// Same normalization, replay selection and hint evidence as the visible dashboard.
require('./model.js');
const M=globalThis.TeacherModel;
function excerpt(value){return String(value||'').replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[이메일 제외]').replace(/(?:\+82[- ]?)?0?1[016789][- ]?\d{3,4}[- ]?\d{4}/g,'[연락처 제외]').slice(0,400)}
function build(db,classCode,mode,includeTests=false){
  if(!['first','latest'].includes(mode))throw Error('처음 또는 최근 판을 선택해 주세요.');
  const d=M.analyze(db,classCode,mode,{includeTests});
  const rows=mode==='first'?d.first:d.recent;
  const written=rows.filter(s=>s.finalAnswer||M.submissions(d,s).length).length;
  const samples=rows.filter(s=>s.firstAnswer||s.finalAnswer||M.submissions(d,s).some(a=>a.input));
  const chosen=samples.length<=24?samples:Array.from({length:24},(_,i)=>samples[Math.floor(i*(samples.length-1)/23)]);
  return {version:'m02-class-evidence-v1',mode,isTest:includeTests,participants:rows.length,written,pending:rows.length-written,excluded:d.review.length,totalPlays:d.sessions.length,hintOpened:rows.filter(s=>M.hint(d,s)==='열람').length,hintUnknown:rows.filter(s=>M.hint(d,s)==='미기록').length,sampled:chosen.length,samples:chosen.map((s,i)=>({ref:'S'+(i+1),first:excerpt(s.firstAnswer),final:excerpt(s.finalAnswer||M.submissions(d,s).at(-1)?.input)}))};
}
module.exports={build,excerpt};
if(require.main===module){let raw='';process.stdin.setEncoding('utf8');process.stdin.on('data',c=>raw+=c);process.stdin.on('end',()=>{try{const v=JSON.parse(raw);process.stdout.write(JSON.stringify(build(v.db,v.classCode,v.mode,v.includeTests)))}catch(e){process.stderr.write(e.message);process.exitCode=1}})}
