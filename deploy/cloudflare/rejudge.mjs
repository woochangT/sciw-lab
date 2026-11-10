import {readOne} from './records.mjs';
import {judgePotato,judgeSteel,keywordFinal} from './evaluators.mjs';
const keys={m01:['C','D','W1','W2a','W2b','W3','WB'],m02:['C','D-A','D-B','W1a','W1b','W2a','W2b']};
const reject=code=>({ok:false,code});
function submission(record){
 const {session,attempts}=record,I=globalThis.TeacherInsights;
 const current=I.finalSubmission(record,session);
 return {...current,status:I.judgmentStatus(record,session).code};
}
async function update(db,id,revision,job,result=null){
 const sql=result?`UPDATE sessions SET payload=json_set(payload,'$.teacherRejudgeRequest',json(?),'$.teacherRejudgment',json(?)),revision=revision+1,updated_at=? WHERE id=? AND revision=? RETURNING revision`:
  `UPDATE sessions SET payload=json_set(payload,'$.teacherRejudgeRequest',json(?)),revision=revision+1,updated_at=? WHERE id=? AND revision=? RETURNING revision`;
 const values=result?[JSON.stringify(job),JSON.stringify(result)]:[JSON.stringify(job)];
 return db.prepare(sql).bind(...values,job.at,id,revision).first();
}
async function evaluate(session,current,env,fetcher){
 const text=current.target.input,raw=current.current?.inReplyTo?current.events?.find(a=>a.attemptId===current.current.inReplyTo):current.current;
 if(session.missionId==='m01'){
  const keyword=keywordFinal(text),useAI=['llm','anthropic'].includes(current.current?.judgedBy||session.judgedBy);
  const judgment=useAI?(await judgePotato({kind:'defense',questId:'FINAL',text},env,fetcher)).elements:keyword.elements;
  if(judgment?.WB===true)judgment.W2a=judgment.W2b=judgment.W3=true;
  return {judgment,judgedBy:useAI?'llm':'keyword',judgeVersion:useAI?'m01-llm-defense-v1':'keyword-m01-defense-v1',outcome:keyword.unclear&&!Object.values(judgment||{}).some(Boolean)?'clarify':'assessed'};
 }
 const input=raw?.evaluationInput;
 const result=await judgeSteel({stage:'final',text,initialAnswer:input?.initialAnswer||session.firstAnswer||'',cardSpans:input?.cardSpans||[]},env,fetcher);
 return {judgment:result.elements,judgedBy:'openai',judgeVersion:result.rubricVersion,rubricVersion:result.rubricVersion,outcome:result.outcome,analysis:result.analysis,contextLimited:!input};
}
export async function rejudge(body,env,fetcher){
 const {classCode,missionId,sessionId,attemptId,requestId}=body;
 if(!Object.hasOwn(keys,missionId)||typeof classCode!=='string'||typeof sessionId!=='string'||!sessionId||sessionId.length>128||typeof attemptId!=='string'||attemptId.length>128||typeof requestId!=='string'||!/^[A-Za-z0-9_-]{12,100}$/.test(requestId))return reject('INVALID_REQUEST');
 const db=env.DB,before=await readOne(db,sessionId);
 if(!before||before.session.classCode!==classCode||before.session.missionId!==missionId)return reject('STALE_SUBMISSION');
 const prior=before.session.teacherRejudgment,current=submission(before),job=before.session.teacherRejudgeRequest;
 if(current.target?.id!==attemptId)return reject('STALE_SUBMISSION');
 if(prior?.attemptId===attemptId&&prior.requestId===requestId)return {ok:true,rejudgment:prior};
 if(!['failed','missing'].includes(current.status))return reject('REJUDGE_NOT_NEEDED');
 if(job?.status==='running'&&Date.now()-Date.parse(job.at)<180000)return reject('REJUDGE_BUSY');
 if(job?.requestId===requestId&&job.status==='failed')return reject(job.code);
 if(current.target.input.length>(missionId==='m01'?2000:1500))return reject('INVALID_TEXT');
 const started={requestId,attemptId,status:'running',at:new Date().toISOString()};
 if(!await update(db,sessionId,before.revision,started))return reject('REJUDGE_BUSY');
 let result,code;
 try{
  result=await evaluate(before.session,{...current,events:before.attempts},env,fetcher);
  if(!keys[missionId].every(key=>typeof result.judgment?.[key]==='boolean'))code='INVALID_RESULT';
  if(result.outcome==='clarify')code='UNAVAILABLE';
 }catch(error){code=/^(TIMEOUT|RATE_LIMIT|DAILY_LIMIT|KEY_NOT_CONFIGURED|INVALID_TEXT|INVALID_RESULT)$/.test(error.message)?error.message:'EVALUATOR_UNAVAILABLE'}
 const after=await readOne(db,sessionId),next=after&&submission(after);
 if(after?.session.teacherRejudgeRequest?.at!==started.at||after.session.teacherRejudgeRequest.requestId!==requestId)return reject('STALE_SUBMISSION');
 if(next.target?.id!==attemptId||next.target?.input!==current.target.input)code='STALE_SUBMISSION';
 else if(!['failed','missing'].includes(next.status))code='REJUDGE_NOT_NEEDED';
 const at=new Date().toISOString(),completed={requestId,attemptId,at,status:code?'failed':'completed',...(code?{code}:{})};
 const rejudgment=code?null:{...result,requestId,attemptId,at};
 if(!await update(db,sessionId,after.revision,completed,rejudgment))return reject('STALE_SUBMISSION');
 return code?reject(code):{ok:true,rejudgment};
}
