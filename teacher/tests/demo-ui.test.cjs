const {test}=require('node:test');const assert=require('node:assert/strict');
require('../model.js');require('../scope.js');require('../evidence.js');require('../insights.js');require('../demo.js');
const M=global.TeacherModel,I=global.TeacherInsights,E=global.TeacherEvidence,demo=global.TeacherDemo;
const session=(id,no,extra={})=>({sessionId:id,classCode:'A',studentNo:no,missionId:'m02',startedAt:'2026-11-01T00:00:00Z',...extra});
test('class denominator deduplicates normalized numbers, retries, mirrors and excludes QA, other classes and m01',()=>{
 const s=session('first','02'),db={sessions:[s,s,session('second',' 2 '),session('third','2'),session('other','2',{classCode:'B'}),session('potato','3',{missionId:'m01'}),session('qa_auto','4'),session('explicit-test','5',{isTest:true}),session('invalid','X'),session('student3','3')],attempts:[]};
 const a=M.analyze(db,'A');assert.equal(a.stats.N,2);assert.equal(a.sessions.length,4);assert.equal(a.review.length,1);assert.equal(a.reps.length,2);assert.equal(M.analyze(db,'B').stats.N,1);
});
test('first play distribution remains stable after a retry; latest ties use session ID',()=>{
 const first=session('a','1',{finalJudgment:{C:false}}),retry=session('b','1',{startedAt:'2026-11-01T01:00:00Z',finalJudgment:{C:true}}),tie=session('c','1',{startedAt:retry.startedAt});
 assert.equal(M.analyze({sessions:[retry,first],attempts:[]},'A').reps[0].sessionId,'a');
 assert.equal(M.analyze({sessions:[tie,first,retry],attempts:[]},'A','latest').reps[0].sessionId,'c');
 assert.equal(M.analyze({sessions:[first,retry],attempts:[]},'A','all').reps.length,2);
});
test('false, empty judgment, and prior quest success are separate evidence states',()=>{
 assert.equal(M.element({finalJudgment:{C:false}},'C'),'자동 판정 미인정');assert.equal(M.element({finalJudgment:{}},'C'),'미관찰');assert.equal(M.element({questPassed:{C:true}},'C'),'퀘스트 기록');assert.equal(M.element({finalJudgment:'{"C":true}'},'C'),'기록됨');
});
test('hint unlock never implies viewing; old hintView proves viewing only',()=>{
 const s=session('s','1'),data={attempts:[{sessionId:'s',attemptId:'a',hintExposure:'unlocked'}]};assert.equal(M.hint(data,s),'해제됨');data.attempts.push({sessionId:'s',attemptId:'b',questId:'hintView'});assert.equal(M.hint(data,s),'열람');assert.equal(M.hint({attempts:[]},{...s,hintLevel:2}),'미기록');
});
test('event and submission ordering survive retries; summaries are not invented submissions',()=>{
 const s=session('s','1',{finalAnswer:'최종 요약'}),attempts=[{attemptId:'2',sessionId:'s',stage:'compose',questId:'final',eventOrder:8,submissionNo:2,input:'두 번째'},{attemptId:'1',sessionId:'s',stage:'compose',questId:'final',eventOrder:3,submissionNo:1,input:'첫 번째'}];
 const a=M.analyze({sessions:[s],attempts:[...attempts,attempts[0]]},'A');assert.deepEqual(M.submissions(a,s).map(x=>x.input),['첫 번째','두 번째']);assert.equal(a.attempts.length,2);assert.equal(M.submissions({attempts:[]},s).length,0);
});
test('stage entry is observed only from actual stage or events, not collected cards',()=>{
 const s=session('s','1',{clueCards:['a','b'],stage:'claim'}),data={attempts:[]};assert.equal(M.observed(data,s,'rebuttal'),false);assert.equal(M.evidence(data,s,'claim'),'기회 제시');data.attempts.push({sessionId:'s',stage:'rebuttal',eventStatus:'opened'});assert.equal(M.evidence(data,s,'rebuttal'),'기회 제시');
});
test('unknown ending is not converted to partial completion; active count uses recent activity',()=>{
 const old=session('s','1',{updatedAt:'2020-01-01'});assert.equal(M.state(old),'종료 미상');assert.equal(M.state({...old,updatedAt:new Date().toISOString()}),'종료 미상');assert.equal(M.state({...old,lastActiveAt:new Date().toISOString()}),'진행 중');assert.equal(M.state({...old,clearType:'partial'}),'부분 완료');
});
test('judgment comparisons require matching explicit mission, log and judge versions',()=>{
 const s={missionVersion:'m02-1',eventSchemaVersion:'v1',judgeVersion:'j1'};assert.equal(M.comparable(s,{...s}),true);assert.equal(M.comparable(s,{...s,judgeVersion:'j2'}),false);assert.equal(M.comparable({},{...s}),false);
});
test('version filters keep cumulative class denominator and never change source answers',()=>{
 const db={sessions:[session('s','1',{missionVersion:'v1',finalAnswer:'원문'}),session('t','2',{missionVersion:'v2'})],attempts:[]},before=JSON.stringify(db);const a=M.analyze(db,'A','first',{version:'v1'});assert.equal(a.stats.N,2);assert.equal(a.reps.length,1);assert.equal(JSON.stringify(db),before);
});
test('synthetic classroom exposes 24 unique students and 20 first final submissions',()=>{
 const a=M.analyze(demo,'2-3');assert.equal(a.stats.N,24);assert.equal(a.stats.submitted,20);assert.equal(a.sessions.length,27);assert.equal([...a.groups.values()].filter(ss=>ss.length>1).length,3);
});

