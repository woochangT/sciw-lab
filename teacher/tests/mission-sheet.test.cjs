const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');const crypto=require('node:crypto');
function make(){
 const head=['recordType','recordId','sessionId','classCode','studentNo','missionId','createdAt','updatedAt','payload'];
 function sheet(rows){return {rows,getLastRow(){return this.rows.length},getLastColumn(){return Math.max(0,...this.rows.map(r=>r.length))},getRange(row,col,n,m){const self=this;return {getValues(){return Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>self.rows[row-1+i]?.[col-1+j]??''))},getDisplayValues(){return this.getValues().map(r=>r.map(String))},setNumberFormat(){return this},setFontWeight(){return this},setValues(values){values.forEach((r,i)=>{self.rows[row-1+i]??=[];r.forEach((v,j)=>self.rows[row-1+i][col-1+j]=v)});return this},createTextFinder(value){return {matchEntireCell(){return this},findNext(){const i=self.rows.findIndex((r,i)=>i>=row-1&&i<row-1+n&&String(r[col-1])===value);return i<0?null:{getRow:()=>i+1}}}}}},setFrozenRows(){}}}
 const sheets={'감자':sheet([head]),'강철솜':sheet([head])};let access='';
 const c={SpreadsheetApp:{openById(){return {getSheetByName:n=>sheets[n],insertSheet:n=>(sheets[n]=sheet([]))}}},ContentService:{MimeType:{JSON:'json'},createTextOutput:s=>({setMimeType(){return s}})},PropertiesService:{getScriptProperties:()=>({getProperty:()=>access})},Utilities:{DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(algo,val)=>Array.from(crypto.createHash(algo).update(val).digest()).map(x=>x>127?x-256:x)},LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})}};
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

test('legacy mirrors preserve mission-specific fields and retries repair partial writes',()=>{
 const m=make();
 const start={action:'startSession',session:{sessionId:'s2',missionId:'m02',classCode:'A',studentNo:'7'}};
 assert.equal(m.post(start).ok,true);
 const update={action:'updateSession',sessionId:'s2',fields:{finalAnswer:'합성 최종 답',finalJudgment:{'D-A':true,W1b:true},ownMode:true}};
 assert.equal(m.post(update).ok,true);
 const attempt={action:'logAttempt',attempt:{attemptId:'a2',sessionId:'s2',input:'합성 시도',choice:'A',pass:true}};
 assert.equal(m.post(attempt).ok,true);
 assert.equal(m.post(start).ok,true); // 재전송이 최종 답을 되돌리지 않는다.
 const row=m.sheets.Sessions.rows[1], h=m.sheets.Sessions.rows[0];
 assert.equal(row[h.indexOf('finalAnswer')],'합성 최종 답');
 assert.equal(row[h.indexOf('finalDA')],'TRUE');
 assert.equal(row[h.indexOf('finalW1b')],'TRUE');
 assert.equal(row[h.indexOf('ownMode')],'true');
 m.sheets.Attempts.rows.pop(); // 미션 쓰기 뒤 기존 시트 쓰기가 실패한 경우 재현
 assert.equal(m.post(attempt).ok,true);assert.equal(m.post(attempt).ok,true);
 assert.equal(m.sheets.Attempts.rows.length,2);assert.equal(m.sheets['강철솜'].rows.length,3);
});
test('an in-flight legacy session resumes and rejects mission changes',()=>{
 const m=make();
 m.sheets.Sessions=m.sheet([['sessionId','classCode','studentNo','missionId','startedAt','updatedAt','questPassed'],['active','A','1','m02','2026-01-01T00:00:00Z','2026-01-01T00:01:00Z','{"C":true}']]);
 assert.equal(m.post({action:'updateSession',sessionId:'active',fields:{finalAnswer:'이어서 쓴 합성 답'}}).ok,true);
 const record=JSON.parse(m.sheets['강철솜'].rows[1][8]);
 assert.equal(record.questPassed.C,true);assert.equal(record.finalAnswer,'이어서 쓴 합성 답');
 assert.equal(m.post({action:'updateSession',sessionId:'active',fields:{missionId:'m01'}}).ok,false);
 assert.equal(m.sheets['감자'].rows.length,1);
});

test('previously migrated JSON fields remain typed and do not erase final judgments',()=>{
 const m=make(), old={sessionId:'old',classCode:'A',studentNo:'1',missionId:'m01',finalJudgment:'{"C":true}',questPassed:'{"C":true}'};
 m.sheets['감자'].rows.push(['session','old','old','A','1','m01','2026-01-01','2026-01-01',JSON.stringify(old)]);
 assert.equal(m.post({action:'updateSession',sessionId:'old',fields:{hintTotal:1}}).ok,true);
 const h=m.sheets.Sessions.rows[0];assert.equal(m.sheets.Sessions.rows[1][h.indexOf('finalC')],'TRUE');
 assert.equal(JSON.parse(m.sheets['감자'].rows[1][8]).questPassed.C,true);
});
