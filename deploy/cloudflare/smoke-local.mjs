import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
const base=new URL(process.argv[2]||'http://localhost:8787');
assert(['localhost','127.0.0.1'].includes(base.hostname),'This smoke test writes only to a local Wrangler instance.');
const stamp=Date.now().toString(36), room=`3-${60+Date.now()%35}`;
const headers={Origin:base.origin,'Content-Type':'application/json'};
async function get(path,init){const res=await fetch(new URL(path,base),init);const data=await res.json();return {status:res.status,...data}}
const student=body=>get('/api/student',{method:'POST',headers,body:JSON.stringify(body)});
const {token}=await get('/api/sheet/login',{method:'POST',headers,body:JSON.stringify({password:'teacher-local'})});
assert(token);
const teacherHeaders={...headers,Authorization:'Bearer '+token};
const teacher=(path,body)=>get('/api/sheet/'+path,body?{method:'POST',headers:teacherHeaders,body:JSON.stringify(body)}:{headers:teacherHeaders});
assert.equal((await get('/api/sheet/classes')).status,401);
const noticeUrl=new URL('/api/sheet/live?missionId=m01&includeTests=1',base);noticeUrl.protocol='ws:';
const channel=new WebSocket(noticeUrl,{protocols:['sciw-progress',token],headers:{Origin:base.origin}});
const messages=[];
channel.addEventListener('message',event=>messages.push(JSON.parse(event.data)));
await new Promise((resolve,reject)=>{channel.addEventListener('open',resolve,{once:true});channel.addEventListener('error',event=>reject(Error(event.message||'WebSocket failed')),{once:true});setTimeout(()=>reject(Error('WebSocket timeout')),5000).unref();});
const people=Array.from({length:30},(_,i)=>({resumeKey:crypto.randomUUID(),missionId:i<15?'m01':'m02',classCode:room,studentNo:String(i+1),isTest:true,sessionId:`d1smoke_${stamp}_${i}`,startedAt:new Date().toISOString()}));
const send=(person,ops)=>student({action:'batch',resumeKey:person.resumeKey,ops});
async function phase(name,task){
 const results=await Promise.all(people.map(async person=>{const start=performance.now(),result=await task(person);return {person,result,elapsed:performance.now()-start};}));
 for(const item of results)assert.equal(item.result.ok,true,JSON.stringify(item.result));
 const durations=results.map(item=>item.elapsed).sort((a,b)=>a-b);
 console.log(`${name}: ${results.length}/${people.length} OK, p95 ${Math.round(durations[Math.ceil(durations.length*.95)-1])}ms`);
}
const input='감자 세포 안의 농도는 5%와 10% 사이이다.';
const finalOps=person=>[
 {action:'updateSession',sessionId:person.sessionId,syncId:'final',fields:{finalAnswer:person.missionId==='m01'?input:'산소가 강철솜에 결합해 질량이 늘었다.',checkpoint:{schema:'student-resume-v1',missionId:person.missionId,point:'compose',state:{}},checkpointSavedAt:new Date().toISOString()}},
 {action:'logAttempt',syncId:'event',attempt:{sessionId:person.sessionId,attemptId:person.sessionId+'_final',questId:person.missionId==='m01'?'FINAL':'final',stage:person.missionId==='m01'?'defense':'compose',input:person.missionId==='m01'?input:'산소가 강철솜에 결합해 질량이 늘었다.'}}
];
try{
 await phase('동시 입장',({resumeKey,...person})=>send({resumeKey},[{action:'startSession',syncId:'start',session:person}]));
 await phase('동시 제출',person=>send(person,finalOps(person)));
 await phase('동일 요청 재전송',person=>send(person,finalOps(person)));
 const [first]=people;
 const completion={action:'updateSession',sessionId:first.sessionId,syncId:'complete',fields:{clearType:'partial'}};
 assert.equal((await send(first,[completion])).ok,true);
 assert.equal((await send(first,[{...completion,syncId:'complete-retry'}])).ok,true);
 const noticeClass=`g:3:r:${room.split('-')[1]}`;
 const activity=()=>messages.filter(notice=>notice.classKey===noticeClass&&notice.kind);
 const until=Date.now()+3000;
 while(activity().length<16&&Date.now()<until)await new Promise(resolve=>setTimeout(resolve,30));
 assert.equal(activity().filter(event=>event.kind==='entered').length,15);
 assert.equal(activity().filter(event=>event.kind==='completed').length,1);
 assert.equal(activity().find(event=>event.kind==='completed').studentNo,'1');
 const request={action:'findStudentSession',classCode:first.classCode,studentNo:first.studentNo,missionId:first.missionId};
 assert.equal((await student({...request,resumeKey:crypto.randomUUID()})).session,null);
 assert.equal((await student({...request,resumeKey:first.resumeKey})).session.checkpoint.point,'compose');
 for(const mission of ['m01','m02']){
  const scoped=await teacher(`class?classCode=${room}&missionId=${mission}&includeTests=1`);
  assert.equal(scoped.sessions.filter(s=>s.sessionId.startsWith(`d1smoke_${stamp}_`)).length,15);
  assert.equal(scoped.attempts.filter(a=>a.sessionId.startsWith(`d1smoke_${stamp}_`)).length,15);
  const person=people.find(person=>person.missionId===mission);
  const retry={classCode:room,missionId:mission,sessionId:person.sessionId,attemptId:person.sessionId+'_final',requestId:crypto.randomUUID()};
  const judged=await teacher('rejudge',retry);assert.equal(judged.ok,true,mission+' '+JSON.stringify(judged));
  assert.equal((await teacher('rejudge',{...retry,requestId:crypto.randomUUID()})).code,'REJUDGE_NOT_NEEDED');
 }
 const report=await teacher('analysis',{classCode:room,missionId:'m02',includeTests:true});
 assert.equal(report.analysis.model,'local-fixture');
 assert(messages.some(notice=>notice.classKey===`g:3:r:${room.split('-')[1]}`&&notice.missionId==='m01'&&notice.isTest));
 console.log('실시간 알림, 이어 하기 격리, 원본 행과 시도 이력, 두 게임 재판정, 수업 요약 OK');
}finally{channel.close();}
