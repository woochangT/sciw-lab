(function () {
  const M = window.TeacherModel, $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const now = Date.now();
  const at = m => new Date(now - m * 60000).toISOString();
  const demo = {sessions: [
    {sessionId:'d1-old',classCode:'DEMO',lessonId:'DEMO',missionId:'m01',studentNo:'1',startedAt:at(100),endedAt:at(80),clearType:'full',firstAnswer:'감자 안이 진해요.',finalAnswer:'물이 이동합니다.',finalJudgment:{C:true,D:true}},
    {sessionId:'d1',classCode:'DEMO',lessonId:'DEMO',missionId:'m01',studentNo:'1',startedAt:at(30),updatedAt:at(1),stage:'rebuttal',firstAnswer:'감자 안이 진해요.'},
    {sessionId:'d2',classCode:'DEMO',lessonId:'DEMO',missionId:'m01',studentNo:'2',startedAt:at(32),updatedAt:at(2),endedAt:at(2),clearType:'partial',firstAnswer:'설탕이 움직여요.',finalAnswer:'물이 감자 밖으로 이동해 질량이 줄었어요.',finalJudgment:{C:true,D:true,W1:true,W2b:true}},
    {sessionId:'d3',classCode:'DEMO',lessonId:'DEMO',missionId:'m02',studentNo:'1',startedAt:at(25),updatedAt:at(1),endedAt:at(1),clearType:'full',firstAnswer:'열 때문에 무거워져요.',finalAnswer:'공기 중 산소가 철과 결합했어요.',finalJudgment:{C:true,'D-A':true,'D-B':true,W1a:true}}
  ], attempts:[
    {attemptId:'a1',sessionId:'d1',createdAt:at(5),stage:'rebuttal',questId:'Q1',input:'물이 이동했어요.',diagnosis:'PASS'},
    {attemptId:'a2',sessionId:'d2',createdAt:at(4),stage:'defense',questId:'FINAL',input:'물이 감자 밖으로 이동해 질량이 줄었어요.'},
    {attemptId:'a3',sessionId:'d3',createdAt:at(1),stage:'compose',questId:'final',input:'공기 중 산소가 철과 결합했어요.'}
  ]};
  let data = {sessions:[],attempts:[]}, view = 'live', selected = null, lastSuccess = null, credential = '', generation = 0, loading = false;
  const config = window.SCIW_TEACHER_CONFIG;
  const params = new URLSearchParams(location.search);
  const missionFromUrl = params.get('mission');
  if (missionFromUrl === 'm01' || missionFromUrl === 'm02') $('#mission').value = missionFromUrl;
  const returnPaths = {m01:'감자 삼투/web/index.html', m02:'강철솜 질량 보존/web/index.html'};
  $('#backToStart').href = returnPaths[params.get('from')] || 'index.html';
  function updateNotice() {
    const source = $('#source').value;
    $('#notice').textContent = source === 'demo' ? '현재 가상의 예시 데이터입니다. 실제 학생 기록이 아닙니다.' : source === 'local' ? '이 브라우저에만 저장된 로컬 기록입니다. 다른 기기와 공유되지 않습니다.' : '서버 기록에는 교사 인증과 수업별 권한이 필요합니다. 운영 인증을 검증하기 전에는 실제 학생 데이터를 사용하지 마세요.';
  }
  updateNotice();
  const date = value => { const d = new Date(value); return value && !isNaN(d) ? d.toLocaleString('ko-KR') : '기록 없음'; };
  const stage = s => s.clearType || s.endedAt ? '완료' : ({explore:'탐색',claim:'주장',rebuttal:'반박',defense:'변론',compose:'변론',sort:'카드 분류'}[s.stage] || '진행 중 · 단계 미기록');
  function render() {
    const rows = M.latest(data.sessions), done = rows.filter(s => s.clearType || s.endedAt);
    const title = view === 'live' ? '학생별 진행' : '평가 요소 살펴보기';
    const heads = view === 'live' ? '<th>학생</th><th>상태 / 단계</th><th>최근 저장</th><th>판 수</th><th></th>' : '<th>학생</th>' + M.missions[$('#mission').value].elements.map(e => `<th>${esc(e)}</th>`).join('') + '<th></th>';
    const body = rows.map(s => view === 'live' ? `<tr><td>${esc(s.studentNo)}번</td><td><span class="pill ${s.clearType || s.endedAt ? '' : 'pending'}">${esc(stage(s))}</span></td><td>${esc(date(s.updatedAt || s.startedAt))}</td><td>${data.sessions.filter(x => String(x.studentNo) === String(s.studentNo)).length}</td><td><button data-student="${esc(s.studentNo)}">기록 보기</button></td></tr>` : `<tr><td>${esc(s.studentNo)}번</td>${M.missions[$('#mission').value].elements.map(k => `<td>${esc(M.element(s,k))}</td>`).join('')}<td><button data-student="${esc(s.studentNo)}">답안 보기</button></td></tr>`).join('');
    $('#content').innerHTML = `<div class="stats"><div class="card"><span>참여 학생</span><b>${rows.length}명</b></div><div class="card"><span>진행 중</span><b>${rows.length-done.length}명</b></div><div class="card"><span>완료 기록</span><b>${done.length}명</b></div></div><section class="panel"><h2>${title}</h2><p class="muted">${view === 'live' ? '각 학생의 가장 최근 판을 표시합니다. 이전 판도 기록 보기에서 확인할 수 있습니다.' : '학생 화면이 보낸 검증되지 않은 자동 판정 기록입니다. 서버 평가가 아닙니다. 정답이나 성취 판단을 확정하지 말고 원문과 함께 교사가 검토하세요.'}</p>${rows.length ? `<table><thead><tr>${heads}</tr></thead><tbody>${body}</tbody></table>` : '<p>이 반과 미션에 저장된 기록이 없습니다.</p>'}</section>`;
    if (selected !== null) detail(selected);
  }
  function detail(no) {
    const sessions = data.sessions.filter(s => String(s.studentNo) === String(no)).sort((a,b) => (Date.parse(b.startedAt)||0)-(Date.parse(a.startedAt)||0));
    if (!sessions.length) { $('#detail').hidden = true; selected = null; return; }
    selected = String(no);
    $('#detail').hidden = false;
    $('#detail').innerHTML = `<button class="close" id="close">닫기</button><h2>${esc(no)}번 · 판과 답안 이력</h2><p class="muted">최신 판부터 표시 · 판정은 교사 검토 자료</p>` + sessions.map(s => `<section class="attempt"><h3>${esc(stage(s))} · 시작 ${esc(date(s.startedAt))}</h3><b>처음 답</b><p class="answer">${esc(s.firstAnswer || '기록 없음')}</p><b>최종 답</b><p class="answer">${esc(s.finalAnswer || '아직 제출되지 않음')}</p><b>시도 이력</b>${M.attemptsFor(data,s.sessionId).map(a => `<div class="attempt"><span class="muted">${esc(date(a.createdAt))} · ${esc(a.stage || '')} · ${esc(a.questId || '')} · ${esc(a.diagnosis || '')}</span><p class="answer">${esc(a.input || a.choice || '텍스트 없음')}</p></div>`).join('') || '<p class="muted">기록 없음</p>'}</section>`).join('');
    $('#close').onclick = () => { selected = null; $('#detail').hidden = true; };
  }
  async function load() {
    if (loading) return;
    const current = generation, source = $('#source').value, classCode = $('#classCode').value.trim(), missionId = $('#mission').value, lessonId = $('#lessonId').value.trim();
    loading = true;
    $('#status').textContent = '조회 중…';
    try {
      let db;
      if (source === 'remote') db = await window.TeacherTransport.classData(config.API_URL, credential, classCode, missionId, lessonId, config.TIMEOUT_MS);
      else db = source === 'demo' ? demo : JSON.parse(localStorage.getItem('sciw_localdb_v1') || '{"sessions":{},"attempts":[]}');
      if (current !== generation) return;
      data = M.select(db, classCode, missionId, lessonId);
      lastSuccess = new Date(); render();
      const label = source === 'demo' ? '합성 예시' : source === 'local' ? '이 브라우저의 로컬 저장소' : '인증된 서버';
      $('#status').textContent = `${label} · 마지막 조회 ${lastSuccess.toLocaleTimeString('ko-KR')} · 20초마다 다시 조회`;
    } catch(e) {
      if (current !== generation) return;
      $('#status').textContent = `조회 실패 · ${lastSuccess ? '이전 조회 결과 유지 (' + lastSuccess.toLocaleTimeString('ko-KR') + ')' : '저장된 결과 없음'} · ${e.message} · 다음 조회 때 재시도`;
    } finally { loading = false; if (current !== generation) load(); }
  }
  function changeScope() {
    generation++; selected=null; data={sessions:[],attempts:[]}; lastSuccess=null;
    $('#detail').hidden=true; $('#signin').hidden=$('#source').value !== 'remote'; updateNotice(); render(); load();
  }
  $('#signin').onclick = async () => {
    try {
      if (!window.SCIW_TEACHER_AUTH || typeof window.SCIW_TEACHER_AUTH.signIn !== 'function') throw new Error('교사 인증 제공자가 설정되지 않았습니다');
      credential = await window.SCIW_TEACHER_AUTH.signIn();
      if (!credential) throw new Error('교사 인증을 완료하지 못했습니다');
      changeScope();
    } catch (e) { credential=''; changeScope(); $('#status').textContent='인증 실패 · ' + e.message; }
  };
  $('#content').addEventListener('click', e => { const b=e.target.closest('[data-student]'); if(b) { detail(b.dataset.student); $('#detail').scrollIntoView({behavior:'smooth'}); } });
  document.querySelectorAll('.tab').forEach(b => b.onclick = () => { view=b.dataset.view; document.querySelectorAll('.tab').forEach(t => { t.classList.toggle('active',t===b); t.setAttribute('aria-pressed',String(t===b)); }); render(); });
  $('#refresh').onclick = load;
  $('#newLesson').onclick = () => {
    if (!window.crypto || !window.crypto.getRandomValues) { $('#status').textContent='안전한 수업 ID 생성에 HTTPS가 필요합니다'; return; }
    const bytes = new Uint8Array(12); window.crypto.getRandomValues(bytes);
    $('#lessonId').value = 'L_' + Array.from(bytes, b => b.toString(16).padStart(2, '0')).join(''); changeScope();
    $('#status').textContent = '새 수업 ID를 만들었습니다. 참여자에게 알리고 서버 권한에도 등록해야 합니다.';
  };
  $('#mission').onchange = changeScope;
  $('#source').onchange = changeScope;
  $('#classCode').onchange = changeScope;
  $('#lessonId').onchange = changeScope;
  load(); setInterval(load, config.REFRESH_MS);
})();
