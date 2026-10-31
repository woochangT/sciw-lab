// 미션 02 판정 회귀 테스트: node --test tests/judge02.test.cjs
const test = require('node:test');
const assert = require('node:assert');
const J = require('../js/judge02.js');

test('Q1: 그대로였다는 것의 뜻', () => {
  assert.equal(J.judgeQ1('반응하는 동안 질량이 새로 생기거나 사라지지 않고, 플라스크 안에서 물질이 옮겨 갔을 뿐이라는 뜻이다').pass, true);
  assert.equal(J.judgeQ1('질량이 보존된다는 뜻이다').pass, true);
  assert.equal(J.judgeQ1('산소가 철 쪽으로 옮겨 붙기만 했다는 뜻').pass, true);
  assert.equal(J.judgeQ1('산소가 모자라 강철솜이 타지 않았다').diag, 'noBurn');
  assert.equal(J.judgeQ1('플라스크 안의 기체는 질량이 없다').diag, 'E2');
  assert.equal(J.judgeQ1('질량이 변하지 않았다는 뜻').diag, 'N1');
  assert.equal(J.judgeQ1('ㅁㄴ').diag, 'unclear');
});

test('Q2: 늘어난 것은 어디서 온 무엇인가 (한 줄)', () => {
  assert.equal(J.judgeQ2('outside', '공기 중의 산소가 들어와 붙었다').pass, true);
  assert.equal(J.judgeQ2('outside', '바깥에서 들어온 산소').pass, true);
  assert.equal(J.judgeQ2('outside', '공기가 들어와서').diag, 'N5');
  assert.equal(J.judgeQ2('outside', '현미경에서 빨간 공이 들어가서').diag, 'modelOnly');
  assert.equal(J.judgeQ2('outside', '산소가 철에 붙었다').diag, 'needAir');
  assert.equal(J.judgeQ2('inside', '공기 중의 산소').diag, 'choiceWrong');
});

test('Q3: 0.5 g의 의미', () => {
  assert.equal(J.judgeQ3('실험 A에서 늘어난 0.5 g은 공기 중에서 들어와 강철솜과 결합한 산소의 질량이다.').pass, true);
  assert.equal(J.judgeQ3('늘어난 0.5 g은 산소가 붙은 만큼이다').pass, true);
  assert.equal(J.judgeQ3('0.5 g은 산화 철이다').diag, 'N2');
  assert.equal(J.judgeQ3('0.5 g은 산소가 생긴 것이다').diag, 'E4');
});

test('최종 변론: 완전한 답(경로 ②)은 통과', () => {
  const t = '강철솜이 공기 중의 산소와 결합했기 때문이다. 실험 A에서 강철솜의 질량은 2.0 g에서 2.5 g으로 늘었다. ' +
    '실험 B에서 마개를 막고 태웠는데도 전체 질량이 150.0 g 그대로였다. 이것은 질량이 새로 생기거나 사라지지 않고 안에서 옮겨 갔을 뿐이라는 뜻이다. ' +
    '접시 위에서 강철솜과 닿아 있던 것은 공기뿐이고 탈 때는 산소가 필요하다. 따라서 늘어난 0.5 g은 공기에서 들어와 결합한 산소의 질량이다.';
  const r = J.judgeFinal(t);
  assert.equal(r.pass, true, JSON.stringify(r));
});

test('최종 변론: 부족한 답은 숫자의 뜻(W2)부터 묻는다', () => {
  const n1 = J.judgeFinal('태우기 전에는 2.0 g이었는데 태운 후에는 2.5 g이 되어 질량이 0.5 g 늘어났기 때문이다.');
  assert.equal(n1.pass, false);
  assert.equal(n1.ask, 'W2b');
  const n3 = J.judgeFinal('산화 철이 되었다. 실험 B에서 마개를 막고 태웠을 때 전체 질량이 150.0 g으로 변하지 않았기 때문이다.');
  assert.equal(n3.pass, false);
  assert.equal(n3.ask, 'W2b');
});

test('부정한 오개념은 오류로 세지 않는다', () => {
  assert.equal(J.features('열이 더해진 게 아니라 산소가 결합했다').E1, false);
  assert.equal(J.features('불꽃의 열이 더해져 무거워졌다').E1, true);
  const f = J.features('강철솜이 스스로 늘 수는 없으므로 바깥에서 들어온 것이다');
  assert.equal(f.E4, false);
  assert.equal(f.W1a, true);
  assert.equal(J.features('마개를 열어 두었다').E1, false);
});

test('처음 답 진단 표시', () => {
  assert.equal(J.tagFirst('질량이 0.5 g 늘었기 때문이다'), 'N1');
  assert.equal(J.tagFirst('산화 철이 되었다'), 'N2');
  assert.equal(J.tagFirst('실험 B에서 150.0 g으로 그대로였기 때문이다'), 'N3');
  assert.equal(J.tagFirst('불의 열이 더해져서'), 'E1');
});

