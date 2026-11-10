import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHmac} from 'node:crypto';
import {issueToken} from './teacher-auth.mjs';
import {createHandler,parseRecords,scoped,catalog} from './worker.mjs';
const root=new URL('../../',import.meta.url);
const head=['recordType','recordId','sessionId','classCode','studentNo','missionId','createdAt','updatedAt','payload'];
const session=(id,code,mission='m01')=>({sessionId:id,classCode:code,studentNo:'02',missionId:mission,firstAnswer:'처음에는 "열"이라고 썼다.\n다시 생각했다.',finalAnswer:'합성 최종 답안',startedAt:'2026-11-02T00:00:00Z'});
const toRows=(records,mission)=>[head,...records.map(s=>['session',s.sessionId,s.sessionId,s.classCode,s.studentNo,mission,'','',JSON.stringify(s)])];
const fixtures={m01:[session('a','3-2'),session('b','03-02'),session('c','3-3'),session('qa_auto','3-2'),session('t','test')],m02:[session('d','3-2','m02')]};
const env={TEACHER_PASSWORD:'synthetic-password',TEACHER_PROXY_SECRET:'synthetic-proxy-secret-for-unit-tests',TEACHER_LOGIN_LIMIT:{limit:async()=>({success:true})}};
const token=await issueToken(env);
function setup(){const calls=[];return {calls,handler:createHandler(async(url,opts={})=>{
  const body=JSON.parse(opts.body);calls.push({url:String(url),opts});
  assert.match(String(url),/^https:\/\/script.google.com\//);
  if(body.action==='teacherDashboardData'){
   assert.equal(body.proxySecret,env.TEACHER_PROXY_SECRET);
   return Response.json({ok:true,records:Object.fromEntries(Object.entries(fixtures).map(([mission,list])=>[mission,toRows(list,mission)]))});
  }
  return Response.json({ok:true,analysis:{model:'gpt-6-luna',effort:'medium',result:{headline:'합성 헤드라인'}}});
})}}
const request=(path,body,headers={})=>new Request('https://preview.example'+path,body===undefined?{headers:{Authorization:'Bearer '+token,...headers}}:{method:'POST',headers:{Authorization:'Bearer '+token,Origin:'https://preview.example','Content-Type':'application/json',...headers},body:JSON.stringify(body)});

test('rejudgment forwards only target details and respects Apps Script eligibility',async()=>{
 const calls=[],handler=createHandler(async(url,opts)=>{
  assert.match(url,/script.google.com/);
  const body=JSON.parse(opts.body);calls.push(body);
  return Response.json(body.attemptId==='b'?{ok:true,rejudgment:{requestId:body.requestId}}:{ok:false,code:'REJUDGE_NOT_NEEDED'});
 });
 const payload={classCode:'3-2',missionId:'m01',sessionId:'a',attemptId:'b',requestId:'synthetic-request'};
 const path='/api/sheet/rejudge';
 const preflight=await handler(new Request('https://preview.example'+path,{method:'OPTIONS',headers:{Origin:'https://woochangt.github.io','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type'}}),env);
 assert.equal(preflight.status,204);
 assert.equal((await handler(request(path,payload,{Origin:'https://other.example'}),env)).status,403);
 assert.equal(calls.length,0);
 assert.equal((await handler(request(path,{...payload,attemptId:'completed'}),env)).status,409);
 const response=await handler(request(path,{...payload,text:'must not be forwarded',teacherKey:'must not be forwarded'}),env);
 assert.deepEqual(await response.json(),{ok:true,rejudgment:{requestId:payload.requestId}});
 assert.deepEqual(calls[1],{action:'rejudge',...payload,proxySecret:env.TEACHER_PROXY_SECRET});
});

test('root serves the intro index with explicit HTML handling, without an upstream server',async()=>{
 const s=setup(),paths=[],env={ASSETS:{fetch:async req=>{const p=new URL(req.url).pathname;paths.push(p);return p==='/index.html'?new Response('intro'):new Response(null,{status:404})}}};
 const res=await s.handler(request('/'),env);assert.equal(res.status,200);assert.equal(await res.text(),'intro');assert.deepEqual(paths,['/index.html']);assert.equal(s.calls.length,0);
 assert.equal((await s.handler(request('/apps-script/Code.gs'),env)).status,404);
});

test('hosted parser preserves multiline original answers and rejects cross-mission/schema rows',()=>{
 const records=parseRecords(toRows(fixtures.m01,'m01'),'m01');assert.equal(records.sessions[0].firstAnswer,fixtures.m01[0].firstAnswer);
 assert.deepEqual(parseRecords(toRows([session('wrong','A','m02')],'m01'),'m01').sessions,[]);
 assert.throws(()=>parseRecords([['wrong','columns'],['1','2']],'m01'));
 assert.equal(parseRecords(toRows([fixtures.m01[0],fixtures.m01[0]],'m01'),'m01').invalidRows,1);
});
test('class catalog, scoped aliases and evidence match the existing local implementation',()=>{
 const data={sessions:Object.values(fixtures).flat(),attempts:[],fetchedAt:'now',sheetUrl:'url',invalidRows:0};
 const hosted=catalog(data);assert.equal(hosted.find(x=>x.label==='3학년 2반').numbers,1);
 const scope={classKey:'g:3:r:2',missionId:'m01',includeTests:false};
 const selected=scoped(data,scope);assert.deepEqual(selected.sessions.map(s=>s.sessionId),['a','b']);
 const script="import json,sys;sys.path.insert(0,'scripts');from local_server import class_scope;d=json.load(sys.stdin);print(json.dumps(class_scope(d,'','g:3:r:2',False,'m01'),ensure_ascii=False))";
 const p=spawnSync('python3',['-c',script],{cwd:root,input:JSON.stringify(data),encoding:'utf8'});assert.equal(p.status,0,p.stderr);
 const local=JSON.parse(p.stdout);assert.deepEqual(selected.sessions,local.sessions);assert.deepEqual(selected.attempts,local.attempts);assert.deepEqual(selected.classCodes.sort(),local.classCodes.sort());
});
test('authenticated hosted GET asks for the selected mission and class',async()=>{
 const s=setup(),res=await s.handler(request('/api/sheet/class?classKey=g:3:r:2&missionId=m02'),env),value=await res.json();
 assert.equal(res.status,200);assert.deepEqual(value.sessions.map(s=>s.sessionId),['d']);assert.equal(s.calls.length,1);assert.equal(res.headers.get('Cache-Control'),'private, no-store');
 const payload=JSON.parse(s.calls[0].opts.body);
 assert.equal(payload.classKey,'g:3:r:2');assert.equal(payload.missionId,'m02');
});
test('class overview is aggregated without student answers and does not generate an AI request',async()=>{
 const s=setup(),res=await s.handler(request('/api/sheet/classes'),env),v=await res.json();
 assert.equal(res.status,200);assert.equal(v.overview.version,'teacher-overview-v1');
 assert.equal(v.overview.classes.find(c=>c.classKey==='g:3:r:2').games.m01.participants,1);
 for(const key of ['firstAnswer','finalAnswer','studentNo','sessionId'])assert.equal(JSON.stringify(v.overview).includes(key),false);
 assert.equal(s.calls.length,1);
});
test('analysis rebuilds authoritative evidence, strips identifiers, and relays explicit regeneration',async()=>{
 const s=setup(),res=await s.handler(request('/api/sheet/analysis',{classKey:'g:3:r:2',missionId:'m01',mode:'latest',regenerate:true,evidence:{participants:999}}),env),v=await res.json();
 assert.equal(res.status,200);assert.equal(v.basis.participants,1);assert.equal(v.basis.written,1);assert.equal(v.analysis.model,'gpt-6-luna');
 const payload=JSON.parse(s.calls[1].opts.body);assert.equal(payload.regenerate,true);assert.equal(payload.action,'analyzeClass');assert.equal(payload.evidence.participants,1);
 for(const field of ['studentNo','classCode','sessionId'])assert.equal(JSON.stringify(payload).includes(field),false);
});
test('browsing never generates AI; invalid origins/body/scopes stop before upstream requests',async()=>{
 const s=setup();await s.handler(request('/api/sheet/classes'),env);assert.equal(s.calls.length,1);
 for(const req of [request('/api/sheet/analysis',{classKey:'g:3:r:2',missionId:'toString'}),request('/api/sheet/analysis',{classKey:'g:3:r:2',mode:'all'}),request('/api/sheet/analysis',{classKey:'g:3:r:2'},{Origin:'https://evil.example'}),request('/api/sheet/analysis',{classKey:'g:3:r:2',pad:'x'.repeat(1024)})]){
   const res=await s.handler(req,env);assert.ok([400,403,413].includes(res.status));assert.equal(s.calls.length,1);
 }
});
test('failed upstream reads produce an error instead of an empty class',async()=>{
 const handler=createHandler(async()=>new Response('not csv',{status:403}));
 const res=await handler(request('/api/sheet/classes'),env);assert.equal(res.status,502);assert.equal((await res.json()).ok,false);
});

const pagesOrigin='https://woochangt.github.io';
const pagesHeaders={Origin:pagesOrigin,'Sec-Fetch-Site':'cross-site'};
test('GitHub Pages reads the catalog and scoped answers with explicit CORS; unrelated sites stay blocked',async()=>{
 const s=setup();
 for(const path of ['/api/sheet/classes','/api/sheet/class?classKey=g:3:r:2&missionId=m02']){
  const res=await s.handler(request(path,undefined,pagesHeaders),env),value=await res.json();
  assert.equal(res.status,200);assert.equal(value.ok,true);assert.equal(res.headers.get('Access-Control-Allow-Origin'),pagesOrigin);
  assert.match(res.headers.get('Vary'),/Origin/);assert.equal(res.headers.has('Access-Control-Allow-Credentials'),false);
  if(value.sessions)assert.deepEqual(value.sessions.map(s=>s.sessionId),['d']);
 }
 const count=s.calls.length;
 for(const Origin of ['https://evil.example','https://woochangt.github.io.evil.example','http://woochangt.github.io','null']){
  const res=await s.handler(request('/api/sheet/classes',undefined,{Origin,'Sec-Fetch-Site':'cross-site'}),env);
  assert.equal(res.status,403);assert.equal(res.headers.has('Access-Control-Allow-Origin'),false);
 }
 const noOrigin=await s.handler(request('/api/sheet/classes',undefined,{'Sec-Fetch-Site':'cross-site'}),env);
 assert.equal(noOrigin.status,403);assert.equal(s.calls.length,count);
});
test('Pages JSON preflight makes no upstream call and explicit analysis preserves authoritative evidence',async()=>{
 const s=setup(),preflight=(path,method,extra={})=>new Request('https://preview.example'+path,{method:'OPTIONS',headers:{...pagesHeaders,'Access-Control-Request-Method':method,'Access-Control-Request-Headers':'content-type',...extra}});
 const res=await s.handler(preflight('/api/sheet/analysis','POST'),env);
 assert.equal(res.status,204);assert.equal(res.headers.get('Access-Control-Allow-Origin'),pagesOrigin);
 assert.equal(res.headers.get('Access-Control-Allow-Methods'),'POST');assert.equal(res.headers.get('Access-Control-Allow-Headers'),'Content-Type, Authorization');
 for(const req of [preflight('/api/sheet/analysis','POST',{Origin:'https://evil.example'}),preflight('/api/sheet/analysis','DELETE'),preflight('/api/sheet/analysis','POST',{'Access-Control-Request-Headers':'X-Forged'}),preflight('/api/not-supported','POST')])assert.equal((await s.handler(req,env)).status,403);
 assert.equal(s.calls.length,0);
 const analysis=await s.handler(request('/api/sheet/analysis',{classKey:'g:3:r:2',missionId:'m01',regenerate:true,evidence:{participants:999}},pagesHeaders),env),value=await analysis.json();
 assert.equal(analysis.status,200);assert.equal(analysis.headers.get('Access-Control-Allow-Origin'),pagesOrigin);
 assert.equal(value.basis.participants,1);assert.equal(s.calls.length,2);assert.equal(JSON.parse(s.calls[1].opts.body).regenerate,true);
});
test('Pages can read API errors without turning a failed Sheet read into an empty class',async()=>{
 const handler=createHandler(async()=>new Response('unavailable',{status:403}));
 const res=await handler(request('/api/sheet/classes',undefined,pagesHeaders),env);
 assert.equal(res.status,502);assert.equal(res.headers.get('Access-Control-Allow-Origin'),pagesOrigin);assert.equal((await res.json()).ok,false);
});

test('teacher login blocks records and rejudgment until a valid unexpired session is present',async()=>{
 const s=setup(),login=(password,binding=env)=>s.handler(request('/api/sheet/login',{password},pagesHeaders),binding);
 const noAuth={Authorization:''},list='/api/sheet/classes';
 for(const [path,body] of [[list],['/api/sheet/class?classCode=3-2'],['/api/sheet/rejudge',{}],['/api/sheet/analysis',{}],['/api/sheet/session']])assert.equal((await s.handler(request(path,body,noAuth),env)).status,401);
 assert.equal((await s.handler(request(list),{})).status,503);
 assert.equal((await login('wrong')).status,401);
 assert.equal((await login(env.TEACHER_PASSWORD,{...env,TEACHER_LOGIN_LIMIT:{limit:async()=>({success:false})}})).status,429);
 const response=await login(env.TEACHER_PASSWORD),credentials=await response.json();
 assert.equal(response.status,200);assert.equal(response.headers.get('Access-Control-Allow-Origin'),pagesOrigin);
 assert.equal(s.calls.length,0);
 for(const bad of [credentials.token+'.forged',await issueToken(env,0)])assert.equal((await s.handler(request(list,undefined,{Authorization:'Bearer '+bad}),env)).status,401);
 assert.equal((await s.handler(request(list,undefined,{Authorization:'Bearer '+credentials.token}),{...env,TEACHER_PASSWORD:'rotated-password'})).status,401);
 assert.equal((await s.handler(request('/api/sheet/session',undefined,{Authorization:'Bearer '+credentials.token}),env)).status,200);
 assert.equal((await s.handler(request(list,undefined,{Authorization:'Bearer '+credentials.token}),env)).status,200);
 assert.equal(s.calls.length,1);
});

test('unchanged teacher polls return the revision without records',async()=>{
 const revision='a'.repeat(64),handler=createHandler(async(_url,{body})=>{
  assert.deepEqual(JSON.parse(body),{action:'teacherDashboardData',proxySecret:env.TEACHER_PROXY_SECRET,missionId:'m02',classKey:'g:3:r:2',classCode:'',since:revision});
  return Response.json({ok:true,unchanged:true,revision});
 });
 const response=await handler(request('/api/sheet/class?classKey=g:3:r:2&missionId=m02&since='+revision),env);
 assert.deepEqual(await response.json(),{ok:true,live:false,unchanged:true,revision});
});

test('signed save hook publishes validated notices to separate game and test rooms',async()=>{
 const published=[],handler=createHandler(()=>assert.fail('hook must not read Sheets'));
 const bindings={...env,CLASS_PROGRESS:{getByName:key=>({publish:async changes=>published.push([key,changes])})}};
 const changes=[{missionId:'m01',classCode:'3-2',isTest:false,kind:'entered',answer:'never forward'},
  {missionId:'m02',classCode:'3-3',isTest:true,kind:'completed'}];
 const payload=JSON.stringify({at:Date.now(),changes});
 const send=signature=>handler(new Request('https://preview.example/api/sheet/changed',{method:'POST',headers:{'X-Sciw-Signature':signature},body:payload}),bindings);
 assert.equal((await send('bad')).status,401);assert.deepEqual(published,[]);
 const signature=createHmac('sha256',env.TEACHER_PROXY_SECRET).update(payload).digest('hex');
 assert.equal((await send(signature)).status,200);
 assert.deepEqual(published,[['m01:false',[{missionId:'m01',classCode:'3-2',classKey:'g:3:r:2',isTest:false,kind:'entered'}]],
  ['m02:true',[{missionId:'m02',classCode:'3-3',classKey:'g:3:r:3',isTest:true,kind:'completed'}]]]);
});

test('configured teacher reads use one uncached Sheets API request for both mission tabs',async()=>{
 const apiKey='synthetic-sheets-api-key',calls=[];
 const handler=createHandler(async(url,opts)=>{
  calls.push(url.searchParams.getAll('ranges'));
  assert.equal(url.origin,'https://sheets.googleapis.com');
  assert.match(url.pathname,/\/values:batchGet$/);
  assert.equal(url.searchParams.get('valueRenderOption'),'FORMATTED_VALUE');
  assert.equal(opts.headers['X-Goog-Api-Key'],apiKey);
  assert.equal(opts.cache,'no-store');
  const missions=url.searchParams.getAll('ranges').map(range=>range.startsWith("'감자'")?'m01':'m02');
  return Response.json({valueRanges:missions.map(mission=>({values:toRows(fixtures[mission],mission)}))});
 });
 const configured={...env,GOOGLE_SHEETS_API_KEY:apiKey};
 const list='/api/sheet/classes';
 assert.equal((await handler(request(list,undefined,{Authorization:''}),configured)).status,401);
 assert.equal(calls.length,0);
 const result=await (await handler(request(list),configured)).json();
 const expected=await (await setup().handler(request(list),env)).json();
 assert.deepEqual(result.classes,expected.classes);
 assert.deepEqual(result.overview,expected.overview);
 assert.deepEqual(calls,[["'감자'!A:Q","'강철솜'!A:Q"]]);
 assert.deepEqual(await (await handler(request(list+'?since='+result.revision),configured)).json(),
   {ok:true,live:false,unchanged:true,revision:result.revision});
 assert.equal(calls.length,2,'a conditional request still reads live sheet values');
 const scoped=await (await handler(request('/api/sheet/class?classKey=g:3:r:2&missionId=m01'),configured)).json();
 assert.deepEqual(scoped.sessions.map(s=>s.sessionId),['a','b']);
 assert.deepEqual(calls[2],["'감자'!A:Q"]);
});
