/** Retry failed or missing final-answer evaluation using the saved submission. */
const REJUDGE_KEYS = {
  m01: ['C','D','W1','W2a','W2b','W3','WB'],
  m02: ['C','D-A','D-B','W1a','W1b','W2a','W2b']
};
const REJUDGE_LEASE_MS = 180000;

function rejudgeLock_(work) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const value = work();
    SpreadsheetApp.flush();
    return value;
  } finally {
    lock.releaseLock();
  }
}

function finalRejudgeTarget_(session, attempts) {
  const events = attempts.slice().sort(function(a,b) {
    const time = v => Date.parse(v || '') || 0;
    return (Number(a.eventOrder)>0 && Number(b.eventOrder)>0
      ? Number(a.eventOrder)-Number(b.eventOrder)
      : time(a.clientOccurredAt || a.createdAt)-time(b.clientOccurredAt || b.createdAt))
      || String(a.attemptId).localeCompare(String(b.attemptId));
  });
  const current = events.filter(function(a) {
    return a.stage==='defense' && a.questId==='FINAL'
      || a.stage==='compose' && ['final','clarify'].includes(a.questId)
      || a.eventCode==='m02.compose.final.submit'
      || a.questId==='studentInput' && (a.evaluationStage==='final' || a.stage==='defense' || a.questionId==='FINAL');
  }).pop();
  const raw = current && current.inReplyTo && events.find(a => a.attemptId===current.inReplyTo && a.questId==='studentInput' && a.input===current.input);
  const text = current ? current.input : session.finalAnswer;
  if (typeof text !== 'string' || !text.trim()) return null;
  return { id:raw ? raw.attemptId : current ? current.attemptId : '', text:text, record:current || session, input:raw || current };
}

function readRejudgeSession_(body) {
  const existing = locate_('session', body.sessionId);
  if (!existing || existing.mission!==body.missionId) return null;
  const session = readPayload_(existing.values);
  if (session.classCode!==body.classCode || !validClassCode_(session.classCode)) return null;
  const older = missionRows_(existing.mission).rows.filter(row => row[0]==='attempt' && row[2]===body.sessionId).map(readPayload_);
  const attempts = older.concat(session.attempts || []);
  return { existing:existing, session:session, target:finalRejudgeTarget_(session, attempts), attempts:attempts };
}

function canRejudgeFinal_(data) {
  const {session, target, attempts} = data;
  if (session.teacherRejudgment?.attemptId===target.id) return false;
  const record = target.record;
  const raw = record.questId==='studentInput';
  const status = record===session ? session.finalEvaluationStatus : record.evaluationStatus;
  const failed = raw && attempts.some(a => a.questId==='finalEvaluation' &&
    a.inReplyTo===record.attemptId && a.evaluationStatus==='failed');
  if (failed || status==='failed') return true;
  if (['pending','processing','unavailable'].includes(status) ||
      record.questId==='clarify' && record.outcome==='clarify' ||
      record.questId==='FINAL' && record.diagnosis==='UNCLEAR') return false;
  if (raw) return true;
  let judgment = record.judgment;
  if (typeof judgment==='string') {
    try { judgment=JSON.parse(judgment); } catch (_) { judgment=null; }
  }
  const saved = judgment && Object.keys(judgment).length ? judgment : session.finalJudgment;
  return !REJUDGE_KEYS[session.missionId].some(key =>
    [true,false,'true','false','TRUE','FALSE'].includes(saved?.[key]));
}

function saveRejudgeSession_(data, fields) {
  const session = Object.assign({},data.session,fields,{updatedAt:new Date().toISOString()});
  putRecord_('session',session.sessionId,session,data.existing.mission,data.existing);
}

function evaluateSavedFinal_(session, target) {
  const settings = SCIW_REJUDGE_SETTINGS;
  if (session.missionId==='m01') {
    const keyword = SCIW_M01_JUDGE(target.text,settings.lexicon,settings.answer);
    const originalMethod = target.record.judgedBy || session.judgedBy;
    const useAI = ['llm','anthropic'].includes(originalMethod);
    let result = keyword.elements;
    if (useAI) {
      result = judge_({kind:'defense',missionId:'m01',questId:'FINAL',text:target.text,
        checks:settings.llmDefenseChecks,context:settings.llmContext}).elements;
      if (result && result.WB===true) result.W2a = result.W2b = result.W3 = true;
    }
    return {judgment:result,judgedBy:useAI?'llm':'keyword',
      judgeVersion:useAI?'m01-llm-defense-v1':'keyword-m01-defense-v1',
      outcome:keyword.unclear && !Object.values(result || {}).some(Boolean)?'clarify':'assessed'};
  }
  const savedInput = target.input && target.input.evaluationInput;
  const response = UrlFetchApp.fetch(settings.m02Url,{
    method:'post',contentType:'text/plain;charset=utf-8',muteHttpExceptions:true,
    payload:JSON.stringify({action:'judgeM02',stage:'final',text:target.text,
      initialAnswer:savedInput ? savedInput.initialAnswer : session.firstAnswer || '',
      cardSpans:savedInput ? savedInput.cardSpans : []})
  });
  if (response.getResponseCode()!==200) throw new Error('EVALUATOR_UNAVAILABLE');
  const value = JSON.parse(response.getContentText()), result = value.result;
  if (!value.ok || !result || result.stage!=='final' || !/^m02-docx-[0-9.]+$/.test(result.rubricVersion)) {
    throw new Error(['TIMEOUT','BUSY','RATE_LIMIT','DAILY_LIMIT','JUDGE_NOT_CONFIGURED','KEY_NOT_CONFIGURED','INVALID_TEXT'].includes(value.code)
      ? value.code : 'EVALUATOR_UNAVAILABLE');
  }
  return {judgment:result.elements,judgedBy:'openai',judgeVersion:result.rubricVersion,
    rubricVersion:result.rubricVersion,outcome:result.outcome,analysis:result.analysis,contextLimited:!savedInput};
}

