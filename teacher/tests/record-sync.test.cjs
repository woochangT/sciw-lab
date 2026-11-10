const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const code=fs.readFileSync('ui/record-sync.js','utf8');
function setup({fetcher,initial=[],storageFails=false,defer=false,statusNode=null}={}){
 const values=new Map([['queue',JSON.stringify(initial)]]),events={},inputs={},requests=[];let failStorage=storageFails;
 const window={addEventListener(name,fn){events[name]=fn}};
 const context={window,TextEncoder,AbortController,setTimeout(){return 1},clearTimeout(){},document:{readyState:'loading',getElementById(id){return id==='sciw-save-status'?statusNode:null},querySelector(){return {textContent:'합성 교수 질문'}},addEventListener(name,fn){inputs[name]=fn}},localStorage:{getItem:k=>values.get(k)||null,setItem(k,v){if(failStorage)throw Error('quota');values.set(k,v)}},fetch:async(url,options)=>{const body=JSON.parse(options.body);requests.push({...options,body});return {ok:true,json:async()=>fetcher?fetcher(body,options,values):{ok:true}}}};
 vm.runInNewContext(code,context);
 const api=window.SciwRecordSync.create({url:'https://example.invalid',queueKey:'queue',defer});
 return {api,values,requests,events,inputs,restoreStorage(){failStorage=false}};
}
const start=id=>({action:'startSession',session:{sessionId:id,missionId:'m02',classCode:'3-2',studentNo:'1'}});
test('one invalid legacy record is retained separately while valid later sessions and feedback are acknowledged',async()=>{
 const t=setup({initial:[{...start('old'),session:{...start('old').session,classCode:'test'}},{action:'updateSession',sessionId:'old',fields:{finalAnswer:'보관할 이전 원문'}}],fetcher(body){
  if(body.ops.some(op=>op.session?.classCode==='test'))return {ok:false,error:'학년은 1~3, 반은 1~99 형식으로 입력해 주세요.'};
  if(body.ops.some(op=>op.sessionId==='old'))return {ok:false,error:'세션이 없어 기록을 보류합니다'};
  return {ok:true};
 }});
 t.api.startSession(start('new').session);t.api.logAttempt({attemptId:'feedback',sessionId:'new',feedbackText:['합성 피드백']});await t.api.flush();
 assert.equal(t.api.pending(),0);assert.equal(t.requests[0].body.ops[0].session.sessionId,'new');
 const held=JSON.parse(t.values.get('queue_blocked'));assert.equal(held.length,2);assert.equal(held[1].op.fields.finalAnswer,'보관할 이전 원문');assert.equal(await t.api.whenSaved('old',0),false);assert.equal(await t.api.whenSaved('new',0),true);
});
test('large AI histories are sent in bounded batches rather than a permanently rejected 40-operation request',async()=>{
 const t=setup();t.api.startSession(start('large').session);
 for(let i=0;i<30;i++)t.api.logAttempt({attemptId:'a'+i,sessionId:'large',input:'답안'.repeat(5000)});
 await t.api.flush();assert.equal(t.api.pending(),0);assert.ok(t.requests.length>15);
 assert.equal(t.requests.flatMap(r=>r.body.ops).filter(op=>op.action==='logAttempt').length,30);
 for(const r of t.requests){assert.ok(new TextEncoder().encode(JSON.stringify(r.body)).length<=48000);assert.ok(r.body.ops.length<=4)}
});
test('a write appended by another tab while a request is in flight survives the acknowledgement',async()=>{
 let injected=false;
 const t=setup({fetcher(body,options,values){if(!injected){injected=true;const queue=JSON.parse(values.get('queue'));queue.push({action:'updateSession',sessionId:'s',fields:{finalAnswer:'別タブの答え'},syncId:'other-tab'});values.set('queue',JSON.stringify(queue))}return {ok:true}}});
 t.api.startSession(start('s').session);await t.api.flush();assert.equal(t.requests.length,2);assert.equal(t.requests[1].body.ops[0].fields.finalAnswer,'別タブの答え');
});
test('network failures retain pending records and cannot be reported as a successful submission',async()=>{
 let offline=true;
 const t=setup({fetcher(){if(offline)throw Error('offline');return {ok:true}}});t.api.startSession(start('s').session);await t.api.flush();
 assert.equal(t.api.pending('s'),1);assert.equal(await t.api.whenSaved('s',0),false);await t.api.flush();offline=false;await t.api.flush();assert.equal(await t.api.whenSaved('s',0),true);
});
test('drafts and raw submissions survive evaluation failure, and pagehide uses acknowledged keepalive delivery',async()=>{
 const t=setup();t.api.startSession(start('draft').session);t.api.watchDrafts(()=>({stage:'compose'}));await t.api.flush();
 t.inputs.input({target:{id:'answer',value:'아직 완성하지 못한 <답안>'}});t.api.captureDraft();
 t.api.recordInput('draft',{stage:'compose',input:'제출했지만 평가가 실패한 원문'});t.events.pagehide();await t.api.flush();
 const ops=t.requests.flatMap(r=>r.body.ops),draft=ops.find(op=>op.fields?.draftAnswer),raw=ops.find(op=>op.attempt?.questId==='studentInput');
 assert.equal(draft.fields.draftAnswer,'아직 완성하지 못한 <답안>');assert.equal(draft.fields.stage,'compose');assert.equal(raw.attempt.input,'제출했지만 평가가 실패한 원문');assert.equal(t.requests.at(-1).keepalive,true);
});
test('storage quota failure keeps unsent operations in memory until storage and the network recover',async()=>{
 let offline=true;const t=setup({storageFails:true,fetcher(){if(offline)throw Error('offline');return {ok:true}}});
 t.api.startSession(start('s').session);await t.api.flush();assert.equal(t.api.pending(),1);t.restoreStorage();offline=false;await t.api.flush();assert.equal(t.api.pending(),0);
});

