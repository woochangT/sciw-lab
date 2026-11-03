const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
require('../../ui/class-entry.js');const C=globalThis.SciwClassEntry;
test('class identity is limited to grades 1–3 and rooms 1–99 without free-text codes',()=>{
 for(const value of ['1-1','1-99','2-10','3-99'])assert.equal(C.valid(value),true,value);
 for(const value of ['0-1','4-1','12-2','3-0','1-100','1--1','1-1.5','1-1e1','03-02','302','A-2','test','QA_UI_JOURNAL',' 1-2 ',null,2])assert.equal(C.valid(value),false,String(value));
 assert.equal(C.code('3','99'),'3-99');assert.equal(C.code('3','100'),null);
});
test('start form validates room boundaries and rechecks tampered submission, while restoring only valid prior classes',()=>{
 const values={},nodes=Object.fromEntries(['grade','classNo','studentNo','goBtn','startForm'].map(id=>[id,{value:'',listeners:{},disabled:false,addEventListener(type,fn){this.listeners[type]=fn},setCustomValidity(value){this.error=value},reportValidity(){}}]));
 const window={},storage={getItem:()=> 'A-2',setItem:(k,v)=>values[k]=v};
 vm.runInNewContext(fs.readFileSync('ui/class-entry.js','utf8'),{window,document:{getElementById:id=>nodes[id]},localStorage:storage});
 const calls=[];window.SciwClassEntry.bindStart((...args)=>calls.push(args));
 assert.equal(nodes.grade.value,'');nodes.grade.value='3';nodes.classNo.value='100';nodes.studentNo.value='2';nodes.classNo.listeners.input();assert.equal(nodes.goBtn.disabled,true);
 nodes.goBtn.disabled=false;nodes.startForm.listeners.submit({preventDefault(){}});assert.equal(calls.length,0);
 nodes.classNo.value='99';nodes.classNo.listeners.input();assert.equal(nodes.goBtn.disabled,false);nodes.startForm.listeners.submit({preventDefault(){}});assert.equal(calls[0][0],'3-99');assert.equal(calls[0][1],'2');assert.equal(values.sciw_class,'3-99');
});
