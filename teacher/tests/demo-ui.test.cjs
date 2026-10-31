const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function app(search='?mission=m02&from=m02') {
 const ids=['source','classCode','lessonId','mission','notice','backToStart','content','detail','status','signin','refresh','newLesson','close'];
 const elements=Object.fromEntries(ids.map(id=>[id,{id,value:'',hidden:false,textContent:'',innerHTML:'',href:'',onclick:null,onchange:null,addEventListener(type,fn){this['on'+type]=fn},scrollIntoView(){}}]));
 Object.assign(elements.source,{value:'demo'});Object.assign(elements.classCode,{value:'DEMO'});Object.assign(elements.lessonId,{value:'DEMO'});Object.assign(elements.mission,{value:'m01'});
 const tabs=['live','analysis'].map(view=>({dataset:{view},classList:{toggle(){}},setAttribute(){}}));
 const document={querySelector:sel=>elements[sel.slice(1)],querySelectorAll:()=>tabs};
 const window={SCIW_TEACHER_CONFIG:{API_URL:'',REFRESH_MS:20000,TIMEOUT_MS:10},crypto:{getRandomValues(bytes){bytes.fill(1)}},TeacherTransport:{classData:async()=>{throw Error('서버 미연결')}}};
 const context={window,document,location:{search},URLSearchParams,Date,Uint8Array,setInterval(){},localStorage:{getItem(){return null}}};
 vm.createContext(context);vm.runInContext(fs.readFileSync('teacher/model.js','utf8'),context);vm.runInContext(fs.readFileSync('teacher/app.js','utf8'),context);
 return {elements,tabs};
}
test('both start pages expose an explicit demo entry and fixed return paths',()=>{
 for(const [path,mission] of [['감자 삼투/web/index.html','m01'],['강철솜 질량 보존/web/index.html','m02']]){
  const html=fs.readFileSync(path,'utf8');assert.match(html,new RegExp('teacher.html\\?mission='+mission+'&amp;from='+mission));assert.match(html,/교사용 대시보드 예시 보기/);
  const {elements}=app('?mission='+mission+'&from='+mission);assert.equal(elements.mission.value,mission);assert.match(elements.backToStart.href,/web\/index.html$/);assert.match(elements.notice.textContent,/가상의 예시/);
 }
 assert.equal(app('?from=https://example.com').elements.backToStart.href,'index.html');
});
test('demo mission switch, details, analysis, empty class, re-entry, and remote failure',async()=>{
 const {elements:e,tabs}=app();
 assert.match(e.content.innerHTML,/1명/); assert.match(e.content.innerHTML,/학생별 진행/);
 e.content.onclick({target:{closest:()=>({dataset:{student:'1'}})}});
 assert.match(e.detail.innerHTML,/열 때문에 무거워져요/);assert.match(e.detail.innerHTML,/공기 중 산소/);
 tabs[1].onclick();assert.match(e.content.innerHTML,/평가 요소 살펴보기/);assert.match(e.content.innerHTML,/D-A/);
 e.mission.value='m01'; e.mission.onchange(); assert.match(e.content.innerHTML,/2명/);
 e.content.onclick({target:{closest:()=>({dataset:{student:'2'}})}});assert.match(e.detail.innerHTML,/설탕이 움직여요/);assert.match(e.detail.innerHTML,/물이 감자 밖으로/);
 e.classCode.value='EMPTY';e.classCode.onchange();assert.match(e.content.innerHTML,/저장된 기록이 없습니다/);
 e.source.value='local';e.source.onchange();assert.equal(e.lessonId.value,'');assert.match(e.notice.textContent,/예전 기록/);
 const reentry=app('?mission=m01&from=m01');assert.match(reentry.elements.notice.textContent,/예시/);assert.match(reentry.elements.content.innerHTML,/2명/);
});
