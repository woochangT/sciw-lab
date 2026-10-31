/** 미션별 탭과 기존 Sessions/Attempts에 함께 저장하는 기록 백엔드. 운영 전 교사 인증과 시트 공유 범위를 검토한다.
 * 기존 batch 프로토콜을 유지한다. POST classData는 반·미션별 교사 키를 검증한다.
 * legacy GET classData는 차단한다. reconcileLegacy는 원본 탭을 수정하지 않는다.
 */

const SHEET_SESSIONS = 'Sessions';
const SHEET_ATTEMPTS = 'Attempts';

const SESSION_HEADERS = [
  'sessionId', 'classCode', 'studentNo', 'missionId', 'startedAt', 'endedAt', 'clearType',
  'firstAnswer', 'finalAnswer',
  'finalC', 'finalD', 'finalW1', 'finalW2a', 'finalW2b', 'finalW3', 'finalWB',
  'firstError', 'hintTotal', 'defenseTries', 'judgedBy',
  'stageTimes', 'clueCards', 'modelCards', 'questPassed', 'finalJudgment', 'errorCounts', 'hintMax',
  'updatedAt',
  // 미션 02에서 더한 열 (기존 시트에는 맨 뒤에 붙는다)
  'finalDA', 'finalDB', 'finalW1a', 'finalW1b', 'path', 'hintLevel', 'hintReason',
  'sortFirstRight', 'dwConfusion', 'selfPredict', 'selfPredictMatch', 'firstSubmitBeforeHint', 'firstSubmitDiag',
  'ownMode', 'ownReward', 'extra'
];
const ATTEMPT_HEADERS = [
  'attemptId', 'sessionId', 'classCode', 'studentNo', 'missionId', 'stage', 'questId', 'element',
  'attemptNo', 'input', 'diagnosis', 'errorType', 'hintLevel', 'durationMs', 'judgedBy', 'judgment', 'createdAt',
  'choice', 'pass', 'extra'
];
const JSON_FIELDS = ['stageTimes', 'clueCards', 'modelCards', 'questPassed', 'finalJudgment', 'errorCounts', 'hintMax', 'judgment', 'extra'];
const FINAL_KEYS = ['C', 'D', 'W1', 'W2a', 'W2b', 'W3', 'WB'];
// 미션별 최종 판정 요소. 열 이름은 'final' + 요소 코드에서 '-'를 뺀 것 (D-A → finalDA)
const FINAL_KEYS_BY_MISSION = {
  m01: FINAL_KEYS,
  m02: ['C', 'D-A', 'D-B', 'W1a', 'W1b', 'W2a', 'W2b']
};
const DEFAULT_MISSION = 'm01';

// ───────────────────────── 진입점 ─────────────────────────

