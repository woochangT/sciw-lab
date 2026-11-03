const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');const crypto=require('node:crypto');
function make(){
 const head=['recordType','recordId','sessionId','classCode','studentNo','missionId','createdAt','updatedAt','payload'];
 function sheet(rows){return {rows,deleteRows(start,count){this.rows.splice(start-1,count)},getLastRow(){return this.rows.length},getLastColumn(){return Math.max(0,...this.rows.map(r=>r.length))},getRange(row,col,n,m){const self=this;return {getValues(){return Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>self.rows[row-1+i]?.[col-1+j]??''))},getDisplayValues(){return this.getValues().map(r=>r.map(String))},setNumberFormat(){return this},setFontWeight(){return this},setValues(values){values.forEach((r,i)=>{self.rows[row-1+i]??=[];r.forEach((v,j)=>self.rows[row-1+i][col-1+j]=v)});return this},createTextFinder(value){return {matchEntireCell(){return this},findNext(){const i=self.rows.findIndex((r,i)=>i>=row-1&&i<row-1+n&&String(r[col-1])===value);return i<0?null:{getRow:()=>i+1}}}}}},setFrozenRows(){}}}
 const sheets={'감자':sheet([head]),'강철솜':sheet([head])};let access='';
 const c={console:{log(){}},SpreadsheetApp:{openById(){return {getSheetByName:n=>sheets[n],insertSheet:n=>(sheets[n]=sheet([]))}}},ContentService:{MimeType:{JSON:'json'},createTextOutput:s=>({setMimeType(){return s}})},PropertiesService:{getScriptProperties:()=>({getProperty:()=>access})},Utilities:{DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(algo,val)=>Array.from(crypto.createHash(algo).update(val).digest()).map(x=>x>127?x-256:x)},LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})}};
 vm.createContext(c);vm.runInContext(fs.readFileSync('apps-script/Code.gs','utf8'),c);
 return {sheets,sheet,cleanup(){return c.deleteInvalidClassRecords()},previewCleanup(){return c.previewInvalidClassRecords()},reconcile(){return c.reconcileLegacy()},setAccess(v){access=JSON.stringify(v)},post(body){return JSON.parse(c.doPost({postData:{contents:JSON.stringify(body)}}))},get(q){return JSON.parse(c.doGet({parameter:q}))}};
}
test('two missions save to separate tabs, retry safely, and teacher access is scoped',()=>{
 const m=make(), key='synthetic-test-key-1234567890';
 const ops=id=>[{action:'startSession',session:{sessionId:id,missionId:id==='s1'?'m01':'m02',classCode:'1-2',studentNo:'1',firstAnswer:'가상 답'}},{action:'logAttempt',attempt:{attemptId:'a'+id,sessionId:id,input:'가상 시도'}},{action:'updateSession',sessionId:id,fields:{finalAnswer:'가상 최종 답'}}];
 for(const id of ['s1','s2']) {assert.equal(m.post({action:'batch',ops:ops(id)}).ok,true);assert.equal(m.post({action:'batch',ops:ops(id)}).ok,true)}
 assert.equal(m.sheets['감자'].rows.length,2);assert.equal(m.sheets['강철솜'].rows.length,2);
 assert.equal(m.post({action:'classData',classCode:'1-2',missionId:'m01',teacherKey:key}).ok,false);
 assert.equal(m.get({action:'classData',classCode:'1-2',missionId:'m01'}).ok,false);
 m.setAccess([{classCode:'1-2',missionId:'m01',keySha256:crypto.createHash('sha256').update(key).digest('hex')}]);
 const result=m.post({action:'classData',classCode:'1-2',missionId:'m01',teacherKey:key});assert.equal(result.ok,true);assert.equal(result.sessions.length,1);assert.equal(result.sessions[0].finalAnswer,'가상 최종 답');assert.equal(result.attempts.length,1);
 assert.equal(m.post({action:'classData',classCode:'1-2',missionId:'m02',teacherKey:key}).ok,false);
 assert.equal(m.post({action:'classData',classCode:'1-3',missionId:'m01',teacherKey:key}).ok,false);
});

test('reconcile copies late legacy records without deleting originals and repeat is idempotent',()=>{
 const m=make();
 m.sheets.Sessions=m.sheet([['sessionId','classCode','studentNo','missionId','startedAt','updatedAt','firstAnswer'],['legacy','1-2','1','m01','2026-01-01T00:00:00Z','2026-01-01T00:01:00Z','합성 답']]);
 m.sheets.Attempts=m.sheet([['attemptId','sessionId','classCode','studentNo','missionId','createdAt','input'],['a1','legacy','1-2','1','m01','2026-01-01T00:02:00Z','합성 시도']]);
 m.reconcile();m.reconcile();assert.equal(m.sheets['감자'].rows.length,3);assert.equal(m.sheets.Sessions.rows.length,2);assert.equal(m.sheets.Attempts.rows.length,2);
 m.sheets.Sessions.rows[1][5]='2026-01-01T00:03:00Z';m.sheets.Sessions.rows[1][6]='추가된 합성 답';m.reconcile();
 assert.equal(JSON.parse(m.sheets['감자'].rows[1][8]).firstAnswer,'추가된 합성 답');
});

