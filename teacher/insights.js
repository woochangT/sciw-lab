(function(root){
 'use strict';
 const M=root.TeacherModel,S=root.TeacherScope;
 const definitions={
  m01:[['C','농도 결론'],['D','실험 자료'],['W1','질량과 물 이동'],['W2a','물 이동 방향'],['W2b','안팎 농도 비교'],['W3/WB','농도 범위 연결']],
  m02:[['C','자신의 결론'],['D-A','열린 실험 자료'],['D-B','닫힌 실험 자료'],['W1a','질량 보존 적용'],['W1b','산소 특정 이유'],['W2a','전체 질량 보존'],['W2b','증가분의 의미']]
 };
 const known=v=>v===true||v===false||['true','false','TRUE','FALSE'].includes(v);
 const statusLabels={completed:'판정 완료',pending:'판정 대기',failed:'판정 실패',unavailable:'판정 불가',missing:'판정 기록 없음'};
 function finalSubmission(data,s,events=M.attemptsFor(data,s.sessionId)){
  const final=events.filter(a=>a.stage==='defense'&&a.questId==='FINAL'||a.stage==='compose'&&['final','clarify'].includes(a.questId)||a.eventCode==='m02.compose.final.submit').at(-1);
  const raw=events.filter(a=>a.questId==='studentInput'&&(a.evaluationStage==='final'||a.stage==='defense'||a.questionId==='FINAL')).at(-1);
  const current=raw&&(!final||events.indexOf(raw)>events.indexOf(final))?raw:final;
  const linked=current?.inReplyTo&&events.find(a=>a.attemptId===current.inReplyTo&&a.questId==='studentInput'&&a.input===current.input);
  const input=current?current.input:s.finalAnswer;
  const target=typeof input==='string'&&input.trim()?{id:linked?.attemptId||current?.attemptId||'',input}:null;
  return {final,raw,current,target};
 }
 function activeRejudgment(s,target){
  return target&&s.teacherRejudgment?.attemptId===target.id?s.teacherRejudgment:null;
 }
 function judgmentStatus(data,s){
  const events=M.attemptsFor(data,s.sessionId),{final,raw,current,target}=finalSubmission(data,s,events);
  const rejudgment=activeRejudgment(s,target);
  if(rejudgment)return {code:'completed',label:'재판정 완료',record:rejudgment,errorCode:''};
  // A saved input only proves that the answer was retained, not that a judge accepted it.
  const failure=raw&&current===raw&&events.find(a=>a.questId==='finalEvaluation'&&a.inReplyTo===raw.attemptId&&a.evaluationStatus==='failed');
  const explicit=failure?.evaluationStatus||current?.evaluationStatus||(current?null:s.finalEvaluationStatus);
  const mapped={pending:'pending',processing:'pending',failed:'failed',unavailable:'unavailable'}[explicit];
  if(mapped)return {code:mapped,label:statusLabels[mapped],record:current||s,errorCode:mapped==='failed'?String(failure?.evaluationErrorCode||current?.evaluationErrorCode||s.finalEvaluationErrorCode||'').slice(0,80):''};
  const failedSpeech=raw&&current===raw&&events.some(a=>a.questId==='professorSpeech'&&a.feedbackSource==='displayed'&&a.inReplyTo===raw.attemptId&&events.indexOf(a)>events.indexOf(raw)&&[].concat(a.feedbackText||[]).some(line=>typeof line==='string'&&(line.startsWith('지금은 답을 읽지 못했네.')||line.startsWith('아직 답을 읽을 준비가 안 됐군.'))));
  if(failedSpeech)return {code:'failed',label:statusLabels.failed,record:raw,errorCode:''};
  if(current?.questId==='clarify'&&current.outcome==='clarify'||current?.questId==='FINAL'&&current.diagnosis==='UNCLEAR')return {code:'unavailable',label:statusLabels.unavailable,record:current,errorCode:''};
  if(raw&&current===raw)return {code:'missing',label:statusLabels.missing,record:raw,errorCode:''};
  const judgment=M.obj(final?.judgment),saved=M.obj(s.finalJudgment);
  const result=Object.keys(judgment).length?judgment:saved;
  const has=(M.missions[s.missionId||'m01']?.elements||[]).some(k=>(k==='W3/WB'?['W3','WB']:[k]).some(id=>known(result[id])));
  const code=has?'completed':'missing';
  return {code,label:statusLabels[code],record:final||s,errorCode:''};
 }
 function evaluation(data,s){
  const {final,raw,current,target}=finalSubmission(data,s);
  const rejudgment=activeRejudgment(s,target);
  const candidate=M.obj(final?.judgment),saved=M.obj(s.finalJudgment);
  const judgment=rejudgment?rejudgment.judgment:current&&current===raw?{}:Object.keys(candidate).length?candidate:saved;
  const record=rejudgment?{...s,...rejudgment,input:target.input}:Object.keys(candidate).length?{...s,...final,analysis:final.analysis||M.obj(final.extra).analysis||{}}:s;
  const has=judgmentStatus(data,s).code==='completed'&&(M.missions[s.missionId||'m01']?.elements||[]).some(k=>(k==='W3/WB'?['W3','WB']:[k]).some(id=>known(judgment[id])));
  const rubric=typeof record.rubricVersion==='string'?record.rubricVersion.slice(0,100):'',method=M.judgmentMethod(record),version=typeof record.judgeVersion==='string'?record.judgeVersion.slice(0,100):'버전 미기록';
  const key=has?(rubric||[method,version||'버전 미기록'].join(' · ')):'';
  const label=rubric?rubric.replace('m02-docx-','AI 루브릭 '):key;
  return {judgment,key,label,has,record,analysis:M.obj(record.analysis||M.obj(record.extra).analysis),written:Boolean(s.finalAnswer||final||target),rejudgment};
 }
 function element(judgment,key){
  const keys=key==='W3/WB'?['W3','WB']:[key],values=keys.map(k=>judgment[k]);
  if(values.some(M.yes))return 'met';
  if(values.every(known))return 'revise';
  return 'unknown';
 }
 function criteria(data,rows,prepared=null){
  const map=new Map();
  for(const {e} of prepared||rows.map(s=>({s,e:evaluation(data,s)}))){if(e.has&&!map.has(e.key))map.set(e.key,{key:e.key,label:e.label})}
  return [...map.values()].sort((a,b)=>Number(!a.key.startsWith('m02-docx'))-Number(!b.key.startsWith('m02-docx'))||b.key.localeCompare(a.key,'ko',{numeric:true}));
 }
 function aggregate(data,rows,mission,key,prepared=null){
  const selected=(prepared||rows.map(s=>({s,e:evaluation(data,s)}))).filter(({e})=>e.key===key);
  return {key,count:selected.length,cells:definitions[mission].map(([id,label])=>{
   const states=selected.map(({e})=>element(e.judgment,id));
   const met=states.filter(x=>x==='met').length,revise=states.filter(x=>x==='revise').length;
   return {key:id,label,met,revise,unknown:rows.length-met-revise,assessed:met+revise,rate:met+revise?Math.round(100*met/(met+revise)):null};
  })};
 }
 function recommendCandidates(prepared,key,focus){
  if(!focus)return [];
  const found=prepared.filter(({e})=>e.key===key&&element(e.judgment,focus.key)==='revise').map(({s,e})=>{
   const input=String(e.record.input||e.record.finalAnswer||'').trim();
   if(!input)return null;
   const checks=M.obj(e.analysis.checks),ids=focus.key==='W3/WB'?['W3','WB']:[focus.key];
   const evidence=ids.map(id=>M.obj(checks[id])),reason=evidence.some(c=>typeof c.reason==='string'&&c.reason.trim()),quote=evidence.some(c=>typeof c.quote==='string'&&c.quote.trim()&&input.includes(c.quote));
   return {sessionId:s.sessionId,studentNo:M.number(s),element:focus.key,reason,quote};
  }).filter(Boolean);
  // Prefer verifiable saved evidence, then a stable student number and session ID.
  // Each normalized student appears once even if the caller supplies multiple plays.
  found.sort((a,b)=>Number(b.quote)-Number(a.quote)||Number(b.reason)-Number(a.reason)||Number(a.studentNo)-Number(b.studentNo)||String(a.studentNo).localeCompare(String(b.studentNo),'ko',{numeric:true})||String(a.sessionId).localeCompare(String(b.sessionId)));
  const seen=new Set();return found.filter(c=>{if(seen.has(c.studentNo))return false;seen.add(c.studentNo);return true}).slice(0,3);
 }
 function lessonPriority(data,rows,mission,key,focusElement=''){
  // An unknown version cannot establish a common assessment basis.
  if(!key||key.includes('버전 미기록'))return {missing:[],focus:null,candidates:[]};
  const prepared=rows.map(s=>({s,e:evaluation(data,s)}));
  const missing=aggregate(data,rows,mission,key,prepared).cells.filter(c=>c.assessed&&c.revise).sort((a,b)=>b.revise-a.revise||b.assessed-a.assessed||a.label.localeCompare(b.label,'ko')).slice(0,2);
  const focus=missing.find(c=>c.key===focusElement)||missing[0]||null;
  return {missing,focus,candidates:recommendCandidates(prepared,key,focus)};
 }
 function comparePlays(data,mission,key,classKey,isTest=false){
  const groups=new Map();
  for(const s of data.sessions||[]){
   if((s.missionId||'m01')!==mission||M.test(s)!==isTest||!M.number(s))continue;
   const identity=S.identity(String(s.classCode||'')).classKey;
   if(identity!==classKey)continue;
   const id=identity+'|'+M.number(s);
   if(!groups.has(id))groups.set(id,[]);
   groups.get(id).push(s);
  }
  const pairs=[...groups.values()].map(sessions=>{
   const ordered=M.ordered(sessions),first=ordered[0],latest=ordered.at(-1);
   return {single:ordered.length===1,first:first&&evaluation(data,first),latest:latest&&evaluation(data,latest)};
  });
  const cells=definitions[mission].map(([id,label])=>{
   const excluded={singlePlay:0,missingJudgment:0,unknownVersion:0,differentVersion:0};
   let firstMet=0,latestMet=0,comparable=0;
   for(const pair of pairs){
    if(pair.single){excluded.singlePlay++;continue}
    const a=pair.first,b=pair.latest,firstState=a.has?element(a.judgment,id):'unknown',latestState=b.has?element(b.judgment,id):'unknown';
    if(firstState==='unknown'||latestState==='unknown'){excluded.missingJudgment++;continue}
    const versions=[a.record,b.record];
    const methods=versions.map(M.judgmentMethod);
    if(versions.some(r=>!r.missionVersion||!r.eventSchemaVersion||!(r.rubricVersion||r.judgeVersion))||methods.includes('미기록')||!a.key||!b.key||a.key.includes('버전 미기록')||b.key.includes('버전 미기록')){excluded.unknownVersion++;continue}
    if(!key||a.key!==key||b.key!==key||methods[0]!==methods[1]||!M.comparable({...a.record,judgeVersion:a.record.judgeVersion||a.record.rubricVersion},{...b.record,judgeVersion:b.record.judgeVersion||b.record.rubricVersion})){excluded.differentVersion++;continue}
    comparable++;if(firstState==='met')firstMet++;if(latestState==='met')latestMet++;
   }
   return {key:id,label,firstMet,latestMet,delta:comparable?latestMet-firstMet:null,comparable,excluded};
  });
  return {students:pairs.length,cells};
 }
 function game(data,codes,mission,includeTests=false){
  const d=M.analyze(data,'','latest',{classCodes:codes,missionId:mission,includeTests}),rows=d.recent;
  const prepared=rows.map(s=>({s,e:evaluation(d,s)})),written=prepared.filter(x=>x.e.written).length,keys=criteria(d,rows,prepared);
  const notes={none:0,one:0,two:0,unknown:0,legacy:0};
  for(const s of rows){const n=M.noteUsage(d,s);notes[n.kind==='legacy'?'legacy':n.pages===0?'none':n.pages===1?'one':n.pages===2?'two':'unknown']++}
  return {participants:rows.length,written,pending:rows.length-written,plays:d.sessions.length,review:d.review.length,judged:prepared.filter(x=>x.e.has).length,notes,evaluations:keys.map(k=>({...aggregate(d,rows,mission,k.key,prepared),label:k.label}))};
 }
 function overview(data){
  const classes=S.catalog(data).filter(c=>String(c.classCode||'').trim());
  return {version:'teacher-overview-v1',classes:classes.map(c=>({...c,games:Object.fromEntries(Object.keys(definitions).map(m=>[m,game(data,c.classCodes,m,c.isTest)]))})),criteria:Object.fromEntries(Object.keys(definitions).map(m=>{
   const d=M.analyze(data,'','latest',{classCodes:classes.filter(c=>!c.isTest).flatMap(c=>c.classCodes),missionId:m});
   // Across classes the same student number is a different person. Derive criteria
   // from all scoped sessions, never deduplicate student numbers across classes.
   return [m,criteria(d,d.sessions)];
  }))};
 }
 root.TeacherInsights={definitions,evaluation,judgmentStatus,finalSubmission,activeRejudgment,element,criteria,aggregate,recommendCandidates,lessonPriority,comparePlays,game,overview};
})(typeof window==='undefined'?globalThis:window);
