(function(){
'use strict';
const M=window.TeacherModel,E=window.TeacherEvidence,S=window.TeacherScope,I=window.TeacherInsights,U=window.TeacherOverviewUI,D=window.TeacherDashboardUI;
const popovers=window.TeacherInfoPopover.attach();
const $=s=>document.querySelector(s),$$=s=>Array.from(document.querySelectorAll(s));
const cfg=window.SCIW_TEACHER_CONFIG||{},apiBase=cfg.SHEET_API||'/api/sheet';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const stageLabels={explore:'실험하고 있어요',claim:'처음 생각을 쓰고 있어요',rebuttal:'교수와 토론하고 있어요',sort:'카드를 분류하고 있어요',compose:'마지막 답안을 쓰고 있어요',defense:'마지막 답안을 쓰고 있어요'};
const games={m01:{name:'감자 삼투',title:'감자 속은 얼마나 진할까?',topic:'농도 차이와 물의 이동',asset:'intro/potato-silhouette.webp'},m02:{name:'강철솜 질량 보존',title:'태웠는데, 왜 더 무거워졌을까?',topic:'산소와의 결합, 측정 범위와 질량 보존',asset:'intro/steel-wool-silhouette.webp'}};
const elements=()=>missionId()==='m01'?{C:'감자 안의 농도 결론',D:'실험에서 관찰한 질량 변화',W1:'질량 변화와 물의 이동',W2a:'물이 이동하는 방향',W2b:'안팎 농도 비교',W3:'농도 범위의 근거',WB:'질량 변화가 0인 조건'}:{C:'강철솜이 무거워진 이유','D-A':'열린 실험의 측정값','D-B':'닫힌 실험의 측정값',W1a:'질량은 새로 생기지 않음',W1b:'산소와 철의 결합',W2a:'전체 질량이 같은 이유',W2b:'늘어난 질량의 의미'};
let db={sessions:[],attempts:[]},sourceDB=db,data=M.analyze(db,''),classes=[],chosenClass=null,chosenMission='',phase='class',view='overview',filter='all',mode='latest',aiMode='latest',isTest=false,loading=false,request=0,controller,previousFocus,selected=null,lastSuccess=null,loadError='',invalidRows=0;
let portfolioData=null,portfolioRevision='',overviewGrade='',overviewMission='',overviewTests=false,focusElement='';
let dashPage=0,dashQuery='',highlightedStudent='',evaluationTimer=null;
const dashSize=8;
let liveSocket=null,liveKey='',liveTimer=null,liveReconnect=null,liveSupported=false;
const recordCache=new Map(), confirmedRejudgments=new Map(), rejudgeJobs=new Set();
const reports=new Map(),aiJobs=new Set(),aiErrors=new Map();
const source=()=>$('#source').value,classCode=()=>chosenClass?.classCode||'',classLabel=()=>chosenClass?.label||'',missionId=()=>chosenMission||'m02',missionName=()=>games[missionId()].name;
const scope=(game=missionId(),recordMode=aiMode)=>JSON.stringify([source(),cfg.SHEET_URL,chosenClass?.classKey,isTest,game,recordMode]);
const date=v=>v&&M.time(v)?new Date(v).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}):'기록 없음';
const hasAnswer=s=>Boolean(s?.finalAnswer||M.submissions(data,s).length);
function status(s){if(hasAnswer(s))return s.clearType==='partial'?'답안 작성 완료 · 부분 클리어':'답안 작성 완료';if(s.stage&&stageLabels[s.stage])return stageLabels[s.stage];return '아직 최종 답안이 없어요'}
function showToast(text){$('#toast').textContent=text;$('#toast').hidden=false;setTimeout(()=>$('#toast').hidden=true,3200)}
function analyze(){data=M.analyze(db,classCode(),mode,{includeTests:isTest,missionId:missionId(),classCodes:chosenClass?.classCodes});render()}
function label(){return isTest?'기록된 테스트 번호':'참여한 학생'}
function sourceNotice(){const n=$('#notice');let text=loadError?(lastSuccess?'시트 갱신 실패 · 마지막 기록을 표시합니다. ':'시트 연결 실패 · ')+loadError:source()==='demo'?'예시 수업 · 합성 자료이며 실제 시트와 섞이지 않습니다.':source()==='local'?'이 브라우저에 저장된 기록만 표시합니다.':isTest?'테스트 기록 · 실제 학급 결과와 구분합니다.':'';n.className='dashboard-notice';n.hidden=!text;n.textContent=text}
function header(title,help,number=''){return `<div class="section-heading"><div>${number?`<span class="step-label">${number}</span>`:''}<h2>${title}</h2><p>${help}</p></div></div>`}
function counts(){const rows=mode==='first'?data.first:data.recent,written=rows.filter(hasAnswer);return {rows,written,pending:rows.filter(s=>!hasAnswer(s)),N:rows.length}}
function summary(){const s=counts();return `<section class="summary-cards" aria-label="한눈에 보는 수업 기록"><button class="summary-card all ${filter==='all'?'chosen':''}" data-filter="all"><span>${label()}</span><strong>${s.N}<small>${isTest?'개':'명'}</small></strong><p>${isTest?'시험 기록을 따로 모았어요.':'시작 기록이 있는 번호를 한 번씩 세어요.'}</p><b>모두 보기 →</b></button><button class="summary-card written ${filter==='written'?'chosen':''}" data-filter="written"><span>최종 답안을 썼어요</span><strong>${s.written.length}<small>${isTest?'개':'명'}</small></strong><p>학생이 마지막에 쓴 설명을 읽어보세요.</p><b>작성한 답안 읽기 →</b></button><button class="summary-card pending ${filter==='pending'?'chosen':''}" data-filter="pending"><span>아직 최종 답안이 없어요</span><strong>${s.pending.length}<small>${isTest?'개':'명'}</small></strong><p>어느 단계까지 했는지 먼저 확인해 보세요.</p><b>작성 전 기록 확인 →</b></button></section>`}
function list(){let rows=(mode==='all'?data.reps:M.latest(data.reps)).filter(s=>filter==='all'||filter==='written'&&hasAnswer(s)||filter==='pending'&&!hasAnswer(s));return `<section class="paper student-list"><div class="list-heading"><div><span class="paper-tag">학생의 실험 노트</span><h2>${filter==='written'?'최종 답안을 쓴 기록':filter==='pending'?'최종 답안이 아직 없는 기록':'학생 이름 대신, 출석번호로 찾아요'}</h2><p>오른쪽의 <b>답안 읽기</b>를 누르면 처음 생각과 마지막 설명을 함께 볼 수 있어요.</p></div><label class="play-filter">볼 판<select id="playMode"><option value="latest" ${mode==='latest'?'selected':''}>가장 최근 판</option><option value="first" ${mode==='first'?'selected':''}>처음 한 판</option><option value="all" ${mode==='all'?'selected':''}>모든 판</option></select></label></div><div class="table-scroll"><table><thead><tr><th>출석번호</th><th>어디까지 했나요?</th><th>마지막으로 저장된 때</th><th>답안 확인</th></tr></thead><tbody>${rows.map(s=>`<tr><td><span class="number-circle">${M.number(s)}</span><b>${M.number(s)}번</b>${data.groups.get(M.number(s)).length>1?`<small class="replay-note">${data.groups.get(M.number(s)).length}판 플레이</small>`:''}</td><td><span class="status-tag ${hasAnswer(s)?'done':'unfinished'}">${hasAnswer(s)?'✓':'○'} ${esc(status(s))}</span>${s.clearType==='partial'?'<small class="row-description">게임은 일부 요소를 더 설명할 수 있다고 표시했어요.</small>':''}</td><td class="time-cell">${date(s.updatedAt||s.startedAt)}</td><td><button class="read-answer" data-student="${M.number(s)}" data-session="${esc(s.sessionId)}">${hasAnswer(s)?'답안 읽기':'진행 기록 보기'} <span>→</span></button></td></tr>`).join('')||`<tr><td colspan="4" class="empty-row">${filter==='pending'?'모든 기록에 최종 답안이 있어요.':'여기에 해당하는 기록이 없어요.'}<br><button class="text-button" data-filter="all">전체 기록으로 돌아가기</button></td></tr>`}</tbody></table></div><p class="paper-foot">${mode==='first'?'처음 한 판':mode==='all'?'모든 판':'가장 최근 판'}을 보고 있어요. 같은 번호가 여러 판을 해도 참여 인원에는 한 번만 포함합니다.</p></section>`}
function journey(){return `<details class="paper journey"><summary><span>실험 과정도 살펴볼까요?</span><small>활동 기록 보기 ⌄</small></summary><p>실제로 저장된 활동이 있는 번호 수예요. 단계별 성취 점수가 아닙니다.${missionId()==='m02'?' 1.2의 새 카드 활동은 이전 카드 분류와 다르므로, 분류 기록이 없다는 이유로 미달로 보지 않습니다.':''}</p><div class="stage-track">${data.stageCounts.map((s,i)=>`<div><span>${i+1}</span><b>${s.label}</b><strong>${s.count}<small>개 번호</small></strong></div>`).join('<i>→</i>')}</div></details>`}
function empty(){return `<section class="paper empty-state"><div class="empty-flask">⚗</div><h2>${loading?'시트에서 기록을 가져오고 있어요.':loadError?'시트 기록을 불러오지 못했어요.':data.review.length?'기록의 출석번호를 확인해 주세요.':'아직 이 반·게임의 수업 기록이 없어요.'}</h2><p>${loading?'잠시만 기다려 주세요.':loadError?'연결에 실패했으므로 기록이 없는 것으로 판단하지 않았습니다. 다시 불러오기를 눌러 주세요.':data.review.length?'저장된 플레이는 있지만 출석번호가 올바르지 않아 참여 인원에 포함하지 않았습니다. 원본 시트에서 먼저 확인해 주세요.':'학생이 선택한 게임을 시작하면 여기에 출석번호가 나타납니다. 시트에 새 기록이 생겼다면 위의 새 기록 불러오기를 눌러보세요.'}</p><button class="button" data-reload>시트 다시 확인</button><button class="button secondary" data-demo>예시 수업 먼저 보기</button></section>`}
function filterButtons(){return `<div class="filter-buttons">${[['all','전체 기록'],['written','최종 답안 있음'],['pending','최종 답안 없음']].map(([k,t])=>`<button data-filter="${k}" class="${filter===k?'selected':''}" aria-pressed="${filter===k}">${t}</button>`).join('')}</div>`}
function closeDetail(){if($('#studentDialog').open)$('#studentDialog').close();selected=null;previousFocus?.focus()}
function openDetail(no,sid,element=''){const plays=data.groups.get(String(no));if(!plays)return;selected=String(no);previousFocus=document.activeElement;const chosen=plays.find(s=>s.sessionId===sid)||plays.at(-1);$('#detail').innerHTML=`<header class="drawer-header"><div><span>학생의 실험 노트</span><h2 id="studentTitle">${no}번의 답안</h2><p>${esc(classLabel())} · ${esc(missionName())}${source()==='demo'?' · 합성 예시':isTest?' · 테스트 기록':''}</p></div><button id="closeDetail" class="close-button" aria-label="학생 답안 닫기">×</button></header><div class="drawer-body"><label class="play-select">어느 판을 읽을까요?<select id="detailPlay">${plays.map((s,i)=>`<option value="${esc(s.sessionId)}" ${s===chosen?'selected':''}>${i+1}번째 판 · ${date(s.startedAt)}</option>`).join('')}</select></label><div id="playContent"></div></div>`;$('#closeDetail').onclick=closeDetail;$('#detailPlay').onchange=()=>renderPlay(data.groups.get(String(no)).find(s=>s.sessionId===$('#detailPlay').value),element);renderPlay(chosen,element);if(!$('#studentDialog').open)$('#studentDialog').showModal()}
const rejudgeMessages={
 REJUDGE_NOT_NEEDED:'현재 답안은 재판정 대상이 아닙니다. 기록을 새로고침해 주세요.',
 STALE_SUBMISSION:'학생의 최종 제출이 바뀌었습니다. 시트 기록을 갱신한 뒤 다시 확인해 주세요.',
 REJUDGE_BUSY:'이 판의 재판정이 진행 중입니다. 잠시 뒤 다시 확인해 주세요.',
 UNAVAILABLE:'평가기에서 답안을 판정 불가로 반환했습니다.',
 INVALID_TEXT:'저장된 답안이 평가기의 길이 제한을 초과했습니다.',
 SAVE_FAILED:'새 판정을 시트에 저장하지 못했습니다.',
 RATE_LIMIT:'평가 요청이 몰리고 있습니다. 잠시 뒤 다시 시도해 주세요.',
 DAILY_LIMIT:'오늘의 평가 요청 한도에 도달했습니다.',
 REJUDGE_UNAVAILABLE:'현재 연결된 Apps Script에서 재판정을 사용할 수 없습니다.'
};
const rejudgeMessage=code=>rejudgeMessages[code]||'평가를 완료하지 못했습니다. 잠시 뒤 다시 시도해 주세요.';
function rejudgeControl(s,target,message){
 if(source()!=='sheet')return '';
 const job=s.teacherRejudgeRequest;
 const busy=rejudgeJobs.has(s.sessionId)||job?.status==='running'&&Date.now()-M.time(job.at)<180000;
 const failure=target&&job?.attemptId===target.id&&job.status==='failed'&&['failed','missing'].includes(I.judgmentStatus(data,s).code);
 return window.TeacherRecordUI.rejudgeControl(data,s,target,busy,message||(failure?rejudgeMessage(job.code):''));
}
function reflectRejudgments(records){
 return {...records,sessions:records.sessions.map(s=>{
  const saved=confirmedRejudgments.get(s.sessionId);
  if(!saved)return s;
  if(M.time(s.teacherRejudgment?.at)>=M.time(saved.at)){
   confirmedRejudgments.delete(s.sessionId);return s;
  }
  const target=I.finalSubmission(records,s).target;
  return target?.id===saved.attemptId&&target.input===saved.input?{...s,updatedAt:M.time(s.updatedAt)>M.time(saved.at)?s.updatedAt:saved.at,teacherRejudgment:saved.result,
   teacherRejudgeRequest:{requestId:saved.result.requestId,attemptId:saved.attemptId,status:'completed',at:saved.at}}:s;
 })};
}
async function rejudgePlay(button,s,target,element){
 if(rejudgeJobs.has(s.sessionId))return;
 const feedback=$('#rejudgeStatus');
 const scopeKey=cacheKey(),submissionId=s.sessionId,requestId=crypto.randomUUID();
 rejudgeJobs.add(submissionId);button.disabled=true;button.textContent='재판정 중…';feedback.textContent='';
 try{
  const payload={classCode:s.classCode,missionId:s.missionId,sessionId:submissionId,attemptId:target.id,requestId};
  const response=await auth.fetch(apiBase+'/rejudge',{method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify(payload),signal:AbortSignal.timeout(155000)});
  const value=await response.json(),result=value.rejudgment;
  if(!response.ok||!value.ok)throw Error(rejudgeMessage(value.code));
  if(result?.requestId!==requestId||result.attemptId!==target.id||!result.at||!result.judgment)throw Error(rejudgeMessage());
  confirmedRejudgments.set(submissionId,{attemptId:target.id,input:target.input,at:result.at,result});
  if(phase!=='dashboard'||cacheKey()!==scopeKey)return;
  db=reflectRejudgments(db);recordCache.set(scopeKey,db);
  const saved=db.sessions.find(item=>item.sessionId===submissionId);
  if(!saved)return;
  const effective=I.evaluation(db,saved);
  if(effective.rejudgment?.requestId===requestId)focusElement='';
  if(portfolioData?.classes)portfolioData={...portfolioData,classes:portfolioData.classes.map(c=>
   c.classKey===chosenClass.classKey&&c.isTest===isTest?{...c,games:{...c.games,[missionId()]:I.game(db,c.classCodes,missionId(),isTest)}}:c)};
  rejudgeJobs.delete(submissionId);analyze();
  if($('#studentDialog').open&&$('#detailPlay')?.value===submissionId){
   renderPlay(saved,element,'새 판정을 저장했습니다.');
   $('#rejudgeStatus')?.focus();

  }
 }catch(error){
  feedback.textContent=error.name==='TimeoutError'?'응답이 늦어지고 있습니다. 시트 기록을 새로고침해 저장 여부를 확인해 주세요.':error.message;
 }finally{rejudgeJobs.delete(submissionId);button.disabled=false;button.textContent='재판정'}
}
function renderPlay(s,element='',retryMessage=''){const events=M.attemptsFor(data,s.sessionId),submits=M.submissions(data,s),target=I.finalSubmission(data,s,events).target,evaluation=I.evaluation(data,s);$('#playContent').innerHTML=`${window.TeacherRecordUI.criterion(data,s,element)}<section class="answer-compare"><article><span>처음에는 이렇게 생각했어요</span><p>${esc(s.firstAnswer||'처음 생각이 아직 저장되지 않았어요.')}</p></article><article class="last-answer"><span>마지막에는 이렇게 설명했어요</span><p>${esc(target?.input||s.finalAnswer||submits.at(-1)?.input||'최종 답안을 아직 제출하지 않았어요.')}</p></article></section>${rejudgeControl(s,target,retryMessage)}${window.TeacherRecordUI.timeline(data,s)}<div class="reading-note"><b>선생님이 살펴볼 점</b><p>처음 생각과 비교해, 실험에서 본 사실과 그 이유를 연결해서 설명했는지 읽어보세요.</p></div><details class="detail-fold"><summary>쓴 답안을 순서대로 보기 <small>${submits.length?submits.length+'회 제출':'개별 제출 기록 확인'}</small></summary>${submits.map((e,i)=>`<article class="submission"><h3>${i+1}번째 제출 <small>${date(e.createdAt)}</small></h3><p class="answer">${esc(e.input||'본문 없음')}</p></article>`).join('')||'<p>이전 저장 방식에는 제출별 원문이 없어요. 위의 마지막 답안만 확인할 수 있습니다.</p>'}</details><details class="detail-fold"><summary>어떤 활동을 했는지 보기 <small>${events.length}개 기록</small></summary><ol class="timeline">${events.map(e=>`<li><b>${eventLabel(e)}</b><time>${date(e.clientOccurredAt||e.createdAt)}</time>${e.input?`<p>${esc(e.input)}</p>`:''}${e.choice?`<small>선택: ${esc(e.choice)}</small>`:''}</li>`).join('')||'<li>활동별 기록은 아직 없어요.</li>'}</ol></details><details class="detail-fold"><summary>게임의 자동 판정 보기 <small>교사의 평가가 아니에요</small></summary><p>${s.synthetic?'합성 예시 답안에 함께 작성한 판정이에요.':M.judgmentMethod(evaluation.record)==='AI 평가'?'AI가 기록한 참고 결과예요.':M.judgmentMethod(evaluation.record)==='단어 규칙'?'단어 규칙으로 기록한 참고 결과예요.':'게임에서 기록한 참고 결과예요. 판정 방식은 저장되지 않았어요.'} 원문과 함께 확인해 주세요.</p><ul class="judgment-list">${Object.entries(elements()).map(([k,name])=>{const j=evaluation.judgment,has=Object.hasOwn(j,k);return `<li><span>${name} <small>${k}</small></span><b class="${!has?'unseen':M.yes(j[k])?'yes':'no'}">${!has?'판정 없음':M.yes(j[k])?'게임에서 인정':'게임에서 미인정'}</b></li>`}).join('')}</ul></details><div class="hint-note"><b>${esc(U.noteText(data,s))}</b>${M.noteUsage(data,s).kind==='legacy'&&s.missionId==='m02'?'<p>이전 방식의 힌트 값은 새 교수 노트의 쪽수와 직접 비교하지 않아요.</p>':''}</div><section class="teacher-note-section"><h3>이 학생에게 어떤 질문을 할까요?</h3><p>질문과 다음 활동을 기록해 두세요. 학생 답안은 바뀌지 않습니다.</p>${planForm(M.number(s),s.finalAnswer||s.firstAnswer||'원문 미기록',s.sessionId)}</section>`;bindPlanForm($('#detail #planForm'));const button=$('#rejudgeButton');if(button)button.onclick=()=>rejudgePlay(button,s,target,element)}
function eventLabel(e){return esc(({burnA:'열린 실험의 강철솜 태우기',clipB:'닫힌 실험의 집게 연결',burnB:'닫힌 실험의 강철솜 태우기',acquire:'실험 단서 모으기',first:'처음 생각 쓰기',claim:'주장과 근거 고르기',Q1:'질문 1에 답하기',Q2:'질문 2에 답하기',Q3:'질문 3에 답하기',predict:'자신의 답안 예상하기',final:'최종 답안 제출',hintView:'힌트 열어보기',hintUnlock:'힌트 열림',stopper:'플라스크 마개 조작'}[e.questId]||(e.stage==='sort'?'카드 분류하기':e.stage==='rebuttal'?'교수와 토론하기':stageLabels[e.stage]||'실험 활동')))}
const plansKey=()=>missionId()==='m02'?`sciw_m02_reviews_v1:${source()==='sheet'?'sheet':source()}:${classCode()}`:`sciw_m01_reviews_v1:${source()}:${classCode()}`;
function readPlans(){try{return JSON.parse(localStorage.getItem(plansKey())||'[]')}catch(_){return []}}
function planForm(target='',evidence='',sid=''){return `<form id="planForm"><input type="hidden" name="sessionId" value="${esc(sid)}"><div class="form-grid"><label>누구에게 물어볼까요?<input name="target" value="${esc(target)}" placeholder="예: 2번 또는 학급 전체" maxlength="80" required></label><label>언제 확인할까요?<input name="when" type="datetime-local"></label></div><label>학생이 쓴 말 또는 관찰한 점<textarea name="evidence" rows="2" maxlength="1500" required>${esc(evidence)}</textarea></label><label>다시 물어볼 질문<textarea name="question" rows="2" placeholder="예: 그 산소는 실험 전에 어디에 있었을까?" maxlength="1000" required></textarea></label><label>함께 해볼 활동<input name="activity" placeholder="예: 실험 전후에 질량에 포함되는 물질 표시하기" maxlength="500" required></label><details class="optional-note"><summary>다른 가능성이나 교사 판단도 남기기</summary><textarea name="judgment" rows="2" maxlength="1500" aria-label="교사 판단"></textarea></details><div class="form-bottom"><small>수업 메모는 이 브라우저에 저장돼요.</small><button class="button" type="submit">수업 메모 저장 →</button></div></form>`}

