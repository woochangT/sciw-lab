import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHandler,parseRecords,scoped,catalog} from './worker.mjs';
const root=new URL('../../',import.meta.url);
const head=['recordType','recordId','sessionId','classCode','studentNo','missionId','createdAt','updatedAt','payload'];
const quote=v=>'"'+String(v??'').replaceAll('"','""')+'"';
const session=(id,code,mission='m01')=>({sessionId:id,classCode:code,studentNo:'02',missionId:mission,firstAnswer:'처음에는 "열"이라고 썼다.\n다시 생각했다.',finalAnswer:'합성 최종 답안',startedAt:'2026-11-02T00:00:00Z'});
const toCSV=(records,mission)=>[head,...records.map(s=>['session',s.sessionId,s.sessionId,s.classCode,s.studentNo,mission,'','',JSON.stringify(s)])].map(row=>row.map(quote).join(',')).join('\r\n');
const fixtures={m01:[session('a','3-2'),session('b','03-02'),session('c','3-3'),session('qa_auto','3-2'),session('t','test')],m02:[session('d','3-2','m02')]};
function setup(){const calls=[];return {calls,handler:createHandler(async(url,opts={})=>{
  calls.push({url:String(url),opts});
  if(String(url).startsWith('https://docs.google.com/')){const q=new URL(url).searchParams;assert.equal(q.get('range'),'A:T');const m=q.get('gid')==='807310001'?'m01':'m02';return new Response(toCSV(fixtures[m],m),{headers:{'Content-Type':'text/csv'}})}
  return Response.json({ok:true,analysis:{model:'gpt-6-luna',effort:'medium',result:{headline:'합성 헤드라인'}}});
})}}
const request=(path,body,headers={})=>new Request('https://preview.example'+path,body===undefined?{headers}:{method:'POST',headers:{Origin:'https://preview.example','Content-Type':'application/json',...headers},body:JSON.stringify(body)});

test('rejudgment is not exposed through the current public worker',async()=>{
 const s=setup();
 for(const req of [request('/api/sheet/rejudge',{classKey:'g:3:r:2',missionId:'m01',sessionId:'a'}),new Request('https://preview.example/api/sheet/rejudge',{method:'OPTIONS',headers:{Origin:'https://preview.example','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type'}})]){
  const response=await s.handler(req,{});
  assert.ok([403,404].includes(response.status));
 }
 assert.equal(s.calls.length,0);
});

test('root serves the intro index with explicit HTML handling, without an upstream server',async()=>{
 const s=setup(),paths=[],env={ASSETS:{fetch:async req=>{const p=new URL(req.url).pathname;paths.push(p);return p==='/index.html'?new Response('intro'):new Response(null,{status:404})}}};
 const res=await s.handler(request('/'),env);assert.equal(res.status,200);assert.equal(await res.text(),'intro');assert.deepEqual(paths,['/index.html']);assert.equal(s.calls.length,0);
 assert.equal((await s.handler(request('/apps-script/Code.gs'),env)).status,404);
});