// 미션별 탭에 기록하고 기존 Sessions/Attempts에도 같은 기록을 반영한다.
const TARGET_SPREADSHEET_ID = '1oA71tk0hqCXC0ImV3c5MZq938hZFKcj2XkJnB3XNnAU';
const RECORD_HEADERS = ['recordType','recordId','sessionId','classCode','studentNo','missionId','createdAt','updatedAt','payload'];
const MISSION_SHEETS = {m01:'감자', m02:'강철솜'};
function doGet(e) {
  const p = e && e.parameter || {};
  if (p.action === 'ping') return json_({ok:true, schema:'mission-records-v1', missions:['m01','m02']});
  if (p.action === 'classData') return json_({ok:false,error:'교사 인증이 필요합니다'});
  return json_({ok:true});
}
function doPost(e) {
  try {
    const raw = e && e.postData && e.postData.contents || '';
    if (!raw || raw.length > 150000) throw new Error('잘못된 요청 크기');
    const body = JSON.parse(raw);
    if (body.action === 'classData') {
      authorizeTeacher_(body);
      return json_(Object.assign({ok:true}, getMissionClassData_(body.classCode, body.missionId)));
    }
    if (body.action === 'judge') return json_({ok:true,result:judge_(body)});
    const ops = body.action === 'batch' ? body.ops : [body];
    if (!Array.isArray(ops) || !ops.length || ops.length > 40) throw new Error('잘못된 기록 묶음');
    const lock = LockService.getScriptLock(); lock.waitLock(20000);
    try { ops.forEach(applyMissionOp_); } finally { lock.releaseLock(); }
    return json_({ok:true,applied:ops.length});
  } catch (err) { return json_({ok:false,error:String(err && err.message || err)}); }
}
// 별도 키를 정적 웹 파일에 넣지 않는다. 강한 비밀값과 반·미션 매핑을 운영자가 Script Properties에 설정해야 한다.
function authorizeTeacher_(body) {
  if (!body || typeof body.classCode !== 'string' || !body.classCode || body.classCode.length > 20 || !MISSION_SHEETS[body.missionId] || typeof body.teacherKey !== 'string' || body.teacherKey.length < 24 || body.teacherKey.length > 256) throw new Error('교사 인증 실패');
  const raw = PropertiesService.getScriptProperties().getProperty('TEACHER_ACCESS');
  if (!raw) throw new Error('교사 접근 설정이 없습니다');
  const rules = JSON.parse(raw);
  const digest = value => Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value).map(x => ('0'+((x+256)%256).toString(16)).slice(-2)).join('');
  const got = digest(body.teacherKey);
  if (!Array.isArray(rules) || !rules.some(r => r && r.classCode === body.classCode && r.missionId === body.missionId && typeof r.keySha256 === 'string' && r.keySha256 === got)) throw new Error('교사 인증 실패');
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function missionSheet_(missionId) {
  const name = MISSION_SHEETS[missionId]; if (!name) throw new Error('지원하지 않는 미션');
  const sh = SpreadsheetApp.openById(TARGET_SPREADSHEET_ID).getSheetByName(name);
  if (!sh) throw new Error('미션 탭이 없습니다');
  const header = sh.getRange(1,1,1,RECORD_HEADERS.length).getValues()[0].map(String);
  if (header.join('\t') !== RECORD_HEADERS.join('\t')) throw new Error('미션 탭 헤더가 다릅니다');
  return sh;
}
function missionRows_(missionId) {
  const sh = missionSheet_(missionId), last = sh.getLastRow();
  return {sh:sh, rows:last < 2 ? [] : sh.getRange(2,1,last-1,RECORD_HEADERS.length).getDisplayValues()};
}
function locate_(kind,id) {
  const hits=[];
  Object.keys(MISSION_SHEETS).forEach(function(m) { const data=missionRows_(m); data.rows.forEach(function(r,i){if(r[0]===kind && r[1]===id) hits.push({mission:m,sh:data.sh,row:i+2,values:r});}); });
  if (hits.length > 1) throw new Error('기록 ID가 중복되어 확인이 필요합니다');
  return hits[0] || null;
}
function putRecord_(kind, id, record, mission, existing) {
  if (!id || typeof id !== 'string' || id.length > 128 || JSON.stringify(record).length > 40000) throw new Error('기록이 잘못되었거나 너무 큽니다');
  const sh = existing ? existing.sh : missionSheet_(mission), timestamp = new Date().toISOString();
  const row = [kind,id,String(record.sessionId || ''),String(record.classCode || ''),String(record.studentNo || ''),mission,String(record.createdAt || record.startedAt || timestamp),String(record.updatedAt || timestamp),JSON.stringify(record)];
  sh.getRange(existing ? existing.row : sh.getLastRow()+1,1,1,RECORD_HEADERS.length).setNumberFormat('@').setValues([row]);
}
function readPayload_(record) {
  let value; try { value=JSON.parse(record[8]); } catch(e) { throw new Error('기록 payload를 읽을 수 없습니다'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('기록 payload가 잘못되었습니다');
  // 이전 이관본에 JSON 문자열로 남은 필드도 새 기록과 같은 형태로 읽는다.
  return rowToObj_(Object.keys(value), Object.keys(value).map(function(k) { return value[k]; }));
}
// 미션 저장을 먼저 검증한다. 두 번째 쓰기가 실패해도 재전송으로 두 저장소를 복구한다.
function applyMissionOp_(op) {
  writeMissionOp_(op);
  if (op.action === 'startSession') {
    const saved = locate_('session', op.session.sessionId);
    upsertSession_(op.session.sessionId, readPayload_(saved.values));
  } else if (op.action === 'updateSession') {
    const saved = locate_('session', op.sessionId);
    upsertSession_(op.sessionId, readPayload_(saved.values));
  } else if (op.action === 'logAttempt') {
    const saved = locate_('attempt', op.attempt.attemptId);
    appendAttempt_(readPayload_(saved.values));
  }
}

// 배포 전에 시작된 판도 startSession 재전송 없이 계속 기록할 수 있다.
function restoreLegacySession_(sid) {
  const sh = SpreadsheetApp.openById(TARGET_SPREADSHEET_ID).getSheetByName(SHEET_SESSIONS);
  if (!sh) return null;
  const row = findRow_(sh, sid);
  if (!row) return null;
  const h = headers_(sh);
  const session = rowToObj_(h, sh.getRange(row, 1, 1, h.length).getValues()[0]);
  const mission = session.missionId || DEFAULT_MISSION;
  putRecord_('session', sid, session, mission, null);
  return locate_('session', sid);
}
function writeMissionOp_(op) {
  if (!op || ['startSession','updateSession','logAttempt'].indexOf(op.action)<0) throw new Error('지원하지 않는 기록 작업');
  const fields=op.action==='startSession'?op.session:op.action==='updateSession'?op.fields:op.attempt;
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) throw new Error('잘못된 기록');
  const sid=op.action==='startSession'?fields.sessionId:op.action==='updateSession'?op.sessionId:fields.sessionId;
  if (typeof sid !== 'string' || !sid || sid.length>128) throw new Error('세션 ID 오류');
  const existing=locate_('session',sid) || (op.action==='startSession' ? null : restoreLegacySession_(sid));
  if (op.action==='startSession') {
    const mission=fields.missionId || 'm01'; if (!MISSION_SHEETS[mission]) throw new Error('지원하지 않는 미션');
    if (existing) {
      const old=readPayload_(existing.values);
      if (existing.mission!==mission || String(old.classCode)!==String(fields.classCode) || String(old.studentNo)!==String(fields.studentNo)) throw new Error('세션 범위 충돌');
      return; // 재시작 재전송이 기존 진행을 되돌리지 않는다.
    }
    putRecord_('session',sid,Object.assign({},fields,{missionId:mission}),mission,null); return;
  }
  if (!existing) throw new Error('세션이 없어 기록을 보류합니다');
  const old=readPayload_(existing.values), mission=existing.mission;
  if (op.action==='updateSession') {
    ['sessionId','missionId','classCode','studentNo'].forEach(function(k){ if (fields[k]!==undefined && String(fields[k])!==String(old[k])) throw new Error('세션 범위 변경 불가'); });
    const merged=Object.assign({},old,fields,{sessionId:sid,missionId:mission,updatedAt:new Date().toISOString()});
    putRecord_('session',sid,merged,mission,existing); return;
  }
  if (!fields.attemptId || typeof fields.attemptId!=='string') throw new Error('시도 ID 오류');
  ['missionId','classCode','studentNo'].forEach(function(k){const expected=k==='missionId' ? mission : old[k]; if(fields[k]!==undefined && String(fields[k])!==String(expected)) throw new Error('시도 범위 충돌');});
  const previous=locate_('attempt',fields.attemptId);
  if (previous) { if(previous.mission!==mission || previous.values[2]!==sid) throw new Error('시도 ID 충돌'); return; }
  putRecord_('attempt',fields.attemptId,Object.assign({},fields,{missionId:mission,classCode:old.classCode,studentNo:old.studentNo}),mission,null);
}
function getMissionClassData_(classCode, missionId) {
  const all=missionRows_(missionId).rows, sessions=all.filter(r=>r[0]==='session' && r[3]===classCode).map(readPayload_);
  const ids=new Set(sessions.map(s=>String(s.sessionId)));
  const attempts=all.filter(r=>r[0]==='attempt' && ids.has(r[2])).map(readPayload_);
  return {sessions:sessions,attempts:attempts};
}
// 운영 중인 구버전 쓰기를 멈춘 뒤, 기존 탭을 읽어 최신 분을 다시 반영한다. 원본 탭은 수정하지 않는다.
function reconcileLegacy() {
  const lock=LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const ss=SpreadsheetApp.openById(TARGET_SPREADSHEET_ID);
    ['Sessions','Attempts'].forEach(function(name){
      const sh=ss.getSheetByName(name); if (!sh) throw new Error('기존 탭 없음: '+name);
      const last=sh.getLastRow(), n=sh.getLastColumn(); if(last<2) return;
      const h=sh.getRange(1,1,1,n).getDisplayValues()[0];
      sh.getRange(2,1,last-1,n).getDisplayValues().forEach(function(row){
        const obj=rowToObj_(h,row);
        const kind=name==='Sessions'?'session':'attempt', id=kind==='session'?obj.sessionId:obj.attemptId;
        if (!id) throw new Error('기존 기록 ID 없음');
        const mission=obj.missionId || 'm01'; if(!MISSION_SHEETS[mission]) throw new Error('기존 미션 확인 필요');
        const existing=locate_(kind,id);
        if (existing && existing.mission!==mission) throw new Error('기존 기록 미션 충돌');
        if (existing && kind==='attempt') return;
        if (existing) {
          const oldTime=Date.parse(obj.updatedAt || obj.startedAt || '');
          const newTime=Date.parse(existing.values[7] || '');
          if (!oldTime || !newTime) throw new Error('시각 없는 세션 충돌: 수동 확인 필요');
          if(oldTime <= newTime) return;
        }
        putRecord_(kind,id,obj,mission,existing);
      });
    });
  } finally { lock.releaseLock(); }
}