function manualPlansView(){const ps=readPlans();return header('읽은 답안에서, 다음 질문을 골라보세요.','학생의 답안 읽기에서도 바로 질문을 가져올 수 있어요. 메모는 이 브라우저에만 저장됩니다.','선생님의 메모')+`<div class="plan-layout"><section class="paper"><h2>새 수업 메모</h2>${planForm()}</section><section><h2 class="saved-heading">남겨둔 메모 <small>${ps.length}개</small></h2>${ps.map(p=>`<article class="paper saved-plan"><div><span class="memo-label">${esc(p.target)}${/^\d+$/.test(p.target)?'번':''}</span><select data-plan-state="${esc(p.id)}" aria-label="메모 상태">${['확인 예정','수업에 반영','보류'].map(v=>`<option ${p.state===v?'selected':''}>${v}</option>`).join('')}</select></div><h3>${esc(p.question)}</h3><p>${esc(p.activity)}</p><details><summary>학생의 말과 내 판단 보기</summary><p class="answer">${esc(p.evidence)}</p><p>${esc(p.judgment||'별도 판단 없음')}</p></details><footer>${p.when?esc(p.when.replace('T',' ')):'일시 미정'} <button class="text-button" data-edit-plan="${esc(p.id)}">수정하기</button></footer></article>`).join('')||'<div class="paper blank-memo"><b>아직 메모가 없어요.</b><p>왼쪽에서 첫 질문을 남겨보세요.</p></div>'}</section></div>`}
function savePlans(ps){try{localStorage.setItem(plansKey(),JSON.stringify(ps));return true}catch(_){showToast('메모를 저장하지 못했어요. 저장 공간을 확인해 주세요.');return false}}
function bindPlanForm(form,id){if(!form)return;form.onsubmit=e=>{e.preventDefault();const fields=Object.fromEntries(new FormData(form)),plans=readPlans(),old=plans.find(p=>p.id===id),item={...fields,id:old?.id||'review_'+crypto.randomUUID(),state:old?.state||'확인 예정',createdAt:old?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString(),classCode:classCode(),missionId:missionId(),source:source()};if(old)plans[plans.indexOf(old)]=item;else plans.unshift(item);if(savePlans(plans)){showToast('이 브라우저에 수업 메모를 저장했어요.');if($('#studentDialog').open)form.reset();else render()}}}

