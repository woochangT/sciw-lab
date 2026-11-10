(function(root){
 'use strict';
 const margin=8,gap=8;
 function position(anchor,popup,viewport){
  const width=Math.min(popup.width,Math.max(0,viewport.width-2*margin));
  const left=Math.max(margin,Math.min(anchor.left,viewport.width-width-margin));
  const below=anchor.bottom+gap,above=anchor.top-gap-popup.height;
  const top=below+popup.height<=viewport.height-margin?below:above>=margin?above:Math.max(margin,Math.min(below,viewport.height-popup.height-margin));
  return {left,top,width};
 }
 function attach(doc=root.document,win=root){
  if(!doc)return;
  const popup=doc.createElement('div');popup.className='term-popover';popup.id='teacherTermPopover';popup.setAttribute('role','dialog');popup.setAttribute('aria-label','용어 설명');popup.hidden=true;doc.body.append(popup);
  let active=null;
  function close(restore=false){if(!active)return;const old=active;active=null;popup.hidden=true;popup.textContent='';old.setAttribute('aria-expanded','false');old.removeAttribute('aria-controls');old.removeAttribute('aria-describedby');if(restore&&old.isConnected)old.focus()}
  function place(){if(!active)return;if(!active.isConnected){close();return}const a=active.getBoundingClientRect();popup.style.left='0px';popup.style.top='0px';popup.style.width='min(320px, calc(100vw - 16px))';const p=popup.getBoundingClientRect(),v={width:win.innerWidth,height:win.innerHeight},xy=position(a,p,v);popup.style.left=xy.left+'px';popup.style.top=xy.top+'px';popup.style.width=xy.width+'px'}
  function open(button){if(active===button){close();return}close();active=button;popup.textContent=button.dataset.infoText||'';popup.hidden=false;button.setAttribute('aria-expanded','true');button.setAttribute('aria-controls',popup.id);button.setAttribute('aria-describedby',popup.id);place()}
  doc.addEventListener('click',event=>{const button=event.target.closest?.('button[data-info-text]');if(button){open(button);return}if(active&&!popup.contains(event.target))close()});
  doc.addEventListener('keydown',event=>{if(event.key==='Escape'&&active){event.preventDefault();close(true)}});
  // A native button supplies Enter, Space, click and touch activation.
  win.addEventListener('resize',()=>active&&place());
  win.addEventListener('scroll',()=>active&&place(),true);
  return {close,place};
 }
 root.TeacherInfoPopover={position,attach};
})(typeof window==='undefined'?globalThis:window);
