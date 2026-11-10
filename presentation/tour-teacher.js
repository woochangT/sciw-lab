/*
 * 발표용 교사 화면 안내 — presentation/index.html이 교사 화면(teacher.html, Google 시트 자료)에 넣어 실행한다.
 * 교사 화면 코드는 건드리지 않는다. 화면에 보이는 것을 차례로 노란 테두리로 가리키고, 그것만 누를 수 있게 한다.
 *   1 전체 학급 · 강철솜 '학급별 성취도' 히트맵에서 발표용 반(3학년 13반) 줄          (누르기)
 *   2 그 반의 '수업 준비' — 다음 수업에서 물어볼 질문(자주 빠진 고리)               (읽기)
 *   3 가장 많이 빠진 고리의 '해당 학생' 번호 → 학생 답안 분석에서 그 학생 줄       (누르기)
 *   4 그 학생의 그 고리 칸('보완')                                                   (누르기)
 *   5 판정 이유와 인용된 학생 문장 — 다음을 누르면 창이 닫힌다                       (읽기)
 *   6 '수업 준비' 탭                                                                (누르기)
 *   7 수업에서 함께 읽을 학생 답안 — 그 고리를 점검할 글과 드러낸 글                 (읽기) → 끝
 * 다음(PageDown·→·Space)을 누르면 가리키는 버튼을 대신 누르거나(누르기), 다음으로 넘어간다(읽기).
 * 마우스로는 노란 테두리 안을 누르거나, 그 옆의 '다음 ▸' 표시를 누르면 된다. 테두리 밖은 눌리지 않는다.
 * 교사 암호 화면이 떠 있으면 안내하지 않고 기다린다. 버튼을 오래 못 찾으면(교사 화면이 바뀐 경우) 안내 없이 둔다.
 */
