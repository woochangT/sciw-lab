const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const {build}=require('../analysis-input.cjs');
const session=(id,no,extra={})=>({sessionId:id,studentNo:no,classCode:'A',missionId:'m02',startedAt:'2026-11-01T00:00:00Z',...extra});
test('AI input uses same first/latest normalization, scopes class, excludes QA and identifiers',()=>{
 const db={sessions:[session('old','02',{firstAnswer:'산소',startedAt:'2026-10-31T00:00:00Z'}),session('new','2',{finalAnswer:'산소와 철이 결합'}),session('other','3',{classCode:'B',finalAnswer:'비공개 다른반'}),session('qa_auto','4'),session('invalid','이름')],attempts:[]};
 const v=build(db,'A','latest');assert.equal(v.participants,1);assert.equal(v.totalPlays,2);assert.equal(v.excluded,1);assert.equal(v.written,1);assert.equal(v.samples[0].final,'산소와 철이 결합');assert.equal(build(db,'A','first').written,0);
 const text=JSON.stringify(v);for(const key of ['classCode','studentNo','sessionId','비공개 다른반'])assert.equal(text.includes(key),false);
});
test('test plays are explicit, sample cap applies and contact strings are removed',()=>{
 const db={sessions:Array.from({length:50},(_,i)=>session('s'+i,String(i+1),{classCode:'test',firstAnswer:'연락 test@example.com 010-1234-5678'})),attempts:[]};
 assert.equal(build(db,'test','latest').participants,0);const v=build(db,'test','latest',true);assert.equal(v.participants,50);assert.equal(v.sampled,24);assert.equal(v.samples[0].first,'연락 [이메일 제외] [연락처 제외]');
});
function backend(options={}){
 let calls=0,lastRequest;const cache=new Map(),props=new Map([['OPENAI-API-KEY','test-only-placeholder']]);
 let response={headline:'확인할 개념',teachingFocus:'학생의 말을 근거로 다음 질문을 선택합니다.',summary:'테스트 결과',observations:[],questions:[],activities:[],limitations:[]};
 const sandbox={PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.get(k),setProperty:(k,v)=>props.set(k,v)})},CacheService:{getScriptCache:()=>({get:k=>cache.get(k),put:(k,v)=>cache.set(k,v),remove:k=>cache.delete(k)})},LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},Utilities:{DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(_,s)=>[...crypto.createHash('sha256').update(s).digest()]},UrlFetchApp:{fetch:(url,req)=>{calls++;lastRequest=JSON.parse(req.payload);return {getResponseCode:()=>options.http||200,getContentText:()=>JSON.stringify(options.response||{model:'gpt-6-luna',status:'completed',output:[{type:'reasoning'},{type:'message',content:[{type:'output_text',text:JSON.stringify(response)}]}]})}}}};
 vm.createContext(sandbox);vm.runInContext(fs.readFileSync('apps-script/Code.gs','utf8'),sandbox);
 return {sandbox,props,cache,get calls(){return calls},get request(){return lastRequest}};
}
const evidence=()=>build({sessions:[session('s','1',{finalAnswer:'산소와 철의 결합'})],attempts:[]},'A','latest');
test('class analysis uses Luna medium, reads message output blocks, caches identical evidence, strips extra identifiers',()=>{
 const b=backend(),e=evidence();e.classCode='private';const out=b.sandbox.analyzeClass_({evidence:e});assert.equal(out.effort,'medium');assert.equal(b.request.model,'gpt-6-luna');assert.equal(b.request.reasoning.effort,'medium');assert.equal(b.request.store,false);assert.equal(b.request.text.format.strict,true);assert.equal(b.request.input.includes('private'),false);assert.equal(b.sandbox.analyzeClass_({evidence:e}).cached,true);assert.equal(b.calls,1);
});
test('invalid counts and exhausted budget stop before paid calls',()=>{
 const b=backend(),e=evidence();e.written=5;assert.throws(()=>b.sandbox.analyzeClass_({evidence:e}),/집계/);assert.equal(b.calls,0);
 const now=new Date().toISOString();b.props.set('CLASS_ANALYSIS_USAGE',JSON.stringify({day:now.slice(0,10),daily:20}));assert.throws(()=>b.sandbox.analyzeClass_({evidence:evidence()}),/한도/);assert.equal(b.calls,0);
});

test('incomplete and refused Responses never become cached teaching suggestions',()=>{
 for(const response of [{status:'incomplete',output:[]},{status:'completed',output:[{type:'message',content:[{type:'refusal',refusal:'no'}]}]}]){
  const b=backend({response});assert.throws(()=>b.sandbox.analyzeClass_({evidence:evidence()}),/분석/);assert.equal(b.calls,1);assert.equal(b.cache.size,0);
 }
});

test('explicit regeneration bypasses cache; ordinary reads reuse it',()=>{const b=backend(),e=evidence();b.sandbox.analyzeClass_({evidence:e});b.sandbox.analyzeClass_({evidence:e});assert.equal(b.calls,1);b.sandbox.analyzeClass_({evidence:e,regenerate:true});assert.equal(b.calls,2)});
test('games and class aliases remain separate in evidence and prompt',()=>{const db={classCodes:['3-2','3학년 2반'],sessions:[session('steel','1',{classCode:'3-2',finalAnswer:'산소'}),session('potato','2',{classCode:'3학년 2반',missionId:'m01',finalAnswer:'물이 이동'}),session('other','3',{classCode:'3-3',missionId:'m01',finalAnswer:'다른 반'})],attempts:[]};const e=build(db,'','latest',false,'m01');assert.equal(e.participants,1);assert.equal(e.samples[0].final,'물이 이동');const b=backend();b.sandbox.analyzeClass_({evidence:e});assert.match(b.request.instructions,/반투과성/);assert.doesNotMatch(b.request.instructions,/강철솜의 열린 실험/)});
