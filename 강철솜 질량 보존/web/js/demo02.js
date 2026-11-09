/*
 * 발표 시연 모드 — 미션 02 「늘어난 강철솜」
 * 주소 끝에 ?demo=1|2|3을 붙이면 시작 화면 없이 그 장면부터 실제 게임이 돈다.
 *   1  꼬투리 ①: 교수가 실험 B 카드를 제멋대로 읽고, 학생이 뒷면을 고쳐 쓴다 (종속 변인 번역)
 *   2  꼬투리 ③: "왜 하필 산소인가?" → 마법 현미경에서 공기 중의 기체를 지켜본다 (모형화)
 *   3  완전한 설명: 최종 답안 제출 → 처음/지금 비교·형광펜 결과 → 선생님께 제출
 * 시연 모드에서는 팀 시트에 기록하지 않는다(js/config.js가 기록 주소를 비운다).
 * 입력칸에는 시연 문장이 미리 들어간다. 문장을 그대로 내면 아래 FIXTURES의 판정 결과를 쓰고(js/api.js),
 * 발표자가 문장을 고쳐 쓰면 실제 AI 판정을 요청한다.
 * 게임 흐름과 판정 규칙은 바꾸지 않는다. 장면에 필요한 상태(모은 카드, 지나온 꼬투리, 콧대 높이)만 미리 채운다.
 */
