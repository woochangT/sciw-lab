/*
 * 백엔드(Apps Script) 클라이언트
 * - 쓰기(세션 시작·갱신, 시도 기록)는 큐에 쌓았다가 묶어서 보낸다. 실패하면 localStorage에 남겨 두고 다시 보낸다.
 * - 요청은 Content-Type: text/plain 으로 보내 CORS 사전 요청(preflight)을 피한다.
 * - API_URL이 비어 있으면 같은 데이터 형태로 localStorage에 저장한다(로컬 모드).
 */
(function () {
  const cfg = window.SCIW_CONFIG || {};
  const URL_ = (cfg.API_URL || '').trim();
  const sync = window.SciwRecordSync.create({url: URL_, queueKey: 'sciw_queue_v1', verified: true, defer: true});
  const API = {
    ...sync,
    get isExperience(){return sync.isExperience;},

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
      if (!URL_) return sync.localClassData(classCode, missionId);
      const res = await fetch(URL_ + '?action=classData&classCode=' + encodeURIComponent(classCode) + '&missionId=' + encodeURIComponent(missionId));
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'server error');
      return json;
    }
  };

  window.SCIW_API = API;
})();
