(function(root){
  'use strict';
  const valid = code => typeof code === 'string' && /^[1-3]-[1-9]\d?$/.test(code);
  function code(grade,room){ const value = String(grade)+'-'+String(room); return valid(value) ? value : null; }
  function bindStart(onStart, options = {}) {
    const grade=document.getElementById('grade'), room=document.getElementById('classNo'), student=document.getElementById('studentNo'), button=document.getElementById('goBtn'), form=document.getElementById('startForm');
    if (!form) return;
    let busy=false;
    const status=document.createElement('p'); status.className='entry-status'; status.setAttribute('role','status'); form.append(status);
    const demo=document.createElement('button'); demo.type='button'; demo.className='entry-demo'; demo.textContent='체험·심사용으로 들어가기'; form.append(demo);
    const dialog=document.createElement('dialog'); dialog.className='entry-resume'; dialog.setAttribute('aria-labelledby','resumeTitle');
    dialog.innerHTML='<h2 id="resumeTitle">이전에 플레이한 기록이 있어요</h2><p class="entry-identity"></p><p class="entry-saved"></p><p class="entry-reason"></p><div class="entry-choices"><button type="button" data-choice="continue">이어 하기</button><button type="button" data-choice="new">처음부터 새로 하기</button></div><button type="button" class="entry-cancel" data-choice="cancel">돌아가기</button>';
    document.body.append(dialog);
    try { const saved=localStorage.getItem('sciw_class'); if(valid(saved)){ const [g,r]=saved.split('-'); grade.value=g; room.value=r; } } catch(_){}
    const sync=()=>{
      const value=code(grade.value.trim(),room.value.trim()); const number=/^\d{1,3}$/.test(student.value.trim()) && Number(student.value)>0;
      button.disabled=busy || !(value&&number); demo.disabled=busy;
      grade.setCustomValidity(grade.value&&!/^[1-3]$/.test(grade.value.trim())?'학년은 1부터 3까지 입력해 주세요.':'');
      room.setCustomValidity(room.value&&!code('1',room.value.trim())?'반은 1부터 99까지의 정수로 입력해 주세요.':'');
      student.setCustomValidity(student.value&&!number?'출석번호는 1부터 999까지의 정수로 입력해 주세요.':'');
      return value;
    };
    [grade,room,student].forEach(el=>{el.addEventListener('input',sync);el.addEventListener('change',sync);}); sync();
    async function launch(classCode,studentNo,choice){
      busy=true; sync();
      try { await onStart(classCode,studentNo,choice); status.textContent=''; }
      catch(error){ status.textContent=error.message || '입장하지 못했어요. 다시 시도해 주세요.'; }
      finally { busy=false; sync(); }
    }
    function choose(previous,classCode,studentNo){
      dialog.querySelector('.entry-identity').textContent=`${classCode.replace('-', '학년 ')}반 · ${studentNo}번`;
      dialog.querySelector('.entry-saved').textContent=previous.savedAt ? '마지막 저장: '+new Date(previous.savedAt).toLocaleString('ko-KR') : '이 번호로 플레이한 기록이 있어요.';
      const can=options.canResume ? options.canResume(previous) : !!previous.checkpoint;
      dialog.querySelector('[data-choice="continue"]').disabled=!can;
      const reason=dialog.querySelector('.entry-reason');
      reason.textContent=can ? '' : '이전 버전의 기록에는 이어 하기 정보가 없어요. 처음부터 새로 시작할 수 있어요.';
      reason.hidden=can;
      dialog.showModal();
      return new Promise(resolve=>{
        let done=false;
        const finish=value=>{if(done)return;done=true;dialog.close();dialog.removeEventListener('click',click);dialog.removeEventListener('cancel',cancel);resolve(value);};
        const click=event=>{const c=event.target.closest('[data-choice]');if(c&&!c.disabled)finish(c.dataset.choice);};
        const cancel=event=>{event.preventDefault();finish('cancel');};
        dialog.addEventListener('click',click);dialog.addEventListener('cancel',cancel);
      });
    }
    form.addEventListener('submit',async event=>{
      event.preventDefault(); if(busy)return; const value=sync();
      if(!value||button.disabled){form.reportValidity();return;}
      const number=String(Number(student.value.trim())); busy=true;sync();status.textContent='이전 플레이 기록을 확인하고 있어요…';
      try {
        const previous=options.findSession ? await options.findSession(value,number) : null;
        status.textContent='';
        const choice=previous ? await choose(previous,value,number) : 'new';
        if(choice==='cancel'){status.textContent='';return;}
        try{localStorage.setItem('sciw_class',value);}catch(_){}
        await launch(value,number,{mode:'student',previous:choice==='continue'?previous:null});
      } catch(error) { status.textContent=error.message || '이전 기록을 확인하지 못했어요. 다시 시도하거나 체험 입장을 이용해 주세요.'; }
      finally {busy=false;sync();}
    });
    demo.addEventListener('click',()=>{if(!busy)launch('', '', {mode:'experience',previous:null});});
  }
  root.SciwClassEntry={valid,code,bindStart};
})(typeof window==='undefined'?globalThis:window);