test('hosted parser preserves multiline original answers and rejects cross-mission/schema rows',()=>{
 const records=parseRecords(toCSV(fixtures.m01,'m01'),'m01');assert.equal(records.sessions[0].firstAnswer,fixtures.m01[0].firstAnswer);
 assert.deepEqual(parseRecords(toCSV([session('wrong','A','m02')],'m01'),'m01').sessions,[]);
 assert.throws(()=>parseRecords('wrong,columns\n1,2','m01'));
 assert.equal(parseRecords(toCSV([fixtures.m01[0],fixtures.m01[0]],'m01'),'m01').invalidRows,1);
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
test('public hosted GET reads both real-shaped tabs without cookies and filters class/game',async()=>{
 const s=setup(),res=await s.handler(request('/api/sheet/class?classKey=g:3:r:2&missionId=m02'),{}),value=await res.json();
 assert.equal(res.status,200);assert.deepEqual(value.sessions.map(s=>s.sessionId),['d']);assert.equal(s.calls.length,2);assert.equal(res.headers.get('Cache-Control'),'private, no-store');
});
test('class overview is aggregated without student answers and does not generate an AI request',async()=>{
 const s=setup(),res=await s.handler(request('/api/sheet/classes'),{}),v=await res.json();
 assert.equal(res.status,200);assert.equal(v.overview.version,'teacher-overview-v1');
 assert.equal(v.overview.classes.find(c=>c.classKey==='g:3:r:2').games.m01.participants,1);
 for(const key of ['firstAnswer','finalAnswer','studentNo','sessionId'])assert.equal(JSON.stringify(v.overview).includes(key),false);
 assert.equal(s.calls.length,2);
});
test('analysis rebuilds authoritative evidence, strips identifiers, and relays explicit regeneration',async()=>{
 const s=setup(),res=await s.handler(request('/api/sheet/analysis',{classKey:'g:3:r:2',missionId:'m01',mode:'latest',regenerate:true,evidence:{participants:999}}),{}),v=await res.json();
 assert.equal(res.status,200);assert.equal(v.basis.participants,1);assert.equal(v.basis.written,1);assert.equal(v.analysis.model,'gpt-6-luna');
 const payload=JSON.parse(s.calls[2].opts.body);assert.equal(payload.regenerate,true);assert.equal(payload.action,'analyzeClass');assert.equal(payload.evidence.participants,1);
 for(const field of ['studentNo','classCode','sessionId'])assert.equal(JSON.stringify(payload).includes(field),false);
});
test('browsing never generates AI; invalid origins/body/scopes stop before upstream requests',async()=>{
 const s=setup();await s.handler(request('/api/sheet/classes'),{});assert.equal(s.calls.length,2);
 for(const req of [request('/api/sheet/analysis',{classKey:'g:3:r:2',missionId:'toString'}),request('/api/sheet/analysis',{classKey:'g:3:r:2',mode:'all'}),request('/api/sheet/analysis',{classKey:'g:3:r:2'},{Origin:'https://evil.example'}),request('/api/sheet/analysis',{classKey:'g:3:r:2',pad:'x'.repeat(1024)})]){
   const res=await s.handler(req,{});assert.ok([400,403,413].includes(res.status));assert.equal(s.calls.length,2);
 }
});
test('failed upstream reads produce an error instead of an empty class',async()=>{
 const handler=createHandler(async()=>new Response('not csv',{status:403}));
 const res=await handler(request('/api/sheet/classes'),{});assert.equal(res.status,502);assert.equal((await res.json()).ok,false);
});

const pagesOrigin='https://woochangt.github.io';
const pagesHeaders={Origin:pagesOrigin,'Sec-Fetch-Site':'cross-site'};
test('GitHub Pages reads the catalog and scoped answers with explicit CORS; unrelated sites stay blocked',async()=>{
 const s=setup();
 for(const path of ['/api/sheet/classes','/api/sheet/class?classKey=g:3:r:2&missionId=m02']){
  const res=await s.handler(request(path,undefined,pagesHeaders),{}),value=await res.json();
  assert.equal(res.status,200);assert.equal(value.ok,true);assert.equal(res.headers.get('Access-Control-Allow-Origin'),pagesOrigin);
  assert.match(res.headers.get('Vary'),/Origin/);assert.equal(res.headers.has('Access-Control-Allow-Credentials'),false);
  if(value.sessions)assert.deepEqual(value.sessions.map(s=>s.sessionId),['d']);
 }
 const count=s.calls.length;
 for(const Origin of ['https://evil.example','https://woochangt.github.io.evil.example','http://woochangt.github.io','null']){
  const res=await s.handler(request('/api/sheet/classes',undefined,{Origin,'Sec-Fetch-Site':'cross-site'}),{});
  assert.equal(res.status,403);assert.equal(res.headers.has('Access-Control-Allow-Origin'),false);
 }
 const noOrigin=await s.handler(request('/api/sheet/classes',undefined,{'Sec-Fetch-Site':'cross-site'}),{});
 assert.equal(noOrigin.status,403);assert.equal(s.calls.length,count);
});
test('Pages JSON preflight makes no upstream call and explicit analysis preserves authoritative evidence',async()=>{
 const s=setup(),preflight=(path,method,extra={})=>new Request('https://preview.example'+path,{method:'OPTIONS',headers:{...pagesHeaders,'Access-Control-Request-Method':method,'Access-Control-Request-Headers':'content-type',...extra}});
 const res=await s.handler(preflight('/api/sheet/analysis','POST'),{});
 assert.equal(res.status,204);assert.equal(res.headers.get('Access-Control-Allow-Origin'),pagesOrigin);
 assert.equal(res.headers.get('Access-Control-Allow-Methods'),'POST');assert.equal(res.headers.get('Access-Control-Allow-Headers'),'Content-Type');
 for(const req of [preflight('/api/sheet/analysis','POST',{Origin:'https://evil.example'}),preflight('/api/sheet/analysis','DELETE'),preflight('/api/sheet/analysis','POST',{'Access-Control-Request-Headers':'Authorization'}),preflight('/api/not-supported','POST')])assert.equal((await s.handler(req,{})).status,403);
 assert.equal(s.calls.length,0);
 const analysis=await s.handler(request('/api/sheet/analysis',{classKey:'g:3:r:2',missionId:'m01',regenerate:true,evidence:{participants:999}},pagesHeaders),{}),value=await analysis.json();
 assert.equal(analysis.status,200);assert.equal(analysis.headers.get('Access-Control-Allow-Origin'),pagesOrigin);
 assert.equal(value.basis.participants,1);assert.equal(s.calls.length,3);assert.equal(JSON.parse(s.calls[2].opts.body).regenerate,true);
});
test('Pages can read API errors without turning a failed Sheet read into an empty class',async()=>{
 const handler=createHandler(async()=>new Response('unavailable',{status:403}));
 const res=await handler(request('/api/sheet/classes',undefined,pagesHeaders),{});
 assert.equal(res.status,502);assert.equal(res.headers.get('Access-Control-Allow-Origin'),pagesOrigin);assert.equal((await res.json()).ok,false);
});
