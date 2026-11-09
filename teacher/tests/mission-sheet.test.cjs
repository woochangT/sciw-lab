const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');const crypto=require('node:crypto');
const {evaluatorSources}=require('../../tools/export-record-apps-script.cjs');
function make({fetchResult}={}){
 const head=['recordType','recordId','sessionId','classCode','studentNo','missionId','createdAt','updatedAt','payload'];
 function sheet(rows){return {rows,deleteRows(start,count){this.rows.splice(start-1,count)},getLastRow(){return this.rows.length},getLastColumn(){return Math.max(0,...this.rows.map(r=>r.length))},getRange(row,col,n,m){const self=this;return {getValues(){return Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>self.rows[row-1+i]?.[col-1+j]??''))},getDisplayValues(){return this.getValues().map(r=>r.map(String))},setNumberFormat(){return this},setFontWeight(){return this},setValues(values){values.forEach((r,i)=>{self.rows[row-1+i]??=[];r.forEach((v,j)=>self.rows[row-1+i][col-1+j]=v)});return this},createTextFinder(value){return {matchEntireCell(){return this},findNext(){const i=self.rows.findIndex((r,i)=>i>=row-1&&i<row-1+n&&String(r[col-1])===value);return i<0?null:{getRow:()=>i+1}}}}}},setFrozenRows(){}}}
 const sheets={'감자':sheet([head]),'강철솜':sheet([head])};let access='';
 const c={console:{log(){}},SpreadsheetApp:{flush(){},openById(){return {getSheetByName:n=>sheets[n],insertSheet:n=>(sheets[n]=sheet([]))}}},ContentService:{MimeType:{JSON:'json'},createTextOutput:s=>({setMimeType(){return s}})},PropertiesService:{getScriptProperties:()=>({getProperty:()=>access})},Utilities:{DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(algo,val)=>Array.from(crypto.createHash(algo).update(val).digest()).map(x=>x>127?x-256:x)},LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})}};
 let locked=false;
 c.LockService={getScriptLock:()=>({waitLock(){assert.equal(locked,false);locked=true},releaseLock(){locked=false}})};
 c.UrlFetchApp={fetch(url,options){
  assert.equal(locked,false,'the evaluator must run outside the sheet lock');
  const value=fetchResult(url,JSON.parse(options.payload));
  return {getResponseCode:()=>200,getContentText:()=>JSON.stringify(value)};
 }};
 vm.createContext(c);
 for(const file of ['Code.gs','Rejudge.gs'])vm.runInContext(fs.readFileSync('apps-script/'+file,'utf8'),c);
 vm.runInContext(evaluatorSources(),c);
 return {sheets,sheet,cleanup(){return c.deleteInvalidClassRecords()},previewCleanup(){return c.previewInvalidClassRecords()},reconcile(){return c.reconcileLegacy()},setAccess(v){access=JSON.stringify(v)},post(body){return JSON.parse(c.doPost({postData:{contents:JSON.stringify(body)}}))},get(q){return JSON.parse(c.doGet({parameter:q}))}};
}
test('rejudgment rejects completed, pending, unavailable and unsubmitted answers without touching the sheet',()=>{
 const m=make(), classCode='3-2', missionId='m02';
 const cases=[
  {finalAnswer:'합성 원문',finalJudgment:{C:false}},
  {finalAnswer:'합성 원문',finalEvaluationStatus:'pending'},
  {finalAnswer:'합성 원문',finalEvaluationStatus:'unavailable'},
  {draftAnswer:'아직 제출되지 않은 답안'},
 ];
 for(const [i,fields] of cases.entries()){
  const sessionId='ineligible-'+i;
  assert.equal(m.post({action:'startSession',session:{sessionId,missionId,classCode,studentNo:'1',...fields}}).ok,true);
  const before=JSON.stringify(m.sheets['강철솜'].rows);
  const request={action:'rejudge',sessionId,missionId,classCode,attemptId:'',requestId:'synthetic-invalid-'+i};
  assert.equal(m.post(request).code,i===3?'STALE_SUBMISSION':'REJUDGE_NOT_NEEDED');
  assert.equal(JSON.stringify(m.sheets['강철솜'].rows),before);
 }
});
test('two missions save to separate tabs, retry safely, and teacher access is scoped',()=>{
 const m=make(), key='synthetic-test-key-1234567890';
 const ops=id=>[{action:'startSession',session:{sessionId:id,missionId:id==='s1'?'m01':'m02',classCode:'1-2',studentNo:'1',firstAnswer:'가상 답'}},{action:'logAttempt',attempt:{attemptId:'a'+id,sessionId:id,input:'가상 시도'}},{action:'updateSession',sessionId:id,fields:{finalAnswer:'가상 최종 답'}}];
 for(const id of ['s1','s2']) {assert.equal(m.post({action:'batch',ops:ops(id)}).ok,true);assert.equal(m.post({action:'batch',ops:ops(id)}).ok,true)}
 assert.equal(m.sheets['감자'].rows.length,2);assert.equal(m.sheets['강철솜'].rows.length,2);
 assert.equal(m.post({action:'classData',classCode:'1-2',missionId:'m01',teacherKey:key}).ok,false);
 assert.equal(m.get({action:'classData',classCode:'1-2',missionId:'m01'}).ok,false);
 m.setAccess([{classCode:'1-2',missionId:'m01',keySha256:crypto.createHash('sha256').update(key).digest('hex')}]);
 const result=m.post({action:'classData',classCode:'1-2',missionId:'m01',teacherKey:key});assert.equal(result.ok,true);assert.equal(result.sessions.length,1);assert.equal(result.sessions[0].finalAnswer,'가상 최종 답');assert.equal(result.attempts.length,1);
 assert.equal(m.post({action:'classData',classCode:'1-2',missionId:'m02',teacherKey:key}).ok,false);
 assert.equal(m.post({action:'classData',classCode:'1-3',missionId:'m01',teacherKey:key}).ok,false);
});

