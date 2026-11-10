(function(root){
 'use strict';
 const M=root.TeacherModel,I=root.TeacherInsights,U=root.TeacherOverviewUI;
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const games={m01:{name:'감자 삼투',asset:'intro/potato-silhouette.webp'},m02:{name:'강철솜 질량 보존',asset:'intro/steel-wool-silhouette.webp'}};
 const labelFor=(mission,id)=>I.definitions[mission].find(([key])=>key===id)?.[1]||id;
 const elementInfo=(mission,id)=>info(labelFor(mission,id),I.descriptions[mission][id]);
 function info(label,description){return `<button type="button" class="term-info" data-info-text="${esc(description)}" aria-label="${esc(label)} 설명" aria-expanded="false" aria-haspopup="dialog">ⓘ</button>`}
 function pageRows(rows,page=0,size=8){const pages=Math.max(1,Math.ceil(rows.length/size)),index=Math.min(Math.max(0,page),pages-1);return {rows:rows.slice(index*size,(index+1)*size),index,pages,total:rows.length,start:rows.length?index*size+1:0,end:Math.min(rows.length,(index+1)*size)}}
 function model({portfolio,data,selectedClass,mission='m01',grade='',tests=false,query='',filter='all',page=0,pageSize=8}){
  const classes=(portfolio?.classes||[]).filter(c=>c.isTest===tests&&(!grade||String(c.grade)===grade));
  const all=selectedClass?(data?.reps||[]).map(s=>({s,e:I.evaluation(data,s)})):classes.map(c=>({c,g:c.games[mission]}));
  const keys=[...new Map((selectedClass?I.criteria(data,data?.reps||[]):classes.flatMap(c=>c.games[mission].evaluations)).map(k=>[k.key,{key:k.key,label:k.label}])).values()].sort((a,b)=>Number(!a.key.startsWith('m02-docx'))-Number(!b.key.startsWith('m02-docx'))||b.key.localeCompare(a.key,'ko',{numeric:true}));
  const current=keys[0]?.key||'';
  const total=selectedClass?all.length:all.reduce((n,r)=>n+r.g.participants,0),written=selectedClass?all.filter(r=>r.e.written).length:all.reduce((n,r)=>n+r.g.written,0),judged=selectedClass?all.filter(r=>r.e.has).length:all.reduce((n,r)=>n+r.g.judged,0);
  const needle=query.trim().toLowerCase();
  const rows=all.filter(r=>{const wrote=selectedClass?r.e.written:r.g.written>0,pending=selectedClass?!r.e.written:r.g.pending>0;return (!needle||(selectedClass?M.number(r.s)+'번':r.c.label).toLowerCase().includes(needle))&&(filter==='all'||filter==='written'&&wrote||filter==='pending'&&pending)});
  const studentCells=selectedClass?I.aggregate(data,data?.reps||[],mission,current).cells:null;
  const cells=I.definitions[mission].map(([key,label],i)=>{
   if(selectedClass)return studentCells[i];
   const source=all.map(r=>r.g.evaluations.find(e=>e.key===current)?.cells[i]).filter(Boolean),met=source.reduce((n,c)=>n+c.met,0),revise=source.reduce((n,c)=>n+c.revise,0);
   return {key,label,met,revise,assessed:met+revise,rate:met+revise?Math.round(100*met/(met+revise)):null};
  });
  return {classes,all,rows,current,total,written,pending:total-written,judged,cells,pagination:pageRows(rows,page,pageSize)};
 }
 function sidebar({portfolio,selectedClass,mission,grade,tests}){
  const rows=(portfolio?.classes||[]).filter(c=>c.isTest===tests&&(!grade||String(c.grade)===grade));
  return `<button class="scope-all ${!selectedClass?'active':''}" data-all-classes ${!selectedClass?'aria-current="page"':''}><span>▦</span> 전체 학급 <small>${rows.length}</small></button><div class="sidebar-section-title"><b>담당 학급</b><label><span class="sr-only">학년 필터</span><select id="overviewGrade"><option value="">모든 학년</option>${['1','2','3'].map(g=>`<option value="${g}" ${grade===g?'selected':''}>${g}학년</option>`).join('')}</select></label></div><div class="sidebar-class-list">${rows.map(c=>`<button class="scope-class ${selectedClass?.classKey===c.classKey&&selectedClass?.isTest===c.isTest?'active':''}" data-class-key="${esc(c.classKey)}" data-class-test="${c.isTest}" ${selectedClass?.classKey===c.classKey&&selectedClass?.isTest===c.isTest?'aria-current="page"':''}><span>${esc(c.label)}</span><small>${c.games[mission].participants}명</small></button>`).join('')||'<p class="sidebar-empty">아직 기록된 반이 없습니다.</p>'}</div><label class="sidebar-tests"><input id="overviewTests" type="checkbox" ${tests?'checked':''}>테스트 기록</label>`;
 }
 function gameTabs(mission){return `<div class="dashboard-gamebar"><div class="game-tabs" role="tablist" aria-label="게임 선택">${Object.entries(games).map(([id,g])=>`<button role="tab" data-switch-game="${id}" id="game-${id}" aria-selected="${id===mission}" aria-controls="dashboardResults" tabindex="${id===mission?0:-1}"><img src="${g.asset}" alt="">${g.name}</button>`).join('')}</div></div>`}
 function metrics(v,selectedClass,loading=false){
  const items=[
   [selectedClass?'참여 학생':'참여 학생 합계',v.total,'플레이 시작 기준'],
   ['최종 답안',v.written,v.total?Math.round(v.written/v.total*100)+'% 작성':'작성 기록 없음'],
   ['작성 전',v.pending,'아직 최종 답안 없음']
  ];
  if(!selectedClass)items.push(['자동 판정',v.judged,'판정이 저장된 답안']);
  return `<section class="dashboard-metrics${selectedClass?' progress-metrics':''}" aria-label="${selectedClass?'학생 진행 지표':'핵심 수업 지표'}">${items.map(([label,count,detail],i)=>`<article class="metric metric-${i}"><span>${label}</span><div><strong>${loading&&v.total===0?'—':count}</strong><small>${detail}</small></div></article>`).join('')}</section>`;
 }
 function classCell(c,evaluation,index,mission){const [id,label]=I.definitions[mission][index],cell=evaluation?.cells[index],rate=cell?.rate??null;return `<td><button class="matrix-cell ${rate===null?'missing':rate>=80?'high':rate>=40?'mid':'low'}" data-class-key="${esc(c.classKey)}" data-class-test="${c.isTest}" data-open-game="${mission}" aria-label="${esc(c.label+' '+label+' '+(rate===null?'판정 없음':rate+'% · '+cell.met+'/'+cell.assessed)+' · 반 분석 보기')}"><b>${rate===null?'—':rate+'%'}</b>${rate===null?'':`<small>${cell.met}/${cell.assessed}</small>`}</button></td>`}
 function studentCell(r,id,label){
  const state=r.e.has?I.studentElement(r.s.missionId||'m01',r.e.judgment,id):'unknown';
  const word={met:'인정',revise:'보완',alternate:'대체 설명',unknown:'—'}[state];
  const cellLabel=state==='unknown'?'판정 없음':word;
  return `<td><button class="matrix-cell ${state==='met'?'high':state==='revise'?'low':state==='alternate'?'alternate':'missing'}" data-student="${M.number(r.s)}" data-session="${esc(r.s.sessionId)}" data-element="${id}" aria-label="${esc(M.number(r.s)+'번 '+label+' '+cellLabel+' · 판정 근거 보기')}"><span class="cell-dot" aria-hidden="true">${state==='met'?'●':state==='revise'?'◐':state==='alternate'?'↔':'—'}</span><b>${word}</b></button></td>`}
 function statusBadge(data,s){
  const value=I.judgmentStatus(data,s);
  return `<span class="judgment-status status-${value.code}">${esc(value.label)}</span>`;
 }
 function matrix(v,state){const {mission,selectedClass,query='',filter='all',mode='latest',loading,error}=state,student=Boolean(selectedClass),p=v.pagination;
  return `<section class="matrix-panel" aria-labelledby="matrixTitle"><header class="matrix-panel-heading"><div><h2 id="matrixTitle">${student?'학생별 설명 요소':'학급별 설명 요소'}</h2><span>${student?'칸을 눌러 학생의 판정 근거 확인':'반을 눌러 학생별 결과 확인'}</span></div><div class="matrix-heading-actions">${student?`<p class="matrix-judged">자동 판정 <b>${loading&&!v.total?'—':v.judged+'명'}</b></p>`:''}</div></header><div class="matrix-toolbar"><label class="record-search"><span aria-hidden="true">⌕</span><input id="recordSearch" type="search" value="${esc(query)}" placeholder="${student?'출석번호 검색':'학급 검색'}" aria-label="${student?'출석번호 검색':'학급 검색'}"></label><label class="sr-only" for="recordFilter">작성 상태</label><select id="recordFilter"><option value="all" ${filter==='all'?'selected':''}>전체 기록</option><option value="written" ${filter==='written'?'selected':''}>답안 작성</option><option value="pending" ${filter==='pending'?'selected':''}>작성 전</option></select>${student?`<label class="sr-only" for="playMode">기록 기준</label><select id="playMode"><option value="latest" ${mode==='latest'?'selected':''}>최근 판</option><option value="first" ${mode==='first'?'selected':''}>처음 한 판</option></select>`:`<span class="scope-count">${v.classes.length}개 반</span>`}</div>
  <div id="matrixViewport" class="matrix-viewport" tabindex="0" role="region" aria-label="${student?'학생별':'학급별'} 성취 표"><table class="dashboard-matrix"><caption class="sr-only">${games[mission].name} · ${student?'학생별':'학급별'} 설명 요소.</caption><thead><tr><th scope="col">${student?'출석번호':'학급'}${student?info('출석번호','게임 시작 화면에 입력한 출석번호입니다. 같은 번호의 판은 선택한 기록 기준에 따라 표시합니다.'):info('학급','게임 시작 화면에 입력한 학년과 반입니다. 반을 누르면 학생별 결과를 볼 수 있습니다.')}</th><th scope="col">${student?'최종 답안':'답안 / 참여'}${student?info('최종 답안','학생이 게임에서 마지막 답안을 제출했는지 보여 줍니다.'):info('답안 / 참여','최종 답안을 작성한 학생 수를 게임을 시작한 학생 수와 함께 표시합니다.')}</th>${I.definitions[mission].map(([id,label])=>`<th scope="col" title="${esc(label+' ('+id+')')}">${esc(label)}${elementInfo(mission,id)}<small class="rubric-code">(${esc(id)})</small></th>`).join('')}${student?`<th scope="col">AI 판정${info('AI 판정','저장된 최종 답안의 자동 판정 상태입니다. 판정 완료·대기·실패·불가·기록 없음은 실제 저장 기록으로 구분합니다.')}</th><th scope="col">기록 보기${info('기록 보기','학생의 답안 원문과 단계별 대화 기록을 엽니다.')}</th>`:''}</tr></thead><tbody>${p.rows.map(r=>student?`<tr id="student-answer-${M.number(r.s)}" tabindex="-1" class="${state.highlightedStudent===M.number(r.s)?'student-answer-highlight':''}"><th scope="row"><b>${M.number(r.s)}번</b></th><td><span class="submission-status ${r.e.written?'written':''}">${r.e.written?'작성':'작성 전'}</span></td>${I.definitions[mission].map(([id,label])=>studentCell(r,id,label)).join('')}<td>${statusBadge(state.data,r.s)}</td><td><button class="matrix-read" data-student="${M.number(r.s)}" data-session="${esc(r.s.sessionId)}" aria-label="${M.number(r.s)}번 답안과 단계별 대화 보기">답안 ↗</button></td></tr>`:`<tr><th scope="row"><button class="matrix-class" data-class-key="${esc(r.c.classKey)}" data-class-test="${r.c.isTest}">${esc(r.c.label)} <span>↗</span></button></th><td><b class="submission-number">${r.g.written}<small> / ${r.g.participants}</small></b></td>${I.definitions[mission].map((_,i)=>classCell(r.c,r.g.evaluations.find(e=>e.key===v.current),i,mission)).join('')}</tr>`).join('')||`<tr class="matrix-empty"><td colspan="${I.definitions[mission].length+(student?4:2)}"><strong>${loading?'기록을 불러오는 중':error?'시트 연결을 확인해 주세요':query||filter!=='all'?'조건에 맞는 기록이 없습니다':'아직 참여 기록이 없습니다'}</strong><p>${loading?'잠시만 기다려 주세요.':error?'상단 새로고침으로 다시 확인할 수 있습니다.':'다른 게임이나 학급을 선택해 보세요.'}</p></td></tr>`}</tbody></table></div>
  <div class="matrix-pagination"><span>${p.start}–${p.end} / ${p.total}${student?'명':'개 반'}</span><div><button id="matrixPrev" data-page="${p.index-1}" ${p.index===0?'disabled':''} aria-label="이전 페이지">←</button><span>${p.index+1} / ${p.pages}</span><button id="matrixNext" data-page="${p.index+1}" ${p.index+1>=p.pages?'disabled':''} aria-label="다음 페이지">→</button></div></div><footer class="matrix-legend"><span><i class="high"></i> 인정${student?'':' 비율'}</span><span><i class="low"></i> 보완</span>${student&&mission==='m02'?'<span><i class="alternate"></i> 대체 설명으로 충족</span>':''}<span><i class="missing"></i> — 판정 없음</span><details class="matrix-help"><summary>판정 안내 ⓘ</summary><p>항목마다 판정이 있는 답안만 분모로 셉니다. 미작성·미기록은 0점이 아닙니다. ${mission==='m02'?'강철솜은 외부 물질이 더해졌다는 질량 보존 설명이나, 닫힌 플라스크 전체의 질량이 유지된다는 설명을 근거로 쓸 수 있습니다. 한 방식으로 기준을 충족하면 다른 방식에서만 쓰는 항목은 대체 설명으로 표시합니다.':''}</p></details></footer></section>`;
 }
 function evidenceBars(v){const cells=v.cells.filter(c=>c.assessed).slice().sort((a,b)=>a.rate-b.rate).slice(0,3);return `<section class="insight-block"><header><h3>요소별 인정 현황</h3><span>인정 / 판정 답안</span></header><div class="element-bars">${cells.map(c=>`<div><span>${esc(c.label)}</span><b>${c.met} / ${c.assessed}</b><i><em style="width:${c.rate??0}%"></em></i></div>`).join('')||'<p class="no-assessment">아직 판정 기록이 없습니다.</p>'}</div></section>`}

 function classInsights(v){return `<aside class="dashboard-insights" aria-label="전체 학급 요약"><section class="insight-block overview-progress"><header><h3>반별 답안 현황</h3><span>${v.written} / ${v.total}명</span></header><div class="class-progress-list">${v.all.map(r=>`<button data-class-key="${esc(r.c.classKey)}" data-class-test="${r.c.isTest}"><span>${esc(r.c.label)}</span><b>${r.g.written}<small> / ${r.g.participants}</small></b><i><em style="width:${r.g.participants?100*r.g.written/r.g.participants:0}%"></em></i></button>`).join('')||'<p>학급 기록이 없습니다.</p>'}</div></section>${evidenceBars(v)}</aside>`}
 function tasks(state){
  const options=state.selectedClass?[['overview','수업 준비'],['progress','참여 현황'],['analysis','학생 답안 분석']]:[['overview','학급 목록'],['analysis','학급별 성취도']];
  return `<nav class="dashboard-tasks" aria-label="대시보드 보기">${options.map(([id,label])=>`<button type="button" id="task-${id}" data-task="${id}" aria-current="${state.view===id?'page':'false'}">${label}</button>`).join('')}</nav>`;
 }
 function classPicker(v,state){
  return `<section class="class-picker" aria-labelledby="classPickerTitle">
    <header><div><h2 id="classPickerTitle">어느 반을 살펴볼까요?</h2><p>참여 인원과 최종 답안 수를 보고 학급을 선택하세요.</p></div><span>${v.classes.length}개 학급</span></header>
    <div class="class-picker-list">${v.all.map(({c,g})=>`<button type="button" data-class-key="${esc(c.classKey)}" data-class-test="${c.isTest}">
      <strong>${esc(c.label)}</strong><span>${g.participants?'<b>'+g.written+' / '+g.participants+'명</b> 최종 답안 / 참여':'이 게임의 기록 없음'}</span>
      <progress value="${g.written}" max="${g.participants||1}" aria-label="${esc(c.label)} 최종 답안 작성 인원"></progress><i aria-hidden="true">→</i>
    </button>`).join('')||`<p class="focus-empty">${state.loading?'학급 기록을 불러오는 중입니다.':state.error?'시트 연결을 확인해 주세요.':'아직 기록된 학급이 없습니다.'} ${!state.loading&&state.source==='sheet'?'<button class="dashboard-link" data-demo>예시 수업 열기</button>':''}</p>`}</div></section>`;
 }
 function lessonHome(v,state,priority){
  const {missing}=priority,report=state.report?.analysis?.result,mission=state.mission;
  const empty=state.loading?'학급 기록을 불러오는 중입니다.':state.error?'학급 기록을 불러오지 못했어요.':v.written?'지금 확인된 보완 질문이 없어요. 아래에서 학생별 답안을 살펴보세요.':'아직 제출된 답안이 없어요.';
  const displayedQuestions=new Set(missing.map(item=>I.teachingQuestions[mission][item.key]));
  const question=Array.isArray(report?.questions)?report.questions.find(item=>typeof item?.question==='string'&&item.question.trim()&&!displayedQuestions.has(item.question.trim()))?.question:'';
  return `<section class="lesson-home" aria-labelledby="lessonHomeTitle">
   <header class="lesson-home-heading">
    <h2 class="dashboard-section-title" id="lessonHomeTitle">다음 수업에서 함께 물어볼 질문</h2>
   </header>
   ${missing.length?`
    <div class="weakness-grid">${missing.map((group,index)=>`<article class="weakness-card">
     <p class="weakness-kicker">보완 ${index+1} <span>${group.assessed}명 중 ${group.revise}명</span></p>
     <h3>${esc(I.teachingQuestions[mission][group.key])}</h3>
     <p class="weakness-description">${esc(I.descriptions[mission][group.key])}</p>
     <div class="weakness-roster"><b>해당 학생:</b><ul class="weakness-students" aria-label="해당 학생">${group.students.map(({studentNo})=>`<li><a href="#student-answer-${studentNo}" data-analysis-student="${studentNo}" aria-label="${studentNo}번 학생 답안 분석">${studentNo}번</a></li>`).join('')}</ul></div>
    </article>`).join('')}</div>`:`<p class="weakness-card lesson-empty">${esc(empty)}</p>`}
   <div class="lesson-participation">
    <div class="lesson-participation-summary"><img src="${games[state.mission].asset}" alt=""><div><strong>${v.written}<small> / ${v.total}명</small></strong><span>최종 답안 / 참여</span></div></div>
    <progress value="${v.written}" max="${v.total||1}" aria-label="학급 최종 답안 작성 인원"></progress>
    <button class="dashboard-generate" data-ai-generate ${!state.available||state.busy?'disabled':''}><span class="analysis-refresh-icon" aria-hidden="true">↻</span> ${state.busy?'학급 재분석 중…':'학급 재분석'}</button>
    ${state.aiError?`<p class="dashboard-ai-error" role="alert">${esc(state.aiError)}</p>`:''}
    ${state.source==='sheet'&&!state.loading&&!state.error&&!report&&!v.written?'<button class="dashboard-link" data-demo>예시 수업 열기</button>':''}
   </div>
   ${report?.teachingFocus||question||state.reportStale?`<div class="lesson-notes">
    ${report?.teachingFocus?`<p class="lesson-question"><b>수업 참고</b> ${esc(report.teachingFocus)}</p>`:''}
    ${question?`<p class="lesson-question"><b>추가로 물어볼 질문</b> ${esc(question)}</p>`:''}
    ${state.reportStale?'<p class="focus-freshness">새 답안이 들어왔어요. 학급 재분석으로 갱신할 수 있어요.</p>':''}
   </div>`:''}
  </section>`;
 }
 function lessonAnswer(state,v,priority){
  const example=priority.candidates[0];
  if(!example)return '';
  const {s,e}=v.all.find(row=>row.s.sessionId===example.sessionId);
  const input=String(I.finalSubmission(state.data,s).target?.input||s.finalAnswer||'');
  const elements=example.element==='W3/WB'?['W3','WB']:[example.element];
  const quote=elements.map(key=>e.analysis?.checks?.[key]?.quote).find(value=>typeof value==='string'&&value.trim()&&input.includes(value));
  const position=quote?input.indexOf(quote):-1;
  const excerpt=position<0?esc(input):esc(input.slice(0,position))+'<mark>'+esc(quote)+'</mark>'+esc(input.slice(position+quote.length));
  return `<section class="focus-examples" aria-labelledby="lessonAnswerTitle"><header><h2 class="dashboard-section-title" id="lessonAnswerTitle">수업에 활용할 답안</h2></header>
   <article class="lesson-answer"><h3>${esc(example.studentNo)}번 학생의 최종 답안</h3><blockquote>${excerpt}</blockquote><button class="dashboard-link" data-student="${esc(example.studentNo)}" data-session="${esc(example.sessionId)}" data-element="${esc(example.element)}">답안과 판정 근거 보기 ↗</button></article></section>`;
 }
 function studentRecords(v,state){
  const p=v.pagination;
  return `<section class="student-records" aria-labelledby="studentRecordsTitle"><header><div><h2 class="dashboard-section-title" id="studentRecordsTitle">학생별 답안</h2><p>${v.total}명 참여 · ${v.written}명 최종 답안 · ${v.pending}명 작성 중</p></div><div class="matrix-toolbar"><input id="recordSearch" type="search" value="${esc(state.query)}" placeholder="출석번호 검색" aria-label="출석번호 검색"><select id="recordFilter" aria-label="작성 상태"><option value="all">전체 기록</option><option value="written" ${state.filter==='written'?'selected':''}>답안 작성</option><option value="pending" ${state.filter==='pending'?'selected':''}>작성 전</option></select><select id="playMode" aria-label="기록 기준"><option value="latest">최근 판</option><option value="first" ${state.mode==='first'?'selected':''}>처음 한 판</option></select></div></header>
   <ul>${p.rows.map(({s,e})=>{
    const answer=e.written?I.finalSubmission(state.data,s).target?.input:s.draftAnswer||s.firstAnswer;
    const label=e.written?'제출 답안':s.draftAnswer?'작성 중인 답안':'처음 생각';
    const preview=String(answer||'').replace(/\s+/g,' ').trim();
    return `<li><strong>${esc(M.number(s))}번</strong><span class="student-record-status">${e.written?'최종 답안 작성':esc(state.status?.(s)||'작성 전')}${e.written?statusBadge(state.data,s):''}</span>
      <span class="student-answer-preview">${preview?`<small>${label}</small><span>${esc(preview.slice(0,160))}${preview.length>160?'…':''}</span>`:'저장된 답안 없음'}</span>
      <button class="dashboard-link" data-student="${esc(M.number(s))}" data-session="${esc(s.sessionId)}" aria-label="${esc(M.number(s))}번 학생 기록 보기">기록 보기 ↗</button></li>`;
   }).join('')||'<li class="focus-empty">표시할 학생 기록이 없습니다.</li>'}</ul>
   <div class="matrix-pagination"><span>${p.start}–${p.end} / ${p.total}명</span><div><button id="matrixPrev" data-page="${p.index-1}" ${p.index===0?'disabled':''} aria-label="이전 페이지">←</button><span>${p.index+1} / ${p.pages}</span><button id="matrixNext" data-page="${p.index+1}" ${p.index+1>=p.pages?'disabled':''} aria-label="다음 페이지">→</button></div></div></section>`;
 }
 function progressTable(v,state){
  const steps=I.progressSteps[state.mission],p=v.pagination;
  const labels={met:'인정',revise:'보완',alternate:'대체 설명으로 충족',unknown:'미판정'};
  return `<section class="student-records progress-panel" aria-labelledby="studentProgressTitle">
   <header><h2 class="dashboard-section-title" id="studentProgressTitle">게임 진행 현황</h2>
    <div class="matrix-toolbar"><input id="recordSearch" type="search" value="${esc(state.query)}" placeholder="출석번호 검색" aria-label="출석번호 검색">
    <select id="playMode" aria-label="기록 기준"><option value="latest">최근 판</option><option value="first" ${state.mode==='first'?'selected':''}>처음 한 판</option></select></div></header>
   <div class="progress-scroll" tabindex="0" role="region" aria-label="게임 단계별 진행 표"><table class="progress-table">
    <thead><tr><th scope="col">출석번호</th>${steps.map(([,label],index)=>`<th scope="col"><small>${index+1}</small>${label}</th>`).join('')}<th scope="col">판정 결과${info('판정 결과','초록은 인정, 주황은 보완, 파랑은 대체 설명으로 충족, 회색은 미판정입니다. 비율은 대체 설명 항목을 제외한 전체 항목 중 인정이 확인된 비율입니다.')}</th></tr></thead>
    <tbody>${p.rows.map(({s,e})=>{
     const no=M.number(s),{reached,judgment,evaluationEnds,elements,percent,met,relevant}=I.studentProgress(state.data,s,e,state.mission);
     const progress=steps.map((_,index)=>{
      if(e.written&&index===steps.length-1)return '<td><span class="step-done">제출</span></td>';
      if(index<reached)return '<td><span class="step-done" aria-label="지난 단계">✓</span></td>';
      if(index===reached)return '<td><span class="step-current">최근 단계</span></td>';
      return '<td><span class="step-empty" aria-label="기록 없음">—</span></td>';
     }).join('');
     const result=elements.length?`<a class="progress-result" href="#student-answer-${no}" data-analysis-student="${no}" aria-label="${no}번 답안 분석, 인정 비율 ${percent}%, 대상 ${relevant}개 중 ${met}개 인정">
       <span class="result-swatches" aria-hidden="true">${elements.map(item=>`<span class="result-square result-${item.state}" title="${esc(item.label+' · '+labels[item.state])}"></span>`).join('')}</span>
       <strong>${percent}%</strong><span class="result-arrow" aria-hidden="true">↗</span></a>`:
      !e.written?'<span class="step-empty">제출 전</span>':evaluationEnds?`<span class="evaluation-running" data-evaluation-ends="${evaluationEnds}"><span class="evaluation-spinner" aria-hidden="true"></span>AI 판정 중</span>`:
      `<span class="judgment-status status-${judgment.code==='completed'?'missing':judgment.code}">${esc(judgment.code==='pending'?'판정 응답 미확인':judgment.code==='completed'?'판정 항목 미기록':judgment.label)}</span>`;
     return `<tr><th scope="row">${no}번</th>${progress}<td>${result}</td></tr>`;
    }).join('')||`<tr><td colspan="${steps.length+2}" class="focus-empty">${state.loading?'게임 기록을 불러오는 중입니다.':'표시할 학생 기록이 없습니다.'}</td></tr>`}</tbody>
   </table></div>
   <div class="matrix-pagination"><span>${p.start}–${p.end} / ${p.total}명</span><div><button id="matrixPrev" data-page="${p.index-1}" ${p.index===0?'disabled':''} aria-label="이전 페이지">←</button><span>${p.index+1} / ${p.pages}</span><button id="matrixNext" data-page="${p.index+1}" ${p.index+1>=p.pages?'disabled':''} aria-label="다음 페이지">→</button></div></div></section>`;
 }
 function screen(state){
  const v=model(state),view=state.view||'analysis',student=state.selectedClass;
  let body;
  if(view==='analysis')body=student?matrix(v,state):`${metrics(v,false,state.loading)}<div class="dashboard-analysis-grid">${matrix(v,state)}${classInsights(v)}</div>`;
  else if(!student)body=classPicker(v,state);
  else if(view==='progress')body=metrics(v,true,state.loading)+progressTable(v,state);
  else{
   const priority=I.lessonPriority(state.data,state.data?.reps||[],state.mission,v.current,'',v.all);
   body=`<div class="lesson-prep">${lessonHome(v,state,priority)}${lessonAnswer(state,v,priority)}${studentRecords(v,state)}</div>`;
  }
  return `<div class="dashboard-screen dashboard-task-screen ${view==='analysis'?'dashboard-analysis-screen':''}" id="dashboardResults" role="tabpanel" aria-labelledby="game-${state.mission}"><div class="dashboard-task-header">${gameTabs(state.mission)}${tasks({...state,view})}</div>${body}</div>`;
 }
 root.TeacherDashboardUI={games,pageRows,model,sidebar,gameTabs,screen};
})(typeof window==='undefined'?globalThis:window);