test('클리어 화면: 주장 문장은 연결로 칠하지 않고, 앞 문장을 받는 W2a 문장은 칠한다', () => {
  const roles = J.sentenceRoles('강철솜이 공기 중의 산소와 결합했기 때문이다. 실험 B에서 마개를 막고 태웠는데도 전체 질량이 150.0 g 그대로였다. 이것은 질량이 새로 생기거나 사라지지 않고 안에서 옮겨 갔을 뿐이라는 뜻이다.');
  assert.deepEqual(roles[0].roles, []);
  assert.ok(roles[2].roles.includes('W2a'));
});

test('경로 ②의 느슨한 W2b는 한 문장 안에서 증가와 산소를 이어야 한다', () => {
  const r = J.judgeFinal('강철솜이 산소와 결합했기 때문이다. 실험 A에서 2.0 g에서 2.5 g으로 늘었고 실험 B에서 마개를 막고 태웠을 때 150.0 g 그대로였다.');
  assert.equal(r.ask, 'W2b');
  assert.equal(J.features('강철솜이 산소와 결합해서 무거워졌다').W2bLoose, true);
});

test('한 줄 이유: 장면을 가리키는 구체적 질문에 대한 답', () => {
  assert.equal(J.judgeQ1('산소는 플라스크 안에서 철에 붙었다').pass, true);
  assert.equal(J.judgeQ1('산소는 점선 안에 그대로 있고 철에 붙었을 뿐이다').pass, true);
  assert.equal(J.judgeQ1('산소는 사라졌다').pass, false);
  assert.equal(J.judgeQ2('outside', '그 산소는 점선 밖 공기 중에 떠 있다가 들어왔다').pass, true);
  assert.equal(J.judgeQ2('outside', '그 산소는 점선 밖에 있었다').pass, true);
  assert.equal(J.judgeQ3('늘어난 0.5 g은 붙은 산소 다섯 개의 무게').pass, true);
});

test('codex 검증 반례: 부정·문장 섞기·오개념 표현', () => {
  const full = '강철솜이 공기 중의 산소와 결합했기 때문이다. 실험 A에서 강철솜의 질량은 2.0 g에서 2.5 g으로 늘었다. ' +
    '실험 B에서 마개를 막고 태웠는데도 전체 질량이 150.0 g 그대로였다. 이것은 질량이 새로 생기거나 사라지지 않고 안에서 옮겨 갔을 뿐이라는 뜻이다. ' +
    '접시 위에서 강철솜과 닿아 있던 것은 공기뿐이고 탈 때는 산소가 필요하다. 따라서 늘어난 0.5 g은 공기에서 들어와 결합한 산소의 질량이다.';
  // 1. 주장·W1b를 부정하면 통과하지 않는다
  assert.equal(J.features(full.replace('산소와 결합했기 때문이다', '산소와 결합하지 않았기 때문이다')).C, false);
  assert.equal(J.features('강철솜이 탈 때 산소가 필요하지 않다.').W1b, false);
  // 2. W2b는 한 문장 안에서만
  assert.equal(J.features('강철솜이 산소와 결합했다. 늘어난 0.5 g은 열의 질량이다.').W2b, false);
  assert.equal(J.judgeFinal(full.replace('따라서 늘어난 0.5 g은 공기에서 들어와 결합한 산소의 질량이다.', '따라서 늘어난 0.5 g은 열의 질량이다.')).pass, false);
  // 3. 맞게 쓴 부정문은 E2가 아니다
  assert.equal(J.features('산소는 질량이 없는 것이 아니라 철 쪽으로 옮겨 갔다').E2, false);
  assert.equal(J.judgeQ1('산소는 질량이 없는 것이 아니라 철 쪽으로 옮겨 갔다').pass, true);
  assert.equal(J.features('산소는 기체라 질량이 없다').E2, true);
  // 4. '증가' 표현도 E1으로 잡는다
  assert.equal(J.features('불꽃의 열 때문에 질량이 증가했다').E1, true);
  assert.equal(J.judgeFinal(full + ' 불꽃의 열 때문에 질량이 증가했다.').pass, false);
  // 원래 완전한 답은 그대로 통과
  assert.equal(J.judgeFinal(full).pass, true);
});

test('플레이 중 찾은 모순: 사라졌다·들어오지 않았다는 통과시키지 않는다', () => {
  assert.equal(J.judgeQ1('산소는 플라스크 안에서 사라졌다').diag, 'vanish');
  assert.equal(J.judgeQ1('산소는 플라스크 안에서 철에 붙었다').pass, true);
  assert.equal(J.judgeQ1('산소는 사라지지 않고 철로 옮겨 갔다').pass, true);
  assert.equal(J.judgeQ2('outside', '그 산소는 바깥에서 들어오지 않았다').diag, 'inflowNeg');
  assert.equal(J.judgeQ2('outside', '그 산소는 점선 밖 공기 중에 있었다').pass, true);
});
