const {test}=require('node:test'),assert=require('node:assert/strict');
require('../model.js');require('../scope.js');require('../insights.js');require('../overview-ui.js');require('../record-ui.js');require('../dashboard-ui.js');
const M=globalThis.TeacherModel,I=globalThis.TeacherInsights,U=globalThis.TeacherRecordUI,D=globalThis.TeacherDashboardUI;
const session=(id,no,extra={})=>({sessionId:id,classCode:'3-2',studentNo:String(no),missionId:'m02',startedAt:'2026-11-03T00:00:00Z',finalAnswer:'합성 답안',...extra});
const attempt=(id,s,extra={})=>({attemptId:id,sessionId:s.sessionId,missionId:s.missionId,stage:'compose',questId:'final',input:'합성 답안',createdAt:'2026-11-03T00:01:00Z',...extra});
const state=(s,attempts=[])=>I.judgmentStatus({attempts},s);

test('stored elements complete a judgment; an answer and science error alone do not',()=>{
 const done=session('done',1,{finalJudgment:{C:false}});
 assert.equal(state(done).code,'completed');
 const old=session('old',2,{finalJudgment:{},firstError:'E2'});
 assert.equal(state(old).code,'missing');
 assert.equal(state(old,[attempt('old-final',old,{judgment:{},errorType:'E2'})]).code,'missing');
});

test('pending and failed require explicit saved evaluation status',()=>{
 const pending=session('pending',3,{finalJudgment:{}}),failed=session('failed',4,{finalJudgment:{}});
 assert.equal(state(pending,[attempt('raw',pending,{questId:'studentInput',evaluationStage:'final',evaluationStatus:'processing'})]).code,'pending');
 const failure=state(failed,[attempt('raw',failed,{questId:'studentInput',evaluationStage:'final',evaluationStatus:'failed',evaluationErrorCode:'RATE_LIMIT'})]);
 assert.equal(failure.code,'failed');assert.equal(failure.errorCode,'RATE_LIMIT');
 assert.equal(state(failed,[attempt('raw',failed,{questId:'studentInput',evaluationStage:'final'})]).code,'missing');
 const raw=attempt('raw2',failed,{questId:'studentInput',evaluationStage:'final'});
 const speech=attempt('speech',failed,{questId:'professorSpeech',feedbackSource:'displayed',inReplyTo:'raw2',feedbackText:'지금은 답을 읽지 못했네. 잠시 뒤 다시 제출해 주게.'});
 assert.equal(state(failed,[raw,speech]).code,'failed');
 assert.equal(state(failed,[raw,{...speech,inReplyTo:'another-input'}]).code,'missing');
});

test('only final evaluation records can prove unavailable',()=>{
 const steel=session('steel',5,{finalJudgment:{}});
 assert.equal(state(steel,[attempt('clarify',steel,{questId:'clarify',outcome:'clarify'})]).code,'unavailable');
 const potato={...session('potato',6,{finalJudgment:{C:true}}),missionId:'m01'};
 const unclear=[attempt('unclear',potato,{stage:'defense',questId:'FINAL',diagnosis:'UNCLEAR',judgment:{C:false}})];
 assert.equal(state(potato,unclear).code,'unavailable');
 assert.equal(I.evaluation({attempts:unclear},potato).has,false);
 assert.equal(state(steel,[attempt('initial',steel,{stage:'claim',questId:'first',outcome:'clarify'})]).code,'missing');
});

test('the class row and answer detail show the same status independently of answer presence',()=>{
 const sessions=[session('done',1,{finalJudgment:{C:true},rubricVersion:'m02-docx-1.2.0'}),session('pending',2,{finalAnswer:''}),session('failed',3),session('unavailable',4),session('missing',5)];
 const attempts=[attempt('p',sessions[1],{questId:'studentInput',evaluationStage:'final',evaluationStatus:'pending'}),attempt('f',sessions[2],{questId:'studentInput',evaluationStage:'final',evaluationStatus:'failed',evaluationErrorCode:'<FAIL>'}),attempt('u',sessions[3],{questId:'clarify',outcome:'clarify'})];
 const db={sessions,attempts},data=M.analyze(db,'3-2','latest',{missionId:'m02'}),portfolio=I.overview(db),selectedClass=portfolio.classes[0];
 const html=D.screen({portfolio,data,selectedClass,mission:'m02',source:'demo'});
 for(const label of ['판정 완료','판정 대기','판정 실패','판정 불가','판정 기록 없음'])assert.match(html,new RegExp(label));
 assert.match(html,/<th scope="col">AI 판정/);
 const pendingRow=html.match(/<tr><th scope="row"><b>2번<\/b>[\s\S]*?<\/tr>/)?.[0];
 assert.match(pendingRow,/submission-status ">작성 전/);assert.match(pendingRow,/status-pending">판정 대기/);
 assert.match(U.criterion(data,sessions[2],''),/판정 실패/);
 assert.match(U.criterion(data,sessions[2],''),/&lt;FAIL&gt;/);
 assert.doesNotMatch(U.criterion(data,sessions[2],''),/<FAIL>/);
});
