const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function server() {
 const db={sessions:[],attempts:[]};
 const grants={teacher:{teachers:[{classCode:'A',missionId:'m02',lessonId:'L1'},{classCode:'A',missionId:'m02',lessonId:'L2'}]},student:{students:[{classCode:'A',missionId:'m02',lessonId:'L1',studentNo:'1'}]},student2:{students:[{classCode:'A',missionId:'m02',lessonId:'L1',studentNo:'1'}]},other:{teachers:[{classCode:'B',missionId:'m02',lessonId:'L1'}]}};
 const c={ContentService:{MimeType:{JSON:'json'},createTextOutput:s=>({setMimeType(){return s}})},PropertiesService:{getScriptProperties:()=>({getProperty:()=>JSON.stringify(grants)})},LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})}};
 vm.createContext(c); vm.runInContext(fs.readFileSync('apps-script/Code.gs','utf8'),c);
 vm.runInContext(`authenticate_ = function(token) { if (!['teacher','student','student2','other'].includes(token)) throw Error('인증 실패'); return {sub: token}; };`,c);
 c.readSheet_ = name => name==='Sessions' ? db.sessions : db.attempts;
 c.applyOp_ = op => {if(op.action==='startSession'){const old=db.sessions.find(x=>x.sessionId===op.session.sessionId);if(old) Object.assign(old,op.session);else db.sessions.push({...op.session});} else if(op.action==='updateSession') Object.assign(db.sessions.find(x=>x.sessionId===op.sessionId),op.fields);else if(!db.attempts.some(x=>x.attemptId===op.attempt.attemptId)) db.attempts.push({...op.attempt});};
 const post = body => JSON.parse(c.doPost({postData:{contents:JSON.stringify(body)}}));
 return {post,db};
}
test('mocked cross-device writes and authorized teacher reads, retry, isolation and completed lesson',()=>{
 const {post} = server();
 const start={action:'startSession',session:{sessionId:'s',classCode:'A',missionId:'m02',lessonId:'L1',studentNo:'1',startedAt:'2026-01-01'}};
 const att={action:'logAttempt',attempt:{attemptId:'a',sessionId:'s',classCode:'A',missionId:'m02',lessonId:'L1',studentNo:'1',input:'가상 답안'}};
 const update={action:'updateSession',sessionId:'s',fields:{finalAnswer:'가상 답안',endedAt:'2026-01-02',clearType:'full'}};
 assert.equal(post({action:'batch',credential:'student',ops:[start,att,update]}).ok,true);
 assert.equal(post({action:'batch',credential:'student',ops:[start,att,update]}).ok,true);
 const read=post({action:'classData',credential:'teacher',classCode:'A',missionId:'m02',lessonId:'L1'});
 assert.equal(read.ok,true); assert.equal(read.sessions[0].finalAnswer,'가상 답안'); assert.equal(read.attempts.length,1);
 assert.equal(post({action:'classData',credential:'teacher',classCode:'A',missionId:'m01',lessonId:'L1'}).ok,false);
 assert.equal(post({action:'classData',credential:'other',classCode:'A',missionId:'m02',lessonId:'L1'}).ok,false);
 assert.equal(post({action:'classData',classCode:'A',missionId:'m02',lessonId:'L1'}).ok,false);
 assert.equal(post({action:'batch',credential:'student',ops:[{action:'updateSession',sessionId:'s',fields:{studentNo:'2'}}]}).ok,false);
 assert.equal(post({action:'batch',credential:'other',ops:[update]}).ok,false);
 assert.equal(post({action:'classData',credential:'teacher',classCode:'A',missionId:'m02',lessonId:'L2'}).sessions.length,0);
 assert.equal(post({action:'batch',credential:'student2',ops:[update]}).ok,false);
 assert.equal(read.rubric.version,'m02-1'); assert.equal(read.evaluation,'client_unverified');
 assert.equal(post({action:'batch',credential:'student',ops:[{action:'updateSession',sessionId:'s',fields:{firstAnswer:'x'.repeat(4001)}}]}).ok,false);
 assert.equal(post({action:'batch',credential:'student',ops:[{action:'updateSession',sessionId:'s',fields:{finalC:'TRUE'}}]}).ok,false);
 assert.equal(post({action:'judge',credential:'student',checks:{C:'fake'}}).ok,false);
});
test('unconfigured identity fails closed',()=>{
 const c={ContentService:{MimeType:{JSON:'json'},createTextOutput:s=>({setMimeType(){return s}})}}; vm.createContext(c);vm.runInContext(fs.readFileSync('apps-script/Code.gs','utf8'),c);
 const r=JSON.parse(c.doPost({postData:{contents:JSON.stringify({action:'classData',credential:'anything',classCode:'A',missionId:'m02',lessonId:'L1'})}}));assert.equal(r.ok,false);
});
test('remote transport sends scope and credential in POST body and reports failure',async()=>{
 let calls=0; const c={AbortController,setTimeout,clearTimeout,fetch:async (url,opts)=>{calls++; const b=JSON.parse(opts.body);assert.equal(url,'https://example.invalid');assert.equal(b.credential,'fake');assert.equal(b.missionId,'m02');assert.equal(b.lessonId,'L1');return {ok:true,json:async()=>calls===1?{ok:false,error:'인증 실패'}:{ok:true,sessions:[],attempts:[]}};}};
 vm.createContext(c); vm.runInContext(fs.readFileSync('teacher/transport.js','utf8'),c);
 await assert.rejects(c.TeacherTransport.classData('https://example.invalid','fake','A','m02','L1'),/인증 실패/);
 assert.equal((await c.TeacherTransport.classData('https://example.invalid','fake','A','m02','L1')).ok,true);
});
