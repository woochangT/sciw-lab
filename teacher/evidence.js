(function(root){
 const M=root.TeacherModel;
 function excerpt(value){return String(value||'').replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[이메일 제외]').replace(/(?:\+82[- ]?)?0?1[016789][- ]?\d{3,4}[- ]?\d{4}/g,'[연락처 제외]').slice(0,400)}
 function revision(data){
  // Change indicator only, not an authentication or cryptographic digest.
  const raw=JSON.stringify([data.sessions.slice().sort((a,b)=>String(a.sessionId).localeCompare(String(b.sessionId))),data.attempts.slice().sort((a,b)=>String(a.attemptId).localeCompare(String(b.attemptId)))]);
  let n=2166136261;for(let i=0;i<raw.length;i++){n^=raw.charCodeAt(i);n=Math.imul(n,16777619)}return (n>>>0).toString(16);
 }
 function build(db,classCode,mode,options={}){
  if(!['first','latest'].includes(mode))throw Error('처음 또는 최근 판을 선택해 주세요.');
  const missionId=options.missionId||'m02',includeTests=options.includeTests||false;
  const d=M.analyze(db,classCode,mode,{missionId,includeTests,classCodes:options.classCodes||db.classCodes});
  const rows=mode==='first'?d.first:d.recent,written=rows.filter(s=>s.finalAnswer||M.submissions(d,s).length).length;
  const samples=rows.filter(s=>s.firstAnswer||s.finalAnswer||M.submissions(d,s).some(a=>a.input));
  const chosen=samples.length<=24?samples:Array.from({length:24},(_,i)=>samples[Math.floor(i*(samples.length-1)/23)]);
  return {version:'class-evidence-v2',missionId,mode,isTest:includeTests,participants:rows.length,written,pending:rows.length-written,excluded:d.review.length,totalPlays:d.sessions.length,hintOpened:rows.filter(s=>M.hint(d,s)==='열람').length,hintUnknown:rows.filter(s=>M.hint(d,s)==='미기록').length,sampled:chosen.length,sourceRevision:revision(d),samples:chosen.map((s,i)=>({ref:'S'+(i+1),first:excerpt(s.firstAnswer),final:excerpt(s.finalAnswer||M.submissions(d,s).at(-1)?.input)}))};
 }
 root.TeacherEvidence={build,excerpt,revision};
})(typeof window==='undefined'?globalThis:window);