test('experience mode never queues, persists or resends student records including an old pending queue',async()=>{
 const t=setup({initial:[start('older-pending')],defer:true});const before=t.values.get('queue');
 await t.api.flush();assert.equal(t.requests.length,0);
 t.api.setExperienceMode();t.api.startSession(start('demo').session);t.api.recordInput('demo',{input:'체험 답'});t.api.logAttempt({sessionId:'demo',attemptId:'demo-answer'});t.api.updateSession('demo',{finalAnswer:'체험 답'});t.api.captureDraft();t.api.captureProgress();
 t.events.pagehide();await t.api.flush();assert.equal(await t.api.whenSaved('demo',0),true);
 assert.equal(t.requests.length,0);assert.equal(t.values.get('queue'),before);assert.equal(t.values.has('sciw_localdb_v1'),false);
});
test('resuming an existing session appends to that session without starting another one',async()=>{
 const t=setup({defer:true});t.api.resumeSession(start('resume').session);t.api.logAttempt({sessionId:'resume',attemptId:'resumed-answer',input:'이어서 쓴 합성 답'});await t.api.flush();
 assert.equal(t.requests.length,1);assert.equal(t.requests[0].body.ops.length,1);assert.equal(t.requests[0].body.ops[0].action,'logAttempt');assert.equal(t.requests[0].body.ops[0].attempt.sessionId,'resume');
});

test('reentry finishes an unacknowledged previous save before querying its server checkpoint',async()=>{
 const t=setup({defer:true,initial:[start('previous')],fetcher(body){if(body.action==='findStudentSession')return {ok:true,schema:'student-resume-v1',session:{sessionId:'previous'}};return {ok:true};}});
 const r=await t.api.findSession('3-2','1','m02');assert.equal(r.sessionId,'previous');assert.equal(t.requests[0].body.action,'batch');assert.equal(t.requests[1].body.action,'findStudentSession');assert.equal(t.api.pending(),0);
});

test('entry and experience hide the redundant save badge while normal save success and errors stay visible',async()=>{
 const badge={textContent:'',hidden:false};const t=setup({defer:true,statusNode:badge});assert.equal(badge.hidden,true);assert.equal(badge.textContent,'');
 t.api.startSession(start('student').session);assert.equal(badge.hidden,false);await t.api.flush();assert.equal(badge.hidden,false);assert.equal(badge.textContent,'서버에 저장됨');
 const demoBadge={textContent:'',hidden:false};const demo=setup({defer:true,statusNode:demoBadge});demo.api.setExperienceMode();demo.api.startSession(start('experience').session);assert.equal(demoBadge.hidden,true);assert.equal(demoBadge.textContent,'');assert.equal(demo.requests.length,0);
 const errorBadge={textContent:'',hidden:false};const failed=setup({defer:true,statusNode:errorBadge,fetcher(){throw Error('offline')}});failed.api.startSession(start('failed').session);await failed.api.flush();assert.equal(errorBadge.hidden,false);assert.match(errorBadge.textContent,/서버 저장 실패/);
});
