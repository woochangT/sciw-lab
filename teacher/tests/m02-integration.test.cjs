const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const rubric = require('../../강철솜 질량 보존/web/js/rubric02.js');
require('../model.js');
require('../evidence.js');
const M = global.TeacherModel;

// Synthetic provider output, not a live model accuracy test.
const text = 'A는 2.0 g에서 2.5 g이 되었다. 연소에는 산소가 필요해서 밖의 산소가 철에 붙었다. B는 내부 산소가 철에 붙어도 닫힌 플라스크 안에 남아 전체 150.0 g이 유지된다. 늘어난 0.5 g은 철에 붙은 산소의 질량이다.';
function analysis() {
  return {
    inputStatus:'meaningful', diagnosis:'NONE',
    checks:Object.fromEntries(rubric.ELEMENTS.map(k=>[k,{status:k==='W1a'?'missing':'met',quote:k==='W1a'?'':text,reason:'합성 평가 근거'}])),
    errors:[], explanationAttempt:true, explanationQuality:4, nextQuestion:'', highlights:[]
  };
}
function server(options={}) {
  const props = new Map(Object.entries({'OPENAI-API-KEY':'synthetic-provider-key',M02_JUDGE_ENABLED:'true',...options.props}));
  const requests = [];
  const c = {
    SCIW_RUBRIC02:rubric,
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.get(k)||null,setProperty:(k,v)=>props.set(k,v)})},
    LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},
    Utilities:{formatDate:()=> '2026-11-02',getUuid:()=> 'synthetic-request'},
    ContentService:{MimeType:{JSON:'json'},createTextOutput:s=>({setMimeType:()=>s})},
    UrlFetchApp:{fetch(url,opts){requests.push({url,body:JSON.parse(opts.payload)});return {
      getResponseCode:()=>200,
      getContentText:()=>JSON.stringify(options.response||{status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(analysis())}]}]})
    }}}
  };
  vm.createContext(c);
  vm.runInContext(fs.readFileSync('apps-script/m02-evaluator/Code.gs','utf8'),c);
  return {requests,post:body=>JSON.parse(c.doPost({postData:{contents:JSON.stringify(body)}}))};
}
function client(fetcher, configured=true) {
  const values = new Map();
  const window = {SCIW_RUBRIC02:rubric,addEventListener(){}};
  vm.runInNewContext(fs.readFileSync('강철솜 질량 보존/web/js/config.js','utf8'),{window});
  if (!configured) window.SCIW_CONFIG.JUDGE_API_URL = '';
  const context = {TextEncoder,
    window,document:{readyState:'loading',addEventListener(){},getElementById(){return null}},AbortController,
    localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)},
    fetch:fetcher,setTimeout(){return 1},clearTimeout(){}
  };
  vm.runInNewContext(fs.readFileSync('ui/record-sync.js','utf8'),context);
  vm.runInNewContext(fs.readFileSync('강철솜 질량 보존/web/js/api.js','utf8'),context);
  return {api:window.SCIW_API,config:window.SCIW_CONFIG,values};
}

