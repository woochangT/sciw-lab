(function(root){
 'use strict';
 const valid=code=>typeof code==='string'&&/^[1-3]-[1-9]\d?$/.test(code);
 function code(grade,room){const value=String(grade)+'-'+String(room);return valid(value)?value:null}
 function bindStart(onStart){
  const grade=document.getElementById('grade'),room=document.getElementById('classNo'),student=document.getElementById('studentNo'),button=document.getElementById('goBtn'),form=document.getElementById('startForm');
  try{const saved=localStorage.getItem('sciw_class');if(valid(saved)){const [g,r]=saved.split('-');grade.value=g;room.value=r}}catch(_){}
  const sync=()=>{const value=code(grade.value,room.value),number=/^\d{1,3}$/.test(student.value.trim())&&Number(student.value)>0;button.disabled=!(value&&number);grade.setCustomValidity(grade.value&&!/^[1-3]$/.test(grade.value)?'학년은 1부터 3까지 입력해 주세요.':'');room.setCustomValidity(room.value&&!code('1',room.value)?'반은 1부터 99까지의 정수로 입력해 주세요.':'');return value};
  grade.addEventListener('input',sync);room.addEventListener('input',sync);student.addEventListener('input',sync);sync();
  form.addEventListener('submit',event=>{event.preventDefault();const value=sync();if(!value||button.disabled){form.reportValidity();return}try{localStorage.setItem('sciw_class',value)}catch(_){}onStart(value,String(Number(student.value.trim())))});
 }
 root.SciwClassEntry={valid,code,bindStart};
})(typeof window==='undefined'?globalThis:window);