// ───────────────────────── 쓰기 ─────────────────────────

function applyOp_(op) {
  if (!op || !op.action) return;
  if (op.action === 'startSession') upsertSession_(op.session.sessionId, op.session);
  else if (op.action === 'updateSession') upsertSession_(op.sessionId, op.fields || {});
  else if (op.action === 'logAttempt') appendAttempt_(op.attempt);
}

function upsertSession_(sessionId, fields) {
  if (!sessionId) throw new Error('sessionId 없음');
  const sh = sheet_(SHEET_SESSIONS, SESSION_HEADERS);
  const headers = headers_(sh);
  const row = findRow_(sh, sessionId);
  const current = row ? rowToObj_(headers, sh.getRange(row, 1, 1, headers.length).getValues()[0]) : {};
  const merged = Object.assign({}, current, fields, { sessionId: sessionId, updatedAt: new Date().toISOString() });
  if (fields.finalJudgment) {
    const keys = FINAL_KEYS_BY_MISSION[merged.missionId || DEFAULT_MISSION] || FINAL_KEYS;
    keys.forEach(function (k) { merged[finalCol_(k)] = fields.finalJudgment[k] ? 'TRUE' : 'FALSE'; });
  }
  merged.extra = withExtra_(current.extra, fields, headers);
  const values = [headers.map(function (h) { return cell_(h, merged[h]); })];
  const target = row || sh.getLastRow() + 1;
  sh.getRange(target, 1, 1, headers.length).setNumberFormat('@').setValues(values);
}