test('m02 AI results route separately from storage and remain readable by teacher analysis', async()=>{
  const s = server(), calls = [];
  const c = client(async(url,opts)=>{
    const body = JSON.parse(opts.body);calls.push({url,body});
    return {ok:true,json:async()=>body.action==='judgeM02'?s.post(body):{ok:true}};
  });
  assert.notEqual(c.config.API_URL,c.config.JUDGE_API_URL);
  const r = await c.api.judge({stage:'final',text,initialAnswer:'열이 더해졌다고 생각했다',cardSpans:[]});
  assert.equal(r.pass,true);assert.equal(r.path,2);assert.equal(r.elements.W1a,false);
  assert.equal(s.requests.length,1);assert.equal(s.requests[0].body.store,false);
  const session = {sessionId:'synthetic-m02',missionId:'m02',classCode:'3-2',studentNo:'02',startedAt:'2026-11-02T00:00:00Z'};
  const fields = {finalAnswer:text,finalJudgment:r.elements,judgedBy:r.judgedBy,rubricVersion:r.rubricVersion,analysis:r.analysis,clearType:'full'};
  const attempt = {attemptId:'synthetic-final',sessionId:session.sessionId,missionId:'m02',classCode:'3-2',stage:'compose',questId:'final',input:text,judgment:r.elements,analysis:r.analysis};
  c.api.startSession(session);c.api.logAttempt(attempt);c.api.updateSession(session.sessionId,fields);await c.api.flush();
  assert.equal(calls[0].url,c.config.JUDGE_API_URL);
  const stored = calls.find(x=>x.body.action==='batch');
  assert.equal(stored.url,c.config.API_URL);assert.equal(stored.body.ops.length,3);
  assert.equal(calls.filter(x=>x.url===c.config.JUDGE_API_URL).length,1);
  const db = {sessions:[{...session,...fields}],attempts:[attempt]};
  const d = M.analyze(db,'3-2','latest');
  assert.equal(M.submissions(d,d.reps[0]).length,1);
  assert.equal(M.element(d.reps[0],'W2b'),'기록됨');
  assert.equal(M.element(d.reps[0],'W1a'),'자동 판정 미인정');
  assert.equal(M.judgmentMethod(d.reps[0]),'AI 평가');
  assert.equal(global.TeacherEvidence.build(db,'3-2','latest').samples[0].final,text);
});

test('missing judge setup and server rate limits never become a keyword result or a storage request',async()=>{
  let calls=0;
  const missing=client(async()=>{calls++},false);
  await assert.rejects(missing.api.judge({stage:'final',text}),e=>e.code==='JUDGE_NOT_CONFIGURED');
  const blocked=client(async()=>{calls++;return {ok:true,json:async()=>({ok:false,code:'DAILY_LIMIT'})}});
  await assert.rejects(blocked.api.judge({stage:'final',text}),e=>e.code==='DAILY_LIMIT');
  assert.equal(calls,1);assert.equal(blocked.values.size,0);
});

test('separate evaluator reserves its budget and rejects unsupported actions before provider calls',()=>{
  const s=server({props:{M02_DAILY_LIMIT:'1'}});
  assert.equal(s.post({action:'batch',ops:[]}).code,'INVALID_REQUEST');
  assert.equal(s.post({action:'judgeM02',stage:'final',text}).ok,true);
  assert.equal(s.post({action:'judgeM02',stage:'final',text}).code,'DAILY_LIMIT');
  assert.equal(s.requests.length,1);
  const disabled=server({props:{M02_JUDGE_ENABLED:'false'}});
  assert.equal(disabled.post({action:'judgeM02',stage:'final',text}).code,'JUDGE_NOT_CONFIGURED');
  assert.equal(disabled.requests.length,0);
});

test('refused or incomplete provider results cannot become student judgments',()=>{
  for(const [response,code] of [
    [{status:'incomplete',output:[]},'INCOMPLETE_RESPONSE'],
    [{status:'completed',output:[{content:[{type:'refusal',refusal:'synthetic'}]}]},'MODEL_REFUSAL']
  ]) assert.equal(server({response}).post({action:'judgeM02',stage:'final',text}).code,code);
});

test('teacher judgment labels distinguish new AI, legacy keyword and missing metadata',()=>{
  assert.equal(M.judgmentMethod({judgedBy:'openai'}),'AI 평가');
  assert.equal(M.judgmentMethod({judgedBy:'llm'}),'AI 평가');
  assert.equal(M.judgmentMethod({judgedBy:'keyword'}),'단어 규칙');
  assert.equal(M.judgmentMethod({judgeVersion:'keyword-1.0'}),'단어 규칙');
  assert.equal(M.judgmentMethod({}),'미기록');
});