test('reconcile copies late legacy records without deleting originals and repeat is idempotent',()=>{
 const m=make();
 m.sheets.Sessions=m.sheet([['sessionId','classCode','studentNo','missionId','startedAt','updatedAt','firstAnswer'],['legacy','1-2','1','m01','2026-01-01T00:00:00Z','2026-01-01T00:01:00Z','합성 답']]);
 m.sheets.Attempts=m.sheet([['attemptId','sessionId','classCode','studentNo','missionId','createdAt','input'],['a1','legacy','1-2','1','m01','2026-01-01T00:02:00Z','합성 시도']]);
 m.reconcile();m.reconcile();assert.equal(m.sheets['감자'].rows.length,3);assert.equal(m.sheets.Sessions.rows.length,2);assert.equal(m.sheets.Attempts.rows.length,2);
 m.sheets.Sessions.rows[1][5]='2026-01-01T00:03:00Z';m.sheets.Sessions.rows[1][6]='추가된 합성 답';m.reconcile();
 assert.equal(JSON.parse(m.sheets['감자'].rows[1][8]).firstAnswer,'추가된 합성 답');
});

test('legacy mirrors preserve mission-specific fields and retries repair partial writes',()=>{
 const m=make();
 const start={action:'startSession',session:{sessionId:'s2',missionId:'m02',classCode:'1-2',studentNo:'7'}};
 assert.equal(m.post(start).ok,true);
 const update={action:'updateSession',sessionId:'s2',fields:{finalAnswer:'합성 최종 답',finalJudgment:{'D-A':true,W1b:true},ownMode:true,judgedBy:'openai',rubricVersion:'m02-docx-1.1.0',analysis:{checks:{W1b:{status:'met',quote:'합성 최종 답',reason:'합성 근거'}}}}};
 assert.equal(m.post(update).ok,true);
 const attempt={action:'logAttempt',attempt:{attemptId:'a2',sessionId:'s2',input:'합성 시도',choice:'1-2',pass:true}};
 assert.equal(m.post(attempt).ok,true);
 assert.equal(m.post(start).ok,true); // 재전송이 최종 답을 되돌리지 않는다.
 const row=m.sheets.Sessions.rows[1], h=m.sheets.Sessions.rows[0];
 assert.equal(row[h.indexOf('finalAnswer')],'합성 최종 답');
 assert.equal(row[h.indexOf('finalDA')],'TRUE');
 assert.equal(row[h.indexOf('finalW1b')],'TRUE');
 assert.equal(row[h.indexOf('ownMode')],'true');
 assert.equal(row[h.indexOf('judgedBy')],'openai');
 const saved=JSON.parse(m.sheets['강철솜'].rows[1][8]);
 assert.equal(saved.rubricVersion,'m02-docx-1.1.0');assert.equal(saved.analysis.checks.W1b.quote,'합성 최종 답');
 const extra=JSON.parse(row[h.indexOf('extra')]);assert.equal(extra.analysis.checks.W1b.status,'met');
 assert.equal(m.sheets.Attempts,undefined); // 새 로그는 행을 추가하지 않고 세션의 대화 열을 갱신한다.
 assert.equal(m.post(attempt).ok,true);assert.equal(m.post(attempt).ok,true);
 const history=JSON.parse(m.sheets['강철솜'].rows[1].slice(9,17).join(''));
 assert.equal(history.length,1);assert.equal(history[0].input,'합성 시도');assert.equal(m.sheets['강철솜'].rows.length,2);
});
test('an in-flight legacy session resumes and rejects mission changes',()=>{
 const m=make();
 m.sheets.Sessions=m.sheet([['sessionId','classCode','studentNo','missionId','startedAt','updatedAt','questPassed'],['active','1-2','1','m02','2026-01-01T00:00:00Z','2026-01-01T00:01:00Z','{"C":true}']]);
 assert.equal(m.post({action:'updateSession',sessionId:'active',fields:{finalAnswer:'이어서 쓴 합성 답'}}).ok,true);
 const record=JSON.parse(m.sheets['강철솜'].rows[1][8]);
 assert.equal(record.questPassed.C,true);assert.equal(record.finalAnswer,'이어서 쓴 합성 답');
 assert.equal(m.post({action:'updateSession',sessionId:'active',fields:{missionId:'m01'}}).ok,false);
 assert.equal(m.sheets['감자'].rows.length,1);
});

