(function(root){
 'use strict';
 const storageKey='sciw_teacher_session_v1';
 function attach({base,open,close}){
  const $=selector=>document.querySelector(selector),form=$('#teacherLoginForm'),password=$('#teacherPassword'),message=$('#teacherLoginMessage'),submit=form.querySelector('button[type=submit]');
  const gate=$('#teacherLogin'),shell=$('.dashboard-shell'),exit=$('#teacherLogout');
  let token='',active=false;
  try{token=sessionStorage.getItem(storageKey)||''}catch{}
  function unlock(){if(active)return;active=true;gate.hidden=true;shell.hidden=false;$('#dashboardTitle').focus();open()}
  function lock(reason=''){
   token='';try{sessionStorage.removeItem(storageKey)}catch{}
   const wasActive=active;active=false;shell.hidden=true;gate.hidden=false;message.textContent=reason;password.value='';password.focus();if(wasActive)close();
  }
  async function authorizedFetch(url,init={}){
   const usedToken=token,headers=new Headers(init.headers);
   if(usedToken)headers.set('Authorization','Bearer '+usedToken);
   const response=await fetch(url,{...init,headers});
   if(response.status===401&&usedToken&&usedToken===token)lock('접속 시간이 끝났습니다. 암호를 다시 입력해 주세요.');
   return response;
  }
  form.onsubmit=async event=>{
   event.preventDefault();if(submit.disabled)return;
   const value=password.value;password.value='';message.textContent='';submit.disabled=true;
   try{
    const response=await fetch(base+'/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:value}),signal:AbortSignal.timeout(15000)});
    const result=await response.json();
    if(!response.ok||!result.ok||typeof result.token!=='string'){message.textContent=result.error||'접속할 수 없습니다. 잠시 후 다시 시도해 주세요.';password.focus();return}
    token=result.token;try{sessionStorage.setItem(storageKey,token)}catch{}
    unlock();
   }catch{message.textContent='연결하지 못했습니다. 잠시 후 다시 시도해 주세요.';password.focus()}
   finally{submit.disabled=false}
  };
  exit.onclick=()=>lock();
  async function start(){
   if(!token){password.focus();return}
   submit.disabled=true;
   try{
    const response=await authorizedFetch(base+'/session',{signal:AbortSignal.timeout(10000)});
    if(response.ok)unlock();else if(response.status!==401)lock('접속을 확인하지 못했습니다. 다시 시도해 주세요.');
   }catch{lock('접속을 확인하지 못했습니다. 다시 시도해 주세요.')}
   finally{submit.disabled=false}
  }
  return {fetch:authorizedFetch,start,active:()=>active};
 }
 root.TeacherAuth={attach};
})(window);