function appendAttempt_(a) {
  if (!a || !a.attemptId) return;
  const sh = sheet_(SHEET_ATTEMPTS, ATTEMPT_HEADERS);
  if (findRow_(sh, a.attemptId)) return; // 재전송 중복 방지
  const headers = headers_(sh);
  const row = Object.assign({}, a, { extra: withExtra_(null, a, headers) });
  const values = [headers.map(function (h) { return cell_(h, row[h]); })];
  sh.getRange(sh.getLastRow() + 1, 1, 1, headers.length).setNumberFormat('@').setValues(values);
}

function finalCol_(k) { return 'final' + String(k).replace(/-/g, ''); }

// 머리글에 없는 값을 extra(JSON)에 모은다. 이전에 모인 값은 유지하고 같은 이름은 새 값으로 바꾼다.
function withExtra_(prev, fields, headers) {
  const out = (prev && typeof prev === 'object') ? Object.assign({}, prev) : {};
  Object.keys(fields || {}).forEach(function (k) {
    if (headers.indexOf(k) < 0) out[k] = fields[k];
  });
  return Object.keys(out).length ? out : '';
}

function cell_(header, v) {
  if (v === undefined || v === null) return '';
  if (JSON_FIELDS.indexOf(header) >= 0 && typeof v !== 'string') return JSON.stringify(v);
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

// ───────────────────────── 읽기 ─────────────────────────

function getClassData_(classCode, missionId) {
  if (!classCode) throw new Error('반 코드가 필요합니다');
  const sameMission = function (s) {
    const m = String(s.missionId || '');
    return missionId ? m === missionId : (m === '' || m === DEFAULT_MISSION);
  };
  const sessions = readSheet_(SHEET_SESSIONS, SESSION_HEADERS).filter(function (s) { return String(s.classCode) === classCode && sameMission(s); });
  const ids = {};
  sessions.forEach(function (s) { ids[s.sessionId] = true; });
  const attempts = readSheet_(SHEET_ATTEMPTS, ATTEMPT_HEADERS).filter(function (a) { return ids[a.sessionId]; });
  return { sessions: sessions, attempts: attempts };
}

function readSheet_(name, defaultHeaders) {
  const sh = sheet_(name, defaultHeaders);
  const last = sh.getLastRow();
  if (last < 2) return [];
  const headers = headers_(sh);
  const values = sh.getRange(2, 1, last - 1, headers.length).getDisplayValues();
  return values.map(function (r) { return rowToObj_(headers, r); });
}

function rowToObj_(headers, row) {
  const o = {};
  headers.forEach(function (h, i) {
    let v = row[i];
    if (JSON_FIELDS.indexOf(h) >= 0 && typeof v === 'string' && v) {
      try { v = JSON.parse(v); } catch (e) { /* 원문 유지 */ }
    }
    o[h] = v;
  });
  return o;
}

// ───────────────────────── 시트 도우미 ─────────────────────────

function ss_() {
  return SpreadsheetApp.openById(TARGET_SPREADSHEET_ID);
}

function sheet_(name, headers) {
  const ss = ss_();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
    return sh;
  }
  // 새 버전에서 열이 추가되었으면 뒤에 붙인다
  const have = headers_(sh);
  const missing = headers.filter(function (h) { return have.indexOf(h) < 0; });
  if (missing.length) {
    sh.getRange(1, have.length + 1, 1, missing.length).setValues([missing]).setFontWeight('bold');
  }
  return sh;
}

