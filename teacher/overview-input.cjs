require('./model.js');require('./scope.js');require('./insights.js');
let raw='';process.stdin.setEncoding('utf8');process.stdin.on('data',c=>raw+=c);
process.stdin.on('end',()=>{try{process.stdout.write(JSON.stringify(globalThis.TeacherInsights.overview(JSON.parse(raw))))}catch{process.stderr.write('학급 요약을 구성하지 못했습니다.');process.exitCode=1}});