function rejudgeFinal_(body) {
  const {classCode, missionId, sessionId, attemptId, requestId} = body;
  if (!validClassCode_(classCode) || typeof missionId!=='string' || !Object.hasOwn(REJUDGE_KEYS,missionId) ||
      typeof sessionId!=='string' || !sessionId || sessionId.length>128 ||
      typeof attemptId!=='string' || attemptId.length>128 ||
      typeof requestId!=='string' || !/^[a-zA-Z0-9_-]{12,100}$/.test(requestId)) {
    return {ok:false,code:'INVALID_REQUEST'};
  }
  const start = rejudgeLock_(function() {
    const data = readRejudgeSession_(body);
    if (!data || !data.target || data.target.id!==attemptId) return {ok:false,code:'STALE_SUBMISSION'};
    const {session,target} = data, job = session.teacherRejudgeRequest;
    if (job && job.requestId===requestId && job.attemptId!==attemptId) return {ok:false,code:'STALE_SUBMISSION'};
    const previous = session.teacherRejudgment;
    if (previous && previous.requestId===requestId && previous.attemptId===attemptId) {
      return {ok:true,rejudgment:previous};
    }
    if (!canRejudgeFinal_(data)) return {ok:false,code:'REJUDGE_NOT_NEEDED'};
    if (job && job.status==='running' && Date.now()-Date.parse(job.at)<REJUDGE_LEASE_MS) {
      return {ok:false,code:'REJUDGE_BUSY'};
    }
    if (job && job.requestId===requestId && job.status==='failed') return {ok:false,code:job.code};
    if (target.text.length>(body.missionId==='m02'?1500:2000)) return {ok:false,code:'INVALID_TEXT'};
    const startedAt = new Date().toISOString();
    saveRejudgeSession_(data,{teacherRejudgeRequest:{requestId,attemptId,status:'running',at:startedAt}});
    return {session,target,startedAt};
  });
  if (!start.target) return start;

  let result, code;
  try {
    result = evaluateSavedFinal_(start.session,start.target);
    if (!result.judgment || !REJUDGE_KEYS[body.missionId].every(key => typeof result.judgment[key]==='boolean')) {
      throw new Error('INVALID_RESULT');
    }
    result.judgment = Object.fromEntries(REJUDGE_KEYS[body.missionId].map(key => [key,result.judgment[key]]));
    if (result.outcome==='clarify') code = 'UNAVAILABLE';
  } catch (error) {
    code = ['TIMEOUT','BUSY','RATE_LIMIT','DAILY_LIMIT','JUDGE_NOT_CONFIGURED','KEY_NOT_CONFIGURED','INVALID_TEXT','INVALID_RESULT'].includes(error.message)
      ? error.message : 'EVALUATOR_UNAVAILABLE';
  }

  return rejudgeLock_(function() {
    const data = readRejudgeSession_(body), job = data && data.session.teacherRejudgeRequest;
    if (!job || job.requestId!==requestId || job.at!==start.startedAt || job.status!=='running') return {ok:false,code:'STALE_SUBMISSION'};
    if (!data.target || data.target.id!==attemptId || data.target.text!==start.target.text ||
        JSON.stringify(data.target.input?.evaluationInput)!==JSON.stringify(start.target.input?.evaluationInput)) code = 'STALE_SUBMISSION';
    else if (!canRejudgeFinal_(data)) code = 'REJUDGE_NOT_NEEDED';
    const at = new Date().toISOString();
    if (code) {
      saveRejudgeSession_(data,{teacherRejudgeRequest:{requestId,attemptId,status:'failed',at,code}});
      return {ok:false,code};
    }
    const rejudgment = Object.assign({},result,{requestId,attemptId,at});
    try {
      saveRejudgeSession_(data,{teacherRejudgment:rejudgment,teacherRejudgeRequest:{requestId,attemptId,status:'completed',at}});
    } catch (_) {
      // Keep the original row and any earlier result when the new payload exceeds the row limits.
      saveRejudgeSession_(data,{teacherRejudgeRequest:{requestId,attemptId,status:'failed',at,code:'SAVE_FAILED'}});
      return {ok:false,code:'SAVE_FAILED'};
    }
    return {ok:true,rejudgment};
  });
}
