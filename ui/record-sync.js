/* Durable, acknowledged session writes shared by both games. Existing queue keys are retained. */
(function (root) {
  'use strict';
  const uid = prefix => prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  const clone = value => JSON.parse(JSON.stringify(value));
  const sessionId = op => op.sessionId || op.session?.sessionId || op.attempt?.sessionId;
  const key = op => op.syncId || JSON.stringify(op);
  const bytes = value => new TextEncoder().encode(JSON.stringify(value)).length;
  // A rejected old operation must not block every subsequent login. Preserve it separately.
  const permanent = /학년은|지원하지 않는 기록 작업|잘못된 기록$|잘못된 요청 크기|잘못된 기록 묶음|요청 크기 한도|세션 ID 오류|시도 ID 오류|세션 범위|시도 범위|시도 ID 충돌|세션이 없어|대화는 logAttempt|기록이 잘못되었거나 너무 큽니다|대화 기록 크기 한도/;

  function create({url, queueKey, verified = true}) {
    const blockedKey = queueKey + '_blocked';
    const read = (name, fallback) => { try { return JSON.parse(localStorage.getItem(name)) ?? fallback; } catch (_) { return fallback; } };
    const write = (name, value) => { try { localStorage.setItem(name, JSON.stringify(value)); return true; } catch (_) { return false; } };
    let queue = read(queueKey, []), blocked = read(blockedKey, []), running = null, timer, backoff = 1000, unpersisted = [];
    const acknowledged = new Set();
    let active = null, getContext = null, draftTimer, draft = null, draftKey = '', message = '저장 대기 중인 기록 없음';
    if (!Array.isArray(queue)) queue = [];
    if (!Array.isArray(blocked)) blocked = [];

    function status(text) {
      message = text;
      const el = document.getElementById('sciw-save-status');
      if (el) {
        el.textContent = text + (blocked.length ? ' · 일부 이전 기록은 별도 보관 중' : '');
        el.title = blocked.length ? '보관된 기록은 내보내서 확인할 수 있습니다.' : '';
        if (blocked.length) {
          const button = document.createElement('button'); button.type = 'button'; button.textContent = '기록 내보내기';
          button.onclick = () => {
            const link = document.createElement('a'), objectURL = URL.createObjectURL(new Blob([JSON.stringify({pending:current(),blocked},null,2)],{type:'application/json'}));
            link.href = objectURL; link.download = 'sciw-unsent-records.json'; link.click(); URL.revokeObjectURL(objectURL);
          };
          el.appendChild(button);
        }
      }
    }
    function installStatus() {
      if (!document.body || document.getElementById('sciw-save-status')) return;
      const el = document.createElement('div'); el.id = 'sciw-save-status'; el.setAttribute('role','status');
      el.style.cssText = 'position:fixed;bottom:6px;right:8px;z-index:10000;padding:4px 8px;background:#fff;color:#25483b;border:1px solid #b6cbbd;border-radius:6px;font:12px system-ui;max-width:90vw';
      document.body.appendChild(el); status(message);
    }
    // Re-read before each mutation: another tab may have appended or acknowledged records.
    function current() {
      const saved = read(queueKey, null);
      if (Array.isArray(saved)) queue = [...new Map([...saved,...unpersisted].filter(op => !acknowledged.has(key(op))).map(op => [key(op),op])).values()];
      return queue;
    }
    function remove(ops) {
      ops.forEach(op => acknowledged.add(key(op))); queue = current().filter(op => !acknowledged.has(key(op)));
      unpersisted = unpersisted.filter(op => !acknowledged.has(key(op))); write(queueKey,queue);
    }
    function hold(op, error) {
      blocked = read(blockedKey, blocked);
      if (!blocked.some(item => key(item.op) === key(op))) blocked.push({op,error:error.message,blockedAt:new Date().toISOString()});
      if (!write(blockedKey,blocked)) throw new Error('기록 보관 공간이 부족합니다. 창을 닫지 말고 다시 시도해 주세요.');
      remove([op]);
    }
    function enqueue(op, immediate = false) {
      op = clone({...op,syncId:uid('op')});
      // Consecutive draft snapshots can be replaced; submitted answers and feedback never are.
      queue = current().slice();
      const previous = queue.at(-1);
      if (op.action === 'updateSession' && op.fields.draftOnly && previous?.action === 'updateSession' && previous.fields.draftOnly && sessionId(previous) === sessionId(op) && previous.fields.draftField === op.fields.draftField) queue.pop();
      if (op.action === 'startSession') queue.unshift(op); else queue.push(op);
      const persisted = write(queueKey,queue);
      unpersisted = persisted ? [] : queue.slice();
      status(persisted ? '저장 대기 중' : '대기 기록을 보관하지 못함 · 창을 닫지 마세요');
      clearTimeout(timer); timer = setTimeout(() => flush(), immediate ? 0 : 400);
    }
    function batchOf(ops) {
      const batch = [];
      for (const op of ops) {
        if (batch.length && (batch.length >= 4 || bytes({action:'batch',ops:[...batch,op]}) > 48000)) break;
        batch.push(op);
      }
      return batch;
    }
    function localApply(op) {
      const db = read('sciw_localdb_v1',{sessions:{},attempts:[]}), id = sessionId(op);
      if (op.action === 'logAttempt') { if (!db.attempts.some(a => a.attemptId === op.attempt.attemptId)) db.attempts.push(op.attempt); }
      else db.sessions[id] = {...db.sessions[id],...(op.session || op.fields),sessionId:id,updatedAt:new Date().toISOString()};
      if (!write('sciw_localdb_v1',db)) throw new Error('로컬 저장 실패');
    }
    async function post(ops, keepalive) {
      const body = JSON.stringify({action:'batch',ops}), controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 45000);
      try {
        // Requests already in flight must also survive pagehide; that flag cannot be changed later.
        const response = await fetch(url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body,redirect:'follow',signal:controller.signal,keepalive:bytes({action:'batch',ops}) <= 60000});
        if (!response.ok) throw Object.assign(new Error(response.status === 413 ? '요청 크기 한도' : 'HTTP ' + response.status),{rejected:response.status === 413});
        const result = await response.json();
        if (!result.ok) throw Object.assign(new Error(result.error || '서버 저장 오류'),{rejected:true});
      } finally { clearTimeout(timeout); }
    }
    async function send(ops, keepalive) {
      try {
        await post(ops,keepalive); remove(ops);
      } catch (error) {
        // Retrying a partially applied batch is safe: session and attempt IDs are idempotent.
        if (!error.rejected || !permanent.test(error.message)) throw error;
        if (ops.length === 1) { hold(ops[0],error); return; }
        const mid = Math.ceil(ops.length / 2); await send(ops.slice(0,mid),keepalive); await send(ops.slice(mid),keepalive);
      }
    }
    async function drain(keepalive) {
      if (url && !verified) throw new Error('미션 02 서버 지원 확인 필요');
      while (current().length) {
        const ops = batchOf(current()); status(url ? '서버 저장 중…' : '이 브라우저에 저장 중…');
        if (url) await send(ops,keepalive); else { ops.forEach(localApply); remove(ops); }
      }
      backoff = 1000; status(url ? '서버에 저장됨' : '이 브라우저에 저장됨');
    }
    function flush(options = {}) {
      if (running) return running;
      if (!current().length) return Promise.resolve();
      const work = () => drain(Boolean(options.keepalive));
      running = (root.navigator?.locks ? root.navigator.locks.request('sciw-records:' + queueKey,work) : work()).catch(error => {
        status('서버 저장 실패 · 기록 보관 후 재시도 중');
        backoff = Math.min(backoff * 2,30000); clearTimeout(timer); timer = setTimeout(() => flush(),backoff);
      }).finally(() => { running = null; });
      return running;
    }
    function pending(id) { return current().filter(op => !id || sessionId(op) === id).length; }
    async function whenSaved(id, timeoutMs = 20000) {
      const deadline = Date.now() + timeoutMs; captureDraft(); flush();
      while (pending(id) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve,100));
      blocked = read(blockedKey,blocked);
      return !pending(id) && !blocked.some(item => sessionId(item.op) === id);
    }
    function captureDraft() {
      clearTimeout(draftTimer);
      if (!draft || !active) return;
      const value = {...draft}, signature = JSON.stringify(value);
      if (signature === draftKey) return;
      draftKey = signature;
      enqueue({action:'updateSession',sessionId:active.sessionId,fields:{...value,draftOnly:true,draftSavedAt:new Date().toISOString()}},true);
    }
    function input(event) {
      if (!active || !['replyText','answer','ansText','defText'].includes(event.target?.id)) return;
      // Retain the prompt alongside unfinished text, even when evaluation fails or the page closes.
      draft = {...getContext?.(),draftField:event.target.id,draftAnswer:event.target.value,draftQuestion:document.querySelector?.('#bubble .body')?.textContent || ''};
      clearTimeout(draftTimer); draftTimer = setTimeout(captureDraft,800);
    }
    document.addEventListener('input',input,true);
    document.addEventListener('change',event => { input(event); captureDraft(); },true);
    root.addEventListener('online',() => flush());
    root.addEventListener('pagehide',() => { captureDraft(); flush({keepalive:true}); });
    document.addEventListener('visibilitychange',() => { if (document.hidden) { captureDraft(); flush({keepalive:true}); } });
    root.addEventListener('storage',event => { if (event.key === queueKey) flush(); });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',installStatus); else installStatus();
    if (queue.length) status('미전송 기록 재시도 대기 중');
    setTimeout(() => flush(),500);
    return {
      uid,isLocal:!url,flush,pending,whenSaved,captureDraft,
      watchDrafts(context) { getContext = context; },
      startSession(session) { active = clone(session); enqueue({action:'startSession',session},true); },
      updateSession(id,fields,immediate) { enqueue({action:'updateSession',sessionId:id,fields},immediate); },
      logAttempt(attempt) { enqueue({action:'logAttempt',attempt}); },
      recordInput(id,fields) { captureDraft(); const attemptId=uid('input'); enqueue({action:'logAttempt',attempt:{attemptId,sessionId:id,missionId:active?.missionId,classCode:active?.classCode,studentNo:active?.studentNo,questId:'studentInput',createdAt:new Date().toISOString(),...fields}},true); return attemptId; },
      localClassData(classCode,missionId) { const db = read('sciw_localdb_v1',{sessions:{},attempts:[]}); const sessions = Object.values(db.sessions).filter(s => s.classCode === classCode && (s.missionId || 'm01') === missionId), ids = new Set(sessions.map(s => s.sessionId)); return {ok:true,sessions,attempts:db.attempts.filter(a => ids.has(a.sessionId)),source:'local'}; }
    };
  }
  root.SciwRecordSync = {create};
})(window);
