/*
 * 학생 기록 API 클라이언트
 * - 쓰기(세션 시작·갱신, 시도 기록)는 큐에 쌓았다가 묶어서 보낸다. 실패하면 localStorage에 남겨 두고 다시 보낸다.
 * - 요청은 Content-Type: text/plain 으로 보내 CORS 사전 요청(preflight)을 피한다.
 * - API_URL이 비어 있으면 같은 데이터 형태로 localStorage에 저장한다(로컬 모드).
 */
(function () {
  const cfg = window.SCIW_CONFIG || {};
  const URL_ = (cfg.API_URL || '').trim();
  const JUDGE_URL = (cfg.JUDGE_API_URL || '').trim();
  const sync = window.SciwRecordSync.create({url: URL_, queueKey: 'sciw_queue_m02_v1', verified: Boolean(cfg.M02_SERVER_VERIFIED), defer: true});
  const API = {
    ...sync,
    get isExperience(){return sync.isExperience;},

    // AI 장애를 오답/null로 바꾸지 않는다. 기록 주소에는 판정 요청을 보내지 않는다.
    async judge(payload, timeoutMs = cfg.LLM_TIMEOUT_MS || 65000) {
      const fail = (code) => Object.assign(new Error(code), { code });
      if (!JUDGE_URL) throw fail('JUDGE_NOT_CONFIGURED');
      const input = window.SCIW_RUBRIC02.prepare(payload);
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const headers = { 'Content-Type': 'text/plain;charset=utf-8' };
        if (JUDGE_URL === '/api/m02-judge') headers['X-Sciw-Local'] = 'm02';
        const res = await fetch(JUDGE_URL, {
          method: 'POST',
          headers,
          body: JSON.stringify(Object.assign({ action: 'judgeM02' }, input)),
          signal: ctrl.signal
        });
        const json = await res.json();
        if (!res.ok || !json.ok) throw fail(json.code || 'EVALUATION_ERROR');
        const result = window.SCIW_RUBRIC02.validate(input, json.result.analysis);
        return Object.assign(result, { model: json.result.model || '', requestId: json.result.requestId || '' });
      } catch (e) {
        if (e.name === 'AbortError') throw fail('TIMEOUT');
        if (e.code) throw e;
        throw fail('EVALUATION_ERROR');
      } finally {
        clearTimeout(t);
      }
    },

    async classData(classCode, missionId = cfg.MISSION_ID || 'm01') {
      if (!URL_) return sync.localClassData(classCode, missionId);
      if (!cfg.M02_SERVER_VERIFIED) throw new Error('미션 02 서버 지원 확인 필요');
      const res = await fetch(URL_ + '?action=classData&classCode=' + encodeURIComponent(classCode) + '&missionId=' + encodeURIComponent(missionId));
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'server error');
      return json;
    }
  };

  window.SCIW_API = API;
})();
