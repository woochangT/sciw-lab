const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = { window: {} };
vm.createContext(context);
for (const file of ['missions/mission01.js', 'js/judge.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
}
const mission = context.window.SCIW_MISSIONS.m01;
const judge = context.window.SCIW_JUDGE;
const q3 = mission.quests.find(q => q.id === 'Q3');
const checkQ3 = text => judge.judgeQuestText(q3, `${q3.answer.starter} ${text}`, null, mission.lexicon);

for (const text of [
  '감자에서 물이 빠져나갔다는 것이고 이는 감자의 진하기가 10%보다는 묽다는 것',
  '감자에서 물이 빠져나갔다는 것이다. 물은 묽은 곳에서 진한 곳으로 이동하므로 감자의 진하기가 10%보다는 묽다는 것을 알 수 있다.',
  '물이 감자 밖으로 빠져나갔고 감자의 진하기가 10%보다 낮다는 뜻이다.',
  '감자에서 수분이 빠져나왔고 감자 세포 안은 10% 설탕물보다 묽다.'
]) {
  test(`Q3 accepts a correct comparison: ${text}`, () => {
    const result = checkQ3(text);
    assert.equal(result.diagnosis, 'PASS');
    assert.equal(result.checks.water_out, true);
    assert.equal(result.checks.inside_low, true);
  });
}

for (const text of [
  '물이 감자 밖으로 빠져나갔고 감자 안은 10%보다 진하다.',
  '물이 감자 안으로 들어왔고 감자 안은 10%보다 묽다.',
  '물이 감자 밖으로 빠져나갔다. 물은 진한 곳에서 묽은 곳으로 이동하므로 감자 안은 10%보다 묽다.',
  '물이 빠져나갔고 감자의 진하기가 10%보다 높다.'
]) {
  test(`Q3 still rejects reversed explanations: ${text}`, () => {
    assert.equal(checkQ3(text).diagnosis, 'E2');
  });
}

test('Q3 still requires the comparison with the outside concentration', () => {
  assert.equal(checkQ3('물이 감자 밖으로 빠져나갔다는 것이다.').diagnosis, 'E3');
});

test('Q2 accepts the correct dilute-to-concentrated direction and rejects its reverse', () => {
  const q2 = mission.quests.find(q => q.id === 'Q2');
  assert.equal(judge.judgeQuestText(q2, '묽은 곳에서 진한 곳으로', 'high', mission.lexicon).diagnosis, 'PASS');
  assert.equal(judge.judgeQuestText(q2, '진한 곳에서 묽은 곳으로', 'high', mission.lexicon).diagnosis, 'E2');
});

test('Final defense recognizes concentration nouns without inventing a reverse comparison', () => {
  const text = '감자 세포 안 농도는 5%와 10% 사이이다. 5% 설탕물에서는 질량이 3 g 늘었고, 10% 설탕물에서는 질량이 5 g 줄었다. 5%에서는 물이 들어왔으므로 감자의 진하기는 5%보다 진하다. 10%에서는 물이 빠져나갔으므로 감자의 진하기는 10%보다 묽다. 물은 묽은 곳에서 진한 곳으로 이동한다.';
  const result = judge.judgeDefense(text, mission.lexicon, mission.answer);
  for (const key of ['C', 'D', 'W1', 'W2a', 'W2b', 'W3']) assert.equal(result.elements[key], true, key);
  assert.equal(result.errors.includes('E2'), false);
});
