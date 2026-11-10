/*
 * 발표용 교사 화면 안내 — presentation/index.html이 교사 화면(teacher.html, Google 시트 자료)에 넣어 실행한다.
 * 교사 화면 코드는 건드리지 않는다. 화면에 보이는 버튼을 차례로 가리키고, 그 버튼만 누를 수 있게 한다.
 *   1 전체 학급 · 강철솜 '학급별 성취도'에서 발표용 반(3학년 13반) 줄
 *   2 그 반의 '수업 준비' — 자주 빠진 고리(보완 1·2)
 *   3 '학생 답안 분석' 탭
 *   4 가장 많이 빠진 고리가 '보완'인 학생 칸 → 판정 이유와 인용 구절
 *   5 판정 근거 읽기 (다음을 누르면 닫힌다)
 *   6 '수업 준비' 탭
 *   7 '답안 비교' → 수업에서 함께 읽을 답안
 * 다음(PageDown·→·Space)을 누르면 지금 가리키는 버튼을 대신 누른다. 끝까지 보면 발표 화면에 끝났다고 알린다.
 * 교사 암호 화면이 떠 있으면 안내하지 않고 기다린다(암호를 넣으면 이어진다).
 * 버튼을 찾지 못하면(교사 화면이 바뀐 경우) 안내 없이 자유롭게 둔다.
 */
(function () {
  if (window.__sciwTour) return;
  const doc = document;
  const $ = (s) => doc.querySelector(s);
  const $$ = (s) => [...doc.querySelectorAll(s)];

  // 발표용 반. 첫째가 없으면 다음 반을 쓴다(둘째는 예시 수업 자료의 반 — 시트가 끊겼을 때 예시 수업으로 바꿔도 이어진다).
  const CLASS_KEYS = ['g:3:r:13', 'g:3:r:4'];
  const GAME = 'm02';

  const style = doc.createElement('style');
  style.textContent = `
    .sciw-tour-target{outline:4px solid #f5c400!important;outline-offset:3px;box-shadow:0 0 0 10px rgba(245,220,85,.45)!important;animation:sciwTourPulse 1.4s ease-in-out infinite;position:relative;z-index:30}
    @keyframes sciwTourPulse{50%{box-shadow:0 0 0 18px rgba(245,220,85,.15)!important}}
    @media (prefers-reduced-motion: reduce){.sciw-tour-target{animation:none}}`;
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
  }
  function choose(select, value) {
    const now = Date.now();
    if (!select || select.value === value || now - lastAuto < 500) return;
    lastAuto = now; select.value = value; select.dispatchEvent(new Event('change', { bubbles: true }));
  }

  let classKey = '', element = ''; // 발표용 반, 그 반에서 가장 많이 빠진 고리(예: W2b)
  function pickClass() {
    if (classKey && $(`[data-class-key="${classKey}"]`)) return classKey;
    classKey = CLASS_KEYS.find((k) => $(`#classNav [data-class-key="${k}"], [data-class-key="${k}"]`)) || '';
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
    { // 2 수업 준비: 자주 빠진 고리
      click: false,
      find: () => {
        if (!inClass() || !current('#task-overview')) return null;
        const home = $('.lesson-home');
        if (!home || /불러오는 중/.test($('#lessonHomeTitle')?.textContent || '')) return null;
        const first = $('.weakness-card [data-compare-element]');
        if (first) element = first.dataset.compareElement;
        return $('.lesson-home-copy') || home;
      }
    },
    { click: true, find: () => (inClass() ? $('#task-analysis') : null) }, // 3 학생 답안 분석 탭
    { // 4 가장 많이 빠진 고리가 '보완'인 학생 칸
      click: true,
      find: () => {
        if (!current('#task-analysis')) return null;
        if (!$('button.matrix-cell[data-student]')) return null; // 표를 그리는 중
        const cell = (element && $(`button.matrix-cell.low[data-student][data-element="${element}"]`)) || $('button.matrix-cell.low[data-student]');
        if (visible(cell)) return cell;
        const more = $('#matrixNext'); if (more && !more.disabled) press(more);
        return null;
      }
    },
    { // 5 판정 이유와 인용 구절
      click: false,
      find: () => { const d = $('#studentDialog'); return d && d.open ? d.querySelector('.criterion-evidence') : null; },
      leave: () => { const d = $('#studentDialog'); if (d && d.open) d.close(); }
    },
    { click: true, find: () => (inClass() ? $('#task-overview') : null) }, // 6 수업 준비 탭
    { // 7 답안 비교
      click: true,
      find: () => (current('#task-overview') ? ($(`button[data-compare-element="${element}"]`) || $('button[data-compare-element]')) : null)
    },
    { click: false, find: () => $('.focus-examples') } // 8 수업에서 함께 읽을 답안
  ];
  let i = 0, target = null, done = false, timer = null, missing = 0;

  function mark(el) {
    if (target) target.classList.remove('sciw-tour-target');
    target = el;
    if (!el) return;
    el.classList.add('sciw-tour-target');
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  // 교사 화면은 기록을 다시 읽을 때마다 표를 새로 그린다. 가리키던 버튼이 바뀌면 새 버튼을 다시 찾아 가리킨다.
  function locate() {
    if (done || i >= steps.length) return;
    if (locked()) { if (target) mark(null); missing = 0; return; } // 교사 암호를 넣을 때까지 기다린다
    if (visible(target)) return;
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
  // 가리키는 버튼 말고는 누를 수 없다. 버튼을 직접 누르면 다음 단계로 간다.
  doc.addEventListener('click', (e) => {
    if (auto || done || !target) return;
    const s = steps[i];
    if (s.click && target.contains(e.target)) { setTimeout(() => activate(i + 1), 50); return; }
    e.preventDefault(); e.stopPropagation();
  }, true);
  doc.addEventListener('keydown', (e) => { if (!done && e.key === 'Escape' && !locked()) { e.preventDefault(); e.stopPropagation(); } }, true);
  doc.addEventListener('cancel', (e) => { if (!done) e.preventDefault(); }, true); // 판정 근거 창을 Esc로 닫지 않게

  window.__sciwTour = { next, get done() { return done; }, get step() { return i; } };
  activate(0);
})();
