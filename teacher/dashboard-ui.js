(function(root){
 'use strict';
 const M=root.TeacherModel,I=root.TeacherInsights,U=root.TeacherOverviewUI;
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const games={m01:{name:'감자 삼투',topic:'농도 차이와 물의 이동',asset:'intro/potato-silhouette.webp'},m02:{name:'강철솜 질량 보존',topic:'두 설명 경로 중 하나로 통과 · 항목별 참고 결과',asset:'intro/steel-wool-silhouette.webp'}};
 const labelFor=(mission,id)=>I.definitions[mission].find(([key])=>key===id)?.[1]||id;
 const elementInfo=(mission,id)=>info(labelFor(mission,id),I.descriptions[mission][id]);
 function info(label,description){return `<button type="button" class="term-info" data-info-text="${esc(description)}" aria-label="${esc(label)} 설명" aria-expanded="false" aria-haspopup="dialog">ⓘ</button>`}
 const criteriaOptions=(keys,current)=>keys.length?keys.map(k=>`<option value="${esc(k.key)}" ${k.key===current?'selected':''}>${esc(k.label)}</option>`).join(''):'<option>판정 기록 없음</option>';
 function pageRows(rows,page=0,size=8){const pages=Math.max(1,Math.ceil(rows.length/size)),index=Math.min(Math.max(0,page),pages-1);return {rows:rows.slice(index*size,(index+1)*size),index,pages,total:rows.length,start:rows.length?index*size+1:0,end:Math.min(rows.length,(index+1)*size)}}
 function model({portfolio,data,selectedClass,mission='m01',grade='',tests=false,criterion='',query='',filter='all',page=0,pageSize=8}){
  const classes=(portfolio?.classes||[]).filter(c=>c.isTest===tests&&(!grade||String(c.grade)===grade));
  const all=selectedClass?(data?.reps||[]).map(s=>({s,e:I.evaluation(data,s)})):classes.map(c=>({c,g:c.games[mission]}));
  const keys=[...new Map((selectedClass?I.criteria(data,data?.reps||[]):classes.flatMap(c=>c.games[mission].evaluations)).map(k=>[k.key,{key:k.key,label:k.label}])).values()].sort((a,b)=>Number(!a.key.startsWith('m02-docx'))-Number(!b.key.startsWith('m02-docx'))||b.key.localeCompare(a.key,'ko',{numeric:true}));
  const current=keys.some(k=>k.key===criterion)?criterion:keys[0]?.key||'';
  const total=selectedClass?all.length:all.reduce((n,r)=>n+r.g.participants,0),written=selectedClass?all.filter(r=>r.e.written).length:all.reduce((n,r)=>n+r.g.written,0),judged=selectedClass?all.filter(r=>r.e.has).length:all.reduce((n,r)=>n+r.g.judged,0);
  const needle=query.trim().toLowerCase();
  const rows=all.filter(r=>{const wrote=selectedClass?r.e.written:r.g.written>0,pending=selectedClass?!r.e.written:r.g.pending>0;return (!needle||(selectedClass?M.number(r.s)+'번':r.c.label).toLowerCase().includes(needle))&&(filter==='all'||filter==='written'&&wrote||filter==='pending'&&pending)});
  const studentCells=selectedClass?I.aggregate(data,data?.reps||[],mission,current).cells:null;
  const cells=I.definitions[mission].map(([key,label],i)=>{
   if(selectedClass)return studentCells[i];
   const source=all.map(r=>r.g.evaluations.find(e=>e.key===current)?.cells[i]).filter(Boolean),met=source.reduce((n,c)=>n+c.met,0),revise=source.reduce((n,c)=>n+c.revise,0);
   return {key,label,met,revise,assessed:met+revise,rate:met+revise?Math.round(100*met/(met+revise)):null};
  });
  return {classes,all,rows,keys,current,total,written,pending:total-written,judged,cells,pagination:pageRows(rows,page,pageSize)};
 }
 function sidebar({portfolio,selectedClass,mission,grade,tests}){
  const rows=(portfolio?.classes||[]).filter(c=>c.isTest===tests&&(!grade||String(c.grade)===grade));
  return `<button class="scope-all ${!selectedClass?'active':''}" data-all-classes ${!selectedClass?'aria-current="page"':''}><span>▦</span> 전체 학급 <small>${rows.length}</small></button><div class="sidebar-section-title"><b>담당 학급</b><label><span class="sr-only">학년 필터</span><select id="overviewGrade"><option value="">모든 학년</option>${['1','2','3'].map(g=>`<option value="${g}" ${grade===g?'selected':''}>${g}학년</option>`).join('')}</select></label></div><div class="sidebar-class-list">${rows.map(c=>`<button class="scope-class ${selectedClass?.classKey===c.classKey&&selectedClass?.isTest===c.isTest?'active':''}" data-class-key="${esc(c.classKey)}" data-class-test="${c.isTest}" ${selectedClass?.classKey===c.classKey&&selectedClass?.isTest===c.isTest?'aria-current="page"':''}><span>${esc(c.label)}</span><small>${c.games[mission].participants}명</small></button>`).join('')||'<p class="sidebar-empty">아직 기록된 반이 없습니다.</p>'}</div><label class="sidebar-tests"><input id="overviewTests" type="checkbox" ${tests?'checked':''}>테스트 기록</label>`;
 }
 function gameTabs(mission){return `<div class="dashboard-gamebar"><div class="game-tabs" role="tablist" aria-label="게임 선택">${Object.entries(games).map(([id,g])=>`<button role="tab" data-switch-game="${id}" id="game-${id}" aria-selected="${id===mission}" aria-controls="dashboardResults" tabindex="${id===mission?0:-1}"><img src="${g.asset}" alt="">${g.name}</button>`).join('')}</div><span class="game-topic">${games[mission].topic}</span></div>`}
 function metrics(v,selectedClass,loading=false){return `<section class="dashboard-metrics" aria-label="핵심 수업 지표">${[[selectedClass?'참여 학생':'참여 학생 합계',v.total,'플레이 시작 기준'],['최종 답안',v.written,v.total?Math.round(v.written/v.total*100)+'% 작성':'작성 기록 없음'],['작성 전',v.pending,'아직 최종 답안 없음'],['자동 판정',v.judged,'판정이 저장된 답안']].map(([label,count,detail],i)=>`<article class="metric metric-${i}"><span>${label}</span><div><strong>${loading&&v.total===0?'—':count}</strong><small>${detail}</small></div></article>`).join('')}</section>`}
 function classCell(c,g,evaluation,index,mission,criterion){const [id,label]=I.definitions[mission][index],cell=evaluation?.cells[index],rate=cell?.rate??null;return `<td><button class="matrix-cell ${rate===null?'missing':rate>=80?'high':rate>=40?'mid':'low'}" data-class-key="${esc(c.classKey)}" data-class-test="${c.isTest}" data-open-game="${mission}" data-criterion="${esc(criterion)}" aria-label="${esc(c.label+' '+label+' '+(rate===null?'판정 없음':rate+'% · '+cell.met+'/'+cell.assessed)+' · 반 분석 보기')}"><b>${rate===null?'—':rate+'%'}</b>${rate===null?'':`<small>${cell.met}/${cell.assessed}</small>`}</button></td>`}
 function studentCell(r,id,label,current){const matches=r.e.key===current&&r.e.has,state=matches?I.element(r.e.judgment,id):'unknown',word={met:'인정',revise:'보완',unknown:'—'}[state];return `<td><button class="matrix-cell ${state==='met'?'high':state==='revise'?'low':'missing'}" data-student="${M.number(r.s)}" data-session="${esc(r.s.sessionId)}" data-element="${id}" aria-label="${esc(M.number(r.s)+'번 '+label+' '+(state==='unknown'?'판정 없음':word)+' · 판정 근거 보기')}"><span class="cell-dot" aria-hidden="true">${state==='met'?'●':state==='revise'?'◐':'—'}</span><b>${word}</b></button></td>`}
 function statusBadge(data,s){const value=I.judgmentStatus(data,s);return `<span class="judgment-status status-${value.code}">${esc(value.label)}</span>`}
 function matrix(v,state){const {mission,selectedClass,query='',filter='all',mode='latest',loading,error}=state,student=Boolean(selectedClass),p=v.pagination;
  return `<section class="matrix-panel" aria-labelledby="matrixTitle"><header class="matrix-panel-heading"><div><h2 id="matrixTitle">${student?'학생별 설명 요소':'학급별 설명 요소'}</h2><span>${student?'칸을 눌러 학생의 판정 근거 확인':'반을 눌러 학생별 결과 확인'}</span></div><label class="criterion-picker"><span>판정 기준</span><select aria-label="판정 기준" id="${student?'detailCriterion':'overviewCriterion'}" ${!v.keys.length?'disabled':''}>${criteriaOptions(v.keys,v.current)}</select></label></header><div class="matrix-toolbar"><label class="record-search"><span aria-hidden="true">⌕</span><input id="recordSearch" type="search" value="${esc(query)}" placeholder="${student?'출석번호 검색':'학급 검색'}" aria-label="${student?'출석번호 검색':'학급 검색'}"></label><label class="sr-only" for="recordFilter">작성 상태</label><select id="recordFilter"><option value="all" ${filter==='all'?'selected':''}>전체 기록</option><option value="written" ${filter==='written'?'selected':''}>답안 작성</option><option value="pending" ${filter==='pending'?'selected':''}>작성 전</option></select>${student?`<label class="sr-only" for="playMode">기록 기준</label><select id="playMode"><option value="latest" ${mode==='latest'?'selected':''}>최근 판</option><option value="first" ${mode==='first'?'selected':''}>처음 한 판</option></select>`:`<span class="scope-count">${v.classes.length}개 반</span>`}</div>
  <div id="matrixViewport" class="matrix-viewport" tabindex="0" role="region" aria-label="${student?'학생별':'학급별'} 성취 표"><table class="dashboard-matrix"><caption class="sr-only">${games[mission].name} · ${student?'학생별':'학급별'} 설명 요소. —는 판정 미기록입니다.</caption><thead><tr><th scope="col">${student?'출석번호':'학급'}${student?info('출석번호','게임 시작 화면에 입력한 출석번호입니다. 같은 번호의 판은 선택한 기록 기준에 따라 표시합니다.'):info('학급','게임 시작 화면에 입력한 학년과 반입니다. 반을 누르면 학생별 결과를 볼 수 있습니다.')}</th><th scope="col">${student?'최종 답안':'답안 / 참여'}${student?info('최종 답안','학생이 게임에서 마지막 답안을 제출했는지 보여 줍니다.'):info('답안 / 참여','최종 답안을 작성한 학생 수를 게임을 시작한 학생 수와 함께 표시합니다.')}</th>${I.definitions[mission].map(([id,label])=>`<th scope="col" title="${esc(label+' ('+id+')')}">${esc(label)}${elementInfo(mission,id)}<small class="rubric-code">(${esc(id)})</small></th>`).join('')}${student?`<th scope="col">AI 판정${info('AI 판정','저장된 최종 답안의 자동 판정 상태입니다. 판정 완료·대기·실패·불가·기록 없음은 실제 저장 기록으로 구분합니다.')}</th><th scope="col">기록 보기${info('기록 보기','학생의 답안 원문과 단계별 대화 기록을 엽니다.')}</th>`:''}</tr></thead><tbody>${p.rows.map(r=>student?`<tr><th scope="row"><b>${M.number(r.s)}번</b></th><td><span class="submission-status ${r.e.written?'written':''}">${r.e.written?'작성':'작성 전'}</span></td>${I.definitions[mission].map(([id,label])=>studentCell(r,id,label,v.current)).join('')}<td>${statusBadge(state.data,r.s)}</td><td><button class="matrix-read" data-student="${M.number(r.s)}" data-session="${esc(r.s.sessionId)}" aria-label="${M.number(r.s)}번 답안과 단계별 대화 보기">답안 ↗</button></td></tr>`:`<tr><th scope="row"><button class="matrix-class" data-class-key="${esc(r.c.classKey)}" data-class-test="${r.c.isTest}">${esc(r.c.label)} <span>↗</span></button></th><td><b class="submission-number">${r.g.written}<small> / ${r.g.participants}</small></b></td>${I.definitions[mission].map((_,i)=>classCell(r.c,r.g,r.g.evaluations.find(e=>e.key===v.current),i,mission,v.current)).join('')}</tr>`).join('')||`<tr class="matrix-empty"><td colspan="${I.definitions[mission].length+(student?4:2)}"><strong>${loading?'기록을 불러오는 중':error?'시트 연결을 확인해 주세요':query||filter!=='all'?'조건에 맞는 기록이 없습니다':'아직 참여 기록이 없습니다'}</strong><p>${loading?'잠시만 기다려 주세요.':error?'상단 새로고침으로 다시 확인할 수 있습니다.':'다른 게임이나 학급을 선택해 보세요.'}</p></td></tr>`}</tbody></table></div>
  <div class="matrix-pagination"><span>${p.start}–${p.end} / ${p.total}${student?'명':'개 반'}</span><div><button id="matrixPrev" data-page="${p.index-1}" ${p.index===0?'disabled':''} aria-label="이전 페이지">←</button><span>${p.index+1} / ${p.pages}</span><button id="matrixNext" data-page="${p.index+1}" ${p.index+1>=p.pages?'disabled':''} aria-label="다음 페이지">→</button></div></div><footer class="matrix-legend"><span><i class="high"></i> 인정${student?'':' 비율'}</span><span><i class="low"></i> 보완</span><span><i class="missing"></i> — 판정 없음</span><details class="matrix-help"><summary>판정 안내 ⓘ</summary><p>항목마다 판정이 있는 답안만 분모로 셉니다. 미작성·미기록은 0점이 아닙니다. 서로 다른 평가 버전은 분리합니다. ${mission==='m02'?'강철솜은 두 설명 경로 중 하나로 통과할 수 있어 모든 항목의 인정이 필수는 아닙니다.':''}</p></details></footer></section>`;
 }
 function evidenceBars(v){const cells=v.cells.filter(c=>c.assessed).slice().sort((a,b)=>a.rate-b.rate).slice(0,3);return `<section class="insight-block"><header><h3>요소별 인정 현황</h3><span>인정 / 판정 답안</span></header><div class="element-bars">${cells.map(c=>`<div><span>${esc(c.label)}</span><b>${c.met} / ${c.assessed}</b><i><em style="width:${c.rate??0}%"></em></i></div>`).join('')||'<p class="no-assessment">아직 판정 기록이 없습니다.</p>'}</div></section>`}

 function reportCard({selectedClass,report,busy,error,available,source,aiMode}){
  const result=report?.analysis?.result;
  if(!selectedClass)return '';
  return `<section class="dashboard-teaching"><div class="insight-eyebrow"><span>✦ 수업 요약</span><small>AI · 저장된 분석</small></div>${result?`<h3>${esc(result.headline)}</h3><p class="teaching-focus">${esc(result.teachingFocus)}</p>`:`<h3>우리 반 결과로<br>다음 수업 준비하기</h3><p>${source==='sheet'?'답안의 경향과 함께 물어볼 질문을 요약합니다.':'예시 자료를 확인 중입니다. 실제 시트에서 수업 요약을 만들 수 있습니다.'}</p>`}${error?`<p class="dashboard-ai-error" role="alert">${esc(error)}</p>`:''}<div class="teaching-actions">${result?'<button class="dashboard-link" data-open-report>상세 리포트 ↗</button>':''}<button class="dashboard-generate" data-ai-generate ${busy||!available?'disabled':''}>${busy?'요약 생성 중…':result?'↻ 재생성':'✦ 수업 요약 생성'}</button></div><small class="manual-ai-note">${aiMode==='first'?'처음 한 판':'최근 판'} 기준 · 수동 갱신</small></section>`;
 }
 function noteSummary(data,mission){
  const rows=data?.reps||[],notes={none:0,one:0,two:0,unknown:0,legacy:0,opened:0};
  for(const s of rows){const n=M.noteUsage(data,s);if(n.kind==='legacy'){notes.legacy++;if(n.label==='열람')notes.opened++}else notes[n.pages===0?'none':n.pages===1?'one':n.pages===2?'two':'unknown']++}
  return `<section class="insight-block note-summary"><header><h3>${mission==='m02'?'교수 노트 열람':'힌트 열람 기록'}</h3></header>${mission==='m02'?`<div class="note-tiles"><div><b>${notes.none}</b><span>미열람</span></div><div><b>${notes.one}</b><span>1쪽</span></div><div><b>${notes.two}</b><span>2쪽까지</span></div></div><p>쪽수 미기록 ${notes.unknown} · 이전 방식 ${notes.legacy}</p>`:`<div class="note-tiles"><div><b>${notes.opened}</b><span>열람 확인</span></div><div><b>${rows.length-notes.opened}</b><span>열람 미기록</span></div></div>`}</section>`;
 }
 function insights(v,state){return `<aside class="dashboard-insights" aria-label="${state.selectedClass?'우리 반 수업 요약':'전체 학급 요약'}">${state.selectedClass?reportCard({...state,error:state.aiError}):`<section class="insight-block overview-progress"><header><h3>반별 답안 현황</h3><span>${v.written} / ${v.total}명</span></header><div class="class-progress-list">${v.all.map(r=>`<button data-class-key="${esc(r.c.classKey)}" data-class-test="${r.c.isTest}"><span>${esc(r.c.label)}</span><b>${r.g.written}<small> / ${r.g.participants}</small></b><i><em style="width:${r.g.participants?100*r.g.written/r.g.participants:0}%"></em></i></button>`).join('')||'<p>학급 기록이 없습니다.</p>'}</div></section>`}${state.selectedClass?noteSummary(state.data,state.mission):evidenceBars(v)}</aside>`}
 function lessonPriority(v,state){
  if(!state.selectedClass)return '';
  const priority=I.lessonPriority(state.data,state.data?.reps||[],state.mission,v.current,state.focusElement),result=state.report?.analysis?.result,question=Array.isArray(result?.questions)?result.questions.find(q=>typeof q?.question==='string'&&q.question.trim())?.question:'',smallSample=priority.missing.length&&priority.missing.some(c=>c.assessed<5)?' 판정 답안이 적어 반 전체 경향으로 해석하지 마세요.':'';
  const missing=priority.missing.length?`<ol>${priority.missing.map(c=>`<li><button class="priority-element ${priority.focus?.key===c.key?'selected':''}" data-focus-element="${esc(c.key)}" aria-pressed="${priority.focus?.key===c.key}"><b>${esc(labelFor(state.mission,c.key))}</b><span>${c.revise} / ${c.assessed}명 미인정</span></button>${elementInfo(state.mission,c.key)}</li>`).join('')}</ol>`:'<p>같은 판정 기준으로 판정된 답안이 없어 공통 누락 요소를 계산할 수 없습니다.</p>';
  const candidates=priority.candidates.length?`<div class="priority-candidates">${priority.candidates.map((c,i)=>`<button data-student="${esc(c.studentNo)}" data-session="${esc(c.sessionId)}" data-element="${esc(c.element)}">답안 후보 ${i+1} · 원문과 판정 근거 보기 ↗ <small>${c.quote&&c.reason?'일치하는 인용문·판정 이유 기록':c.quote?'일치하는 인용문 기록':c.reason?'판정 이유 기록':'원문·항목 판정 기록'}</small></button>`).join('')}</div>`:'<p>선택한 설명 요소에 미인정 판정과 원문이 함께 저장된 후보가 없습니다.</p>';
  const questionCard=question?`<p class="priority-question">${esc(question)}</p><button data-open-report>저장된 수업 리포트 보기 ↗</button><small>${state.report?.basis?.mode==='first'?'처음 판':'최근 판'} 기준으로 저장된 질문입니다.</small>`:`<p>저장된 수업 질문이 없습니다.</p>${state.available?`<button data-ai-generate ${state.busy?'disabled':''}>${state.busy?'요약 생성 중…':'수업 요약·질문 생성 →'}</button>`:'<small>시트 기록이 연결되면 생성 버튼으로 수업 질문을 만들 수 있습니다.</small>'}`;
  return `<section class="lesson-priority" aria-label="다음 수업 활용 정보"><article><h2>가장 많이 누락된 설명 요소</h2>${missing}<small>지도할 요소를 선택하세요. 선택한 판정 기준의 해당 요소 판정만 분모로 셉니다. 미제출·미판정·판정 불가는 제외합니다.${smallSample}</small></article><article><h2>수업에서 함께 살펴볼 답안 후보</h2>${priority.focus?`<p class="priority-focus">${esc(labelFor(state.mission,priority.focus.key))} · 미인정 판정 기록</p>`:''}${candidates}<small>저장된 근거가 있는 후보를 먼저 보여 줍니다. 교사가 원문과 판정 근거를 확인해 활용 여부를 결정하세요. 학생 능력 평가나 확정된 모범 답안이 아닙니다.</small></article><article><h2>다음 수업에 사용할 질문</h2>${questionCard}</article></section>`;
 }
 function playComparison(v,state){
  if(!state.selectedClass)return '';
  const result=I.comparePlays(state.data,state.mission,v.current,state.selectedClass.classKey,Boolean(state.selectedClass.isTest)),excluded=x=>[['singlePlay','1회 참여'],['missingJudgment','양쪽 판정 부족'],['unknownVersion','버전 미기록'],['differentVersion','기준·버전 다름']].filter(([key])=>x[key]).map(([key,label])=>`${label} ${x[key]}명`).join(' · ')||'제외 없음';
  return `<section class="play-comparison" aria-labelledby="comparisonTitle"><header><h2 id="comparisonTitle">처음 판·최근 판의 판정 변화</h2><p id="comparisonHelp">같은 반·같은 학생의 첫 판과 최근 판을 연결했습니다. 선택한 판정 기준과 관련 버전이 같고, 양쪽에 해당 요소 판정이 있는 학생만 비교합니다. 관찰된 자동 판정 결과의 변화이며 성취도나 학습 효과의 검증이 아닙니다.</p></header><div class="comparison-scroll"><table aria-describedby="comparisonHelp"><thead><tr><th scope="col">설명 요소</th><th scope="col">첫 판 인정${info('첫 판 인정','같은 반·학생의 가장 이른 플레이에서 해당 설명 요소가 인정된 학생 수입니다. 비교 가능한 학생만 셉니다.')}</th><th scope="col">최근 판 인정${info('최근 판 인정','같은 반·학생의 가장 최근 플레이에서 해당 설명 요소가 인정된 학생 수입니다. 비교 가능한 학생만 셉니다.')}</th><th scope="col">변화${info('변화','비교 가능한 학생의 최근 판 인정 인원에서 첫 판 인정 인원을 뺀 값입니다. 관찰된 자동 판정 결과의 변화입니다.')}</th><th scope="col">비교 인원${info('비교 인원','같은 반·학생의 첫 판과 최근 판에 해당 요소 판정이 모두 있고 판정 기준·버전이 호환되는 학생 수입니다.')}</th><th scope="col">제외 이유${info('제외 이유','1회 참여, 양쪽 판정 부족, 버전 미기록, 기준·버전 불일치로 비교에서 제외된 학생 수입니다.')}</th></tr></thead><tbody>${result.cells.map(c=>`<tr><th scope="row">${esc(c.label)}</th><td>${c.comparable?`${c.firstMet}/${c.comparable}명`:'—'}</td><td>${c.comparable?`${c.latestMet}/${c.comparable}명`:'—'}</td><td class="${c.comparable?'comparison-delta':''}">${c.comparable?`${c.delta>0?'+':''}${c.delta}명`:'비교 불가'}</td><td>${c.comparable}명</td><td class="comparison-excluded">${excluded(c.excluded)}</td></tr>`).join('')}</tbody></table></div><p class="comparison-note">1회 참여는 처음·최근 판에 중복 반영하지 않습니다. 변화 0명은 비교 가능한 기록에서 인정 인원이 같은 경우입니다. —는 비교할 기록이 없다는 뜻입니다.</p></section>`;
 }
 function tasks(state){
  const options=state.selectedClass?[['overview','수업 준비'],['analysis','학생 기록']]:[['overview','학급 목록'],['analysis','학급별 성취도']];
  return `<nav class="dashboard-tasks" aria-label="대시보드 보기">${options.map(([id,label])=>`<button type="button" id="task-${id}" data-task="${id}" aria-current="${state.view===id?'page':'false'}">${label}</button>`).join('')}</nav>`;
 }
 function classPicker(v,state){
  return `<section class="class-picker" aria-labelledby="classPickerTitle">
    <header><div><h2 id="classPickerTitle">어느 반을 살펴볼까요?</h2><p>참여 인원과 최종 답안 수를 보고 학급을 선택하세요.</p></div><span>${v.classes.length}개 학급</span></header>
    <div class="class-picker-list">${v.all.map(({c,g})=>`<button type="button" data-class-key="${esc(c.classKey)}" data-class-test="${c.isTest}">
      <strong>${esc(c.label)}</strong><span>${g.participants?'<b>'+g.written+' / '+g.participants+'명</b> 최종 답안 / 참여':'이 게임의 기록 없음'}</span>
      <progress value="${g.written}" max="${g.participants||1}" aria-label="${esc(c.label)} 최종 답안 작성 인원"></progress><i aria-hidden="true">→</i>
    </button>`).join('')||`<p class="focus-empty">${state.loading?'학급 기록을 불러오는 중입니다.':state.error?'시트 연결을 확인해 주세요.':'아직 기록된 학급이 없습니다.'}</p>`}</div></section>`;
 }
 function lessonHome(v,state,priority){
  const {focus,candidates}=priority,report=state.report?.analysis?.result;
  const title=report?.headline||(focus?labelFor(state.mission,focus.key):state.loading?'학급 기록을 불러오는 중입니다.':v.written?'저장된 학생 답안부터 살펴보세요.':'아직 제출된 답안이 없어요.');
  const detail=report?.teachingFocus||(focus?I.descriptions[state.mission][focus.key]:'아래에서 학생별 진행과 저장된 답안을 확인할 수 있어요.');
  const question=Array.isArray(report?.questions)?report.questions.find(item=>typeof item?.question==='string'&&item.question.trim())?.question:'';
  return `<section class="lesson-home" aria-labelledby="lessonHomeTitle">
   <div class="lesson-home-copy"><p class="focus-kicker">${report?'저장된 수업 요약':'이번 수업에서 함께 확인할 점'}</p>
   <h2 id="lessonHomeTitle">${esc(title)}</h2>
   <p class="focus-detail">${esc(detail)}</p>
   ${!report&&focus?`<p class="focus-evidence">이 항목을 판정한 글 <b>${focus.assessed}개 중 ${focus.revise}개</b>에서 설명을 확인하지 못했어요.${focus.assessed<5?' 소수의 글에서 나온 결과예요.':''}</p>`:''}
   ${question?`<p class="lesson-question"><b>수업에서 물어볼 질문</b> ${esc(question)}</p>`:''}
   ${state.reportStale?'<p class="focus-freshness">요약을 만든 뒤 새 기록이 들어왔어요.</p>':''}
   ${state.aiError?`<p class="dashboard-ai-error" role="alert">${esc(state.aiError)}</p>`:''}
   <div class="focus-actions">${candidates.length?'<button class="button" data-show-answers>학생 글 비교하기 ↓</button>':''}${report?'<button class="button secondary" data-open-report>상세 리포트와 수업 자료</button>':''}
   ${state.available||state.busy?`<button class="dashboard-generate ${candidates.length||report?'focus-secondary':''}" data-ai-generate ${state.busy?'disabled':''}>${state.busy?'수업 요약 생성 중…':report?'요약 재생성':'수업 요약 만들기'}</button>`:''}</div></div>
   <div class="lesson-participation"><img src="${games[state.mission].asset}" alt=""><div><strong>${v.written}<small> / ${v.total}명</small></strong><span>최종 답안 / 참여</span><progress value="${v.written}" max="${v.total||1}" aria-label="학급 최종 답안 작성 인원"></progress></div></div>
  </section>`;
 }
 function answerComparison(state,v,priority){
  const first=priority.candidates[0],focus=priority.focus;
  const alternative=first&&v.all.find(({s,e})=>M.number(s)!==first.studentNo&&e.key===v.current&&I.element(e.judgment,focus.key)==='met'&&I.finalSubmission(state.data,s).target)?.s;
  const examples=first?[{...first,label:'설명을 함께 점검할 글'},alternative?{studentNo:M.number(alternative),sessionId:alternative.sessionId,element:focus.key,label:'같은 요소가 드러난 글'}:priority.candidates[1]&&{...priority.candidates[1],label:'같은 요소를 함께 살펴볼 다른 글'}].filter(Boolean):[];
  return `<section class="focus-examples" aria-labelledby="comparisonHeading"><header><div><h2 id="comparisonHeading" tabindex="-1">수업에서 함께 읽을 학생 답안</h2><p>${examples.length?`같은 판정 기준으로 살펴본 최종 답안이에요. <b>${esc(labelFor(state.mission,focus.key))}</b> 항목을 중심으로 읽어 보세요.`:'같은 판정 기준으로 비교할 수 있는 답안이 아직 없어요. 아래 목록에서 학생별 답안을 열어 볼 수 있어요.'}</p></div></header>
   <div class="focus-example-grid">${examples.map(example=>{
    const {s,e}=v.all.find(row=>row.s.sessionId===example.sessionId);
    const input=String(I.finalSubmission(state.data,s).target?.input||s.finalAnswer||'');
    const elements=example.element==='W3/WB'?['W3','WB']:[example.element];
    const quote=elements.map(key=>e.analysis.checks?.[key]?.quote).find(value=>typeof value==='string'&&value.trim()&&input.includes(value));
    const position=quote?input.indexOf(quote):-1;
    const excerpt=position<0?esc(input):esc(input.slice(0,position))+'<mark>'+esc(quote)+'</mark>'+esc(input.slice(position+quote.length));
    return `<article><p>${esc(example.label)}</p><h3>${esc(example.studentNo)}번 학생의 최종 답안</h3><blockquote>${excerpt}</blockquote><button class="dashboard-link" data-student="${esc(example.studentNo)}" data-session="${esc(example.sessionId)}" data-element="${esc(example.element)}">원문과 판정 근거 보기 ↗</button></article>`;
   }).join('')}${examples.length===1?'<p class="focus-empty">같은 판정 기준으로 비교할 두 번째 글이 아직 없습니다.</p>':''}</div>
   ${examples.length?'<p class="focus-freshness">학생 글에 어떤 설명이 드러나는지 함께 읽고, 그 이유를 물어보세요.</p>':''}</section>`;
 }
 function studentRecords(v,state){
  const p=v.pagination;
  return `<section class="student-records" aria-labelledby="studentRecordsTitle"><header><div><h2 id="studentRecordsTitle">학생별 진행과 답안</h2><p>${v.total}명 참여 · ${v.written}명 최종 답안 · ${v.pending}명 작성 중</p></div><div class="matrix-toolbar"><input id="recordSearch" type="search" value="${esc(state.query)}" placeholder="출석번호 검색" aria-label="출석번호 검색"><select id="recordFilter" aria-label="작성 상태"><option value="all">전체 기록</option><option value="written" ${state.filter==='written'?'selected':''}>답안 작성</option><option value="pending" ${state.filter==='pending'?'selected':''}>작성 전</option></select><select id="playMode" aria-label="기록 기준"><option value="latest">최근 판</option><option value="first" ${state.mode==='first'?'selected':''}>처음 한 판</option></select></div></header>
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
 function screen(state){
  const v=model(state),view=state.view||'analysis',student=state.selectedClass;
  let body;
  if(view==='analysis')body=`${metrics(v,student,state.loading)}${student?`<details class="analysis-details"><summary>수업에서 살펴볼 요소와 처음·최근 판 비교</summary>${lessonPriority(v,state)}${playComparison(v,state)}</details>`:''}<div class="dashboard-analysis-grid">${matrix(v,state)}${insights(v,state)}</div>`;
  else if(!student)body=classPicker(v,state);
  else{
   const priority=I.lessonPriority(state.data,state.data?.reps||[],state.mission,v.current,state.focusElement);
   body=`<div class="lesson-prep">${lessonHome(v,state,priority)}${answerComparison(state,v,priority)}${studentRecords(v,state)}</div>`;
  }
  return `<div class="dashboard-screen dashboard-task-screen ${view==='analysis'?'dashboard-analysis-screen':''}" id="dashboardResults" role="tabpanel" aria-labelledby="game-${state.mission}"><div class="dashboard-task-header">${gameTabs(state.mission)}${tasks({...state,view})}</div>${body}</div>`;
 }
 root.TeacherDashboardUI={games,pageRows,model,sidebar,gameTabs,screen};
})(typeof window==='undefined'?globalThis:window);
