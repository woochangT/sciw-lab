/* 발표용 교사 화면 안내. 일반 클릭은 대시보드 조작에만 쓰고, 다음으로 시연 장면을 전환한다. */
(function () {
  if (window.__sciwTour) return;
  const doc = document, $ = (s) => doc.querySelector(s);
  const CLASS_KEYS = ['g:3:r:13', 'g:3:r:4'], GAME = 'm02';
  const visible = (el) => !!el && el.isConnected && el.getClientRects().length > 0;
  const locked = () => { const g = $('#teacherLogin'); return !!g && !g.hidden; };
  const current = (sel) => $(sel)?.getAttribute('aria-current') === 'page';
  const inClass = () => $('.scope-class[aria-current="page"]')?.dataset.classKey === classKey;
  let classKey = '', student = '', element = '', target = null, i = 0, done = false;
  let preparing = true, lastAuto = 0, nextBtn = null, timer;

  const style = doc.createElement('style');
  style.textContent = `
    .sciw-tour-target{outline:4px solid #f5c400!important;outline-offset:3px;box-shadow:0 0 0 10px rgba(245,220,85,.35)!important}
    .sciw-tour-next{position:fixed;z-index:2147483000;left:24px;bottom:24px;display:flex;align-items:center;gap:18px;width:auto;min-width:0;padding:12px 22px;border:2px solid #8a6800;border-radius:999px;background:#ffdc48;color:#25332d;font:700 19px/1.2 Pretendard,system-ui,sans-serif;cursor:pointer;box-shadow:0 4px 16px #0003}
    .sciw-tour-next small{font-size:12px;font-weight:600;opacity:.8}
    .sciw-tour-next:focus-visible{outline:3px solid #25332d;outline-offset:4px}
    .sciw-tour-next:disabled{cursor:wait;opacity:.7}
    .sciw-tour-next[hidden]{display:none}
    .sciw-tour-student>th{background:#fff2b5!important}
    @media(max-width:600px){.sciw-tour-next{left:12px;bottom:12px;padding:10px 16px}}
  `;
  doc.head.appendChild(style);

  function press(el) {
    if (!el || el.disabled || Date.now() - lastAuto < 500) return false;
    lastAuto = Date.now(); el.click(); return true;
  }
  function closeDialog() { const d = $('#studentDialog'); if (d?.open) d.close(); }
  function pickClass() {
    if (!classKey || !$(`[data-class-key="${classKey}"]`)) {
      const key = CLASS_KEYS.find((k) => $(`[data-class-key="${k}"]`)) || '';
      if (key !== classKey) { student = ''; element = ''; }
      classKey = key;
    }
    return classKey;
  }
  function ensureClass() {
    if (!pickClass()) return false;
    if (!inClass()) { press($(`.scope-class[data-class-key="${classKey}"]`)); return false; }
    const tab = $('#game-' + GAME);
    if (tab && tab.getAttribute('aria-selected') !== 'true') { press(tab); return false; }
    return true;
  }
  function ensureOverview() {
    closeDialog();
    if (!ensureClass()) return false;
    if (!current('#task-overview')) { press($('#task-overview')); return false; }
    if (!student) {
      // 4번 학생이 포함된 보완 질문을 우선 고르고, 해당 질문의 요소를 함께 기억한다.
      const link = $('.weakness-card [data-analysis-student="4"]') || $('.weakness-card [data-analysis-student]');
      const card = link?.closest('.weakness-card');
      if (!link || !card?.dataset.weaknessElement) return false;
      student = link.dataset.analysisStudent; element = card.dataset.weaknessElement;
    }
    return true;
  }
  const studentLink = () => $(`.weakness-card[data-weakness-element="${element}"] [data-analysis-student="${student}"]`);
  const studentCell = () => $(`button.matrix-cell[data-student="${student}"][data-element="${element}"]`);
  function ensureAnalysis() {
    closeDialog();
    if (!ensureClass()) return false;
    if (current('#task-analysis') && visible(studentCell())) return true;
    // 학생 번호 링크가 학생의 페이지·행을 함께 선택한다. 다른 학생 셀로 대체하지 않는다.
    if (!ensureOverview()) return false;
    press(studentLink()); return false;
  }
  function evidence() {
    const d = $('#studentDialog');
    return d?.open && $('#studentTitle')?.textContent.trim() === `${student}번의 답안`
      ? d.querySelector('.criterion-evidence') : null;
  }
  const steps = [
    {
      prepare() {
        closeDialog();
        if (!pickClass()) return false;
        if ($('.scope-class[aria-current="page"]')) { press($('[data-all-classes]')); return false; }
        const tab = $('#game-' + GAME);
        if (tab && tab.getAttribute('aria-selected') !== 'true') { press(tab); return false; }
        if (!current('#task-analysis')) { press($('#task-analysis')); return false; }
        const grade = /^g:(\d+)/.exec(classKey)?.[1], select = $('#overviewGrade');
        if (grade && select && select.value !== grade && Date.now() - lastAuto >= 500) {
          lastAuto = Date.now(); select.value = grade; select.dispatchEvent(new Event('change', {bubbles:true})); return false;
        }
        if (visible(this.find())) return true;
        press($('#matrixNext')); return false;
      },
      find: () => $(`button.matrix-class[data-class-key="${classKey}"]`)
    },
    {prepare: ensureOverview, find: () => current('#task-overview') ? $('.weakness-grid') : null},
    {prepare: ensureOverview, find: () => current('#task-overview') ? studentLink() : null},
    {prepare: ensureAnalysis, find: () => current('#task-analysis') ? studentCell() : null},
    {
      prepare() {
        if (visible(evidence())) return true;
        if (!ensureAnalysis()) return false;
        press(studentCell()); return false;
      },
      find: evidence
    },
    {prepare() { closeDialog(); return ensureClass(); }, find: () => inClass() ? $('#task-overview') : null},
    {prepare: ensureOverview, find: () => current('#task-overview') ? $('.focus-examples') : null}
  ];
  function mark(el) {
    if (el === target) return;
    target?.classList.remove('sciw-tour-target');
    doc.querySelectorAll('.sciw-tour-student').forEach((row) => row.classList.remove('sciw-tour-student'));
    target = el;
    if (el) {
      el.classList.add('sciw-tour-target');
      if (i === 3) el.closest('tr')?.classList.add('sciw-tour-student');
      el.scrollIntoView({block:'center', behavior:'smooth'});
    }
  }
  function placeNext() {
    if (!nextBtn) {
      nextBtn = doc.createElement('button'); nextBtn.type = 'button'; nextBtn.className = 'sciw-tour-next';
      nextBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); next(); });
    }
    // showModal()창의 최상위 레이어에서도 다음 버튼을 사용할 수 있게 한다.
    const d = $('#studentDialog'), host = d?.open ? d : doc.body;
    if (nextBtn.parentNode !== host) host.appendChild(nextBtn);
    nextBtn.hidden = done || locked();
    nextBtn.disabled = preparing;
    nextBtn.innerHTML = `<small>대시보드 시연 ${i + 1} / ${steps.length}</small><span>${preparing ? '준비 중…' : '다음 →'}</span>`;
    nextBtn.setAttribute('aria-label', `대시보드 시연 ${i + 1}/${steps.length}, 다음 장면`);
  }
  function locate() {
    if (done) return;
    if (locked()) { mark(null); placeNext(); return; }
    // 화면 정렬은 명시적인 장면 전환 때만 한다. 자유롭게 클릭하는 동안에는 탐색을 방해하지 않는다.
    if (preparing && steps[i].prepare()) preparing = false;
    const el = steps[i].find();
    mark(visible(el) ? el : null);
    placeNext();
  }
  function finish() {
    done = true; mark(null); nextBtn?.remove(); clearInterval(timer);
    window.parent.postMessage({type:'sciw-demo-done', scene:'teacher'}, location.origin);
  }
  function next() {
    if (done) return false;
    if (locked() || preparing) return true;
    i += 1;
    if (i >= steps.length) { finish(); return true; }
    if (i === 4) closeDialog(); // 탐색 중 열었던 다른 근거 대신 안내한 학생·항목을 연다.
    preparing = true; mark(null); locate(); return true;
  }
  addEventListener('resize', placeNext);
  window.__sciwTour = {next, get done() {return done;}, get step() {return i;}};
  timer = setInterval(locate, 150);
  locate();
})();
