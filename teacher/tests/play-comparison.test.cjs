const {test}=require('node:test'),assert=require('node:assert/strict');
require('../model.js');require('../scope.js');require('../insights.js');require('../overview-ui.js');require('../dashboard-ui.js');
const M=globalThis.TeacherModel,I=globalThis.TeacherInsights,D=globalThis.TeacherDashboardUI;
const key='m02-docx-1.2.0',classKey='g:3:r:2';
const make=(id,no,at,judgment,extra={})=>({sessionId:id,classCode:'3-2',studentNo:String(no),missionId:'m02',startedAt:`2026-11-${String(at).padStart(2,'0')}T00:00:00Z`,missionVersion:'m02-1.2',eventSchemaVersion:'m02-events-v1',judgeVersion:'judge-1',judgedBy:'openai',rubricVersion:key,finalAnswer:'합성 답안',finalJudgment:judgment,...extra});
const source={sessions:[
 make('a1',1,1,{C:false,W1a:true}),make('a-mid',1,1,{C:true,W1a:true},{startedAt:'2026-11-01T12:00:00Z'}),make('a2',1,2,{C:true,W1a:false},{classCode:'3학년 2반'}),
 make('b1',2,1,{C:true,W1a:false}),make('b2',2,2,{C:true,W1a:false}),
 make('single',3,1,{C:false,W1a:false}),
 make('missing1',4,1,{C:false,W1a:false}),make('missing2',4,2,{}),
 make('judge1',5,1,{C:false,W1a:false}),make('judge2',5,2,{C:true,W1a:true},{judgeVersion:'judge-2'}),
 make('rubric1',6,1,{C:false,W1a:false}),make('rubric2',6,2,{C:true,W1a:true},{rubricVersion:'m02-docx-1.1.0'}),
 make('unknown1',7,1,{C:false,W1a:false},{missionVersion:''}),make('unknown2',7,2,{C:true,W1a:true}),
 make('partial1',8,1,{W1a:true}),make('partial2',8,2,{C:true,W1a:true}),
 make('other-class',1,3,{C:false,W1a:false},{classCode:'3-3'}),
 make('other-game',2,3,{C:false,W1a:false},{missionId:'m01'})
],attempts:[]};
const data=M.analyze(source,'','latest',{classCodes:['3-2','3학년 2반','3-3'],missionId:'m02'});

test('same class and student pairs compare only the first and latest compatible judgments',()=>{
 const before=JSON.stringify(source),result=I.comparePlays(data,'m02',key,classKey),c=result.cells.find(x=>x.key==='C'),w=result.cells.find(x=>x.key==='W1a');
 assert.equal(result.students,8);
 assert.deepEqual([c.firstMet,c.latestMet,c.delta,c.comparable],[1,2,1,2]);
 assert.deepEqual([w.firstMet,w.latestMet,w.delta,w.comparable],[2,1,-1,3]);
 assert.deepEqual(c.excluded,{singlePlay:1,missingJudgment:2,unknownVersion:1,differentVersion:2});
 assert.deepEqual(w.excluded,{singlePlay:1,missingJudgment:1,unknownVersion:1,differentVersion:2});
 assert.equal(JSON.stringify(source),before);
});
test('zero change is distinct from no comparable student and exclusions appear for each element',()=>{
 const result=I.comparePlays(data,'m02',key,classKey),none=I.comparePlays(data,'m02','m02-docx-1.3.0',classKey),p=I.overview(source),selectedClass=p.classes.find(c=>c.classKey===classKey),html=D.screen({portfolio:p,data,selectedClass,mission:'m02',criterion:key,source:'demo'});
 assert.equal(result.cells.find(x=>x.key==='D-A').comparable,0);
 assert.equal(result.cells.find(x=>x.key==='D-A').delta,null);
 assert.equal(none.cells.find(x=>x.key==='C').comparable,0);
 assert.match(html,/처음 판·최근 판의 판정 변화/);
 assert.match(html,/양쪽 판정 부족 2명/);assert.match(html,/버전 미기록 1명/);assert.match(html,/기준·버전 다름 2명/);
 assert.match(html,/1\/2명/);assert.match(html,/2\/2명/);assert.match(html,/\+1명/);
 assert.match(html,/비교 불가/);assert.match(html,/변화 0명은 비교 가능한 기록/);
 const stable={sessions:[make('same1',1,1,{C:true}),make('same2',1,2,{C:true})],attempts:[]},stableData=M.analyze(stable,'3-2','latest',{missionId:'m02'}),row=I.comparePlays(stableData,'m02',key,classKey).cells[0];
 assert.deepEqual([row.comparable,row.firstMet,row.latestMet,row.delta],[1,1,1,0]);
});
test('matching version strings still exclude a changed or unknown judgment method',()=>{
 const methods={sessions:[make('method1',1,1,{C:false}),make('method2',1,2,{C:true},{judgedBy:'keyword'}),make('unknown-method1',2,1,{C:false},{judgedBy:''}),make('unknown-method2',2,2,{C:true})],attempts:[]};
 const scoped=M.analyze(methods,'3-2','latest',{missionId:'m02'}),cell=I.comparePlays(scoped,'m02',key,classKey).cells[0];
 assert.equal(cell.comparable,0);
 assert.equal(cell.excluded.differentVersion,1);
 assert.equal(cell.excluded.unknownVersion,1);
});
test('test-mode and ordinary records do not share a student pair',()=>{
 const mixed={sessions:[make('real',1,1,{C:false}),make('test',1,2,{C:true},{isTest:true})],attempts:[]},scoped=M.analyze(mixed,'3-2','latest',{missionId:'m02',includeTests:true});
 const regular=I.comparePlays(scoped,'m02',key,classKey,false),testing=I.comparePlays(scoped,'m02',key,classKey,true);
 assert.equal(regular.students,1);assert.equal(testing.students,1);
 assert.equal(regular.cells[0].comparable,0);assert.equal(testing.cells[0].comparable,0);
 assert.equal(regular.cells[0].excluded.singlePlay,1);assert.equal(testing.cells[0].excluded.singlePlay,1);
});
