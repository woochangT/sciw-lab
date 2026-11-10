(function (root) {
  const missions = {m01:{name:'감자 삼투',elements:['C','D','W1','W2a','W2b','W3/WB']},m02:{name:'강철솜 질량 보존',elements:['C','D-A','D-B','W1a','W1b','W2a','W2b']}};
  const stages=[['explore','실험 탐색'],['claim','최초 생각'],['rebuttal','반박·추론'],['sort','카드 분류'],['compose','최종 서술']];
  const obj=v=>{if(v&&typeof v==='object')return v;try{return JSON.parse(v||'{}')}catch(_){return {}}};
  const yes=v=>v===true||v==='true'||v==='TRUE';
  const time=v=>Date.parse(v||'')||0;
  const normalize=v=>{const s=String(v??'').trim();return /^\d{1,6}$/.test(s)&&Number(s)>0?String(Number(s)):null};
  const number=s=>{const raw=normalize(s.studentNo),declared=s.studentNoNormalized?normalize(s.studentNoNormalized):raw;return raw&&declared===raw?raw:null};
  const test=s=>yes(s.isTest)||/^(QA_|TEST)/i.test(String(s.classCode||''))||/^(QA_|TEST)/i.test(String(s.studentNo||''))||/^qa_/i.test(String(s.sessionId||''));
  const ordered=ss=>ss.slice().sort((a,b)=>time(a.startedAt)-time(b.startedAt)||String(a.sessionId).localeCompare(String(b.sessionId)));
  function latest(ss){const m=new Map();ordered(ss).forEach(s=>m.set(number(s)||String(s.studentNo),s));return [...m.values()].sort((a,b)=>String(number(a)||a.studentNo).localeCompare(String(number(b)||b.studentNo),'ko',{numeric:true}))}
  function select(db,classCode,missionId,lessonId){const sessions=(Array.isArray(db.sessions)?db.sessions:Object.values(db.sessions||{})).filter(s=>String(s.classCode)===classCode&&String(s.missionId||'m01')===missionId&&(lessonId===undefined||String(s.lessonId||'')===lessonId));const ids=new Set(sessions.map(s=>s.sessionId));return {sessions,attempts:(db.attempts||[]).filter(a=>ids.has(a.sessionId))}}
  function judgmentMethod(s){if(['openai','llm','anthropic'].includes(s.judgedBy))return 'AI 평가';if(s.judgedBy==='keyword'||/^keyword(?:-|$)/.test(s.judgeVersion||''))return '단어 규칙';return '미기록'}
  function element(s,key){const j=obj(s.finalJudgment),q=obj(s.questPassed),keys=key==='W3/WB'?['W3','WB']:[key];if(keys.some(k=>yes(j[k])))return '기록됨';if(keys.some(k=>Object.hasOwn(j,k)))return '자동 판정 미인정';return keys.some(k=>yes(q[k]))?'퀘스트 기록':'미관찰'}
  function compareAttempts(a,b){return (Number(a.eventOrder)>0&&Number(b.eventOrder)>0 ? Number(a.eventOrder)-Number(b.eventOrder) : time(a.clientOccurredAt||a.createdAt)-time(b.clientOccurredAt||b.createdAt))||String(a.attemptId).localeCompare(String(b.attemptId))}
  function attemptsFor(data,id){return data.attemptIndex?(data.attemptIndex.get(id)||[]).slice():data.attempts.filter(a=>a.sessionId===id).sort(compareAttempts)}
  function submissions(data,s){return attemptsFor(data,s.sessionId).filter(a=>a.stage==='compose'&&a.questId==='final'||a.eventCode==='m02.compose.final.submit'||a.stage==='defense'&&a.questId==='FINAL').sort((a,b)=>Number(a.submissionNo)>0&&Number(b.submissionNo)>0?Number(a.submissionNo)-Number(b.submissionNo):0)}
  function legacyHint(data,s){const events=attemptsFor(data,s.sessionId);if(s.hintViewedAt||events.some(a=>a.questId==='hintView'||a.hintExposure==='opened'))return '열람';if(events.some(a=>a.hintExposure==='visible'))return '표시됨';if(s.hintOpenedAt||events.some(a=>a.hintExposure==='unlocked'))return '해제됨';if(events.some(a=>a.hintExposure==='locked'))return '잠김';return '미기록'}
  function noteUsage(data,s){
    const events=attemptsFor(data,s.sessionId),records=[s,...events];
    const pagesMode=(s.missionId||'m01')==='m02'&&records.some(r=>r.hintSchemaVersion==='m02-note-pages-v1'||(typeof r.rubricVersion==='string'&&/^m02-docx-1\.(?:[2-9]|[1-9]\d)\./.test(r.rubricVersion)));
    if(!pagesMode)return {kind:'legacy',pages:null,label:legacyHint(data,s)};
    const values=records.filter(r=>Object.hasOwn(r,'hintLevel')&&['number','string'].includes(typeof r.hintLevel)&&['0','1','2'].includes(String(r.hintLevel))).map(r=>Number(r.hintLevel));
    for(const e of events)if(e.questId==='hintView'&&['1','2'].includes(String(e.choice)))values.push(Number(e.choice));
    const pages=values.length?Math.max(...values):null;
    return {kind:'pages',pages,label:pages===null?'노트 열람 미기록':pages===0?'노트 미열람':pages+'쪽까지 열람'};
  }
  function hint(data,s){const u=noteUsage(data,s);return u.kind==='legacy'?u.label:u.pages===null?'미기록':u.pages>0?'열람':'미열람'}
  function state(s,now=Date.now()){if(s.clearType==='full')return '완료';if(s.clearType==='partial')return '부분 완료';if(s.endedAt||s.endReason&&s.endReason!=='unknown')return '종료';const active=time(s.lastActiveAt);return active&&now-active<30*60000?'진행 중':'종료 미상'}
  function observed(data,s,stage){return s.stage===stage||attemptsFor(data,s.sessionId).some(a=>a.stage===stage||(a.eventCode||'').startsWith((s.missionId||'m02')+'.'+stage+'.'))}
  function evidence(data,s,stage){const as=attemptsFor(data,s.sessionId).filter(a=>a.stage===stage||(a.eventCode||'').startsWith((s.missionId||'m02')+'.'+stage+'.'));if(as.some(a=>a.eventStatus==='opened')&&!as.some(a=>a.input||a.choice||a.eventStatus&&a.eventStatus!=='opened'))return '기회 제시';if(as.length)return '행동 기록';if(s.stage===stage)return '기회 제시';return '미관찰'}
  function analyze(db,classCode,mode='first',options={}){
    const missionId=options.missionId||'m02',codes=options.classCodes||[classCode],allSessions=Array.isArray(db.sessions)?db.sessions:Object.values(db.sessions||{}),scopedSessions=allSessions.filter(s=>codes.includes(String(s.classCode))&&String(s.missionId||'m01')===missionId),scopeIds=new Set(scopedSessions.map(s=>s.sessionId)),scoped={sessions:scopedSessions,attempts:(db.attempts||[]).filter(a=>scopeIds.has(a.sessionId)&&(!a.missionId||a.missionId===missionId)&&(!a.classCode||codes.includes(String(a.classCode))))}, unique=new Map();scoped.sessions.forEach(s=>{if(!test(s)||(options.includeTests&&!/^QA_/i.test(String(s.classCode||''))&&!/^qa_/i.test(String(s.sessionId||''))))unique.set(s.sessionId,s)});
    const review=[...unique.values()].filter(s=>!number(s)), sessions=[...unique.values()].filter(s=>number(s));
    const ids=new Set(sessions.map(s=>s.sessionId)), attempts=[...new Map(scoped.attempts.filter(a=>ids.has(a.sessionId)).map(a=>[a.attemptId,a])).values()];
    const attemptIndex=new Map();
    for(const event of attempts){if(!attemptIndex.has(event.sessionId))attemptIndex.set(event.sessionId,[]);attemptIndex.get(event.sessionId).push(event)}
    for(const group of attemptIndex.values())group.sort(compareAttempts);
    const data={sessions,attempts,attemptIndex},groups=new Map();ordered(sessions).forEach(s=>{const key=number(s);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(s)});
    let reps=[];groups.forEach(ss=>reps.push(...(mode==='all'?ss:[mode==='latest'?ss[ss.length-1]:ss[0]])));
    const range=options.period==='today'?new Date().setHours(0,0,0,0):0;
    reps=reps.filter(s=>(!range||time(s.startedAt)>=range)&&(!options.version||options.version==='all'||s.missionVersion===options.version));
    reps.sort((a,b)=>Number(number(a))-Number(number(b))||time(a.startedAt)-time(b.startedAt));
    const first=[...groups.values()].map(ss=>ss[0]), recent=[...groups.values()].map(ss=>ss[ss.length-1]);
    const hasFinal=s=>Boolean(s.firstFinalSubmittedAt||submissions(data,s).length||s.finalAnswer);
    const N=groups.size,stats={N,submitted:first.filter(hasFinal).length,completed:recent.filter(s=>['완료','부분 완료'].includes(state(s))).length,active:recent.filter(s=>state(s)==='진행 중').length,unknown:recent.filter(s=>state(s)==='종료 미상').length};
    const visibleStages=stages.filter(([key])=>key!=='sort'||attempts.some(a=>a.stage==='sort'));
    const stageCounts=visibleStages.map(([key,label])=>({key,label:key==='sort'?'카드 분류 · 이전 방식':label,count:new Set(reps.filter(s=>observed(data,s,key)).map(number)).size}));
    return {...data,reps,groups,review,first,recent,stats,stageCounts,versions:[...new Set(sessions.map(s=>s.missionVersion||'미기록'))],mode};
  }
  const comparable=(a,b)=>Boolean(a&&b&&a.missionVersion&&a.missionVersion===b.missionVersion&&a.eventSchemaVersion&&a.eventSchemaVersion===b.eventSchemaVersion&&a.judgeVersion&&a.judgeVersion===b.judgeVersion);
  root.TeacherModel={missions,stages,obj,yes,time,normalize,number,test,ordered,latest,select,judgmentMethod,element,attemptsFor,submissions,noteUsage,hint,state,evidence,observed,analyze,comparable};
})(typeof window==='undefined'?globalThis:window);