function headers_(sh) {
  const n = sh.getLastColumn();
  if (!n) return [];
  return sh.getRange(1, 1, 1, n).getValues()[0].map(String).filter(function (h) { return h; });
}

function findRow_(sh, id) {
  const last = sh.getLastRow();
  if (last < 2) return 0;
  const hit = sh.getRange(2, 1, last - 1, 1).createTextFinder(String(id)).matchEntireCell(true).findNext();
  return hit ? hit.getRow() : 0;
}

/** 처음 한 번 실행: 기존 기록 탭과 미션 탭을 준비한다. */
function setup() {
  sheet_(SHEET_SESSIONS, SESSION_HEADERS);
  sheet_(SHEET_ATTEMPTS, ATTEMPT_HEADERS);
  Object.keys(MISSION_SHEETS).forEach(function(m) { sheet_(MISSION_SHEETS[m], RECORD_HEADERS); });
  Logger.log('준비 완료: ' + ss_().getUrl());
}

// ───────────────────────── LLM 판정 (선택) ─────────────────────────

const ERROR_GUIDE = [
  'N1 자료 나열: 숫자·관찰(늘었다/줄었다)만 되풀이하고 그것이 무슨 뜻인지 설명하지 않음',
  'N2 개념 이름표: "삼투" 같은 원리 이름만 쓰고 물이 어느 쪽으로 이동했는지 말하지 않음',
  'E1 용질 이동: 설탕(용질)이 세포막을 통과해 드나든다고 함',
  'E2 방향 역전: 물이 진한 쪽에서 묽은 쪽으로 간다고 하거나, 안팎 농도 비교를 거꾸로 씀',
  'E3 비교 대상 누락: "진하다/묽다"만 쓰고 무엇보다 진한지(묽은지) 비교 대상이 없음',
  'UNCLEAR 판정 불가: 의미 없는 입력, 빈칸'
].join('\n');

