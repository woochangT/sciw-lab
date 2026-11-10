/*
 * 발표용 교사 화면 안내 — presentation/index.html이 교사 화면(teacher.html?source=demo)에 넣어 실행한다.
 * 교사 화면 코드는 건드리지 않는다. 화면에 보이는 버튼을 차례로 가리키고, 그 버튼만 누를 수 있게 한다.
 *   1 전체 학급 히트맵에서 '3학년 1반 · 증가분의 의미' 칸
 *   2 반 분석에서 '1번 · 증가분의 의미' 칸 → 학생 원문과 판정 근거
 *   3 원문 읽기 (다음을 누르면 닫힌다)
 *   4 수업 요약 (미리 만들어 둔 예시 요약)
 * 다음(PageDown·→·Space)을 누르면 지금 가리키는 버튼을 대신 누른다. 넷을 다 보면 발표 화면에 끝났다고 알린다.
 * 버튼을 찾지 못하면(교사 화면이 바뀐 경우) 안내 없이 자유롭게 둔다.
 */
(function () {
  if (window.__sciwTour) return;
  const doc = document;
  const $ = (s) => doc.querySelector(s);
  const cfg = window.SCIW_TEACHER_CONFIG || {};

  // 미리 만들어 둔 수업 요약: 예시 수업(합성 자료) 3학년 1반 · 강철솜 기록에 맞춰 손으로 쓴 예시다.
  // 교사 화면이 저장된 리포트를 읽는 자리(localStorage)에 넣어 두면, 생성 버튼 없이 '저장된 분석'으로 보인다.
  const CLASS_KEY = 'g:3:r:1';
  const report = {
    reportVersion: 3, classKey: CLASS_KEY, missionId: 'm02', classLabel: '3학년 1반',
    analysis: {
      generatedAt: '2026-11-10T12:00:00.000Z',
      result: {
        headline: '늘어난 0.5 g이 무엇의 질량인지, 닫힌 플라스크는 왜 그대로인지 함께 짚어 주세요.',
        teachingFocus: '최종 답안 20개 중 14개가 “산소와 결합했기 때문이다”에서 멈췄어요. 늘어난 0.5 g이 산소의 질량이라는 번역과, 마개를 막은 플라스크 전체가 150.0 g 그대로인 실험 B의 의미가 가장 많이 빠졌습니다. 다음 시간 첫 5분에 두 실험에서 저울이 재는 범위를 칠판에 그리며 이 두 고리를 함께 확인해 보세요.',
        summary: '24개 번호가 참여했고 20개 번호가 최종 답안을 냈어요. 결론과 실험 A 자료는 모두 썼지만, 실험 B 자료와 증가분의 의미는 6개 답안에서만 인정됐어요.',
        observations: [
          { finding: '결론은 맞지만 0.5 g의 정체를 밝히지 않은 답안이 많아요.', evidence: '“실험 A에서 강철솜은 2.0 g에서 2.5 g으로 늘었다. 산소와 결합했기 때문이다.”처럼 결과와 결론을 바로 잇는 답안이 14개였어요.', alternative: '증가분이 산소의 질량이라는 것을 알고도 당연해서 쓰지 않았을 수 있어요. 말로 물어 확인해 보세요.' },
          { finding: '실험 B(닫힌 플라스크)를 근거로 쓴 답안이 적어요.', evidence: '실험 B 자료가 인정된 답안은 20개 중 6개였어요.', alternative: '실험 B가 실험 A와 무엇을 비교하려는 장치인지 놓쳤을 수 있어요.' }
        ],
        questions: [
          { question: '늘어난 0.5 g은 무엇의 무게일까요? 그 물질은 처음에 어디에 있었나요?', purpose: '증가분을 물질로 번역하게 해요.' },
          { question: '마개를 막은 플라스크에서도 산소가 철에 붙었는데, 왜 저울은 그대로일까요?', purpose: '저울이 재는 범위(닫힌 계)를 떠올리게 해요.' }
        ],
        activities: [
          { title: '저울이 재는 범위 그리기', minutes: 5, steps: ['두 실험의 장치를 칠판에 그린다.', '저울이 재는 범위를 점선으로 표시한다.', '산소가 어디에서 어디로 옮겨 갔는지 화살표로 그린다.'], why: '측정 범위를 그리면 실험 B의 150.0 g이 “드나든 물질이 없다”는 뜻임이 드러나요.' }
        ],
        limitations: ['예시 수업의 합성 자료로 만든 요약입니다.']
      }
    },
    basis: {
      mode: 'latest', participants: 24, written: 20, pending: 4, hintOpened: 5, hintUnknown: 0, excluded: 0, sampled: 2, totalPlays: 27, sourceRevision: 'presentation-example',
      samples: [
        { first: '강철솜을 태우면 열 때문에 무거워질 것 같다.', final: '실험 A에서 강철솜은 2.0 g에서 2.5 g으로 늘었다. 산소와 결합했기 때문이다.' },
        { first: '강철솜을 태우면 열 때문에 무거워질 것 같다.', final: '공기 중 산소가 철과 결합하면서 0.5 g이 더해졌다. 닫힌 플라스크에서는 산소도 처음부터 전체 질량에 포함돼 있어 전체는 150.0 g으로 같다.' }
      ]
    }
  };
  try {
    const scope = JSON.stringify(['demo', cfg.SHEET_URL, CLASS_KEY, false, 'm02', 'latest']);
    localStorage.setItem('sciw_teaching_report_v3:' + scope, JSON.stringify(report));
  } catch (e) { /* 저장소를 못 쓰면 요약 없이 진행한다 */ }

  const style = doc.createElement('style');
  style.textContent = `
    .sciw-tour-target{outline:4px solid #f5c400!important;outline-offset:3px;box-shadow:0 0 0 10px rgba(245,220,85,.45)!important;animation:sciwTourPulse 1.4s ease-in-out infinite;position:relative;z-index:30}
    @keyframes sciwTourPulse{50%{box-shadow:0 0 0 18px rgba(245,220,85,.15)!important}}
    @media (prefers-reduced-motion: reduce){.sciw-tour-target{animation:none}}`;
  doc.head.appendChild(style);

  const closeDialog = () => { const d = $('#studentDialog'); if (d && d.open) d.close(); };
  const steps = [
    { find: () => $('button.matrix-cell[aria-label^="3학년 1반 증가분"]'), click: true },
    { find: () => $('button.matrix-cell[data-student="1"][data-element="W2b"]'), click: true },
    { find: () => { const d = $('#studentDialog'); return d && d.open ? d : null; }, click: false, leave: closeDialog },
    { find: () => $('.dashboard-teaching'), click: false }
  ];
  let i = 0, target = null, done = false, timer = null, missing = 0;

  function mark(el) {
    if (target) target.classList.remove('sciw-tour-target');
    target = el;
    if (!el) return;
    if (el.tagName !== 'DIALOG') el.classList.add('sciw-tour-target');
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  // 교사 화면은 자료를 다시 읽을 때마다 표를 새로 그린다. 가리키던 버튼이 바뀌면 새 버튼을 다시 찾아 가리킨다.
  function locate() {
    if (done || i >= steps.length) return;
    if (target && target.isConnected && (target.tagName !== 'DIALOG' || target.open)) return;
    const el = steps[i].find();
    if (el && el.isConnected) { missing = 0; if (el !== target) mark(el); }
    else if (++missing > 60 && target) mark(null); // 오래 못 찾으면(교사 화면이 바뀐 경우) 안내 없이 둔다
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
    if (!target) { if (missing > 60) finish(); return true; } // 아직 그리는 중이면 기다린다
    if (s.click) target.click(); else advance();
    return true;
  }
  // 가리키는 버튼 말고는 누를 수 없다. 버튼을 직접 누르면 다음 단계로 간다.
  doc.addEventListener('click', (e) => {
    if (done || !target) return;
    const s = steps[i];
    if (s.click && target.contains(e.target)) { setTimeout(() => activate(i + 1), 50); return; }
    e.preventDefault(); e.stopPropagation();
  }, true);
  doc.addEventListener('keydown', (e) => { if (!done && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); } }, true);
  doc.addEventListener('cancel', (e) => { if (!done) e.preventDefault(); }, true); // 원문 창을 Esc로 닫지 않게

  window.__sciwTour = { next, get done() { return done; } };
  activate(0);
})();
