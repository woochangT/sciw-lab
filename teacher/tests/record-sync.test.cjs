const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const code=fs.readFileSync('ui/record-sync.js','utf8');
function setup({fetcher,initial=[],storageFails=false}={}){
 const values=new Map([['queue',JSON.stringify(initial)]]),events={},inputs={},requests=[];let failStorage=storageFails;
 const window={addEventListener(name,fn){events[name]=fn}};
 const context={window,TextEncoder,AbortController,setTimeout(){return 1},clearTimeout(){},document:{readyState:'loading',getElementById(){return null},querySelector(){return {textContent:'합성 교수 질문'}},addEventListener(name,fn){inputs[name]=fn}},localStorage:{getItem:k=>values.get(k)||null,setItem(k,v){if(failStorage)throw Error('quota');values.set(k,v)}},fetch:async(url,options)=>{const body=JSON.parse(options.body);requests.push({...options,body});return {ok:true,json:async()=>fetcher?fetcher(body,options,values):{ok:true}}}};
 vm.runInNewContext(code,context);
 const api=window.SciwRecordSync.create({url:'https://example.invalid',queueKey:'queue'});
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
