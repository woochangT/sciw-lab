const {test}=require('node:test'),assert=require('node:assert/strict');
require('../model.js');require('../scope.js');require('../insights.js');require('../record-ui.js');
const M=globalThis.TeacherModel,I=globalThis.TeacherInsights,U=globalThis.TeacherRecordUI;
const s={sessionId:'s',missionId:'m02',classCode:'3-2',studentNo:'2',finalAnswer:'마지막 답안',finalJudgment:{W1b:false},analysis:{checks:{W1b:{reason:'이전 판정'}}}};
const a={attemptId:'a',sessionId:'s',stage:'compose',questId:'final',input:'밖의 <산소>가 철에 붙었다.',judgment:{W1b:true},rubricVersion:'m02-docx-1.2.0',analysis:{checks:{W1b:{status:'met',quote:'<산소>가 철에 붙었다.',reason:'학생이 산소의 결합을 설명함'}}}};
test('clicked criterion shows the same final attempt judgment, exact quote, reason and assessed answer safely',()=>{
 const data={attempts:[a]},html=U.criterion(data,s,'W1b');
 assert.equal(I.evaluation(data,s).judgment.W1b,true);assert.match(html,/산소 특정 이유 · 인정/);assert.match(html,/학생이 산소의 결합을 설명함/);assert.match(html,/&lt;산소&gt;가 철에 붙었다/);assert.doesNotMatch(html,/<산소>/);assert.doesNotMatch(html,/이전 판정/);
});
test('missing historical reasons stay missing; fabricated or nonmatching quotes are not highlighted',()=>{
 assert.match(U.criterion({attempts:[]},{...s,analysis:{}},'W1b'),/항목별 판정 이유가 저장되지/);
 const changed={...a,analysis:{checks:{W1b:{quote:'존재하지 않는 구절',reason:'합성 이유'}}}};
 assert.match(U.criterion({attempts:[changed]},s,'W1b'),/답안과 일치하지 않아/);assert.doesNotMatch(U.criterion({attempts:[changed]},s,'W1b'),/<blockquote>/);
});
test('stage conversations preserve student text and displayed feedback in chronological stages without executing markup',()=>{
 const html=U.timeline({attempts:[{...a,createdAt:'2026-11-03T00:00:00Z'},{attemptId:'b',sessionId:'s',stage:'compose',questId:'professorSpeech',feedbackText:['<script>대사</script>'],feedbackSource:'displayed',inReplyTo:'a',createdAt:'2026-11-03T00:01:00Z'}]},s);
 assert.match(html,/최종 서술/);assert.match(html,/학생 답변/);assert.match(html,/화면에 표시된 교수 대사/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);assert.doesNotMatch(html,/이 답변의 교수 피드백은/);
});
test('potato final defense submissions provide their own judgment and not the initial assessment',()=>{
 const potato={...s,missionId:'m01',finalJudgment:{C:false}},last={attemptId:'p',sessionId:'s',stage:'defense',questId:'FINAL',input:'최종 감자 답',judgment:{C:true}};
 assert.equal(M.submissions({attempts:[last]},potato).length,1);assert.equal(I.evaluation({attempts:[last]},potato).judgment.C,true);
});
test('unfinished inputs are visible without being mistaken for a final answer or an automatic judgment',()=>{
 const html=U.timeline({attempts:[]},{...s,endedAt:'',stage:'compose',draftAnswer:'작성 중인 <원문>',draftQuestion:'질문 <내용>',draftSavedAt:'2026-11-04'});
 assert.match(html,/작성 중인 답안 · 최종 서술/);assert.match(html,/아직 평가되지 않은 입력/);assert.match(html,/작성 중인 &lt;원문&gt;/);assert.doesNotMatch(html,/<원문>/);
 assert.doesNotMatch(U.timeline({attempts:[]},{...s,endedAt:'2026-11-04',draftAnswer:'이전 초안'}),/작성 중인 답안/);
});
