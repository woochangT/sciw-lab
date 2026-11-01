(function(root){
 const M=root.TeacherModel;
 function identity(code){const m=String(code).match(/^\s*(\d{1,2})\s*(?:학년|[-_/])\s*(\d{1,3})\s*반?\s*$/);if(m&&+m[1]>0&&+m[1]<=12&&+m[2]>0&&+m[2]<=99)return {classKey:`g:${+m[1]}:r:${+m[2]}`,grade:+m[1],classNo:+m[2],label:`${+m[1]}학년 ${+m[2]}반`};return {classKey:'code:'+code,grade:null,classNo:null,label:code}}
 const gradeKey=c=>c.isTest?'test':c.grade===null?'unknown':String(c.grade);
 function catalog(db){const groups=new Map();for(const s of db.sessions||[]){if(/^QA_/i.test(s.classCode)||/^qa_/i.test(s.sessionId))continue;const id=identity(String(s.classCode||'')),isTest=M.test(s),key=id.classKey+'|'+isTest;if(!s.classCode)continue;if(!groups.has(key))groups.set(key,{...id,classCode:s.classCode,classCodes:new Set(),isTest,plays:0,numbers:new Set(),byMission:{}});const g=groups.get(key);g.classCodes.add(String(s.classCode));g.plays++;const m=s.missionId||'m01',stat=g.byMission[m]||(g.byMission[m]={plays:0,numbers:new Set()});stat.plays++;if(M.number(s)){g.numbers.add(M.number(s));stat.numbers.add(M.number(s))}}
  return [...groups.values()].map(g=>({...g,classCodes:[...g.classCodes],numbers:g.numbers.size,byMission:Object.fromEntries(Object.entries(g.byMission).map(([m,v])=>[m,{plays:v.plays,numbers:v.numbers.size}]))})).sort((a,b)=>Number(a.isTest)-Number(b.isTest)||Number(a.grade===null)-Number(b.grade===null)||(a.grade||0)-(b.grade||0)||(a.classNo||0)-(b.classNo||0)||a.label.localeCompare(b.label,'ko',{numeric:true}));
 }
 root.TeacherScope={identity,gradeKey,catalog};
})(typeof window==='undefined'?globalThis:window);