test('previously migrated JSON fields remain typed and do not erase final judgments',()=>{
 const m=make(), old={sessionId:'old',classCode:'1-2',studentNo:'1',missionId:'m01',finalJudgment:'{"C":true}',questPassed:'{"C":true}'};
 m.sheets['감자'].rows.push(['session','old','old','1-2','1','m01','2026-01-01','2026-01-01',JSON.stringify(old)]);
 assert.equal(m.post({action:'updateSession',sessionId:'old',fields:{hintTotal:1}}).ok,true);
 const h=m.sheets.Sessions.rows[0];assert.equal(m.sheets.Sessions.rows[1][h.indexOf('finalC')],'TRUE');
 assert.equal(JSON.parse(m.sheets['감자'].rows[1][8]).questPassed.C,true);
});

test('one login stays one mission row across many answers, feedback pages and retries; hosted/local readers round-trip chunked dialogue',async()=>{
 const m=make(),start={action:'startSession',session:{sessionId:'journal',missionId:'m02',classCode:'3-2',studentNo:'2'}};
 assert.equal(m.post(start).ok,true);
 const answer={action:'logAttempt',attempt:{attemptId:'answer',sessionId:'journal',stage:'compose',questId:'final',input:('합성 답안😀').repeat(10000),judgment:{W1b:true},analysis:{checks:{W1b:{status:'met',quote:'합성 답안',reason:'합성 이유'}}}}};
 const feedback={action:'logAttempt',attempt:{attemptId:'feedback',sessionId:'journal',stage:'compose',questId:'professorSpeech',feedbackText:['산소의 출처를 설명해 보겠나?'],feedbackSource:'displayed',inReplyTo:'answer'}};
 for(const op of [answer,feedback,answer,feedback])assert.equal(m.post(op).ok,true);
 assert.equal(m.sheets['강철솜'].rows.length,2);assert.equal(m.sheets['감자'].rows.length,1);assert.equal(m.sheets.Sessions.rows.length,2);assert.equal(m.sheets.Attempts,undefined);
 const {parseRecords}=await import('../../deploy/cloudflare/worker.mjs');
 const quote=v=>'"'+String(v??'').replaceAll('"','""')+'"';
 const csv=m.sheets['강철솜'].rows.map(r=>r.map(quote).join(',')).join('\r\n');
 const parsed=parseRecords(csv,'m02');assert.equal(parsed.invalidRows,0);assert.equal(parsed.sessions.length,1);assert.equal(parsed.attempts.length,2);assert.equal(parsed.attempts[0].input,answer.attempt.input);assert.equal(parsed.attempts[0].eventOrder,1);assert.equal(parsed.attempts[1].eventOrder,2);assert.equal(parsed.attempts[1].feedbackText[0],feedback.attempt.feedbackText[0]);
 const {spawnSync}=require('node:child_process');
 const py=spawnSync('python3',['-c',"import sys,json;sys.path.insert(0,'scripts');from local_server import parse_records;print(json.dumps(parse_records(sys.stdin.read(),'m02'),ensure_ascii=False))"],{input:csv,encoding:'utf8'});
 assert.equal(py.status,0,py.stderr);assert.deepEqual(JSON.parse(py.stdout),parsed);
 assert.equal(m.post({action:'logAttempt',attempt:{attemptId:'conflict',sessionId:'journal',missionId:'m01',input:'다른 미션'}}).ok,false);
 assert.equal(m.sheets['강철솜'].rows.length,2);
});

