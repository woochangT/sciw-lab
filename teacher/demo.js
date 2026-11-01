/* 합성 시연 자료. 학생 기록이나 KakaoTalk 원문이 포함되지 않는다. */
(function(root){
const sessions=[],attempts=[],now=Date.now(),iso=m=>new Date(now-m*60000).toISOString();
function add(no,retry=false){const sid=`demo-m02-${no}${retry?'-retry':''}`,complete=retry||no<=18,submitted=retry||no<=20,minute=retry?35:120+no;
const first='강철솜을 태우면 열 때문에 무거워질 것 같다.';
const partial='실험 A에서 강철솜은 2.0 g에서 2.5 g으로 늘었다. 산소와 결합했기 때문이다.';
const final=retry||no%3===0?'공기 중 산소가 철과 결합하면서 0.5 g이 더해졌다. 닫힌 플라스크에서는 산소도 처음부터 전체 질량에 포함돼 있어 전체는 150.0 g으로 같다.':partial;
const s={sessionId:sid,classCode:'DEMO',lessonId:'DEMO',studentNo:String(no).padStart(2,'0'),studentNoNormalized:String(no),missionId:'m02',isTest:false,missionVersion:'m02-1.0',eventSchemaVersion:'m02-events-v1',judgeVersion:'keyword-1.0',startedAt:iso(minute),updatedAt:iso(no<=21?no%4:65),lastActiveAt:iso(no<=21?no%4:65),firstAnswer:no<=23?first:'',stage:complete?'compose':no<=20?'compose':no===21?'sort':no===22?'rebuttal':no===23?'claim':'explore',clearType:complete?(no%5===0?'partial':'full'):'',endedAt:complete?iso(minute-24):'',finalAnswer:submitted?final:'',firstFinalSubmittedAt:submitted?iso(minute-18):'',endReason:complete?'full':no<=21?'':'unknown',finalSubmissionCount:submitted?(no%3+1):0,finalJudgment:submitted?{C:true,'D-A':true,'D-B':no%3===0,W1a:no%4!==0,W1b:retry||no%3===0,W2a:retry||no%2===0,W2b:no%3===0}:{},questPassed:{},hintOpenedAt:no%4===0?iso(minute-17):'',hintViewedAt:no%8===0?iso(minute-16):''};sessions.push(s);
let order=0;function event(stage,quest,input='',rest={}){const n=++order;attempts.push({attemptId:`${sid}-e${n}`,sessionId:sid,missionId:'m02',stage,questId:quest,input,eventOrder:n,eventStatus:'acted',createdAt:iso(minute-n),clientOccurredAt:iso(minute-n),missionVersion:s.missionVersion,eventSchemaVersion:s.eventSchemaVersion,...rest})}
event('explore','burnA');if(no<24)event('explore','clipB');if(no<23)event('explore','burnB');if(no<=23)event('claim','first',first);
for(let q=1;q<=3;q++){if(no>22||no>21&&q>1)break;event('rebuttal','Q'+q,q===1?'닫힌 플라스크 안에서는 전체 질량이 그대로다.':'바깥 공기에서 들어온 산소의 질량이다.',{pass:no%4!==0,diagnosis:no%4===0?'N2':'PASS'})}
if(no<=21){event('sort','D-A','',{choice:'data',pass:true});event('sort','W1a','',{choice:no%4===0?'data':'warrant',pass:no%4!==0})}
if(s.hintOpenedAt)event('compose','hintUnlock','',{hintExposure:'unlocked'});if(s.hintViewedAt)event('compose','hintView','',{hintExposure:'opened'});
if(submitted){for(let n=1;n<=s.finalSubmissionCount;n++)event('compose','final',n===s.finalSubmissionCount?final:partial,{submissionNo:n,eventStatus:'submitted',judgment:n===s.finalSubmissionCount?s.finalJudgment:{C:true,'D-A':true},hintExposure:s.hintViewedAt?'opened':'locked'})}
}
for(let n=1;n<=24;n++)add(n);[2,5,9].forEach(n=>add(n,true));
sessions.push({sessionId:'qa_demo',classCode:'DEMO',studentNo:'TEST',missionId:'m02',isTest:true});
root.TeacherDemo={sessions,attempts};
})(window);