function judge_(body) {
  const props = PropertiesService.getScriptProperties();
  const key = props.getProperty('ANTHROPIC_API_KEY');
  if (!key) throw new Error('ANTHROPIC_API_KEY가 설정되지 않음 — 키워드 판정을 사용하세요');
  const model = props.getProperty('LLM_MODEL') || 'claude-opus-5-5';
  const checks = body.checks || {};
  const names = Object.keys(checks);
  const isDefense = body.kind === 'defense';
  // 미션별 값은 요청에서 받는다. 없으면 미션 01(감자) 값을 쓴다.
  const codes = (Array.isArray(body.errorCodes) && body.errorCodes.length)
    ? body.errorCodes.map(String).filter(function (c) { return /^[A-Z][A-Z0-9]{0,7}$/.test(c) && c !== 'NONE' && c !== 'UNCLEAR'; }).slice(0, 12)
    : ['N1', 'N2', 'E1', 'E2', 'E3'];
  const guide = clip_(body.errorGuide, 2000) || ERROR_GUIDE;
  const synonyms = clip_(body.synonyms, 600) || '유의어를 넓게 인정한다. "물이 빨려 들어갔다", "수분이 흡수됐다"는 "물이 들어왔다"와 같다. "농도가 높다"는 "진하다"와 같다.';
  const defenseNote = clip_(body.defenseNote, 600) || 'errors에는 답안에 나타난 오류 유형을 모두 넣는다(없으면 빈 배열). WB는 W2a·W2b·W3 대신 "안팎 농도가 같으면 질량 변화가 0" 경로로 설명한 경우다.';

  const boolProps = {};
  names.forEach(function (k) { boolProps[k] = { type: 'boolean' }; });
  const boolObj = { type: 'object', properties: boolProps, required: names, additionalProperties: false };
  const schema = isDefense
    ? {
        type: 'object',
        properties: {
          elements: boolObj,
          errors: { type: 'array', items: { type: 'string', enum: codes } }
        },
        required: ['elements', 'errors'],
        additionalProperties: false
      }
    : {
        type: 'object',
        properties: {
          checks: boolObj,
          error_type: { type: 'string', enum: ['NONE'].concat(codes, ['UNCLEAR']) }
        },
        required: ['checks', 'error_type'],
        additionalProperties: false
      };

  const system = [
    '너는 중학교 과학 서술형 답안을 판정하는 채점 보조다. 점수를 매기지 말고 체크 항목별 참/거짓과 오류 유형만 낸다.',
    '상황: ' + (clip_(body.context, 1500) || '감자 조각을 퍼센트 농도가 0%, 5%, 10%, 15%인 설탕물에 30분 담갔더니 질량 변화가 +8 g, +3 g, −5 g, −10 g이었다. 묻는 것은 감자 세포 안 용액의 농도다.'),
    synonyms,
    '학생이 실제로 쓴 의미만 보고, 쓰지 않은 내용을 추측해서 참으로 만들지 않는다.',
    '오류 유형:',
    guide,
    isDefense
      ? defenseNote
      : 'error_type: 모든 체크가 참이면 NONE, 아니면 가장 핵심적인 오류 유형 하나.'
  ].join('\n');

  const checkLines = names.map(function (k) { return '- ' + k + ': ' + checks[k]; }).join('\n');
  const user = '체크 항목:\n' + checkLines + '\n\n학생 답안:\n"""\n' + String(body.text || '').slice(0, 2000) + '\n"""';

  const req = {
    model: model,
    max_tokens: 2048,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: schema } },
    system: system,
    messages: [{ role: 'user', content: user }]
  };
  const headers = { 'x-api-key': key, 'anthropic-version': '2026-10-21' };
  if (props.getProperty('LLM_FALLBACKS') !== 'off') {
    req.fallbacks = 'default';
    headers['anthropic-beta'] = 'server-side-fallback-2026-07-01';
  }
  const res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    headers: headers,
    payload: JSON.stringify(req),
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) throw new Error('Claude API ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 300));
  const msg = JSON.parse(res.getContentText());
  if (msg.stop_reason === 'refusal') throw new Error('refusal');
  const block = (msg.content || []).filter(function (b) { return b.type === 'text'; })[0];
  if (!block) throw new Error('응답에 텍스트 없음');
  const out = JSON.parse(block.text);
  if (!isDefense && out.error_type === 'NONE') out.error_type = null;
  return out;
}

