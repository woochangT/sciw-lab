const {test}=require('node:test'),assert=require('node:assert/strict');
require('../model.js');require('../scope.js');require('../insights.js');require('../overview-ui.js');require('../record-ui.js');require('../dashboard-ui.js');
const M=globalThis.TeacherModel,I=globalThis.TeacherInsights,D=globalThis.TeacherDashboardUI,R=globalThis.TeacherRecordUI;
const session=(id,code,no,missionId='m02',extra={})=>({sessionId:id,classCode:code,studentNo:no,missionId,startedAt:'2026-11-03T00:00:00Z',...extra});
const db={sessions:[session('a','3-2','1','m02',{finalAnswer:'답안',finalJudgment:{C:true,W1a:false},rubricVersion:'m02-docx-1.2.0'}),session('b','3-2','2'),session('c','3-10','1','m02',{finalAnswer:'다른 반',finalJudgment:{C:false},rubricVersion:'m02-docx-1.2.0'}),session('p','3-2','1','m01',{finalAnswer:'감자 답',finalJudgment:{C:true}})],attempts:[]};
const portfolio=I.overview(db),selectedClass=portfolio.classes.find(c=>c.classKey==='g:3:r:2');
test('compact overview keeps classes separate and does not turn absent element judgments into zero',()=>{
 const v=D.model({portfolio,mission:'m02'});assert.equal(v.total,3);assert.equal(v.written,2);assert.equal(v.classes.length,2);assert.equal(v.cells.find(c=>c.key==='C').rate,50);assert.equal(v.cells.find(c=>c.key==='W1a').assessed,1);assert.equal(v.cells.find(c=>c.key==='W1a').rate,0);assert.equal(v.cells.find(c=>c.key==='W2b').rate,null);
 const filtered=D.model({portfolio,mission:'m02',query:'3학년 2반'});assert.equal(filtered.rows.length,1);assert.equal(filtered.total,3);assert.equal(filtered.written,2);
});
test('class game views reuse the same matrix layout and preserve original scoped records',()=>{
 const before=JSON.stringify(db);
 for(const mission of ['m01','m02']){
  const data=M.analyze(db,'3-2','latest',{missionId:mission}),html=D.screen({portfolio,data,selectedClass,mission,pageSize:8,source:'sheet'});
  assert.match(html,/role="tablist" aria-label="게임 선택"/);assert.match(html,/id="matrixViewport"/);assert.match(html,/학생별 설명 요소/);assert.match(html,/data-switch-game="m01"/);assert.match(html,/data-switch-game="m02"/);assert.match(html,/data-student="1"/);
  assert.equal(D.model({portfolio,data,selectedClass,mission}).total,mission==='m01'?1:2);
 }
 assert.equal(JSON.stringify(db),before);
});
test('ambiguous criterion headers have accurate help while obvious headers and stored fields stay intact',()=>{
 const data=M.analyze(db,'3-2','latest',{missionId:'m02'}),html=D.screen({portfolio,data,selectedClass,mission:'m02',source:'demo'});
 assert.match(html,/<th scope="col" title="열린 실험 자료 \(D-A\)">열린 A<button[^>]*data-info-text="[^"]*최종 답안에서 식별/);
 assert.match(html,/실험을 관찰했는지의 기록은 아닙니다/);
 assert.match(html,/<th scope="col" title="닫힌 실험 자료 \(D-B\)">닫힌 B<button/);
 assert.match(html,/<th scope="col">AI 판정<button/);
 assert.match(html,/<th scope="col">출석번호<\/th>/);
 assert.doesNotMatch(html,/<th scope="col">출석번호<button/);
 assert.match(html,/id="recordFilter"/);assert.match(html,/id="playMode"/);assert.match(html,/status-/);
 assert.deepEqual(I.definitions.m02[1],['D-A','열린 실험 자료']);
 const comparison=html.match(/<div class="comparison-scroll">([\s\S]*?)<\/table>/)?.[1]||'';
 assert.match(comparison,/첫 판 인정<button/);assert.match(comparison,/비교 인원<button/);assert.match(comparison,/제외 이유<button/);
});
test('pagination clamps stale page indexes and search changes visible rows rather than analysis denominators',()=>{
 const rows=Array.from({length:32},(_,i)=>i+1);assert.deepEqual(D.pageRows(rows,99,10),{rows:[31,32],index:3,pages:4,total:32,start:31,end:32});assert.equal(D.pageRows([],5,10).index,0);
 const data=M.analyze(db,'3-2','latest',{missionId:'m02'}),v=D.model({portfolio,data,selectedClass,mission:'m02',query:'2',filter:'pending'});
 assert.equal(v.rows.length,1);assert.equal(v.total,2);assert.equal(v.written,1);
});
test('rubric versions remain isolated across both screen types',()=>{
 const s=session('old','3-2','3','m02',{finalAnswer:'이전 버전',finalJudgment:{C:true},rubricVersion:'m02-docx-1.1.0'}),source={sessions:[...db.sessions,s],attempts:[]},p=I.overview(source);
 const v=D.model({portfolio:p,mission:'m02',criterion:'m02-docx-1.1.0'});assert.equal(v.cells[0].assessed,1);assert.equal(v.cells[0].rate,100);
 const data=M.analyze(source,'3-2','latest',{missionId:'m02'}),html=D.screen({portfolio:p,data,selectedClass,mission:'m02',criterion:'m02-docx-1.1.0',source:'sheet'});
 assert.match(html,/m02-docx-1.1.0/);assert.match(html,/1번 자신의 결론 판정 없음/);assert.match(html,/3번 자신의 결론 인정/);
});
test('stored AI summaries are escaped and only expose an explicit generation action',()=>{
 const data=M.analyze(db,'3-2','latest',{missionId:'m02'}),html=D.screen({portfolio,data,selectedClass,mission:'m02',source:'sheet',available:true,report:{analysis:{result:{headline:'<script>head</script>',teachingFocus:'<img onerror=bad>'}}}});
 assert.doesNotMatch(html,/<script>|<img onerror/);assert.match(html,/&lt;script&gt;/);assert.match(html,/data-ai-generate/);assert.match(html,/data-open-report/);
});
test('lesson priority counts only assessed students under the selected rubric and links candidates to originals',()=>{
 const records=[session('one','3-2','1','m02',{finalAnswer:'합성 답안 1',finalJudgment:{C:false,W1a:false},rubricVersion:'m02-docx-1.2.0'}),session('two','3-2','2','m02',{finalAnswer:'합성 답안 2',finalJudgment:{C:false,W1a:true},rubricVersion:'m02-docx-1.2.0'}),session('old','3-2','3','m02',{finalAnswer:'이전 기준',finalJudgment:{C:false,W1a:false},rubricVersion:'m02-docx-1.1.0'}),session('none','3-2','4','m02',{finalAnswer:'미판정 답안'}),session('unclear','3-2','5','m02',{finalAnswer:'판정 불가 답안',finalJudgment:{C:false},rubricVersion:'m02-docx-1.2.0'})];
 const source={sessions:records,attempts:[{attemptId:'u',sessionId:'unclear',stage:'compose',questId:'clarify',outcome:'clarify',input:'판정 불가 답안'}]},data=M.analyze(source,'3-2','latest',{missionId:'m02'}),p=I.overview(source),choice='m02-docx-1.2.0';
 const priority=I.lessonPriority(data,data.reps,'m02',choice);
 assert.deepEqual(priority.missing.map(c=>[c.key,c.revise,c.assessed]),[['C',2,2],['W1a',1,2]]);
 assert.deepEqual(priority.candidates.map(c=>c.sessionId),['one','two']);
 const html=D.screen({portfolio:p,data,selectedClass:p.classes[0],mission:'m02',criterion:choice,source:'demo'});
 assert.ok(html.indexOf('가장 많이 누락된 설명 요소')<html.indexOf('id="matrixViewport"'));
 assert.match(html,/2 \/ 2명 미인정/);assert.match(html,/반 전체 경향으로 해석하지 마세요/);assert.match(html,/data-session="one" data-element="C"/);
 assert.doesNotMatch(html.split('class="dashboard-analysis-grid"')[0],/data-session="old" data-element="C"/);
 assert.match(html,/id="matrixViewport"/);assert.match(html,/id="recordFilter"/);assert.match(html,/id="playMode"/);
 assert.equal(I.lessonPriority(data,data.reps,'m02','AI 평가 · 버전 미기록').missing.length,0);
});
test('saved question is reused safely; empty question offers only an explicit generation button',()=>{
 const data=M.analyze(db,'3-2','latest',{missionId:'m02'}),state={portfolio,data,selectedClass,mission:'m02',source:'sheet',available:true};
 const saved=D.screen({...state,report:{basis:{mode:'latest'},analysis:{result:{questions:[{question:'<script>다음 수업 질문</script>'}]}}}});
 assert.match(saved,/&lt;script&gt;다음 수업 질문&lt;\/script&gt;/);assert.doesNotMatch(saved,/<script>/);assert.match(saved,/저장된 수업 리포트 보기/);
 const empty=D.screen(state);assert.match(empty,/저장된 수업 질문이 없습니다/);assert.match(empty,/수업 요약·질문 생성/);
 const all=D.screen({portfolio,mission:'m02',source:'sheet'});assert.doesNotMatch(all,/class="lesson-priority"/);
});
test('answer candidates favor matching saved quotes and reasons, deduplicate students, and stop at three',()=>{
 const judged=(id,no,extra={})=>session(id,'3-2',no,'m02',{finalAnswer:'합성 답안 산소',finalJudgment:{C:false},rubricVersion:'m02-docx-1.2.0',...extra});
 const source={sessions:[
  judged('plain','1'),judged('reason','2',{analysis:{checks:{C:{reason:'저장된 판정 이유'}}}}),
  judged('quote','3',{analysis:{checks:{C:{quote:'산소'}}}}),
  judged('both','4',{analysis:{checks:{C:{quote:'산소',reason:'저장된 판정 이유'}}}}),
  judged('bad-quote','5',{analysis:{checks:{C:{quote:'원문에 없는 구절',reason:'저장된 판정 이유'}}}}),
  judged('both-two','6',{analysis:{checks:{C:{quote:'산소',reason:'저장된 판정 이유'}}}}),
  judged('old-play','6',{startedAt:'2026-11-01T00:00:00Z'}),
  judged('no-original','7',{finalAnswer:''}),
  session('other-class','3-3','8','m02',{finalAnswer:'합성 답안',finalJudgment:{C:false},rubricVersion:'m02-docx-1.2.0'}),
  session('other-game','3-2','9','m01',{finalAnswer:'합성 답안',finalJudgment:{C:false},rubricVersion:'m02-docx-1.2.0'}),
  judged('other-rubric','10',{rubricVersion:'m02-docx-1.1.0'}),
  judged('unavailable','11')
 ],attempts:[{attemptId:'u',sessionId:'unavailable',stage:'compose',questId:'clarify',outcome:'clarify',input:'합성 답안'}]};
 const data=M.analyze(source,'3-2','latest',{missionId:'m02'}),key='m02-docx-1.2.0',first=I.lessonPriority(data,data.reps,'m02',key),again=I.lessonPriority(data,[...data.reps].reverse(),'m02',key);
 assert.deepEqual(first.candidates.map(c=>c.sessionId),['both','both-two','quote']);
 assert.deepEqual(again.candidates.map(c=>c.sessionId),first.candidates.map(c=>c.sessionId));
 assert.equal(first.candidates.length,3);assert.equal(new Set(first.candidates.map(c=>c.studentNo)).size,3);
 assert.equal(first.candidates[0].quote,true);assert.equal(first.candidates[0].reason,true);
 assert.equal(R.criterion(data,data.reps.find(s=>s.sessionId==='both'),'C').includes('합성 답안 산소'),true);
 assert.equal(R.criterion(data,data.reps.find(s=>s.sessionId==='both'),'C').includes('저장된 판정 이유'),true);
});
test('selected missing element drives candidates and a missing original shows an empty state',()=>{
 const source={sessions:[
  session('c','3-2','1','m02',{finalAnswer:'합성 결론',finalJudgment:{C:false,W1a:true},rubricVersion:'m02-docx-1.2.0'}),
  session('w','3-2','2','m02',{finalAnswer:'합성 근거',finalJudgment:{C:true,W1a:false},rubricVersion:'m02-docx-1.2.0'}),
  session('empty','3-2','3','m02',{finalAnswer:'',finalJudgment:{C:false,W1a:false},rubricVersion:'m02-docx-1.2.0'})
 ],attempts:[]};
 const data=M.analyze(source,'3-2','latest',{missionId:'m02'}),p=I.overview(source),key='m02-docx-1.2.0';
 assert.deepEqual(I.lessonPriority(data,data.reps,'m02',key,'W1a').candidates.map(c=>c.sessionId),['w']);
 const html=D.screen({portfolio:p,data,selectedClass:p.classes[0],mission:'m02',criterion:key,focusElement:'W1a',source:'demo'}),top=html.split('class="dashboard-analysis-grid"')[0];
 assert.match(top,/data-focus-element="W1a" aria-pressed="true"/);assert.match(top,/data-session="w" data-element="W1a"/);
 assert.doesNotMatch(top,/data-session="c" data-element="W1a"/);assert.doesNotMatch(top,/합성 근거/);
 const onlyEmpty={sessions:[source.sessions[2]],attempts:[]},emptyData=M.analyze(onlyEmpty,'3-2','latest',{missionId:'m02'}),empty=D.screen({portfolio:I.overview(onlyEmpty),data:emptyData,selectedClass:I.overview(onlyEmpty).classes[0],mission:'m02',criterion:key,source:'demo'});
 assert.match(empty,/후보가 없습니다/);assert.doesNotMatch(empty.split('class="dashboard-analysis-grid"')[0],/data-session=/);
});
