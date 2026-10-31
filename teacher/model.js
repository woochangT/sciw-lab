(function (root) {
  const missions = {
    m01: { name: '감자 삼투', elements: ['C', 'D', 'W1', 'W2a', 'W2b', 'W3/WB'] },
    m02: { name: '강철솜 질량 보존', elements: ['C', 'D-A', 'D-B', 'W1a', 'W1b', 'W2a', 'W2b'] }
  };
  const obj = v => { if (v && typeof v === 'object') return v; try { return JSON.parse(v || '{}'); } catch (_) { return {}; } };
  const yes = v => v === true || v === 'true' || v === 'TRUE';
  const time = v => Date.parse(v || '') || 0;
  function latest(sessions) {
    const byStudent = new Map();
    sessions.forEach(s => { const key = String(s.studentNo); const prev = byStudent.get(key); if (!prev || time(s.startedAt) > time(prev.startedAt)) byStudent.set(key, s); });
    return Array.from(byStudent.values()).sort((a, b) => String(a.studentNo).localeCompare(String(b.studentNo), 'ko', { numeric: true }));
  }
  function select(db, classCode, missionId, lessonId) {
    const sessions = (db.sessions instanceof Array ? db.sessions : Object.values(db.sessions || {})).filter(s => String(s.classCode) === classCode && String(s.missionId || 'm01') === missionId && (lessonId === undefined || String(s.lessonId || '') === lessonId));
    const ids = new Set(sessions.map(s => s.sessionId));
    return { sessions, attempts: (db.attempts || []).filter(a => ids.has(a.sessionId)) };
  }
  function element(s, key) {
    const j = obj(s.finalJudgment); const q = obj(s.questPassed);
    const keys = key === 'W3/WB' ? ['W3', 'WB'] : [key];
    return keys.some(k => yes(j[k])) ? '기록됨' : keys.some(k => yes(q[k])) ? '퀘스트 기록' : '미확인';
  }
  function attemptsFor(data, id) { return data.attempts.filter(a => a.sessionId === id).sort((a, b) => time(a.createdAt) - time(b.createdAt)); }
  root.TeacherModel = { missions, latest, select, element, attemptsFor };
})(typeof window === 'undefined' ? globalThis : window);
