const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ctx = {window:{}};
vm.createContext(ctx);
for (const file of ['missions/mission01.js','js/learning.js']) vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),ctx);
const L = ctx.window.SCIW_LEARNING;
const copy = ctx.window.SCIW_MISSIONS.m01.clear.feedback;

test('Concept names are student-readable while internal IDs stay stable',()=>{
  assert.equal(L.modelLabel('M1'),'개념 1'); assert.equal(L.modelLabel('M2'),'개념 2');
});
test('Typing a standard scientific sentence does not falsely count as card use',()=>{
  const cards=[{id:'M2',sentence:'물은 묽은 쪽에서 진한 쪽으로 이동한다.'}];
  assert.equal(L.cardsInText(cards,cards[0].sentence,[]).length,0);
  assert.equal(L.cardsInText(cards,cards[0].sentence,['M2']).length,1);
  assert.equal(L.cardsInText(cards,'내가 다시 쓴 설명',['M2']).length,0);
});
test('Own-words reward requires meaningful self-written content and no retained card contribution',()=>{
  const own={mode:'own',own:{W1:true},usedCards:[],cardSentences:[],unclear:false};
  assert.equal(L.giftEligible(own,'물이 감자 밖으로 빠져나갔다.'),true);
  assert.equal(L.giftEligible({...own,mode:'cards'},'물이 빠져나갔다.'),false);
  assert.equal(L.giftEligible({...own,usedCards:['M1']},'물이 빠져나갔다.'),false);
  assert.equal(L.giftEligible({...own,cardSentences:['가져온 문장']},'가져온 문장'),false);
  assert.equal(L.giftEligible({...own,own:{}},'아무 뜻 없는 말'),false);
  assert.equal(L.giftEligible(own,'   '),false);
});
test('Feedback separately explains interpreting the measurement and reasoning about the invisible cell',()=>{
  const result={own:{W1:true,W2a:true,W2b:true},ownEvidence:{W1:'물이 감자 안으로 들어왔다.',W2a:'감자 안은 5%보다 진하다.',W2b:'감자 안은 10%보다 묽다.'}};
  const feedback=L.feedback(result,copy);
  assert.deepEqual(Array.from(feedback,p=>p.kind),['W1','W2']);
  assert.match(feedback[0].focus,/물의 드나듦/); assert.match(feedback[1].focus,/농도 관계/);
  assert.equal(L.feedback({own:{},ownEvidence:result.ownEvidence},copy).length,0);
});
test('The equilibrium explanation gets matching feedback rather than an invented direction rule',()=>{
  const feedback=L.feedback({own:{WB:true},ownViaWB:true,ownEvidence:{WB:'농도가 같으면 질량 변화가 없다.'}},copy);
  assert.equal(feedback[0].kind,'WB'); assert.match(feedback[0].focus,/농도가 같으면/);
});
test('Feedback highlights the actual concept phrase and escapes student HTML',()=>{
  const water=L.highlightQuote('질량이 늘었다는 것은 물이 감자 안으로 들어왔다는 뜻이다.','W1');
  const comparison=L.highlightQuote('감자의 진하기가 10%보다는 묽다는 것을 알 수 있다.','W2');
  assert.match(water,/<mark>물이 감자 안으로 들어왔다는<\/mark>/);
  assert.match(comparison,/<mark>10%보다는 묽다는<\/mark>/);
  const unsafe=L.highlightQuote('<img src=x onerror=alert(1)> 물이 빠져나갔다.','W1');
  assert.ok(!unsafe.includes('<img')); assert.ok(unsafe.includes('&lt;img'));
});
