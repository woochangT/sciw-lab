/* 합성 시연 자료. 원문과 판정 근거를 한 쌍으로 작성한 예시다. */
(function(root){
 'use strict';
 const lessons={
  m01:{
   version:'m01-example-v1',first:['설탕물이 감자에 들어가서 질량이 달라졌다고 생각했다.','진한 설탕물에 넣으면 감자도 더 무거워질 것 같다.','질량이 줄어든 건 감자 속 물이 빠져나갔기 때문일 것 같다.'],
   response:'5%에서는 물이 감자에 들어가고, 10%에서는 반대로 나간 것 같다.',
   feedback:'어느 농도에서 질량이 늘거나 줄었는지 말한 뒤, 그 변화가 물의 이동과 어떻게 연결되는지 설명해 보자.',
   elements:{
    C:['감자 세포 안의 농도는 5%와 10% 사이이다.','감자 안의 농도 범위'],
    D:['5% 설탕물에서는 감자 질량이 3 g 늘고, 10% 설탕물에서는 5 g 줄었다.','두 설탕물에서 관찰한 질량 변화'],
    W1:['물이 감자 안으로 들어오면 질량이 늘고, 감자 밖으로 나가면 질량이 줄어든다.','질량 변화와 물의 이동을 연결한 설명'],
    W2a:['5% 설탕물에서 물이 감자 안으로 들어갔으므로 감자 안이 5%보다 진하다.','5%보다 진하다는 근거'],
    W2b:['10% 설탕물에서는 물이 감자 밖으로 나갔으므로 감자 안이 10%보다 묽다.','10%보다 묽다는 근거'],
    W3:['5%보다 진하다는 결과와 10%보다 묽다는 결과를 함께 적용하면 그 사이로 범위를 좁힐 수 있다.','두 결과를 합쳐 범위를 좁힌 설명'],
    WB:['질량 변화가 0이 되는 농도에서는 물의 순이동이 없고, 그 지점은 질량 변화의 부호가 바뀌는 5%와 10% 사이에 있다.','질량 변화가 0인 조건을 이용한 설명']
   },
   omitted:[['WB'],['W3'],['D','W3','WB'],['W1','W3','WB'],['W2b','W3','WB'],['C','W3','WB'],['D','W1','WB']]
  },
  m02:{
   version:'m02-docx-1.2.1',first:['강철솜을 태울 때 열이 들어가서 무거워진 것 같다.','태우면 일부가 연기로 날아가서 가벼워질 줄 알았다.','공기 중에서 무엇인가가 강철솜에 붙은 것 같다.'],
   response:'닫힌 플라스크에서는 산소가 철에 붙어도 플라스크 밖으로 나가지 않는다.',
   feedback:'열린 실험에서 강철솜에 더해진 물질과 닫힌 실험에서 저울이 잰 범위를 각각 설명해 보자.',
   elements:{
    C:['공기 중의 산소가 철과 결합해서 강철솜이 더 무거워졌다.','강철솜이 무거워진 까닭'],
    'D-A':['열린 실험 A에서 강철솜의 질량은 2.0 g에서 2.5 g으로 늘었다.','열린 실험의 질량 측정값'],
    'D-B':['닫힌 실험 B의 플라스크 전체 질량은 실험 전후 모두 150.0 g이었다.','닫힌 실험의 전체 질량 측정값'],
    W1a:['질량은 저절로 생기지 않으므로 강철솜의 질량이 늘려면 외부 물질이 더해져야 한다.','질량 보존과 외부 물질 유입의 관계'],
    W1b:['연소 뒤에 공기 중 산소가 줄어든 관찰은 철에 더해진 물질이 산소라는 근거다.','더해진 물질을 산소로 본 근거'],
    W2a:['닫힌 플라스크에서는 산소가 철과 결합해도 밖으로 드나드는 물질이 없으므로 플라스크 전체 질량은 그대로다.','닫힌 계에서 전체 질량이 유지되는 이유'],
    W2b:['강철솜에서 늘어난 0.5 g은 바깥 공기에서 들어와 철에 결합한 산소의 질량이다.','늘어난 0.5 g의 출처']
   },
   omitted:[['D-B','W2a'],['W1a'],['W1b','W2b'],['C','W1b','W2b'],['W1b','D-B','W2a'],['W1a','W2a'],['D-B','W1b','W2b']]
  }
 };
 const sessions=[],attempts=[],now=Date.now();
 const iso=timestamp=>new Date(timestamp).toISOString();
 function addPlay(classCode,missionId,no,variant,phase,retry=false){
  const lesson=lessons[missionId],sessionId=`example:${classCode}:${missionId}:${no}${retry?':retry':''}`;
  const firstAnswer=lesson.first[(no+variant)%lesson.first.length];
  const complete=phase==='complete',pending=phase==='pending';
  const started=now-(retry?35:120+no)*60000;
  const skipped=lesson.omitted[variant],entries=Object.entries(lesson.elements);
  const judgment=Object.fromEntries(entries.map(([key])=>[key,!skipped.includes(key)]));
  const input=entries.filter(([key])=>judgment[key]).map(([,element])=>element[0]).join(' ');
  const analysis={checks:Object.fromEntries(entries.map(([key,[sentence,topic]])=>[key,{
   quote:judgment[key]?sentence:'',reason:judgment[key]?`답안에서 ${topic}에 해당하는 문장을 확인할 수 있어요.`:`이 최종 답안에서는 ${topic}을(를) 확인할 수 없어요.`
  }]))};
  const met=(...keys)=>keys.every(key=>judgment[key]);
  const full=missionId==='m01'?met('C','D','W1','W2a','W2b')&&(judgment.W3||judgment.WB):
   met('C','D-A','W1b','W2b')&&(judgment.W1a||met('D-B','W2a'));
  const stage=complete?'complete':phase==='progress'?'rebuttal':'defense';
  const meta={classCode,missionId,studentNo:String(no),sessionId,synthetic:true,rubricVersion:lesson.version,
   missionVersion:`${missionId}-example-v1`,eventSchemaVersion:`${missionId}-events-v1`,judgeVersion:lesson.version,judgedBy:'example'};
  sessions.push({...meta,startedAt:iso(started),updatedAt:iso(complete?started+24*60000:now),lastActiveAt:iso(complete?started+24*60000:now),
   stage,firstAnswer,checkpoint:{schema:'student-resume-v1',missionId,point:complete?'complete':phase==='progress'?(missionId==='m01'?'quest':'link'):'compose',state:{}},
   ...(missionId==='m02'?{hintLevel:no%3,hintSchemaVersion:'m02-note-pages-v1'}:{}),
   ...(phase==='draft'?{draftAnswer:lesson.response,draftQuestion:lesson.feedback,draftSavedAt:iso(now)}:{}),
   ...(complete?{clearType:full?'full':'partial',endedAt:iso(started+24*60000),firstFinalSubmittedAt:iso(started+23*60000),finalAnswer:input,finalJudgment:judgment,analysis}:{})});
  let order=0;
  function record(stage,questId,extra={},timestamp=started+(order+1)*60000){
   const eventOrder=++order,attemptId=`${sessionId}:${eventOrder}`;
   attempts.push({...meta,attemptId,eventOrder,stage,questId,createdAt:iso(timestamp),...extra});return attemptId;
  }
  record('explore',missionId==='m01'?'observeMass':'burnA');
  record('claim','first',{input:firstAnswer,feedbackText:lesson.feedback});
  if(missionId==='m02')record('claim','claim',{input:lesson.response});
  record('rebuttal','Q1',{input:lesson.response,feedbackText:lesson.feedback});
  if(phase==='draft')record('compose','hintView',{feedbackText:lesson.feedback});
  const finalStage=missionId==='m01'?'defense':'compose';
  if(pending)record(finalStage,'studentInput',{input,evaluationStage:'final',evaluationStatus:'pending'},now-2000);
  if(complete){
   const origin=record(finalStage,'studentInput',{input,evaluationStage:'final'});
   record(finalStage,missionId==='m01'?'FINAL':'final',{input,inReplyTo:origin,submissionNo:1,judgment,analysis});
   record(finalStage,'professorSpeech',{inReplyTo:origin,feedbackText:full?'관찰한 결과와 그 까닭을 함께 설명했구나.':lesson.feedback,feedbackSource:'displayed'});
  }
 }
 for(const [classCode,count,offset] of [['1-2',16,2],['2-3',24,0],['3-4',18,4]]){
  for(const missionId of Object.keys(lessons)){
   for(let no=1;no<=count;no++){
    const phase=no<=count-4?'complete':no===count-3?'pending':no===count-2?'draft':'progress';
    addPlay(classCode,missionId,no,(no+offset)%7,phase);
   }
   for(const no of [2,5,9])addPlay(classCode,missionId,no,(no+offset)%2,'complete',true);
  }
 }
 root.TeacherDemo={sessions,attempts};
})(typeof window==='undefined'?globalThis:window);
