require('./model.js');require('./evidence.js');
const E=globalThis.TeacherEvidence;
function build(db,classCode,mode,includeTests=false,missionId='m02'){return E.build(db,classCode,mode,{includeTests,missionId})}
module.exports={build,excerpt:E.excerpt};
if(require.main===module){let raw='';process.stdin.setEncoding('utf8');process.stdin.on('data',c=>raw+=c);process.stdin.on('end',()=>{try{const v=JSON.parse(raw);process.stdout.write(JSON.stringify(build(v.db,v.classCode,v.mode,v.includeTests,v.missionId)))}catch(e){process.stderr.write(e.message);process.exitCode=1}})}