function clip_(v, max) { return typeof v === 'string' && v.trim() ? v.slice(0, max) : ''; }

/** 편집기에서 실행해 LLM 연결을 확인한다. */
function testJudge() {
  const r = judge_({
    kind: 'quest',
    text: '10% 설탕물에서 질량이 줄었다는 것은 물이 감자 밖으로 빠져나갔다는 것이고, 감자 안이 10% 설탕물보다 묽다는 뜻이다.',
    checks: { water_out: '물이 빠져나갔다고 썼는가', inside_low: '안이 10% 설탕물보다 묽다고 썼는가' }
  });
  Logger.log(JSON.stringify(r));
}

/** 편집기에서 실행해 미션 02 판정 설정이 통하는지 확인한다 (강철솜). */
function testJudgeM02() {
  const r = judge_({
    kind: 'quest',
    text: '실험 A에서 늘어난 0.5 g은 공기 중에서 들어와 강철솜과 결합한 산소의 질량이다.',
    checks: { oxygen: '산소라고 썼는가', from_air: '공기(바깥)에서 들어왔다고 썼는가', mass: '0.5 g이 그 산소의 질량이라고 썼는가' },
    context: '실험 A: 강철솜 2.0 g을 공기 중에서 태웠더니 2.5 g이 되었다. 실험 B: 마개를 막은 플라스크 안에서 태웠더니 전체 150.0 g이 그대로였다.',
    errorCodes: ['N1', 'N2', 'N3', 'N5', 'E1', 'E2', 'E3', 'E4'],
    errorGuide: 'N2 개념 이름표: "산화 철"처럼 이름만 씀\nE4 스스로 무거워짐: 질량이 새로 생겼다고 함\nUNCLEAR 판정 불가'
  });
  Logger.log(JSON.stringify(r));
}
