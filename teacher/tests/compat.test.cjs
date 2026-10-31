const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
function setup(path, config, failure=false){
 const values=new Map(),requests=[];let fail=failure;
 const localStorage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};
 const window={SCIW_CONFIG:config,addEventListener(){}};
 const document={readyState:'loading',addEventListener(){},getElementById(){return null}};
 const context={window,document,localStorage,AbortController,setTimeout(){},clearTimeout(){},fetch:async (url,opts)=>{requests.push({url,body:JSON.parse(opts.body)});if(fail)throw Error('offline');return {ok:true,json:async()=>({ok:true})}}};
 vm.runInNewContext(fs.readFileSync(path,'utf8'),context);return {api:window.SCIW_API,requests,values,online(){fail=false}};
}
test('m01 sends existing batch protocol without credentials and retries queued operations',async()=>{
 const t=setup('감자 삼투/web/js/api.js',{API_URL:'https://example.invalid',MISSION_ID:'m01'},true);
 t.api.startSession({sessionId:'s',classCode:'X',studentNo:'1',missionId:'m01'});await t.api.flush();
 assert.equal(JSON.parse(t.values.get('sciw_queue_v1')).length,1);t.online();await t.api.flush();
 assert.equal(t.requests.length,2);assert.equal(t.requests[1].body.action,'batch');assert.equal('credential' in t.requests[1].body,false);assert.equal(t.requests[1].body.ops[0].session.missionId,'m01');assert.equal(JSON.parse(t.values.get('sciw_queue_v1')).length,0);
});
test('unverified m02 server is never called and its queue is separate',async()=>{
 const t=setup('강철솜 질량 보존/web/js/api.js',{API_URL:'https://example.invalid',MISSION_ID:'m02'});
 t.api.startSession({sessionId:'s',missionId:'m02'});await t.api.flush();assert.equal(t.requests.length,0);assert.equal(JSON.parse(t.values.get('sciw_queue_m02_v1')).length,1);assert.equal(t.values.has('sciw_queue_v1'),false);
 await assert.rejects(t.api.classData('X'),/지원 확인 필요/);assert.equal(t.requests.length,0);
});