test('backend blocks invalid class starts, legacy resurrection and out-of-scope logs without storing rows',()=>{
 const m=make();
 for(const classCode of ['0-1','4-1','3-0','3-100','3-1.5','03-02','302','test','A-2','QA_JOURNAL'])assert.equal(m.post({action:'startSession',session:{sessionId:'blocked-'+classCode,missionId:'m02',classCode,studentNo:'1'}}).ok,false,classCode);
 assert.equal(m.sheets['감자'].rows.length,1);assert.equal(m.sheets['강철솜'].rows.length,1);assert.equal(m.sheets.Sessions,undefined);
 assert.equal(m.post({action:'startSession',session:{sessionId:'valid',missionId:'m02',classCode:'3-99',studentNo:'1'}}).ok,true);
 assert.equal(m.post({action:'logAttempt',attempt:{attemptId:'bad',sessionId:'valid',classCode:'4-1',input:'차단 대상'}}).ok,false);
 assert.equal(m.sheets['강철솜'].rows.length,2);assert.equal(JSON.parse(m.sheets['강철솜'].rows[1].slice(9,17).join('')).length,0);
 m.sheets.Sessions=m.sheet([['sessionId','classCode','studentNo','missionId'],['old-test','test','1','m02']]);
 assert.equal(m.post({action:'updateSession',sessionId:'old-test',fields:{finalAnswer:'재전송'}}).ok,false);assert.equal(m.sheets['강철솜'].rows.length,2);
});

test('cleanup uses the same class bounds, deletes invalid session logs in descending order and preserves valid rows',()=>{
 const m=make(),valid={sessionId:'keep',classCode:'3-99',studentNo:'1',missionId:'m02'},invalid={sessionId:'remove',classCode:'test',studentNo:'1',missionId:'m02'};
 assert.equal(m.post({action:'startSession',session:valid}).ok,true);
 const h=m.sheets['강철솜'].rows[0];
 m.sheets['강철솜'].rows.push(['session','remove','remove','test','1','m02','','',JSON.stringify(invalid)]);
 m.sheets['강철솜'].rows.push(['attempt','a-remove','remove','3-99','1','m02','','','{}']);
 m.sheets.Sessions.rows.push(['remove','test','1','m02']);
 m.sheets.Attempts=m.sheet([['attemptId','sessionId','classCode','studentNo','missionId'],['a-remove','remove','3-99','1','m02'],['a-keep','keep','3-99','1','m02'],['bad','keep','4-1','1','m02']]);
 const before=m.sheets['강철솜'].rows.length;assert.equal(m.previewCleanup().removedRows['강철솜'],2);assert.equal(m.sheets['강철솜'].rows.length,before);
 const result=m.cleanup();assert.equal(result.invalidSessions,1);assert.equal(result.removedRows.Attempts,2);assert.equal(m.sheets['강철솜'].rows.length,2);assert.equal(m.sheets['강철솜'].rows[1][2],'keep');assert.equal(m.sheets.Attempts.rows[1][0],'a-keep');assert.equal(m.sheets.Sessions.rows.length,2);
 assert.equal(m.cleanup().removedRows['강철솜'],0);assert.equal(m.post({action:'updateSession',sessionId:'remove',fields:{firstAnswer:'부활 시도'}}).ok,false);
});

