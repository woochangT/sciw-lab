const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
require('../../ui/class-entry.js');const C=globalThis.SciwClassEntry;
test('class identity is limited to grades 1–3 and rooms 1–99 without free-text codes',()=>{
 for(const value of ['1-1','1-99','2-10','3-99'])assert.equal(C.valid(value),true,value);
 for(const value of ['0-1','4-1','12-2','3-0','1-100','1--1','1-1.5','1-1e1','03-02','302','A-2','test','QA_UI_JOURNAL',' 1-2 ',null,2])assert.equal(C.valid(value),false,String(value));
 assert.equal(C.code('3','99'),'3-99');assert.equal(C.code('3','100'),null);
});
test('start form validates room boundaries and rechecks tampered submission, while restoring only valid prior classes',()=>{
 const values={},nodes=Object.fromEntries(['grade','classNo','studentNo','goBtn','startForm'].map(id=>[id,{value:'',listeners:{},disabled:false,addEventListener(type,fn){this.listeners[type]=fn},setCustomValidity(value){this.error=value},reportValidity(){},append(){}}]));
 const element=()=>({textContent:'',className:'',setAttribute(){},append(){},addEventListener(){}});
 const window={},storage={getItem:()=> 'A-2',setItem:(k,v)=>values[k]=v};
 vm.runInNewContext(fs.readFileSync('ui/class-entry.js','utf8'),{window,document:{getElementById:id=>nodes[id],createElement:element,body:{append(){}}},localStorage:storage});
 const calls=[];window.SciwClassEntry.bindStart((...args)=>calls.push(args));
 assert.equal(nodes.grade.value,'');nodes.grade.value='3';nodes.classNo.value='100';nodes.studentNo.value='2';nodes.classNo.listeners.input();assert.equal(nodes.goBtn.disabled,true);
 nodes.goBtn.disabled=false;nodes.startForm.listeners.submit({preventDefault(){}});assert.equal(calls.length,0);
 nodes.classNo.value='99';nodes.classNo.listeners.input();assert.equal(nodes.goBtn.disabled,false);nodes.startForm.listeners.submit({preventDefault(){}});assert.equal(calls[0][0],'3-99');assert.equal(calls[0][1],'2');assert.equal(values.sciw_class,'3-99');
});

test('entry omits the extra experience and record preservation notices',async()=>{
 const nodes=Object.fromEntries(['grade','classNo','studentNo','goBtn','startForm'].map(id=>[id,{value:'',listeners:{},disabled:false,children:[],addEventListener(type,fn){this.listeners[type]=fn},setCustomValidity(){},reportValidity(){},append(el){this.children.push(el)}}]));
 const parts={},dialogs=[];
 const element=tag=>({textContent:'',className:'',listeners:{},setAttribute(){},append(){},addEventListener(type,fn){this.listeners[type]=fn},removeEventListener(type){delete this.listeners[type]},querySelector(selector){return parts[selector]??=( {textContent:'',disabled:false} )},showModal(){this.open=true;dialogs.push(this)},close(){this.open=false}});
 const window={};vm.runInNewContext(fs.readFileSync('ui/class-entry.js','utf8'),{window,document:{getElementById:id=>nodes[id],createElement:element,body:{append(){}}},localStorage:{getItem(){return null},setItem(){}}});
 window.SciwClassEntry.bindStart(()=>{throw Error('cancel must not start a session')},{findSession:async()=>({sessionId:'old',checkpoint:{}}),canResume:()=>true});
 nodes.grade.value='3';nodes.classNo.value='1';nodes.studentNo.value='91';nodes.studentNo.listeners.input();
 const task=nodes.startForm.listeners.submit({preventDefault(){}});assert.equal(nodes.startForm.children[0].textContent,'이전 플레이 기록을 확인하고 있어요…');
 await new Promise(setImmediate);assert.equal(dialogs.length,1);assert.equal(nodes.startForm.children[0].textContent,'');assert.equal(parts['.entry-reason'].textContent,'');assert.equal(parts['.entry-reason'].hidden,true);assert.equal(nodes.startForm.children.length,2);
 dialogs[0].listeners.click({target:{closest(){return {disabled:false,dataset:{choice:'cancel'}}}}});await task;assert.equal(nodes.goBtn.disabled,false);
});