test('legacy mirrors preserve mission-specific fields and retries repair partial writes',()=>{
 const m=make();
 const start={action:'startSession',session:{sessionId:'s2',missionId:'m02',classCode:'1-2',studentNo:'7'}};
 assert.equal(m.post(start).ok,true);
 const update={action:'updateSession',sessionId:'s2',fields:{finalAnswer:'합성 최종 답',finalJudgment:{'D-A':true,W1b:true},ownMode:true,judgedBy:'openai',rubricVersion:'m02-docx-1.1.0',analysis:{checks:{W1b:{status:'met',quote:'합성 최종 답',reason:'합성 근거'}}}}};
 assert.equal(m.post(update).ok,true);
 const attempt={action:'logAttempt',attempt:{attemptId:'a2',sessionId:'s2',input:'합성 시도',choice:'1-2',pass:true}};
 assert.equal(m.post(attempt).ok,true);
 assert.equal(m.post(start).ok,true); // 재전송이 최종 답을 되돌리지 않는다.
 const row=m.sheets.Sessions.rows[1], h=m.sheets.Sessions.rows[0];
 assert.equal(row[h.indexOf('finalAnswer')],'합성 최종 답');
 assert.equal(row[h.indexOf('finalDA')],'TRUE');
 assert.equal(row[h.indexOf('finalW1b')],'TRUE');
 assert.equal(row[h.indexOf('ownMode')],'true');
 assert.equal(row[h.indexOf('judgedBy')],'openai');
 const saved=JSON.parse(m.sheets['강철솜'].rows[1][8]);
 assert.equal(saved.rubricVersion,'m02-docx-1.1.0');assert.equal(saved.analysis.checks.W1b.quote,'합성 최종 답');
 const extra=JSON.parse(row[h.indexOf('extra')]);assert.equal(extra.analysis.checks.W1b.status,'met');
 assert.equal(m.sheets.Attempts,undefined); // 새 로그는 행을 추가하지 않고 세션의 대화 열을 갱신한다.
 assert.equal(m.post(attempt).ok,true);assert.equal(m.post(attempt).ok,true);
 const history=JSON.parse(m.sheets['강철솜'].rows[1].slice(9,17).join(''));
 assert.equal(history.length,1);assert.equal(history[0].input,'합성 시도');assert.equal(m.sheets['강철솜'].rows.length,2);
});
test('an in-flight legacy session resumes and rejects mission changes',()=>{
 const m=make();
 m.sheets.Sessions=m.sheet([['sessionId','classCode','studentNo','missionId','startedAt','updatedAt','questPassed'],['active','1-2','1','m02','2026-01-01T00:00:00Z','2026-01-01T00:01:00Z','{"C":true}']]);
 assert.equal(m.post({action:'updateSession',sessionId:'active',fields:{finalAnswer:'이어서 쓴 합성 답'}}).ok,true);
 const record=JSON.parse(m.sheets['강철솜'].rows[1][8]);
 assert.equal(record.questPassed.C,true);assert.equal(record.finalAnswer,'이어서 쓴 합성 답');
 assert.equal(m.post({action:'updateSession',sessionId:'active',fields:{missionId:'m01'}}).ok,false);
 assert.equal(m.sheets['감자'].rows.length,1);
});

test('previously migrated JSON fields remain typed and do not erase final judgments',()=>{
 const m=make(), old={sessionId:'old',classCode:'1-2',studentNo:'1',missionId:'m01',finalJudgment:'{"C":true}',questPassed:'{"C":true}'};
 m.sheets['감자'].rows.push(['session','old','old','1-2','1','m01','2026-01-01','2026-01-01',JSON.stringify(old)]);
 assert.equal(m.post({action:'updateSession',sessionId:'old',fields:{hintTotal:1}}).ok,true);
 const h=m.sheets.Sessions.rows[0];assert.equal(m.sheets.Sessions.rows[1][h.indexOf('finalC')],'TRUE');
 assert.equal(JSON.parse(m.sheets['감자'].rows[1][8]).questPassed.C,true);
});