test('both missions rejudge the saved answer in the same row and use it in the dashboard after readback',async()=>{
 const {createHandler}=await import('../../deploy/cloudflare/worker.mjs');
 const I=globalThis.TeacherInsights;
 const m02Text='강철솜의 질량은 밖의 산소가 결합해 0.5 g만큼 늘었다.';
 const m02Keys=['C','D-A','D-B','W1a','W1b','W2a','W2b'];
 const m02Result={stage:'final',rubricVersion:'m02-docx-1.2.1',outcome:'revise',
  elements:Object.fromEntries(m02Keys.map(k=>[k,k==='C'])),
  analysis:{checks:{C:{reason:'합성 판정 근거',quote:'밖의 산소가 결합'}}}};
 let calls=0, mode='success', raceSession, raceRequest;
 const m=make({fetchResult(_url,body){
  calls++;
  assert.deepEqual(body,{action:'judgeM02',stage:'final',text:m02Text,initialAnswer:'저장된 첫 답안',cardSpans:[{start:0,end:4}]});
  if(mode==='error')return {ok:false,code:'RATE_LIMIT'};
  if(mode==='race'){
   assert.equal(m.post({...raceRequest,requestId:'duplicate-request'}).code,'REJUDGE_BUSY');
   const newer={...raceSession,attemptId:'newer',stage:'compose',questId:'studentInput',evaluationStage:'final',input:'더 최근 답안'};
   assert.equal(m.post({action:'logAttempt',attempt:newer}).ok,true);
  }
  return {ok:true,result:m02Result};
 }});
 const csv=rows=>rows.map(row=>row.map(value=>'"'+String(value??'').replaceAll('"','""')+'"').join(',')).join('\n');
 const handler=createHandler(async(url,options)=>{
  const gid=new URL(url).searchParams.get('gid');
  if(gid)return new Response(csv(m.sheets[gid==='807310001'?'감자':'강철솜'].rows),{headers:{'Content-Type':'text/csv'}});
  return Response.json(m.post(JSON.parse(options.body)));
 });
 const post=async body=>handler(new Request('https://test.example/api/sheet/rejudge',{method:'POST',
  headers:{Origin:'https://test.example','Content-Type':'application/json'},body:JSON.stringify(body)}),{});
 for(const missionId of ['m01','m02']){
  const sessionId='play-'+missionId, classCode='3-2', studentNo='1', attemptId='original-'+missionId;
  const input=missionId==='m01'?'감자 세포 안 농도는 5%에서 10% 사이다.':m02Text;
  const session={sessionId,classCode,studentNo,missionId,finalAnswer:input};
  const attempt={sessionId,attemptId,missionId,classCode,stage:missionId==='m01'?'defense':'compose',
   questId:missionId==='m01'?'FINAL':'studentInput',input,feedbackText:'보존할 교수 피드백',
   ...(missionId==='m02'?{evaluationStage:'final',evaluationStatus:'pending'}:{}),
   evaluationInput:{initialAnswer:'저장된 첫 답안',cardSpans:[{start:0,end:4}]}};
  assert.equal(m.post({action:'startSession',session}).ok,true);
  assert.equal(m.post({action:'logAttempt',attempt}).ok,true);
  if(missionId==='m02'){
   const pending={classCode,missionId,sessionId,attemptId,requestId:'while-pending-000'};
   assert.equal((await (await post(pending)).json()).code,'REJUDGE_NOT_NEEDED');
   assert.equal(m.post({action:'logAttempt',attempt:{sessionId,attemptId:'failure',questId:'finalEvaluation',
    inReplyTo:attemptId,evaluationStatus:'failed'}}).ok,true);
  }
  assert.equal(m.post({action:'updateSession',sessionId,fields:{teacherRejudgment:{judgment:{C:true}}}}).ok,false);
  const rows=m.sheets[missionId==='m01'?'감자':'강철솜'].rows;
  const before=rows[1].slice(9);
  const request={classCode,missionId,sessionId,attemptId,requestId:'rejudge-request-'+missionId};
  if(missionId==='m02'){
   mode='error';
   assert.equal((await (await post({...request,requestId:'rejudge-rate-limit'})).json()).code,'RATE_LIMIT');
   assert.deepEqual(rows[1].slice(9),before);
   mode='success';
  }
  const response=await post({...request,text:'client-supplied text must be ignored'});
  assert.equal(response.status,200);
  const {rejudgment}=await response.json();
  assert.equal(rejudgment.judgment.C,true);
  assert.equal(rows.length,2);
  assert.deepEqual(rows[1].slice(9),before);
  assert.equal(JSON.parse(rows[1][8]).finalJudgment,undefined);
  assert.equal(JSON.parse(rows[1][8]).finalAnswer,input);
  const retry=await post(request);
  assert.deepEqual((await retry.json()).rejudgment,rejudgment);
  assert.equal((await (await post({...request,requestId:'already-completed'})).json()).code,'REJUDGE_NOT_NEEDED');
  const restored=await handler(new Request('https://test.example/api/sheet/class?classKey=g:3:r:2&missionId='+missionId),{});
  const db=await restored.json();
  const effective=I.evaluation(db,db.sessions[0]);
  assert.equal(effective.judgment.C,true);
  assert.equal(effective.record.input,input);
  assert.equal(I.judgmentStatus(db,db.sessions[0]).label,'재판정 완료');
  assert.equal(I.game(db,[classCode],missionId).evaluations[0].cells[0].met,1);
  if(missionId==='m02'){
   assert.equal(calls,2);
   assert.match(effective.analysis.checks.C.reason,/합성 판정 근거/);
   mode='race';raceSession=session;
   const later={...attempt,attemptId:'later-attempt',evaluationStatus:'failed'};
   assert.equal(m.post({action:'logAttempt',attempt:later}).ok,true);
   const race={...request,attemptId:later.attemptId,requestId:'rejudge-race-001'};
   raceRequest={...race,action:'rejudge'};
   assert.equal((await (await post(race)).json()).code,'STALE_SUBMISSION');
   assert.deepEqual(JSON.parse(rows[1][8]).teacherRejudgment,rejudgment);
   assert.equal(rows.length,2);
   const after=await (await handler(new Request('https://test.example/api/sheet/class?classKey=g:3:r:2&missionId=m02'),{})).json();
   assert.equal(I.evaluation(after,after.sessions[0]).rejudgment,null);
  }
 }
});

test('an explicit failure event belongs to its own submitted input',async()=>{
 await import('../../deploy/cloudflare/worker.mjs');
 const I=globalThis.TeacherInsights;
 const s={sessionId:'sample',missionId:'m02'};
 const raw={sessionId:s.sessionId,attemptId:'raw',questId:'studentInput',stage:'compose',evaluationStage:'final',evaluationStatus:'pending',eventOrder:1,input:'합성 답안'};
 const failed={sessionId:s.sessionId,attemptId:'failed',questId:'finalEvaluation',stage:'compose',evaluationStatus:'failed',evaluationErrorCode:'TIMEOUT',inReplyTo:'raw',eventOrder:2};
 assert.equal(I.judgmentStatus({attempts:[raw,failed]},s).errorCode,'TIMEOUT');
 assert.equal(I.judgmentStatus({attempts:[raw,failed,{...raw,attemptId:'newer',eventOrder:3}]},s).code,'pending');
});
