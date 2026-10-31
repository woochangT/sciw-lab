/*
 * 백엔드(Apps Script) 클라이언트
 * - 쓰기(세션 시작·갱신, 시도 기록)는 큐에 쌓았다가 묶어서 보낸다. 실패하면 localStorage에 남겨 두고 다시 보낸다.
 * - 요청은 Content-Type: text/plain 으로 보내 CORS 사전 요청(preflight)을 피한다.
 * - API_URL이 비어 있으면 같은 데이터 형태로 localStorage에 저장한다(로컬 모드).
 */
(function () {
  const cfg = window.SCIW_CONFIG || {};
  const URL_ = (cfg.API_URL || '').trim();
  const QUEUE_KEY = 'sciw_queue_v1';
  const LOCAL_DB_KEY = 'sciw_localdb_v1';

  const store = {
    get(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch (e) { return fallback; } },
    set(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch (e) { return false; } }
  };

  let queue = store.get(QUEUE_KEY, []);
  let flushing = false;
  let timer = null;
  let backoff = 1000;
  let saveMessage = '저장 대기 중인 기록 없음';
  function showSaveStatus(message) {
    saveMessage = message;
    const el = document.getElementById('sciw-save-status');
    if (el) el.textContent = message;
  }
  function installSaveStatus() {
    if (!document.body || document.getElementById('sciw-save-status')) return;
    const el = document.createElement('div');
    el.id = 'sciw-save-status'; el.setAttribute('role', 'status');
    el.style.cssText = 'position:fixed;bottom:6px;right:8px;z-index:10000;padding:4px 8px;background:#fff;color:#25483b;border:1px solid #b6cbbd;border-radius:6px;font:12px system-ui';
    el.textContent = saveMessage; document.body.appendChild(el);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installSaveStatus);
  else installSaveStatus();

  function uid(prefix) {
    return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // ───── 로컬 모드 저장소 ─────
  function localApply(op) {
    const db = store.get(LOCAL_DB_KEY, { sessions: {}, attempts: [] });
    if (op.action === 'startSession' || op.action === 'updateSession') {
      const s = op.session || op.fields;
      const id = op.session ? op.session.sessionId : op.sessionId;
      db.sessions[id] = Object.assign({}, db.sessions[id] || {}, s, { sessionId: id, updatedAt: new Date().toISOString() });
    } else if (op.action === 'logAttempt') {
      if (!db.attempts.some((a) => a.attemptId === op.attempt.attemptId)) db.attempts.push(op.attempt);
    }
    return store.set(LOCAL_DB_KEY, db);
  }

  function localClassData(classCode, missionId) {
    const db = store.get(LOCAL_DB_KEY, { sessions: {}, attempts: [] });
    const sessions = Object.values(db.sessions).filter((s) => String(s.classCode) === String(classCode) && String(s.missionId || 'm01') === missionId);
    const ids = new Set(sessions.map((s) => s.sessionId));
    return { ok: true, sessions, attempts: db.attempts.filter((a) => ids.has(a.sessionId)), source: 'local' };
  }

  async function post(body) {
    const res = await fetch(URL_, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
      redirect: 'follow'
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || 'server error');
    return json;
  }

  async function flush() {
    if (flushing || !queue.length) return;
    if (!URL_) {
      if (!queue.every(localApply)) { showSaveStatus('로컬 저장 실패 · 다시 시도 필요'); return; }
      queue = []; store.set(QUEUE_KEY, queue); showSaveStatus('이 브라우저에 저장됨'); return;
    }
    flushing = true;
    showSaveStatus('서버 저장 중…');
    const batch = queue.slice(0, 40);
    try {
      // credential은 메모리의 인증 제공자에서만 가져오며 큐에 저장하지 않는다.
      if (!window.SCIW_AUTH || typeof window.SCIW_AUTH.getCredential !== 'function') throw new Error('학생 인증이 필요합니다');
      const credential = await window.SCIW_AUTH.getCredential();
      if (!credential) throw new Error('학생 인증이 필요합니다');
      await post({ action: 'batch', ops: batch, credential });
      queue = queue.slice(batch.length);
      store.set(QUEUE_KEY, queue);
      backoff = 1000;
      showSaveStatus(queue.length ? '남은 기록 전송 중…' : '서버에 저장됨');
      flushing = false;
      if (queue.length) flush();
    } catch (e) {
      flushing = false;
      showSaveStatus('서버 저장 실패 · 재시도 대기 중');
      backoff = Math.min(backoff * 2, 30000);
      clearTimeout(timer);
      timer = setTimeout(flush, backoff);
    }
  }

  function enqueue(op, immediate) {
    queue.push(op);
    const persisted = store.set(QUEUE_KEY, queue);
    showSaveStatus(persisted ? '저장 대기 중' : '대기 기록을 보관하지 못함 · 창을 닫지 마세요');
    clearTimeout(timer);
    timer = setTimeout(flush, immediate ? 0 : 400);
  }

  const API = {
    isLocal: !URL_,
    uid,
    startSession(session) { enqueue({ action: 'startSession', session }); },
    updateSession(sessionId, fields, immediate) { enqueue({ action: 'updateSession', sessionId, fields }, immediate); },
    logAttempt(attempt) { enqueue({ action: 'logAttempt', attempt }); },
    flush,

    // LLM 판정: timeoutMs 안에 답이 없으면 null
    async judge(payload, timeoutMs) {
      if (!URL_ || !cfg.USE_LLM) return null;
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const res = await fetch(URL_, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(Object.assign({ action: 'judge' }, payload)),
          signal: ctrl.signal
        });
        const json = await res.json();
        return json.ok ? json.result : null;
      } catch (e) {
        return null;
      } finally {
        clearTimeout(t);
      }
    },

    async classData(classCode, missionId = cfg.MISSION_ID || 'm01') {
      if (!URL_) return localClassData(classCode, missionId);
      const res = await fetch(URL_ + '?action=classData&classCode=' + encodeURIComponent(classCode) + '&missionId=' + encodeURIComponent(missionId));
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'server error');
      return json;
    }
  };

  window.addEventListener('online', flush);
  window.addEventListener('pagehide', flush);
  if (queue.length) showSaveStatus('미전송 기록 재시도 대기 중');
  setTimeout(flush, 500);
  window.SCIW_API = API;
})();