/* Selection, report and load flow below. */

function cacheKey(game=missionId()){return JSON.stringify([source(),chosenClass?.classKey,isTest,game])}
function enterClassDashboard(next,game=''){closeDetail();highlightedStudent='';chosenClass=next;isTest=next.isTest;overviewTests=isTest;chosenMission=game||overviewMission||'m01';overviewMission=chosenMission;phase='dashboard';view='overview';mode='latest';filter='all';focusElement='';dashPage=0;dashQuery='';aiMode=readReport(chosenMission,'first')&&!readReport(chosenMission,'latest')?'first':'latest';db=recordCache.get(cacheKey())||{sessions:[],attempts:[]};loading=true;analyze();$('#content').scrollTop=0;$('#content').focus({preventScroll:true});load()}
function returnToPortfolio(){closeDetail();highlightedStudent='';overviewMission=chosenMission||overviewMission||'m01';chosenClass=null;chosenMission='';isTest=false;phase='class';view='overview';filter='all';dashPage=0;dashQuery='';db={sessions:[],attempts:[]};data=M.analyze(db,'');render();$('#content').focus({preventScroll:true});load()}
function switchGame(game){if(!Object.hasOwn(games,game))return;closeDetail();highlightedStudent='';dashPage=0;if(phase==='class'){overviewMission=game;render();return}chosenMission=game;overviewMission=game;focusElement='';aiMode=mode==='first'?'first':'latest';db=recordCache.get(cacheKey())||{sessions:[],attempts:[]};loading=true;analyze();$('#content').scrollTop=0;load()}
function backToClassDashboard(){returnToPortfolio()}
function reportKey(key=scope()){return 'sciw_teaching_report_v3:'+key}
function readReport(game=missionId(),recordMode=aiMode){const key=scope(game,recordMode);if(reports.has(key))return reports.get(key);try{const v=JSON.parse(localStorage.getItem(reportKey(key))||'null');if(v?.reportVersion===3&&v.classKey===chosenClass?.classKey&&v.missionId===game&&v.analysis?.result?.headline&&v.analysis?.result?.teachingFocus&&v.basis?.samples){reports.set(key,v);return v}}catch(_){}return null}
function reportStale(entry){return entry&&!loading&&lastSuccess&&!loadError&&entry.basis.sourceRevision!==E.revision(data)}
async function generateAnalysis(){if(phase==='dashboard'&&source()==='demo'){analyze();showToast('학급 기록을 다시 정리했어요.');return}if(phase!=='dashboard'||source()!=='sheet'||!lastSuccess||loadError||!data.stats.N)return;const key=scope();if(aiJobs.has(key))return;const existing=readReport(),payload={classKey:chosenClass.classKey,missionId:missionId(),includeTests:isTest,mode:aiMode,regenerate:Boolean(existing)},contextLabel=classLabel();aiJobs.add(key);aiErrors.delete(key);render();const abort=new AbortController(),timeout=setTimeout(()=>abort.abort(),170000);try{const response=await auth.fetch(apiBase+'/analysis',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:abort.signal});const value=await response.json();if(!response.ok||!value.ok)throw Error(value.error||'분석 서버에 연결하지 못했습니다.');if(value.classKey!==payload.classKey||value.missionId!==payload.missionId||!value.analysis?.result?.teachingFocus||!value.basis?.samples)throw Error('선택한 반·게임의 리포트를 확인하지 못했습니다.');const entry={...value,reportVersion:3,classLabel:contextLabel};reports.set(key,entry);try{localStorage.setItem(reportKey(key),JSON.stringify(entry))}catch(_){showToast('리포트는 이번 화면에서만 볼 수 있어요. 브라우저 저장 공간을 확인해 주세요.')}}catch(error){aiErrors.set(key,error.name==='AbortError'?'응답이 늦어졌어요. 잠시 후 생성 버튼을 눌러 확인해 주세요.':error.message)}finally{clearTimeout(timeout);aiJobs.delete(key);if(phase==='dashboard'&&key===scope())render()}}
function render(){
 const focused=document.activeElement,id=focused?.id,gameFocus=focused?.dataset?.switchGame,taskFocus=focused?.dataset?.task,caret=id==='recordSearch'?focused.selectionStart:null;
 clearTimeout(evaluationTimer);
 sourceNotice();$('#dashboardNav').hidden=true;$('#changeScope').hidden=true;$('#backToClass').hidden=true;$('#scopeBadge').hidden=true;
 const game=phase==='class'?(overviewMission||'m01'):missionId();
 $('#dashboardTitle').textContent=chosenClass?classLabel():'전체 학급';$('#boardDescription').textContent=chosenClass?'학생의 진행을 확인하고 다음 수업을 준비하세요.':'학급을 선택하고 참여 현황을 확인하세요.';
 $('#classNav').innerHTML=D.sidebar({portfolio:portfolioData,selectedClass:chosenClass,mission:game,grade:overviewGrade,tests:overviewTests});
 $('#content').innerHTML=D.screen({view,status,highlightedStudent,reportStale:chosenClass&&reportStale(readReport()),portfolio:portfolioData,data,selectedClass:chosenClass,mission:game,grade:overviewGrade,tests:overviewTests,focusElement,query:dashQuery,filter,mode,page:dashPage,pageSize:dashSize,loading,error:loadError,report:chosenClass&&source()!=='demo'?readReport():null,busy:aiJobs.has(scope()),aiError:aiErrors.get(scope()),aiMode,available:['sheet','demo'].includes(source())&&!loading&&!loadError&&lastSuccess&&data.stats.N>0,source:source()});
 const nextEvaluation=Math.min(...$$('[data-evaluation-ends]').map(node=>Number(node.dataset.evaluationEnds)));
 if(Number.isFinite(nextEvaluation))evaluationTimer=setTimeout(render,Math.max(0,nextEvaluation-Date.now()));
 bindContent();syncLive();
 let target=gameFocus?$('#game-'+game):taskFocus?$('#task-'+view):id?document.getElementById(id):null;if(target?.disabled&&id==='matrixNext')target=$('#matrixPrev');if(target){target.focus({preventScroll:true});if(id==='recordSearch'&&caret!==null)target.setSelectionRange(caret,caret)}
}
function bindContent(){
 const p=$('#playMode'),og=$('#overviewGrade'),ot=$('#overviewTests'),q=$('#recordSearch'),f=$('#recordFilter');
 if(og)og.onchange=()=>{overviewGrade=og.value;dashPage=0;if(chosenClass)returnToPortfolio();else render()};
 if(ot)ot.onchange=()=>{overviewTests=ot.checked;overviewGrade='';dashPage=0;if(chosenClass)returnToPortfolio();else render()};
 if(p)p.onchange=()=>{mode=p.value;aiMode=mode;focusElement='';dashPage=0;analyze()};if(q)q.oninput=()=>{dashQuery=q.value;dashPage=0;render()};if(f)f.onchange=()=>{filter=f.value;dashPage=0;render()};
 $$('[data-switch-game]').forEach(button=>button.onkeydown=event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const tabs=$$('[data-switch-game]'),index=tabs.indexOf(button),next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;tabs[next].focus();tabs[next].click()});
 bindPlanForm($('#content #planForm'));
}
function switchView(next){view=next;highlightedStudent='';dashPage=0;dashQuery='';filter='all';render();$('#content').scrollTop=0;($('#task-'+next)||$('#content')).focus({preventScroll:true})}
function openStudentAnalysis(studentNo){
 const index=data.reps.findIndex(student=>M.number(student)===studentNo);
 if(index<0)return;
 view='analysis';highlightedStudent=studentNo;dashPage=Math.floor(index/dashSize);dashQuery='';filter='all';
 render();
 const row=document.getElementById('student-answer-'+studentNo);
 row?.focus({preventScroll:true});
 row?.scrollIntoView({block:'center',inline:'nearest',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
}
$('#content').addEventListener('click',e=>{const link=e.target.closest('[data-analysis-student]');if(link){e.preventDefault();openStudentAnalysis(link.dataset.analysisStudent);return}const b=e.target.closest('button');if(!b)return;const d=b.dataset;if(d.task){switchView(d.task);return}if(d.compareElement){focusElement=d.compareElement;render();$('.focus-examples').scrollIntoView({block:'start'});$('#comparisonHeading').focus({preventScroll:true});return}if('page'in d){dashPage=Math.max(0,Number(d.page)||0);render();return}if(d.switchGame){switchGame(d.switchGame);return}if(d.overviewGame){overviewMission=d.overviewGame;render();return}if(d.classKey){const next=classes.find(c=>c.classKey===d.classKey&&c.isTest===(d.classTest==='true'));if(next)enterClassDashboard(next,d.openGame||'');return}if(d.game){chosenMission=d.game;focusElement='';phase='dashboard';view='overview';filter='all';mode='latest';aiMode=readReport(d.game,'latest')?'latest':readReport(d.game,'first')?'first':'latest';db={sessions:[],attempts:[]};data=M.analyze(db,'');loading=true;render();$('#content').focus({preventScroll:true});load()}if(d.filter){filter=d.filter;render();$('.student-list')?.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'})}if(d.student){openDetail(d.student,d.session,d.element||'');if(d.element){const fold=$('#playContent .judgment-list')?.closest('details');if(fold)fold.open=true}}if('reload'in d)load(true);if('demo'in d){$('#source').value='demo';resetScope();load()}if('aiGenerate'in d)generateAnalysis();if(d.editPlan){const p=readPlans().find(x=>x.id===d.editPlan),form=$('#content #planForm');if(p&&form){Object.entries(p).forEach(([k,v])=>{if(form.elements[k])form.elements[k].value=v});bindPlanForm(form,p.id);form.elements.question.focus()}}});
$$('[data-view]').forEach(b=>b.onclick=()=>switchView(b.dataset.view));$('#studentDialog').addEventListener('click',e=>{if(e.target===$('#studentDialog'))closeDetail()});$('#studentDialog').addEventListener('cancel',()=>selected=null);
function resetScope(){closeDetail();highlightedStudent='';dashPage=0;dashQuery='';loading=true;portfolioData=null;portfolioRevision='';overviewGrade='';overviewMission='';overviewTests=false;focusElement='';chosenClass=null;chosenMission='';phase='class';view='overview';classes=[];lastSuccess=null;loadError='';invalidRows=0;isTest=false;db={sessions:[],attempts:[]};data=M.analyze(db,'');render()}

const getJSON=(url,signal)=>window.TeacherConnection.getJSON(url,signal,auth.fetch);
async function load(force=false,background=false){
 if(!auth.active())return;
 const ticket=++request,wasError=Boolean(loadError),classView=phase==='dashboard'&&chosenClass;
 controller?.abort();controller=new AbortController();const signal=controller.signal;
 loading=true;$('#refresh').disabled=true;
 if(!background)$('#connectionState').textContent='기록 확인 중…';
 const timer=setTimeout(()=>controller?.signal===signal&&controller.abort(),50000);
 try{
  let unchanged=false;
  if(source()==='sheet'){
   const params=new URLSearchParams();
   if(classView){params.set('classKey',chosenClass.classKey);params.set('missionId',missionId());params.set('includeTests',isTest?'1':'0')}
   const since=classView?db.revision:portfolioRevision;
   if(since&&!force)params.set('since',since);
   if(force)params.set('refresh','1');
   const value=await getJSON(apiBase+(classView?'/class':'/classes')+'?'+params,signal);
   if(ticket!==request)return;
   liveSupported=value.live===true;
   unchanged=value.unchanged===true;
   if(!unchanged){
    if(classView){
     db=reflectRejudgments(value);recordCache.set(cacheKey(),db);
     if(portfolioData?.classes)portfolioData={...portfolioData,classes:portfolioData.classes.map(c=>
      c.classKey===chosenClass.classKey&&c.isTest===isTest?{...c,games:{...c.games,[missionId()]:I.game(db,db.classCodes||c.classCodes,missionId(),isTest)}}:c)};
    }else{
     classes=value.classes;portfolioData=value.overview;portfolioRevision=value.revision||'';invalidRows=value.invalidRows||0;
     if(!overviewMission)overviewMission=Object.keys(games).find(id=>portfolioData?.classes.some(c=>!c.isTest&&c.games[id].participants))||'m02';
    }
    $('#sheetLink').href=value.sheetUrl||cfg.SHEET_URL;
   }
  }else{
   sourceDB=source()==='demo'?window.TeacherDemo:JSON.parse(localStorage.getItem('sciw_localdb_v1')||'{"sessions":[],"attempts":[]}');
   sourceDB.sessions=Array.isArray(sourceDB.sessions)?sourceDB.sessions:Object.values(sourceDB.sessions||{});
   classes=S.catalog(sourceDB);portfolioData=I.overview(sourceDB);
   if(classView)db=M.analyze(sourceDB,classCode(),'all',{missionId:missionId(),classCodes:chosenClass.classCodes,includeTests:isTest});
   $('#sheetLink').href=cfg.SHEET_URL;
  }
  lastSuccess=new Date().toISOString();loading=false;loadError='';
  if(!unchanged||!background||wasError)analyze();
  $('#connectionState').textContent=source()==='sheet'?'✓ Google 시트 연결됨':source()==='demo'?'가상의 예시 수업':'브라우저 기록';
  $('#status').textContent=date(lastSuccess)+' 확인';
 }catch(error){
  if(ticket!==request)return;
  loading=false;loadError=error.name==='AbortError'?'응답이 늦어요. 잠시 후 새로고침을 눌러 주세요.':error.message;
  $('#connectionState').textContent='시트 연결 확인 필요';$('#status').textContent=loadError;render();
 }finally{clearTimeout(timer);if(ticket===request){loading=false;$('#refresh').disabled=false}}
}
$('#backToClass').onclick=returnToPortfolio;$('#changeScope').onclick=returnToPortfolio;$('#refresh').onclick=()=>{closeDetail();load(true)};$('#source').onchange=()=>{liveSupported=false;recordCache.clear();resetScope();load()};
$('#classNav').addEventListener('click',event=>{const button=event.target.closest('button');if(!button)return;if('allClasses'in button.dataset){returnToPortfolio();return}const d=button.dataset;if(d.classKey){const next=classes.find(c=>c.classKey===d.classKey&&c.isTest===(d.classTest==='true'));if(next)enterClassDashboard(next)}});

function canRefresh(){return !loading&&!document.hidden&&!$('#studentDialog').open&&$('#teacherTermPopover').hidden&&document.activeElement?.tagName!=='SELECT'}
function scheduleLiveRefresh(){
 if(liveTimer)return;
 liveTimer=setTimeout(()=>{
  liveTimer=null;
  if(!auth.active()||source()!=='sheet'||document.hidden)return;
  if(canRefresh())load(false,true);else scheduleLiveRefresh();
 },700);
}
function closeLive(){
 const previous=liveSocket;liveSocket=null;liveKey='';previous?.close();
 clearTimeout(liveTimer);clearTimeout(liveReconnect);liveTimer=null;
 $('#liveMilestones').replaceChildren();
}
function syncLive(){
 if(!auth.active()||source()!=='sheet'||!liveSupported){closeLive();return;}
 const game=phase==='class'?(overviewMission||'m01'):missionId(),test=phase==='class'?overviewTests:isTest,key=game+':'+test;
 if(liveKey===key)return;
 closeLive();liveKey=key;
 const socket=auth.progress({missionId:game,includeTests:test?'1':'0'});
 if(!socket)return;
 liveSocket=socket;
 socket.onmessage=event=>{
  if(liveSocket!==socket||document.hidden)return;
  let changes;try{changes=JSON.parse(event.data)}catch{return;}
  if(!Array.isArray(changes))return;
  const relevant=changes.filter(change=>change?.missionId===game&&change.isTest===test&&(!chosenClass||change.classKey===chosenClass.classKey));
  if(!relevant.length)return;
  const area=$('#liveMilestones');
  for(const change of relevant){
   if(!['entered','completed'].includes(change.kind))continue;
   const card=document.createElement('p'),kind=change.kind==='entered'?'입장':'완료';
   card.className='live-milestone '+change.kind;
   card.textContent=S.identity(change.classCode).label+' · 학생 '+kind;
   while(area.children.length>=2)area.firstElementChild.remove();
   area.append(card);setTimeout(()=>card.remove(),4200);
  }
  scheduleLiveRefresh();
 };
 socket.onclose=()=>{if(liveSocket===socket)liveReconnect=setTimeout(()=>{liveKey='';syncLive()},15000)};
}
const auth=window.TeacherAuth.attach({base:apiBase,open:()=>{loading=true;render();load()},close:()=>{liveSupported=false;closeLive();request++;controller?.abort();sourceDB={sessions:[],attempts:[]};recordCache.clear();confirmedRejudgments.clear();reports.clear();popovers.close();$('#detail').replaceChildren();resetScope()}});
auth.start();
setInterval(()=>{if(auth.active()&&source()==='sheet'&&canRefresh())load(false,true)},cfg.REFRESH_MS||20000);
document.addEventListener('visibilitychange',()=>{if(auth.active()&&source()==='sheet'&&canRefresh())load(false,true)});
})();
