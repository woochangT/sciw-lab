import {readFileSync,writeFileSync} from 'node:fs';
import {parseRecords} from './worker.mjs';

const [source,output]=process.argv.slice(2);
if(!source||!output)throw Error('Usage: node import-from-sheets.mjs snapshot.json .local/import.sql');
const snapshot=JSON.parse(readFileSync(source,'utf8'));
const missions=['m01','m02'];
const dates=value=>{const date=new Date(value||0);return Number.isNaN(date.getTime())?'1970-01-01T00:00:00.000Z':date.toISOString()};
const sql=value=>value===null?'NULL':typeof value==='number'?String(value):`CAST(X'${Buffer.from(String(value),'utf8').toString('hex')}' AS TEXT)`;
const insert=(table,columns,values,onConflict='ON CONFLICT DO NOTHING')=>`INSERT INTO ${table} (${columns}) VALUES (${values.map(sql).join(',')}) ${onConflict};`;
const statements=[],sessions=new Map(),events=new Map();
let skipped=0;
for(const mission of missions){
 const data=parseRecords(snapshot.records[mission],mission);
 skipped+=data.invalidRows;
 for(const row of data.sessions){
  if(sessions.has(row.sessionId))throw Error('Duplicate session across the mission tabs');
  if(/^qa_/i.test(row.sessionId)||!globalThis.TeacherScope.identity(row.classCode).grade){skipped++;continue;}
  sessions.set(row.sessionId,row);
 }
 for(const row of data.attempts){
  const previous=events.get(row.attemptId);
  if(previous&&previous.sessionId!==row.sessionId)throw Error('Duplicate event across sessions');
  events.set(row.attemptId,row);
 }
}
for(const row of sessions.values()){
 const {sessionId,missionId,classCode,studentNo,startedAt,updatedAt,checkpoint,checkpointSavedAt,attempts,teacherRejudgeRequest,...payload}=row;
 const point=row.clearType?'complete':checkpoint?.point||({defense:'compose',rebuttal:'quest'}[row.stage]||row.stage||'explore');
 const job=teacherRejudgeRequest?.status==='running'?undefined:teacherRejudgeRequest;
 const history=JSON.stringify({...payload,...(job?{teacherRejudgeRequest:job}:{})});
 statements.push(insert('sessions','id,mission,class_code,class_key,student_no,is_test,started_at,updated_at,progress,checkpoint,checkpoint_at,payload',[
  sessionId,missionId,classCode,globalThis.TeacherScope.identity(classCode).classKey,globalThis.TeacherModel.number(row)||String(studentNo),Number(globalThis.TeacherModel.test(row)),
  dates(startedAt),dates(updatedAt||startedAt),point,checkpoint?JSON.stringify(checkpoint):null,checkpointSavedAt?dates(checkpointSavedAt):null,history
 ], `ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at,progress=excluded.progress,checkpoint=excluded.checkpoint,checkpoint_at=excluded.checkpoint_at,payload=excluded.payload
 WHERE sessions.resume_key IS NULL AND sessions.mission=excluded.mission AND sessions.class_code=excluded.class_code
 AND sessions.student_no=excluded.student_no AND sessions.updated_at<excluded.updated_at`));
}
const ordered=[...events.values()].sort((a,b)=>a.sessionId.localeCompare(b.sessionId)||(a.eventOrder&&b.eventOrder?Number(a.eventOrder)-Number(b.eventOrder):dates(a.clientOccurredAt||a.createdAt).localeCompare(dates(b.clientOccurredAt||b.createdAt))));
let importedEvents=0;
for(const row of ordered){
 const parent=sessions.get(row.sessionId);
 if(!parent||row.classCode&&row.classCode!==parent.classCode||row.missionId&&row.missionId!==parent.missionId){skipped++;continue;}
 statements.push(insert('session_events','id,session_id,quest,payload',[row.attemptId,row.sessionId,row.questId||'',JSON.stringify({...row,classCode:parent.classCode,missionId:parent.missionId})]));
 importedEvents++;
}
writeFileSync(output,statements.join('\n')+'\n',{mode:0o600,flag:'wx'});
console.log(JSON.stringify({sessions:sessions.size,events:importedEvents,skipped}));
