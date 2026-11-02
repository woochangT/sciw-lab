const {test}=require('node:test'),assert=require('node:assert/strict');
require('../model.js');require('../scope.js');require('../insights.js');require('../overview-ui.js');require('../evidence.js');
const M=global.TeacherModel,I=global.TeacherInsights,U=global.TeacherOverviewUI,E=global.TeacherEvidence;
const s=(id,code,no,extra={})=>({sessionId:id,classCode:code,studentNo:no,missionId:'m02',startedAt:'2026-11-03T00:00:00Z',...extra});

test('multi-class overview never deduplicates the same student number across classes, and aliases/retries stay scoped',()=>{
 const data={sessions:[s('a','3-2','02',{finalJudgment:{C:true},finalAnswer:'처음 답',rubricVersion:'m02-docx-1.2.0'}),s('b','3학년 2반','2',{startedAt:'2026-11-03T01:00:00Z'}),s('c','3-10','2',{finalJudgment:{C:true},finalAnswer:'다른 반 답',rubricVersion:'m02-docx-1.2.0'}),s('t','test','1'),s('qa_auto','3-2','3'),s('p','3-2','4',{missionId:'m01'})],attempts:[]};
 const o=I.overview(data),a=o.classes.find(c=>c.classKey==='g:3:r:2').games,b=o.classes.find(c=>c.classKey==='g:3:r:10').games;
 assert.equal(a.m02.participants,1);assert.equal(a.m02.written,0);assert.equal(a.m02.judged,0);assert.equal(a.m01.participants,1);assert.equal(b.m02.participants,1);assert.equal(b.m02.judged,1);assert.equal(o.classes.filter(c=>!c.isTest).length,2);
});
test('heatmap keeps unknown and false apart and compares only one explicit rubric at a time',()=>{
 const data={sessions:[s('a','A','1',{rubricVersion:'m02-docx-1.2.0',finalJudgment:{C:true,W1a:false},finalAnswer:'합성 답'}),s('b','A','2',{rubricVersion:'m02-docx-1.2.0',finalJudgment:{C:false},finalAnswer:'합성 답'}),s('c','A','3'),s('d','A','4',{rubricVersion:'m02-docx-1.1.0',finalJudgment:{C:true},finalAnswer:'다른 기준'})],attempts:[]};
 const g=I.game(data,['A'],'m02'),v=g.evaluations.find(e=>e.key==='m02-docx-1.2.0'),c=v.cells.find(e=>e.key==='C'),w=v.cells.find(e=>e.key==='W1a');
 assert.deepEqual({met:c.met,revise:c.revise,assessed:c.assessed,unknown:c.unknown,rate:c.rate},{met:1,revise:1,assessed:2,unknown:2,rate:50});
 assert.equal(w.rate,0);assert.equal(w.assessed,1);assert.equal(v.cells.find(e=>e.key==='W2a').rate,null);assert.equal(g.participants,4);assert.equal(g.evaluations.length,2);
});
test('latest final-attempt judgments work before a game finishes, without treating initial diagnosis as final',()=>{
 const record=s('a','A','1',{rubricVersion:'m02-docx-1.2.0',analysis:{checks:{C:{status:'met'}}}}),data={sessions:[record],attempts:[{attemptId:'a1',sessionId:'a',stage:'claim',questId:'first',judgment:{C:true}}]};
 assert.equal(I.game(data,['A'],'m02').judged,0);
 data.attempts.push({attemptId:'a2',sessionId:'a',stage:'compose',questId:'final',input:'최종 글',rubricVersion:'m02-docx-1.2.0',judgment:{C:false}});
 const g=I.game(data,['A'],'m02');assert.equal(g.written,1);assert.equal(g.judged,1);assert.equal(g.evaluations[0].cells[0].rate,0);
});
test('new note page counts use versioned 0/1/2 or viewing events; old hint levels never become page counts',()=>{
 const data={attempts:[]},newRecord={...s('a','A','1'),rubricVersion:'m02-docx-1.2.0'};
 for(const n of [0,1,2])assert.equal(M.noteUsage(data,{...newRecord,hintLevel:n}).pages,n);
 assert.equal(M.noteUsage(data,newRecord).pages,null);
 for(const v of [false,null,[],{}])assert.equal(M.noteUsage(data,{...newRecord,hintLevel:v}).pages,null);
 assert.equal(M.noteUsage(data,s('old','A','1',{hintLevel:2,rubricVersion:'m02-docx-1.1.0'})).kind,'legacy');
 data.attempts=[{attemptId:'v',sessionId:'a',questId:'hintView',choice:'2'}];assert.equal(M.noteUsage(data,newRecord).pages,2);
 assert.equal(M.hint(data,{...newRecord,hintLevel:0}),'열람');
 const evidence=E.build({sessions:[{...newRecord,hintLevel:0}],attempts:[]},'A','latest');assert.equal(evidence.hintOpened,0);assert.equal(evidence.hintUnknown,0);
});
test('removed sorting is absent from the journey while actual legacy sorting stays explicit',()=>{
 const d={sessions:[s('a','A','1',{rubricVersion:'m02-docx-1.2.0'})],attempts:[]};assert.equal(M.analyze(d,'A').stageCounts.some(x=>x.key==='sort'),false);
 d.attempts.push({attemptId:'sort',sessionId:'a',stage:'sort',questId:'card'});assert.match(M.analyze(d,'A').stageCounts.find(x=>x.key==='sort').label,/이전 방식/);
});
test('overview starts with real classes, not a step or a class-selection gate, and test mode is explicit',()=>{
 const o=I.overview({sessions:[s('a','3-2','1'),s('b','test','1')],attempts:[]});
 const normal=U.overview({value:o,mission:'m02'}),tests=U.overview({value:o,mission:'m02',includeTests:true});
 assert.match(normal,/반별 성취 히트맵/);assert.match(normal,/3학년 2반/);assert.doesNotMatch(normal,/STEP|setup-steps|data-class-key="code:test"/);assert.match(tests,/data-class-key="code:test"/);assert.doesNotMatch(tests,/data-class-key="g:3:r:2"/);
});
test('matrix labels and source codes are escaped; absent alternative warrant evidence is not a failure',()=>{
 const bad=s('x','<img src=x>','1',{rubricVersion:'<script>',finalJudgment:{C:true},finalAnswer:'합성'}),html=U.overview({value:I.overview({sessions:[bad],attempts:[]}),mission:'m02'});
 assert.doesNotMatch(html,/<img src=x>|<script>/);assert.match(html,/&lt;img/);assert.equal(I.element({W3:false},'W3/WB'),'unknown');assert.equal(I.element({W3:false,WB:false},'W3/WB'),'revise');assert.equal(I.element({WB:true},'W3/WB'),'met');
});
