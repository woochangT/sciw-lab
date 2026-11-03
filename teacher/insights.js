(function(root){
 'use strict';
 const M=root.TeacherModel,S=root.TeacherScope;
 const definitions={
  m01:[['C','농도 결론'],['D','실험 자료'],['W1','질량과 물 이동'],['W2a','물 이동 방향'],['W2b','안팎 농도 비교'],['W3/WB','농도 범위 연결']],
  m02:[['C','자신의 결론'],['D-A','열린 실험 자료'],['D-B','닫힌 실험 자료'],['W1a','질량 보존 적용'],['W1b','산소로 특정한 근거'],['W2a','전체 질량 보존'],['W2b','증가분의 의미']]
 };
 const known=v=>v===true||v===false||['true','false','TRUE','FALSE'].includes(v);
 function evaluation(data,s){
  const last=M.submissions(data,s).at(-1),candidate=M.obj(last?.judgment),saved=M.obj(s.finalJudgment);
  const judgment=Object.keys(candidate).length?candidate:saved;
  const record=Object.keys(candidate).length?{...s,...last,analysis:last.analysis||M.obj(last.extra).analysis||{}}:s;
  const has=(M.missions[s.missionId||'m01']?.elements||[]).some(k=>(k==='W3/WB'?['W3','WB']:[k]).some(id=>known(judgment[id])));
  const rubric=typeof record.rubricVersion==='string'?record.rubricVersion.slice(0,100):'',method=M.judgmentMethod(record),version=typeof record.judgeVersion==='string'?record.judgeVersion.slice(0,100):'버전 미기록';
  const key=has?(rubric||[method,version||'버전 미기록'].join(' · ')):'';
  const label=rubric?rubric.replace('m02-docx-','AI 루브릭 '):key;
  return {judgment,key,label,has,record,analysis:M.obj(record.analysis||M.obj(record.extra).analysis),written:Boolean(s.finalAnswer||last)};
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
 root.TeacherInsights={definitions,evaluation,element,criteria,aggregate,game,overview};
})(typeof window==='undefined'?globalThis:window);