(function () {
  if (window.__sciwTour) return;
  const doc = document;
  const $ = (s) => doc.querySelector(s);

  // 발표용 반. 첫째가 없으면 다음 반을 쓴다(둘째는 예시 수업 자료의 반 — 시트가 끊겼을 때 예시 수업으로 바꿔도 이어진다).
  const CLASS_KEYS = ['g:3:r:13', 'g:3:r:4'];
  const GAME = 'm02';

  const style = doc.createElement('style');
  style.textContent = `
    .sciw-tour-target{outline:4px solid #f5c400!important;outline-offset:3px;box-shadow:0 0 0 10px rgba(245,220,85,.45)!important;animation:sciwTourPulse 1.4s ease-in-out infinite;position:relative;z-index:30}
    @keyframes sciwTourPulse{50%{box-shadow:0 0 0 18px rgba(245,220,85,.15)!important}}
    .sciw-tour-next{position:fixed;z-index:2147483000;width:auto;height:auto;min-width:0;white-space:nowrap;padding:9px 18px;border:2px solid #1d2b33;border-radius:999px;background:#f5c400;color:#1d2b33;font:700 17px/1 Pretendard,system-ui,sans-serif;cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,.28);animation:sciwTourNudge 1.4s ease-in-out infinite}
    .sciw-tour-next.in{position:absolute;left:auto!important;top:auto!important;right:16px;bottom:16px}
    @keyframes sciwTourNudge{50%{transform:translateX(5px)}}
    @media (prefers-reduced-motion: reduce){.sciw-tour-target,.sciw-tour-next{animation:none}}`;
  doc.head.appendChild(style);

  const visible = (el) => !!el && el.isConnected && el.getClientRects().length > 0;
  const locked = () => { const g = $('#teacherLogin'); return !!g && !g.hidden; };
  const inClass = () => ($('#dashboardTitle')?.textContent || '').trim() !== '전체 학급';
  const current = (sel) => $(sel)?.getAttribute('aria-current') === 'page';

  // 화면을 맞추려고 안내가 직접 누르는 버튼(게임 탭, 학년, 다음 쪽). 너무 자주 누르지 않게 간격을 둔다.
  let auto = false, lastAuto = 0;
  function press(el) {
    const now = Date.now();
    if (!el || el.disabled || now - lastAuto < 500) return;
    lastAuto = now; auto = true;
    try { el.click(); } finally { auto = false; }
    const f = doc.activeElement; if (f && f !== doc.body && f.blur) f.blur(); // 안내가 누른 탭에 포커스 테두리가 남지 않게
  }
  function choose(select, value) {
    const now = Date.now();
    if (!select || select.value === value || now - lastAuto < 500) return;
    lastAuto = now; select.value = value; select.dispatchEvent(new Event('change', { bubbles: true }));
  }

  let classKey = '', element = '', student = ''; // 발표용 반, 그 반에서 가장 많이 빠진 고리(예: W2b), 그 고리를 놓친 학생
  function pickClass() {
    if (classKey && $(`[data-class-key="${classKey}"]`)) return classKey;
    classKey = CLASS_KEYS.find((k) => $(`[data-class-key="${k}"]`)) || '';
    return classKey;
  }

  const steps = [
    { // 1 학급별 성취도에서 발표용 반
      click: true,
      find: () => {
        if (inClass()) return null;
        const tab = $('#game-' + GAME);
        if (tab && tab.getAttribute('aria-selected') !== 'true') { press(tab); return null; }
        if ($('#task-analysis') && !current('#task-analysis')) { press($('#task-analysis')); return null; }
        const key = pickClass(); if (!key) return null;
        const grade = (/^g:(\d+)/.exec(key) || [])[1];
        const gradeSelect = $('#overviewGrade');
        if (grade && gradeSelect && [...gradeSelect.options].some((o) => o.value === grade) && gradeSelect.value !== grade) { choose(gradeSelect, grade); return null; }
        const row = $(`button.matrix-class[data-class-key="${key}"]`);
        if (visible(row)) return row;
        const more = $('#matrixNext'); if (more && !more.disabled) press(more);
        return null;
      }
    },
    { // 2 수업 준비: 다음 수업에서 물어볼 질문(자주 빠진 고리)
      click: false,
      find: () => {
        if (!inClass() || !current('#task-overview')) return null;
        if (/불러오는 중/.test($('#lessonHomeTitle')?.textContent || '')) return null;
        const card = $('.weakness-card');
        if (!card) return null;
        element = card.querySelector('[data-compare-element]')?.dataset.compareElement || '';
        student = card.querySelector('[data-analysis-student]')?.dataset.analysisStudent || '';
        return $('.weakness-grid') || $('.lesson-home-copy');
      }
    },
    { // 3 그 고리를 놓친 학생 번호 → 학생 답안 분석에서 그 학생 줄
      click: true,
      find: () => {
        if (!current('#task-overview')) return null;
        return (student && $(`.weakness-card [data-analysis-student="${student}"]`)) || $('.weakness-card [data-analysis-student]');
      }
    },
    { // 4 그 학생의 그 고리 칸('보완')
      click: true,
      find: () => {
        if (!current('#task-analysis')) return null;
        if (!$('button.matrix-cell[data-student]')) return null; // 표를 그리는 중
        const cell = (student && element && $(`button.matrix-cell[data-student="${student}"][data-element="${element}"]`))
          || (element && $(`button.matrix-cell.low[data-student][data-element="${element}"]`))
          || $('button.matrix-cell.low[data-student]');
        if (visible(cell)) return cell;
        const more = $('#matrixNext'); if (more && !more.disabled) press(more);
        return null;
      }
    },
    { // 5 판정 이유와 인용된 학생 문장
      click: false,
      find: () => { const d = $('#studentDialog'); return d && d.open ? d.querySelector('.criterion-evidence') : null; },
      leave: () => { const d = $('#studentDialog'); if (d && d.open) d.close(); }
    },
    { click: true, find: () => (inClass() && !$('#studentDialog')?.open ? $('#task-overview') : null) }, // 6 수업 준비 탭
    { click: false, find: () => (current('#task-overview') ? $('.focus-examples') : null) } // 7 수업에서 함께 읽을 학생 답안
  ];
  let i = 0, target = null, done = false, timer = null, missing = 0, nextBtn = null;

  // 읽는 단계에서는 가리킨 곳 옆에 '다음 ▸'를 띄운다(마우스로 넘길 수 있게)
  function placeNext() {
    const s = steps[i];
    if (done || !target || !s || s.click) { if (nextBtn) nextBtn.remove(); nextBtn = null; return; }
    // 판정 근거 창 안에서는 창이 기준이 되므로, 가리킨 상자의 오른쪽 아래 모서리에 붙인다
    const inDialog = !!target.closest('dialog');
    const host = inDialog ? target : doc.body;
    if (!nextBtn) {
      nextBtn = doc.createElement('button');
      nextBtn.type = 'button'; nextBtn.className = 'sciw-tour-next'; nextBtn.textContent = '다음 ▸';
      nextBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); next(); });
    }
    if (nextBtn.parentNode !== host) host.appendChild(nextBtn);
    nextBtn.classList.toggle('in', inDialog);
    if (inDialog) return;
    const r = target.getBoundingClientRect(), w = nextBtn.offsetWidth || 90, h = nextBtn.offsetHeight || 36;
    const left = Math.min(innerWidth - w - 16, Math.max(16, r.right - w));
    const top = Math.min(innerHeight - h - 16, Math.max(16, r.bottom + 14));
    nextBtn.style.left = left + 'px'; nextBtn.style.top = top + 'px';
  }
  function mark(el) {
    if (target) target.classList.remove('sciw-tour-target');
    target = el;
    if (el) {
      el.classList.add('sciw-tour-target');
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      // 판정 근거 창이 열리면 닫기 버튼에 포커스 테두리가 생긴다. 노란 테두리와 헷갈리지 않게 걷어 낸다.
      const box = el.closest('dialog'), f = doc.activeElement;
      if (box && f && box.contains(f) && !el.contains(f) && f.blur) f.blur();
    }
    placeNext();
  }
  // 교사 화면은 기록을 다시 읽을 때마다 표를 새로 그린다. 가리키던 것이 바뀌면 새로 찾아 가리킨다.
  function locate() {
    if (done || i >= steps.length) return;
    if (locked()) { if (target) mark(null); missing = 0; return; } // 교사 암호를 넣을 때까지 기다린다
    if (visible(target)) { placeNext(); return; }
    const el = steps[i].find();
    if (visible(el)) { missing = 0; if (el !== target) mark(el); }
    else if (++missing > 100 && target) mark(null); // 오래 못 찾으면(교사 화면이 바뀐 경우) 안내 없이 둔다
  }
  function activate(k) {
    i = k; missing = 0; mark(null);
    if (i >= steps.length) { finish(); return; }
    locate();
  }
  timer = setInterval(locate, 150);
  function finish() {
    done = true; mark(null); clearInterval(timer);
    try { window.parent.postMessage({ type: 'sciw-demo-done', scene: 'teacher' }, location.origin); } catch (e) {}
  }
  function advance() {
    const s = steps[i];
    if (s && s.leave) s.leave();
    activate(i + 1);
  }
  // 다음: 가리키는 버튼을 대신 누르거나(누르는 단계), 지금 화면을 넘긴다(읽는 단계). 다 끝났으면 false.
  function next() {
    if (done) return false;
    const s = steps[i];
    locate();
    if (!target) { if (missing > 100 && !locked()) finish(); return true; } // 아직 그리는 중이면 기다린다
    if (s.click) target.click(); else advance();
    return true;
  }
  // 가리킨 것 말고는 누를 수 없다. 가리킨 것을 누르면 다음 단계로 간다(읽는 단계도 테두리 안을 누르면 넘어간다).
  doc.addEventListener('click', (e) => {
    if (auto || done || !target) return;
    if (nextBtn && nextBtn.contains(e.target)) return;
    const s = steps[i];
    if (target.contains(e.target)) {
      if (s.click) { setTimeout(() => activate(i + 1), 50); return; }
      e.preventDefault(); e.stopPropagation(); advance(); return;
    }
    e.preventDefault(); e.stopPropagation();
  }, true);
  doc.addEventListener('keydown', (e) => { if (!done && e.key === 'Escape' && !locked()) { e.preventDefault(); e.stopPropagation(); } }, true);
  doc.addEventListener('cancel', (e) => { if (!done) e.preventDefault(); }, true); // 판정 근거 창을 Esc로 닫지 않게
  addEventListener('resize', placeNext);

  window.__sciwTour = { next, get done() { return done; }, get step() { return i; } };
  activate(0);
})();
