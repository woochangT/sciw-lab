const S=()=>globalThis.TeacherScope;
const M=()=>globalThis.TeacherModel;
const missions=new Set(['m01','m02']);
const points=new Set(['explore','first','claim','scope','link','combine','compose','quest','complete']);
const protectedFields=new Set(['sessionId','classCode','missionId','studentNo','isTest','teacherRejudgment','teacherRejudgeRequest','attempts','resumeKey','startedAt','checkpoint','checkpointSavedAt','checkpointOnly']);
const recordId=value=>typeof value==='string'&&/^[A-Za-z0-9_:.@-]{1,128}$/.test(value);
const keyValid=value=>typeof value==='string'&&/^[a-f0-9-]{36}$/.test(value);
const validClass=value=>typeof value==='string'&&/^[1-3]-[1-9]\d?$/.test(value);
const validNumber=value=>/^0*[1-9]\d{0,2}$/.test(String(value??''))&&String(value).length<=3;
const isRecord=value=>value&&typeof value==='object'&&!Array.isArray(value);
export class RecordError extends Error {}
function requireRecord(condition,message){if(!condition)throw new RecordError(message)}
function asSession(row){return {...JSON.parse(row.payload),sessionId:row.id,missionId:row.mission,classCode:row.class_code,studentNo:row.student_no,isTest:Boolean(row.is_test),startedAt:row.started_at,updatedAt:row.updated_at,progress:row.progress}}
function asEvent(row){return {...JSON.parse(row.payload),attemptId:row.id,sessionId:row.session_id,eventOrder:row.event_seq}}
function date(value,fallback){const time=Date.parse(value);return Number.isFinite(time)?new Date(time).toISOString():fallback}
function missionClass(mission,classCode,studentNo){requireRecord(missions.has(mission)&&validClass(classCode)&&validNumber(studentNo),'학년은 1~3, 반은 1~99, 번호는 1~999로 입력해 주세요.')}
function cleanFields(fields){
 const result=Object.fromEntries(Object.entries(fields).filter(([k])=>!protectedFields.has(k)));
 requireRecord(Object.keys(result).every(key=>/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(key)),'잘못된 기록');
 return result;
}
function validateCheckpoint(cp,mission){
 requireRecord(isRecord(cp)&&cp.schema==='student-resume-v1'&&cp.missionId===mission&&points.has(cp.point)&&isRecord(cp.state)&&JSON.stringify(cp).length<=30000,'복원 상태 형식이 잘못되었습니다');
}
export async function saveRecords(db,body){
 const ops=body.action==='batch'?body.ops:[body];
 requireRecord(Array.isArray(ops)&&ops.length>0&&ops.length<=4,'잘못된 기록 묶음');
 requireRecord(keyValid(body.resumeKey),'세션 범위 오류: 이 브라우저의 복원 키가 필요합니다.');
 const ids=[...new Set(ops.map(op=>op?.sessionId||op?.session?.sessionId||op?.attempt?.sessionId))];
 requireRecord(ids.every(recordId),'세션 ID 오류');
 const found=await db.prepare(`SELECT id,mission,class_code,student_no,resume_key,is_test,progress FROM sessions WHERE id IN (${ids.map(()=>'?').join(',')})`).bind(...ids).all();
 const rows=new Map(found.results.map(row=>[row.id,row]));
 const statements=[],changed=new Map(),now=new Date().toISOString();
 for(const op of ops){
  const kind=op.action,id=op.sessionId||op.session?.sessionId||op.attempt?.sessionId;
  const fields=kind==='startSession'?op.session:kind==='updateSession'?op.fields:op.attempt;
  requireRecord(['startSession','updateSession','logAttempt'].includes(kind)&&isRecord(fields),'지원하지 않는 기록 작업');
  requireRecord(!('teacherRejudgment' in fields)&&!('teacherRejudgeRequest' in fields)&&!('attempts' in fields),'잘못된 기록');
  const receipt=op.syncId||`legacy:${kind}:${await digest(JSON.stringify(op))}`;
  requireRecord(recordId(receipt),'잘못된 기록');
  let identity=rows.get(id), notify=false;
  if(kind==='startSession'){
   missionClass(fields.missionId,fields.classCode,fields.studentNo);
   if(!identity){
    notify=true;
    identity={id,mission:fields.missionId,class_code:fields.classCode,student_no:String(Number(fields.studentNo)),resume_key:body.resumeKey,is_test:Number(M().test(fields))};
    rows.set(id,identity);
   }
   requireRecord(identity.mission===fields.missionId&&identity.class_code===fields.classCode&&identity.student_no===String(Number(fields.studentNo)),'세션 범위 충돌');
   requireRecord(identity.resume_key===body.resumeKey,'세션 범위 충돌');
   statements.push(db.prepare(`INSERT INTO sessions(id,mission,class_code,class_key,student_no,resume_key,is_test,started_at,updated_at,progress,payload)
    VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING`).bind(id,identity.mission,identity.class_code,S().identity(identity.class_code).classKey,identity.student_no,body.resumeKey,identity.is_test,date(fields.startedAt,now),now,'explore',JSON.stringify(cleanFields(fields))));
  }
  requireRecord(identity?.resume_key===body.resumeKey,'세션이 없어 저장할 수 없습니다.');
  requireRecord((fields.classCode===undefined||fields.classCode===identity.class_code)&&(fields.missionId===undefined||fields.missionId===identity.mission)&&(fields.studentNo===undefined||String(Number(fields.studentNo))===identity.student_no),'시도 범위가 다릅니다.');
  const fresh='id=? AND resume_key=? AND NOT EXISTS(SELECT 1 FROM write_receipts WHERE session_id=? AND id=?)';
  const guard=[id,body.resumeKey,id,receipt];
  if(kind==='updateSession'){
   if('checkpoint' in fields){
    validateCheckpoint(fields.checkpoint,identity.mission);
    const checkpointAt=date(fields.checkpointSavedAt,now);
    notify=identity.progress!==fields.checkpoint.point;
    identity.progress=fields.checkpoint.point;
    statements.push(db.prepare(`UPDATE sessions SET checkpoint=?,checkpoint_at=?,progress=?,updated_at=?,revision=revision+1 WHERE ${fresh} AND (checkpoint_at IS NULL OR checkpoint_at<=?)`).bind(JSON.stringify(fields.checkpoint),checkpointAt,fields.checkpoint.point,now,...guard,checkpointAt));
   }
   const patch=cleanFields(fields),keys=Object.keys(patch);
   if(keys.length){
    notify ||= !fields.draftOnly&&!fields.checkpointOnly;
    requireRecord(keys.length<=40,'기록이 잘못되었거나 너무 큽니다');
    const setters=keys.map(()=> '?, json(?)').join(', ');
    const args=keys.flatMap(key=>[`$.${key}`,JSON.stringify(patch[key])]);
    statements.push(db.prepare(`UPDATE sessions SET payload=json_set(payload,${setters}),updated_at=?,revision=revision+1,
     progress=CASE WHEN ? THEN 'complete' ELSE progress END WHERE ${fresh}`).bind(...args,now,Boolean(patch.clearType)?1:0,...guard));
   }
  }
  if(kind==='logAttempt'){
   notify=['studentInput','finalEvaluation','final','FINAL','clarify','hintView'].includes(fields.questId);
   requireRecord(recordId(fields.attemptId),'시도 ID 오류');
   const attempt={...fields,classCode:identity.class_code,missionId:identity.mission,studentNo:identity.student_no,createdAt:date(fields.createdAt,now)};
   statements.push(db.prepare(`INSERT INTO session_events(id,session_id,quest,payload) SELECT ?,id,?,? FROM sessions WHERE ${fresh} ON CONFLICT(id) DO NOTHING`).bind(attempt.attemptId,attempt.questId||'',JSON.stringify(attempt),...guard));
   statements.push(db.prepare(`UPDATE sessions SET updated_at=?,revision=revision+1 WHERE ${fresh} AND changes()>0`).bind(now,...guard));
  }
  // A concurrent conflicting claim cannot acknowledge someone else's operation.
  statements.push(db.prepare(`INSERT INTO write_receipts(session_id,id) VALUES((SELECT id FROM sessions WHERE id=? AND resume_key=?),?) ON CONFLICT(session_id,id) DO NOTHING`).bind(id,body.resumeKey,receipt));
  if(notify)changed.set(id,{classKey:S().identity(identity.class_code).classKey,missionId:identity.mission,isTest:Boolean(identity.is_test)});
 }
 await db.batch(statements);
 return {applied:ops.length,changed:[...changed.values()]};
}
export async function digest(value){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('')}
export async function findSession(db,body){
 const {missionId,classCode,studentNo,resumeKey}=body;
 missionClass(missionId,classCode,studentNo);
 if(!keyValid(resumeKey))return null;
 const row=await db.prepare(`SELECT id,checkpoint,checkpoint_at,updated_at,json_extract(payload,'$.clearType') AS clear_type FROM sessions
  WHERE mission=? AND class_key=? AND student_no=? AND resume_key=? ORDER BY started_at DESC,id DESC LIMIT 1`).bind(missionId,S().identity(classCode).classKey,String(Number(studentNo)),resumeKey).first();
 return row?{sessionId:row.id,classCode,studentNo:String(Number(studentNo)),missionId,checkpoint:row.checkpoint?JSON.parse(row.checkpoint):null,savedAt:row.checkpoint_at||row.updated_at,completed:Boolean(row.clear_type)}:null;
}
const overviewQuests="('studentInput','finalEvaluation','final','FINAL','clarify','hintView','professorSpeech')";
export async function readRecords(db,scope=null){
 const where=scope?' WHERE s.class_key=? AND s.is_test=? AND s.mission=?':'';
 const args=scope?[scope.classKey||S().identity(scope.classCode).classKey,Number(scope.includeTests),scope.missionId]:[];
 const columns='s.id,s.mission,s.class_code,s.student_no,s.is_test,s.started_at,s.updated_at,s.progress';
 // The overview uses only fields necessary for class totals and rubric summaries.
 const payload=scope?'s.payload':`json_object('finalAnswer',CASE WHEN length(json_extract(s.payload,'$.finalAnswer'))>0 THEN '작성' ELSE NULL END,
  'finalEvaluationStatus',json_extract(s.payload,'$.finalEvaluationStatus'),'finalJudgment',json_extract(s.payload,'$.finalJudgment'),
  'teacherRejudgment',json_extract(s.payload,'$.teacherRejudgment'),'rubricVersion',json_extract(s.payload,'$.rubricVersion'),
  'judgeVersion',json_extract(s.payload,'$.judgeVersion'),'judgedBy',json_extract(s.payload,'$.judgedBy'),
  'hintViewedAt',json_extract(s.payload,'$.hintViewedAt'),'hintOpenedAt',json_extract(s.payload,'$.hintOpenedAt'),
  'hintLevel',json_extract(s.payload,'$.hintLevel'),'hintSchemaVersion',json_extract(s.payload,'$.hintSchemaVersion')) AS payload`;
 const eventPayload=scope?'e.payload':`json_remove(e.payload,'$.analysis','$.evaluationInput','$.displayedPrompt','$.extra') AS payload`;
 const relevant=scope?'':` WHERE e.quest IN ${overviewQuests} AND (e.quest<>'studentInput' OR json_extract(e.payload,'$.evaluationStage')='final' OR json_extract(e.payload,'$.stage')='defense')`;
 const queries=[db.prepare(`SELECT ${columns},${payload} FROM sessions s${where}`).bind(...args),
  db.prepare(`SELECT e.id,e.session_id,e.event_seq,${eventPayload} FROM session_events e JOIN sessions s ON s.id=e.session_id${scope?where:relevant}`).bind(...args)];
 const [sessions,events]=await db.batch(queries);
 return {sessions:sessions.results.map(asSession),attempts:events.results.map(asEvent),invalidRows:0,fetchedAt:new Date().toISOString(),storage:'d1'};
}
export async function readOne(db,id){
 const [session,events]=await db.batch([db.prepare('SELECT * FROM sessions WHERE id=?').bind(id),db.prepare('SELECT * FROM session_events WHERE session_id=? ORDER BY event_seq').bind(id)]);
 const row=session.results[0];
 return row?{session:asSession(row),attempts:events.results.map(asEvent),revision:row.revision}:null;
}
