(function (root) {
  async function classData(url, credential, classCode, missionId, lessonId, timeoutMs) {
    if (!url || !credential) throw new Error('서버 주소와 교사 인증이 필요합니다');
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs || 12000);
    try {
      const res = await fetch(url, {method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'classData',credential,classCode,missionId,lessonId}),redirect:'follow',signal:ctrl.signal});
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const result = await res.json();
      if (!result.ok) throw new Error(result.error || '조회 실패');
      if (!Array.isArray(result.sessions) || !Array.isArray(result.attempts)) throw new Error('잘못된 서버 응답');
      return result;
    } catch (e) { if (e.name === 'AbortError') throw new Error('조회 시간 초과'); throw e; }
    finally { clearTimeout(timer); }
  }
  root.TeacherTransport = {classData};
})(typeof window === 'undefined' ? globalThis : window);