(function () {
  const cfg = window.SCIW_CONFIG || {};
  const scene = cfg.DEMO;
  if (!scene) return;
  const E = window.SCIW_ENGINE02;
  const { S, M, $ } = E;
  const API = window.SCIW_API;

  // 시연에서 학생이 쓰는 문장. 답 틀(시작어 … 라는 뜻이다) 사이에 들어가는 부분만 적는다.
  const TEXT = {
    Q1: '플라스크 안에서 산소가 철에 옮겨 붙었을 뿐, 안팎으로 드나든 물질은 없다',
    Q2: '공기 중의 산소가 철에 붙어 더해졌다',
    Q3: '줄어든 산소가 철에 붙었고, 늘어난 0.5 g은 그 산소의 질량이다',
    first: '산소 때문',
    final: '강철솜이 공기 중의 산소와 결합했기 때문이다. 실험 A에서 강철솜은 2.0 g에서 2.5 g으로 0.5 g 늘었고, 마개를 막은 실험 B에서는 플라스크 전체가 150.0 g 그대로였다. B에서는 플라스크 안의 산소가 철에 옮겨 붙었을 뿐 밖으로 드나든 물질이 없어서 전체 질량이 변하지 않았다. 철이 타는 동안 공기 중에서 줄어드는 기체는 산소뿐이므로 철에 붙는 것은 산소이다. 따라서 A에서 늘어난 0.5 g은 접시 밖 공기에서 들어와 철과 결합한 산소의 질량이다.'
  };
  // 게임의 meaningSentence와 같은 규칙으로 뒷면 문장을 만든다
  const meaning = (t) => (/(이|아니)다$/.test(t) ? t.replace(/다$/, '라는 뜻이다.') : t + '는 뜻이다.');

  // 판정 결과. text는 게임이 판정 서버로 보내는 전체 문장(시작어 + 학생 문장 + 끝말)과 같아야 쓰인다.
  // source: 'draft'는 손으로 만든 임시 결과, 'captured'는 실제 판정 서버가 이 문장에 낸 결과다.
  const met = (quote, reason) => ({ status: 'met', quote, reason });
  const FIXTURES = {
    Q1: {
      source: 'draft', delay: 1600,
      text: E.STAGES.Q1.starter + meaning(TEXT.Q1),
      analysis: {
        inputStatus: 'meaningful', diagnosis: 'NONE',
        checks: { wholeMass: met('플라스크 안에서 산소가 철에 옮겨 붙었을 뿐, 안팎으로 드나든 물질은 없다', '플라스크 안에서 산소가 철과 결합한 일과, 플라스크 밖으로 드나든 물질이 없다는 경계를 함께 밝혔다.') },
        errors: [], explanationAttempt: true, explanationQuality: 4, nextQuestion: '', highlights: []
      }
    },
    Q3: {
      source: 'draft', delay: 1600,
      text: E.STAGES.Q3.starter + meaning(TEXT.Q3),
      analysis: {
        inputStatus: 'meaningful', diagnosis: 'NONE',
        checks: { oxygenMass: met('줄어든 산소가 철에 붙었고, 늘어난 0.5 g은 그 산소의 질량', '줄어든 산소가 철에 붙었다는 것과 늘어난 0.5 g이 그 산소의 질량이라는 것을 함께 밝혔다.') },
        errors: [], explanationAttempt: true, explanationQuality: 4, nextQuestion: '', highlights: []
      }
    },
    final: {
      source: 'draft', delay: 2600,
      text: TEXT.final,
      analysis: {
        inputStatus: 'meaningful', diagnosis: 'NONE',
        checks: {
          C: met('강철솜이 공기 중의 산소와 결합했기 때문이다', '실험 A의 강철솜이 무거워진 까닭을 공기 중 산소와의 결합으로 밝혔다.'),
          'D-A': met('실험 A에서 강철솜은 2.0 g에서 2.5 g으로 0.5 g 늘었고', '실험 A의 측정값과 증가분을 적었다.'),
          'D-B': met('마개를 막은 실험 B에서는 플라스크 전체가 150.0 g 그대로였다', '실험 B의 플라스크 전체 질량이 그대로임을 적었다.'),
          W1a: { status: 'missing', quote: '', reason: '질량이 저절로 생기지 않는다는 원리를 A에 적용한 문장은 없다.' },
          W1b: met('철이 타는 동안 공기 중에서 줄어드는 기체는 산소뿐이므로 철에 붙는 것은 산소이다', '공기 중에서 산소만 줄어드는 관찰로 더해진 물질을 산소로 특정했다.'),
          W2a: met('플라스크 안의 산소가 철에 옮겨 붙었을 뿐 밖으로 드나든 물질이 없어서 전체 질량이 변하지 않았다', '닫힌 플라스크 안에서 산소가 옮겨 갔을 뿐 출입이 없어 전체 질량이 일정함을 설명했다.'),
          W2b: met('A에서 늘어난 0.5 g은 접시 밖 공기에서 들어와 철과 결합한 산소의 질량이다', '증가분을 바깥에서 들어와 결합한 산소의 질량으로 해석했다.')
        },
        errors: [], explanationAttempt: true, explanationQuality: 4, nextQuestion: '',
        highlights: [
          { quote: '플라스크 안의 산소가 철에 옮겨 붙었을 뿐 밖으로 드나든 물질이 없어서 전체 질량이 변하지 않았다', occurrence: 0, roles: ['W2a'],
            explanation: '150.0 g이 그대로인 까닭을 플라스크 안에서 산소가 옮겨 붙었을 뿐 드나든 물질이 없다는 뜻으로 풀어냈어요.', isNew: true, newReason: '처음 생각에는 실험 B의 결과를 해석한 내용이 없었어요.' },
          { quote: '철이 타는 동안 공기 중에서 줄어드는 기체는 산소뿐이므로 철에 붙는 것은 산소이다', occurrence: 0, roles: ['W1b'],
            explanation: '공기 중에서 산소만 줄어든다는 관찰로, 더해진 물질이 왜 하필 산소인지 밝혔어요.', isNew: true, newReason: '처음에는 산소라고만 했고 왜 산소인지는 밝히지 않았어요.' },
          { quote: 'A에서 늘어난 0.5 g은 접시 밖 공기에서 들어와 철과 결합한 산소의 질량이다', occurrence: 0, roles: ['W2b'],
            explanation: '늘어난 0.5 g을 바깥 공기에서 들어와 철과 결합한 산소의 질량으로 번역했어요.', isNew: true, newReason: '처음 생각에는 증가분이 무엇의 질량인지 없었어요.' }
        ]
      }
    }
  };
  window.SCIW_DEMO = { scene, text: TEXT, fixtures: FIXTURES, prefill: (q) => (q === 'final' ? TEXT.final : TEXT[q] || '') };

  const claimCard = () => {
    S.claim = M.claimOptions.find((o) => o.correct);
    S.cards.claim = { kind: 'claim', title: '내 주장', text: '강철솜이 공기 중의 산소와 결합했다.', sentence: S.claim.text };
  };
  // 꼬투리 i를 통과한 상태: 교수의 빨간 글씨가 학생의 문장으로 지워져 있다
  const linkDone = (i, typed) => {
    const c = S.cards[M.links[i].data];
    c.mis = M.links[i].mis;
    c.back = meaning(typed);
  };

  // 탐색과 주장까지 마친 실험실: 두 강철솜은 다 탔고, 처음 생각과 주장이 칠판에 있다
  function seedLab() {
    document.body.classList.add('demo-mode');
    // 시연 중에는 '이 브라우저에 저장됨' 같은 기록 상태 표시를 감춘다
    const style = document.createElement('style');
    style.textContent = '.demo-mode #sciw-save-status{display:none!important}';
    document.head.appendChild(style);
    S.classCode = '3-1'; S.studentNo = '7';
    S.sessionId = API.uid('demo');
    API.startSession({ sessionId: S.sessionId, missionId: M.id, classCode: S.classCode, studentNo: S.studentNo, startedAt: new Date().toISOString(), stage: 'rebuttal', isTest: true, demo: scene });
    $('#who').textContent = '시연 · 3학년 1반 7번';
    $('#startScreen').hidden = true;
    S.started = true;
    E.buildBench();
    S.done.burnA = S.done.burnB = true;
    S.boardOpen = true;
    $('#numA').textContent = M.devices.A.after.toFixed(1) + ' g';
    $('#tagA').textContent = '2.0 → 2.5 g';
    $('#tagB').textContent = '150.0 → 150.0 g';
    ['#devA', '#devB'].forEach((sel) => { const w = $(sel + ' .wool-dark'); if (w) w.style.opacity = '1'; });
    S.firstAnswer = TEXT.first;
    claimCard();
    S.tray = ['cA', 'cB'];
  }
  // 드러내기 칠판: 꼬투리 셋이 적혀 있고, 콧대 게이지가 보인다
  function seedRebuttal(link, nose) {
    S.linkBoard = true;
    S.link = link;
    E.setStage('rebuttal');
    $('#stage').classList.add('spot');
    $('#noseMeter').hidden = false;
    E.setNose(nose);
    E.renderSmallBoard();
    E.renderTray();
    E.fit();
  }

  async function scene1() {
    seedLab();
    S.tray.push('e1'); // 실제 흐름에서는 뒷면을 쓰기 전에 현미경(밀폐 용기)을 보고 온다. 그 돋보기를 쥐여 둔다.
    seedRebuttal(0, 4);
    await E.sleep(600);
    await E.openGap(0); // 교수가 실험 B 카드를 뒤집어 '아무 일도 안 일어났다는 뜻이군!'이라고 적는다
    await E.askLink(0); // 뒷면 쓰기: 답 칸에 시연 문장이 들어가 있다
  }
  async function scene2() {
    seedLab();
    linkDone(0, TEXT.Q1);
    linkDone(1, TEXT.Q2);
    S.tray.push('e1', 'e2');
    seedRebuttal(2, 2);
    await E.sleep(600);
    await E.nextGap(2); // "공기 중엔 질소가 훨씬 많은데, 왜 하필 산소라고 하나?" → 현미경이 빛난다
  }
  async function scene3() {
    seedLab();
    linkDone(0, TEXT.Q1);
    linkDone(1, TEXT.Q2);
    linkDone(2, TEXT.Q3);
    S.tray.push('e1', 'e2', 'e3', 'l3');
    seedRebuttal(null, 1);
    S.linkBoard = false;
    $('#stage').classList.remove('spot');
    E.startCompose();
    // 혼자 힘으로 쓴 답: 카드 문장을 붙이지 않았으므로 결과 화면에서 강철솜 키링을 받는다
    const own = $('#ownMode');
    own.checked = true;
    own.dispatchEvent(new Event('change'));
    const ta = $('#answer');
    ta.value = TEXT.final;
    ta.dispatchEvent(new Event('input'));
    ta.scrollTop = 0;
  }

  const run = { 1: scene1, 2: scene2, 3: scene3 }[scene];
  if (run) run().catch((e) => console.error('[demo]', e));
})();
