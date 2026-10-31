const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
require('../model.js');
const model = global.TeacherModel;
function api(path, url = '') {
  const values = new Map(), calls = [];
  const window = {SCIW_CONFIG:{API_URL:url,MISSION_ID:'m02'},addEventListener(){}};
  const document = {readyState:'loading',addEventListener(){},getElementById(){return null;}};
  const context = {window, document, localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)},setTimeout(){},clearTimeout(){},AbortController,fetch:async url=>{calls.push(url);return {ok:true,json:async()=>({ok:true,sessions:[],attempts:[]})}}};
  vm.runInNewContext(fs.readFileSync(path,'utf8'),context);
  return {api:window.SCIW_API,values,calls};
}
test('local submission survives retry without duplicates and appears only in its mission', async () => {
  for (const path of ['감자 삼투/web/js/api.js','강철솜 질량 보존/web/js/api.js']) {
    const {api:a,values} = api(path);
    a.startSession({sessionId:'s',classCode:'T',studentNo:'1',missionId:'m02',startedAt:'2026-01-01'});
    a.logAttempt({attemptId:'a',sessionId:'s',input:'합성 답안'}); a.logAttempt({attemptId:'a',sessionId:'s',input:'합성 답안'});
    a.updateSession('s',{finalAnswer:'합성 답안',endedAt:'2026-01-02',clearType:'full'}); await a.flush();
    const stored = JSON.parse(values.get('sciw_localdb_v1'));
    const data = model.select(stored,'T','m02');
    assert.equal(data.attempts.length,1); assert.equal(data.sessions[0].finalAnswer,'합성 답안');
    assert.equal(model.select(stored,'T','m01').sessions.length,0);
    assert.equal((await a.classData('T','m02')).attempts.length,1);
  }
});
test('latest ongoing attempt is not hidden by older completion', () => {
 const chosen = model.latest([{studentNo:'1',startedAt:'2026-01-01',clearType:'full'},{studentNo:'1',startedAt:'2026-01-02',stage:'claim'}]);
 assert.equal(chosen[0].stage,'claim');
});
test('m02 remote query specifies mission', async () => {
 const {api:a,calls} = api('강철솜 질량 보존/web/js/api.js','https://example.invalid'); await a.classData('T'); assert.match(calls[0],/missionId=m02/);
});
test('server refuses class data without authentication', () => {
 const context = {ContentService:{MimeType:{JSON:'json'},createTextOutput:s=>({setMimeType(){return s}})}};
 vm.createContext(context); vm.runInContext(fs.readFileSync('apps-script/Code.gs','utf8'),context);
 const result = JSON.parse(context.doGet({parameter:{action:'classData',classCode:'T',missionId:'m02'}}));
 assert.equal(result.ok,false); assert.match(result.error,/인증/);
});
