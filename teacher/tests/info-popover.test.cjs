const {test}=require('node:test'),assert=require('node:assert/strict');
require('../info-popover.js');
const P=globalThis.TeacherInfoPopover;

test('popover stays inside viewport near right and bottom edges',()=>{
 const p=P.position({left:370,top:770,bottom:790},{width:320,height:140},{width:390,height:844});
 assert.equal(p.left,62);assert.equal(p.top,622);assert.equal(p.width,320);
 const narrow=P.position({left:10,top:10,bottom:28},{width:320,height:100},{width:280,height:240});
 assert.equal(narrow.width,264);assert.equal(narrow.left,8);assert.equal(narrow.top,36);
});

test('click and keyboard activation toggle one shared popover; Escape and outside click close it',()=>{
 const listeners={},windowListeners={},attrs={};
 const popup={style:{},hidden:true,textContent:'',id:'',setAttribute(k,v){this[k]=v},getBoundingClientRect(){return {width:200,height:80}},contains(target){return target===this}};
 const button={dataset:{infoText:'합성 설명'},isConnected:true,setAttribute(k,v){attrs[k]=v},removeAttribute(k){delete attrs[k]},getBoundingClientRect(){return {left:20,top:20,bottom:40}},focus(){this.focused=true}};
 const doc={body:{append(node){assert.equal(node,popup)}},createElement(){return popup},addEventListener(k,fn){listeners[k]=fn}};
 const win={innerWidth:390,innerHeight:844,addEventListener(k,fn){windowListeners[k]=fn}};
 P.attach(doc,win);
 const click=target=>listeners.click({target:{closest:()=>target, ...(target===popup?{closest:()=>null}:{})}});
 click(button);assert.equal(popup.hidden,false);assert.equal(popup.textContent,'합성 설명');assert.equal(attrs['aria-expanded'],'true');
 click(button);assert.equal(popup.hidden,true);assert.equal(attrs['aria-expanded'],'false');
 click(button);listeners.keydown({key:'Escape',preventDefault(){}});assert.equal(popup.hidden,true);assert.equal(button.focused,true);
 click(button);click(null);assert.equal(popup.hidden,true);
 assert.equal(typeof windowListeners.resize,'function');assert.equal(typeof windowListeners.scroll,'function');
});
