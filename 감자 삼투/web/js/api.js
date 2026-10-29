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
    set(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* 저장 불가 환경 */ } }
  };

  let queue = store.get(QUEUE_KEY, []);
  let flushing = false;
  let timer = null;
  let backoff = 1000;

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
    store.set(LOCAL_DB_KEY, db);
  }

  function localClassData(classCode) {
    const db = store.get(LOCAL_DB_KEY, { sessions: {}, attempts: [] });
    const sessions = Object.values(db.sessions).filter((s) => String(s.classCode) === String(classCode));
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
    if (!URL_) { queue.forEach(localApply); queue = []; store.set(QUEUE_KEY, queue); return; }
    flushing = true;
    const batch = queue.slice(0, 40);
    try {
      await post({ action: 'batch', ops: batch });
      queue = queue.slice(batch.length);
      store.set(QUEUE_KEY, queue);
      backoff = 1000;
      flushing = false;
      if (queue.length) flush();
    } catch (e) {
      flushing = false;
      backoff = Math.min(backoff * 2, 30000);
      clearTimeout(timer);
      timer = setTimeout(flush, backoff);
    }
  }

  function enqueue(op, immediate) {
    queue.push(op);
    store.set(QUEUE_KEY, queue);
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

    async classData(classCode) {
      if (!URL_) return localClassData(classCode);
      const res = await fetch(URL_ + '?action=classData&classCode=' + encodeURIComponent(classCode));
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'server error');
      return json;
    }
  };

  window.addEventListener('online', flush);
  window.addEventListener('pagehide', flush);
  setTimeout(flush, 500);
  window.SCIW_API = API;
})();
