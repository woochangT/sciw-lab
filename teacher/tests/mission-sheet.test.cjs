const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');const crypto=require('node:crypto');
function make(){
 const head=['recordType','recordId','sessionId','classCode','studentNo','missionId','createdAt','updatedAt','payload'];
 function sheet(rows){return {rows,getLastRow(){return this.rows.length},getLastColumn(){return this.rows[0].length},getRange(row,col,n,m){const self=this;return {getValues(){return self.rows.slice(row-1,row-1+n).map(r=>r.slice(col-1,col-1+m))},getDisplayValues(){return this.getValues()},setNumberFormat(){return this},setValues(values){self.rows[row-1]=values[0].slice();return this}}}}}
 const sheets={'감자':sheet([head]),'강철솜':sheet([head])};let access='';
 const c={SpreadsheetApp:{openById(){return {getSheetByName:n=>sheets[n]}}},ContentService:{MimeType:{JSON:'json'},createTextOutput:s=>({setMimeType(){return s}})},PropertiesService:{getScriptProperties:()=>({getProperty:()=>access})},Utilities:{DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(algo,val)=>Array.from(crypto.createHash(algo).update(val).digest()).map(x=>x>127?x-256:x)},LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})}};
 vm.createContext(c);vm.runInContext(fs.readFileSync('apps-script/Code.gs','utf8'),c);
 return {sheets,sheet,reconcile(){return c.reconcileLegacy()},setAccess(v){access=JSON.stringify(v)},post(body){return JSON.parse(c.doPost({postData:{contents:JSON.stringify(body)}}))},get(q){return JSON.parse(c.doGet({parameter:q}))}};
}
test('two missions save to separate tabs, retry safely, and teacher access is scoped',()=>{
 const m=make(), key='synthetic-test-key-1234567890';
 const ops=id=>[{action:'startSession',session:{sessionId:id,missionId:id==='s1'?'m01':'m02',classCode:'A',studentNo:'1',firstAnswer:'가상 답'}},{action:'logAttempt',attempt:{attemptId:'a'+id,sessionId:id,input:'가상 시도'}},{action:'updateSession',sessionId:id,fields:{finalAnswer:'가상 최종 답'}}];
 for(const id of ['s1','s2']) {assert.equal(m.post({action:'batch',ops:ops(id)}).ok,true);assert.equal(m.post({action:'batch',ops:ops(id)}).ok,true)}
 assert.equal(m.sheets['감자'].rows.length,3);assert.equal(m.sheets['강철솜'].rows.length,3);
 assert.equal(m.post({action:'classData',classCode:'A',missionId:'m01',teacherKey:key}).ok,false);
 assert.equal(m.get({action:'classData',classCode:'A',missionId:'m01'}).ok,false);
 m.setAccess([{classCode:'A',missionId:'m01',keySha256:crypto.createHash('sha256').update(key).digest('hex')}]);
 const result=m.post({action:'classData',classCode:'A',missionId:'m01',teacherKey:key});assert.equal(result.ok,true);assert.equal(result.sessions.length,1);assert.equal(result.sessions[0].finalAnswer,'가상 최종 답');assert.equal(result.attempts.length,1);
 assert.equal(m.post({action:'classData',classCode:'A',missionId:'m02',teacherKey:key}).ok,false);
 assert.equal(m.post({action:'classData',classCode:'B',missionId:'m01',teacherKey:key}).ok,false);
});

test('reconcile copies late legacy records without deleting originals and repeat is idempotent',()=>{
 const m=make();
 m.sheets.Sessions=m.sheet([['sessionId','classCode','studentNo','missionId','startedAt','updatedAt','firstAnswer'],['legacy','A','1','m01','2026-01-01T00:00:00Z','2026-01-01T00:01:00Z','합성 답']]);
 m.sheets.Attempts=m.sheet([['attemptId','sessionId','classCode','studentNo','missionId','createdAt','input'],['a1','legacy','A','1','m01','2026-01-01T00:02:00Z','합성 시도']]);
 m.reconcile();m.reconcile();assert.equal(m.sheets['감자'].rows.length,3);assert.equal(m.sheets.Sessions.rows.length,2);assert.equal(m.sheets.Attempts.rows.length,2);
 m.sheets.Sessions.rows[1][5]='2026-01-01T00:03:00Z';m.sheets.Sessions.rows[1][6]='추가된 합성 답';m.reconcile();
 assert.equal(JSON.parse(m.sheets['감자'].rows[1][8]).firstAnswer,'추가된 합성 답');
});
