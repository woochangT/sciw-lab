(function(root){
 'use strict';
 const M=root.TeacherModel,I=root.TeacherInsights;
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const text=v=>Array.isArray(v)?v.map(text).join('\n'):typeof v==='string'?v:'';
 const stageName={explore:'실험 탐색',claim:'처음 생각',rebuttal:'교수와 토론',sort:'카드 분류 · 이전 방식',compose:'최종 서술',defense:'최종 변론'};
 function status(data,s){
  const value=I.judgmentStatus(data,s);
  return `<section class="judgment-status-detail" aria-label="자동 판정 상태"><b>${esc(value.label)}</b>${value.errorCode?`<small>오류 코드: ${esc(value.errorCode)}</small>`:''}<p>${value.code==='missing'?'상태를 확인할 판정 기록이 없습니다. 저장된 답안만으로 실패나 대기를 추정하지 않습니다.':value.code==='pending'?'저장된 판정 대기 기록을 확인했습니다.':value.code==='failed'?'저장된 판정 실패 기록을 확인했습니다. 기존 답안과 판정 기록은 그대로 볼 수 있습니다.':value.code==='unavailable'?'평가기가 이 답안을 판정 불가로 기록했습니다.':'판정 요소가 저장되어 있습니다. 자동 판정은 수업 참고 자료입니다.'}</p></section>`;
 }
 function rejudgeControl(data,s,target,busy=false,message=''){
  const eligible=target&&['failed','missing'].includes(I.judgmentStatus(data,s).code);
  if(!eligible&&!message)return '';
  return `<div class="rejudge-control">${eligible?`<button type="button" id="rejudgeButton" ${busy?'disabled':''}>${busy?'재판정 중…':'재판정'}</button>`:''}<span id="rejudgeStatus" role="status" tabindex="-1">${esc(message)}</span></div>`;
 }
 function criterion(data,s,key){
  if(!key)return status(data,s);
  const evaluation=I.evaluation(data,s),record=evaluation.record,label=I.definitions[s.missionId||'m01'].find(([id])=>id===key)?.[1]||key;
  const keys=key==='W3/WB'?['W3','WB']:[key],checks=M.obj(evaluation.analysis?.checks)||{},state=evaluation.has?I.studentElement(s.missionId||'m01',evaluation.judgment,key):'unknown';
  const input=record.input||s.finalAnswer||'',quoteBlocks=keys.map(id=>{
   const check=M.obj(checks[id]),quote=text(check.quote),reason=text(check.reason),exact=quote&&input.includes(quote);
   return `<div class="criterion-reason"><h4>${esc(id)}</h4>${reason?`<p><b>판정 이유</b> ${esc(reason)}</p>`:'<p>이전 기록에는 항목별 판정 이유가 저장되지 않았어요.</p>'}${exact?`<blockquote><b>판정 근거로 인용된 부분</b><p>${esc(quote)}</p></blockquote>`:quote?'<p>저장된 인용문이 답안과 일치하지 않아 근거로 강조하지 않았어요.</p>':'<p>직접 인용된 답안 구절은 저장되지 않았어요.</p>'}`;
  }).join('</div>')+'</div>';
  return `${status(data,s)}<section class="criterion-evidence" aria-labelledby="criterionTitle"><span class="paper-tag">선택한 루브릭 항목 · ${esc(key)}</span><h3 id="criterionTitle">${esc(label)} · ${{met:'인정',revise:'보완',alternate:'다른 경로',unknown:'판정 없음'}[state]}</h3><p>${esc(evaluation.label||'판정 기준 미기록')} · ${state==='alternate'?'다른 설명 경로로 인정되어 보완 인원 집계에서 제외한 항목입니다.':evaluation.rejudgment?'교사 요청으로 다시 판정한 참고 결과입니다.':'게임이 저장한 참고 판정입니다.'}</p>${quoteBlocks}<details open><summary>판정에 사용된 학생 답안 전체</summary><p class="answer">${esc(input||'답안 원문이 저장되지 않았어요.')}</p></details></section>`;
 }
 function timeline(data,s){
  const events=M.attemptsFor(data,s.sessionId),groups=new Map();
  for(const e of events){if(!e.input&&!e.feedbackQuestion&&!e.feedbackText&&!e.displayedPrompt)continue;const key=e.stage||'other';if(!groups.has(key))groups.set(key,[]);groups.get(key).push(e)}
  const draft=s.draftAnswer&&!s.endedAt?`<section class="answer-compare"><article><span>작성 중인 답안 · ${esc(stageName[s.stage]||s.stage||'진행 중')}</span>${s.draftQuestion?`<p><b>교수의 질문</b> ${esc(s.draftQuestion)}</p>`:''}<p>${esc(s.draftAnswer)}</p><small>아직 평가되지 않은 입력 · ${esc(s.draftSavedAt||'')}</small></article></section>`:'';
  return draft+`<section class="stage-conversations"><h3>단계별 학생 답변과 교수 피드백</h3><p>저장된 순서대로 보여줍니다. 이전 기록에 없는 피드백은 새로 만들지 않아요.</p>${[...groups].map(([stage,items])=>`<details class="detail-fold" open><summary>${esc(stageName[stage]||stage)} <small>${items.length}개 대화 기록</small></summary>${items.map(e=>`<article class="conversation-turn">${e.displayedPrompt?`<div class="professor-turn"><b>교수의 질문</b><p>${esc(text(e.displayedPrompt))}</p></div>`:''}${e.input?`<div class="student-turn"><b>${e.questId==='studentInput'?'제출 원문 · 평가 전 저장':'학생 답변'}</b><p>${esc(e.input)}</p></div>`:''}${e.feedbackText||e.feedbackQuestion?`<div class="professor-turn"><b>${e.feedbackSource==='displayed'?'화면에 표시된 교수 대사':'저장된 교수 피드백'}</b><p>${esc(text(e.feedbackText||e.feedbackQuestion))}</p></div>`:e.input&&e.questId!=='studentInput'&&!events.some(a=>a.inReplyTo===e.attemptId&&a.feedbackText)?'<p class="missing-feedback">이 답변의 교수 피드백은 이 기록에 저장되지 않았어요.</p>':''}<small>${esc(e.questId||'')} · ${esc(e.createdAt||e.clientOccurredAt||'시각 미기록')}</small></article>`).join('')}</details>`).join('')||'<p>아직 단계별 대화가 저장되지 않았어요.</p>'}</section>`;
 }
 root.TeacherRecordUI={criterion,timeline,status,rejudgeControl};
})(typeof window==='undefined'?globalThis:window);
