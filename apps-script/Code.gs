/**
 * 서술 실험실 — Apps Script 백엔드
 *
 * 학생 기록을 Google 스프레드시트에 저장하고, 교사 히트맵에 반 단위 데이터를 내려준다.
 * (선택) Script Properties에 ANTHROPIC_API_KEY가 있으면 서술 답안을 Claude로 판정한다.
 *
 * 시트
 *   Sessions : 학생 1명 × 미션 1판 = 1행 (세션 + 요약)
 *   Attempts : 입력 1회 = 1행 (시도)
 *
 * 요청
 *   POST (Content-Type: text/plain, 본문 JSON)
 *     { action: 'batch', ops: [ {action:'startSession', session}, {action:'updateSession', sessionId, fields}, {action:'logAttempt', attempt} ] }
 *     { action: 'judge', kind: 'quest'|'defense', questId, text, checks,
 *       context?, synonyms?, errorCodes?, errorGuide?, defenseNote? }   ← 미션 02부터 미션 설정 파일에서 보낸다
 *   GET
 *     ?action=classData&classCode=3-2[&missionId=m02]   → 그 반의 세션과 시도
 *       missionId를 빼면 미션 01(missionId가 'm01'이거나 빈 행)만 준다. 미션 01 교사 화면이 그대로 동작하게 하려는 것.
 *     ?action=ping
 *
 * 미션마다 보내는 값이 달라도 버리지 않는다: 머리글에 없는 값은 extra 열에 JSON으로 모인다.
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
  'ownMode', 'ownReward', 'extra', 'stage', 'lessonId', 'ownerSub'
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
// 고정된 평가 항목 정의. 이것은 판정기가 아니며 학생이 보낸 평가 결과를 신뢰하지 않는다.
const SERVER_RUBRICS = {
  m01: {version:'m01-1', elements:{C:'세포 안 농도의 범위',D:'5%와 10%의 질량 변화 자료',W1:'질량 변화와 물의 이동',W2a:'5%에서 물 이동과 농도 비교',W2b:'10%에서 물 이동과 농도 비교',W3:'두 결과를 결합한 범위',WB:'평형과 부호 변화로 범위 추론'}},
  m02: {version:'m02-1', elements:{C:'산소가 결합해 질량 증가', 'D-A':'열린 실험의 질량 변화', 'D-B':'닫힌 실험의 전체 질량 유지', W1a:'질량이 저절로 생기지 않음', W1b:'산소가 반응에 참여', W2a:'닫힌 계에서 산소의 이동', W2b:'증가한 질량과 산소 결합의 연결'}}
};
const MAX_BODY_CHARS = 100000;
function validId_(v, max) { return typeof v === 'string' && v.length > 0 && v.length <= max && /^[a-zA-Z0-9_-]+$/.test(v); }
function validateTree_(v, depth) {
  if (depth > 8) throw new Error('기록 구조가 너무 깊습니다');
  if (typeof v === 'string' && v.length > 4000) throw new Error('입력이 너무 깁니다');
  if (typeof v === 'number' && !isFinite(v)) throw new Error('숫자가 잘못되었습니다');
  if (Array.isArray(v)) { if (v.length > 100) throw new Error('항목이 너무 많습니다'); v.forEach(function(x){validateTree_(x, depth+1);}); }
  else if (v && typeof v === 'object') {
    const keys = Object.keys(v); if (keys.length > 80) throw new Error('항목이 너무 많습니다');
    keys.forEach(function(k) { if (k.length > 80 || ['__proto__','constructor','prototype'].indexOf(k) >= 0) throw new Error('허용되지 않은 항목'); validateTree_(v[k], depth+1); });
  }
}
function validateOp_(op) {
  validateTree_(op, 0);
  if (JSON.stringify(op).length > 20000) throw new Error('기록이 너무 큽니다');
  const record = op.action === 'startSession' ? op.session : op.action === 'updateSession' ? op.fields : op.attempt;
  if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error('잘못된 기록');
  const forbidden = ['ownerSub','updatedAt','extra','finalC','finalD','finalW1','finalW2a','finalW2b','finalW3','finalWB','finalDA','finalDB','finalW1a','finalW1b'];
  if (Object.keys(record).some(function(k){return forbidden.indexOf(k)>=0;})) throw new Error('서버 전용 항목은 변경할 수 없습니다');
  if (op.action === 'logAttempt' && !validId_(record.attemptId, 128)) throw new Error('잘못된 시도 ID');
}


// ───────────────────────── 진입점 ─────────────────────────

function doGet(e) {
  const p = (e && e.parameter) || {};
  try {
    // 공개 웹 앱에서는 호출자의 교사 신원을 검증할 수 없다. 인증 도입 전 원문 조회를 차단한다.
    if (p.action === 'classData') throw new Error('교사 인증이 설정되지 않아 조회가 차단되었습니다');
    if (p.action === 'ping') return json_({ ok: true, time: new Date().toISOString() });
    return HtmlService.createHtmlOutput('<p style="font-family:sans-serif">서술 실험실 백엔드가 동작 중입니다.</p>');
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function doPost(e) {
  try {
    const raw = e && e.postData && e.postData.contents || '';
    if (!raw || raw.length > MAX_BODY_CHARS) throw new Error('요청 크기가 잘못되었습니다');
    const body = JSON.parse(raw);
    if (body.action === 'classData') {
      const identity = authenticate_(body.credential);
      authorizeTeacher_(identity, body.classCode, body.missionId, body.lessonId);
      return json_(Object.assign({ ok: true, rubric: SERVER_RUBRICS[body.missionId], evaluation: 'client_unverified' }, getClassData_(body.classCode, body.missionId, body.lessonId)));
    }
    if (body.action === 'judge') throw new Error('서버 루브릭과 학생 인증이 준비되지 않아 판정이 차단되었습니다');
    const ops = body.action === 'batch' ? body.ops : [body];
    if (!Array.isArray(ops) || !ops.length || ops.length > 40) throw new Error('잘못된 요청');
    const identity = authenticate_(body.credential);
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      ops.forEach(function (op) { validateOp_(op); authorizeStudentOp_(identity, op); if (op.action === 'startSession') op.session.ownerSub = identity.sub; applyOp_(op); });
    } finally { lock.releaseLock(); }
    return json_({ ok: true, applied: ops.length });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

// 운영 배포 전 검증된 신원 제공자를 연결해야 한다. 클라이언트 값은 신원으로 취급하지 않는다.
// 실제 구현은 서명, 발급자, 대상, 만료를 검증한 뒤 불변 사용자 ID(sub)를 반환해야 한다.
function authenticate_(credential) {
  throw new Error('인증 제공자가 설정되지 않았습니다');
}

// 서버 Script Properties의 ACCESS_GRANTS만 권한의 기준이다. 예: {"sub": {"teachers":[{"classCode":"A","missionId":"m01"}],"students":[{"classCode":"A","missionId":"m01","studentNo":"1"}]}}
function grants_(identity) {
  if (!identity || typeof identity.sub !== 'string' || !identity.sub) throw new Error('인증 실패');
  const raw = PropertiesService.getScriptProperties().getProperty('ACCESS_GRANTS');
  if (!raw) throw new Error('접근 권한이 설정되지 않았습니다');
  const all = JSON.parse(raw);
  return Object.prototype.hasOwnProperty.call(all, identity.sub) ? all[identity.sub] : {};
}
function sameScope_(grant, classCode, missionId, lessonId) {
  return grant && grant.classCode === classCode && grant.missionId === missionId && grant.lessonId === lessonId;
}
function authorizeTeacher_(identity, classCode, missionId, lessonId) {
  if (typeof classCode !== 'string' || !classCode || classCode.length > 20 || !validId_(lessonId, 64) || ['m01','m02'].indexOf(missionId) < 0) throw new Error('수업과 미션이 필요합니다');
  const grants = grants_(identity);
  if (!Array.isArray(grants.teachers) || !grants.teachers.some(function (g) { return sameScope_(g, classCode, missionId, lessonId); })) throw new Error('수업 접근 권한이 없습니다');
}
function authorizeStudentOp_(identity, op) {
  if (!op || ['startSession','updateSession','logAttempt'].indexOf(op.action) < 0) throw new Error('잘못된 기록 작업');
  const id = op.action === 'startSession' ? op.session && op.session.sessionId : op.action === 'logAttempt' ? op.attempt && op.attempt.sessionId : op.sessionId;
  if (!validId_(id, 128)) throw new Error('잘못된 세션');
  const rows = readSheet_(SHEET_SESSIONS, SESSION_HEADERS);
  const existing = rows.find(function (s) { return s.sessionId === id; });
  const submitted = op.action === 'startSession' ? op.session : op.action === 'logAttempt' ? op.attempt : op.fields;
  if (!submitted || typeof submitted !== 'object' || Array.isArray(submitted)) throw new Error('잘못된 기록');
  const scope = existing || (op.action === 'startSession' ? op.session : null);
  if (!scope) throw new Error('세션을 찾을 수 없습니다');
  if (!validId_(scope.lessonId, 64) || typeof scope.classCode !== 'string' || !scope.classCode || scope.classCode.length > 20 || !/^[0-9]{1,3}$/.test(String(scope.studentNo)) || !SERVER_RUBRICS[scope.missionId]) throw new Error('잘못된 수업 정보');
  if (existing && existing.ownerSub !== identity.sub) throw new Error('다른 학생의 세션입니다');
  const immutable = ['sessionId','classCode','missionId','studentNo','lessonId'];
  if (existing && immutable.some(function (k) { return submitted[k] !== undefined && String(submitted[k]) !== String(existing[k]); })) throw new Error('세션 소속을 변경할 수 없습니다');
  const grants = grants_(identity);
  if (!Array.isArray(grants.students) || !grants.students.some(function (g) { return sameScope_(g, String(scope.classCode), String(scope.missionId || DEFAULT_MISSION), String(scope.lessonId)) && String(g.studentNo) === String(scope.studentNo); })) throw new Error('학생 기록 권한이 없습니다');
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
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
  // finalJudgment는 클라이언트 기록일 뿐이다. 서버가 검증한 평가 열로 변환하지 않는다.
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

function getClassData_(classCode, missionId, lessonId) {
  if (!classCode) throw new Error('반 코드가 필요합니다');
  const sameMission = function (s) {
    const m = String(s.missionId || '');
    return missionId ? (m === missionId || (!m && missionId === DEFAULT_MISSION)) : (m === '' || m === DEFAULT_MISSION);
  };
  const sessions = readSheet_(SHEET_SESSIONS, SESSION_HEADERS).filter(function (s) { return String(s.classCode) === classCode && String(s.lessonId) === lessonId && sameMission(s); });
  const ids = new Set(sessions.map(function (s) { return s.sessionId; }));
  const attempts = readSheet_(SHEET_ATTEMPTS, ATTEMPT_HEADERS).filter(function (a) { return ids.has(a.sessionId); });
  return { sessions: sessions.map(function (s) { const safe = Object.assign({}, s); delete safe.ownerSub; return safe; }), attempts: attempts };
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
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('SPREADSHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  const created = SpreadsheetApp.create('서술 실험실 기록');
  props.setProperty('SPREADSHEET_ID', created.getId());
  return created;
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

/** 처음 한 번 실행: 시트 두 개를 만들고 머리글을 넣는다. */
function setup() {
  sheet_(SHEET_SESSIONS, SESSION_HEADERS);
  sheet_(SHEET_ATTEMPTS, ATTEMPT_HEADERS);
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