test('every completed example has explicit rubric values, matching evidence and a class report in both games',()=>{
 for(const classCode of ['1-2','2-3','3-4'])for(const missionId of ['m01','m02']){
  const data=M.analyze(demo,classCode,'latest',{missionId});
  for(const session of data.sessions.filter(s=>s.finalAnswer)){
   const assessment=I.evaluation(data,session);
   assert.ok(session.synthetic&&assessment.has);
   for(const [key] of I.definitions[missionId])assert.notEqual(I.element(assessment.judgment,key),'unknown');
   for(const [key,check] of Object.entries(assessment.analysis.checks)){
    assert.ok(check.reason);
    if(assessment.judgment[key])assert.ok(check.quote&&session.finalAnswer.includes(check.quote));
   }
  }
  const result=I.recordLesson(data,E.build(demo,classCode,'latest',{missionId}));
  assert.equal(result.observations.length,2);
  assert.equal(result.questions.length,2);
  assert.ok(result.activities[0].steps.length);
 }
});

test('a stored answer without a judgment can support a report without inventing an assessment',()=>{
 const record=session('unjudged','1',{finalAnswer:'산소가 붙었다.'}),db={sessions:[record],attempts:[]};
 const data=M.analyze(db,'A','latest'),result=I.recordLesson(data,E.build(db,'A','latest'));
 assert.match(result.observations[0].evidence,/판정이 있는 답안 0개/);
 assert.equal(I.judgmentStatus(data,record).code,'missing');
 assert.equal(record.finalJudgment,undefined);
});

test('a conflicting normalized number is held for review rather than assigned to a different student',()=>{const a=M.analyze({sessions:[session('x','2',{studentNoNormalized:'3'})],attempts:[]},'A');assert.equal(a.stats.N,0);assert.equal(a.review.length,1)});

test('sheet test mode is explicit and still cannot include automated QA in class counts',()=>{
 const db={sessions:[session('sample','2',{classCode:'test'}),session('qa_auto','3',{classCode:'test'})],attempts:[]};
 assert.equal(M.analyze(db,'test').stats.N,0);
 assert.equal(M.analyze(db,'test','latest',{includeTests:true}).stats.N,1);
});