test('one login stays one mission row across many answers, feedback pages and retries; hosted/local readers round-trip chunked dialogue',async()=>{
 const m=make(),start={action:'startSession',session:{sessionId:'journal',missionId:'m02',classCode:'3-2',studentNo:'2'}};
 assert.equal(m.post(start).ok,true);
 const answer={action:'logAttempt',attempt:{attemptId:'answer',sessionId:'journal',stage:'compose',questId:'final',input:('합성 답안😀').repeat(10000),judgment:{W1b:true},analysis:{checks:{W1b:{status:'met',quote:'합성 답안',reason:'합성 이유'}}}}};
 const feedback={action:'logAttempt',attempt:{attemptId:'feedback',sessionId:'journal',stage:'compose',questId:'professorSpeech',feedbackText:['산소의 출처를 설명해 보겠나?'],feedbackSource:'displayed',inReplyTo:'answer'}};
 for(const op of [answer,feedback,answer,feedback])assert.equal(m.post(op).ok,true);
 assert.equal(m.sheets['강철솜'].rows.length,2);assert.equal(m.sheets['감자'].rows.length,1);assert.equal(m.sheets.Sessions.rows.length,2);assert.equal(m.sheets.Attempts,undefined);
 const {parseRecords}=await import('../../deploy/cloudflare/worker.mjs');
 const quote=v=>'"'+String(v??'').replaceAll('"','""')+'"';
 const csv=m.sheets['강철솜'].rows.map(r=>r.map(quote).join(',')).join('\r\n');
 const parsed=parseRecords(csv,'m02');assert.equal(parsed.invalidRows,0);assert.equal(parsed.sessions.length,1);assert.equal(parsed.attempts.length,2);assert.equal(parsed.attempts[0].input,answer.attempt.input);assert.equal(parsed.attempts[0].eventOrder,1);assert.equal(parsed.attempts[1].eventOrder,2);assert.equal(parsed.attempts[1].feedbackText[0],feedback.attempt.feedbackText[0]);
 const {spawnSync}=require('node:child_process');
 const py=spawnSync('python3',['-c',"import sys,json;sys.path.insert(0,'scripts');from local_server import parse_records;print(json.dumps(parse_records(sys.stdin.read(),'m02'),ensure_ascii=False))"],{input:csv,encoding:'utf8'});
 assert.equal(py.status,0,py.stderr);assert.deepEqual(JSON.parse(py.stdout),parsed);
 assert.equal(m.post({action:'logAttempt',attempt:{attemptId:'conflict',sessionId:'journal',missionId:'m01',input:'다른 미션'}}).ok,false);
 assert.equal(m.sheets['강철솜'].rows.length,2);
});

test('backend blocks invalid class starts, legacy resurrection and out-of-scope logs without storing rows',()=>{
 const m=make();
 for(const classCode of ['0-1','4-1','3-0','3-100','3-1.5','03-02','302','test','A-2','QA_JOURNAL'])assert.equal(m.post({action:'startSession',session:{sessionId:'blocked-'+classCode,missionId:'m02',classCode,studentNo:'1'}}).ok,false,classCode);
 assert.equal(m.sheets['감자'].rows.length,1);assert.equal(m.sheets['강철솜'].rows.length,1);assert.equal(m.sheets.Sessions,undefined);
 assert.equal(m.post({action:'startSession',session:{sessionId:'valid',missionId:'m02',classCode:'3-99',studentNo:'1'}}).ok,true);
 assert.equal(m.post({action:'logAttempt',attempt:{attemptId:'bad',sessionId:'valid',classCode:'4-1',input:'차단 대상'}}).ok,false);
 assert.equal(m.sheets['강철솜'].rows.length,2);assert.equal(JSON.parse(m.sheets['강철솜'].rows[1].slice(9,17).join('')).length,0);
 m.sheets.Sessions=m.sheet([['sessionId','classCode','studentNo','missionId'],['old-test','test','1','m02']]);
 assert.equal(m.post({action:'updateSession',sessionId:'old-test',fields:{finalAnswer:'재전송'}}).ok,false);assert.equal(m.sheets['강철솜'].rows.length,2);
});

test('cleanup uses the same class bounds, deletes invalid session logs in descending order and preserves valid rows',()=>{
 const m=make(),valid={sessionId:'keep',classCode:'3-99',studentNo:'1',missionId:'m02'},invalid={sessionId:'remove',classCode:'test',studentNo:'1',missionId:'m02'};
 assert.equal(m.post({action:'startSession',session:valid}).ok,true);
 const h=m.sheets['강철솜'].rows[0];
 m.sheets['강철솜'].rows.push(['session','remove','remove','test','1','m02','','',JSON.stringify(invalid)]);
 m.sheets['강철솜'].rows.push(['attempt','a-remove','remove','3-99','1','m02','','','{}']);
 m.sheets.Sessions.rows.push(['remove','test','1','m02']);
 m.sheets.Attempts=m.sheet([['attemptId','sessionId','classCode','studentNo','missionId'],['a-remove','remove','3-99','1','m02'],['a-keep','keep','3-99','1','m02'],['bad','keep','4-1','1','m02']]);
 const before=m.sheets['강철솜'].rows.length;assert.equal(m.previewCleanup().removedRows['강철솜'],2);assert.equal(m.sheets['강철솜'].rows.length,before);
 const result=m.cleanup();assert.equal(result.invalidSessions,1);assert.equal(result.removedRows.Attempts,2);assert.equal(m.sheets['강철솜'].rows.length,2);assert.equal(m.sheets['강철솜'].rows[1][2],'keep');assert.equal(m.sheets.Attempts.rows[1][0],'a-keep');assert.equal(m.sheets.Sessions.rows.length,2);
 assert.equal(m.cleanup().removedRows['강철솜'],0);assert.equal(m.post({action:'updateSession',sessionId:'remove',fields:{firstAnswer:'부활 시도'}}).ok,false);
});
