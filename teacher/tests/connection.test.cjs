const {test}=require('node:test'),assert=require('node:assert/strict');require('../connection.js');
const get=globalThis.TeacherConnection.getJSON;
test('Sheet GET retries one transient upstream failure and keeps the same read-only scope',async()=>{
 const calls=[];const result=await get('https://api.example/class?classKey=3-2',undefined,async(url,options)=>{calls.push({url,options});return calls.length===1?new Response('unavailable',{status:502}):Response.json({ok:true,sessions:[]})});
 assert.equal(result.ok,true);assert.equal(calls.length,2);assert.equal(calls[0].url,calls[1].url);assert.equal(calls[0].options.method,undefined);assert.equal(calls[0].options.cache,'no-store');
});
test('authorization errors, aborts and persistent failures are not hidden as empty records',async()=>{
 let calls=0;await assert.rejects(get('/class',undefined,async()=>{calls++;return Response.json({ok:false,error:'연결 범위 확인'},{status:403})}),/연결 범위 확인/);assert.equal(calls,1);
 calls=0;await assert.rejects(get('/class',undefined,async()=>{calls++;throw Object.assign(Error('aborted'),{name:'AbortError'})}),/aborted/);assert.equal(calls,1);
 calls=0;await assert.rejects(get('/class',undefined,async()=>{calls++;return new Response('unavailable',{status:503})}),/HTTP 503/);assert.equal(calls,2);
});
