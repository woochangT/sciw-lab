/** 별도 평가 전용 Apps Script 프로젝트용. 운영 기록 프로젝트의 Code.gs를 덮어쓰지 않는다.
 * Rubric.gs는 tools/export-m02-apps-script.cjs로 같은 원본에서 생성한다.
 * 키는 사용자가 Script Properties의 OPENAI-API-KEY에 직접 설정한다.
 */
function doGet() {
  var props = PropertiesService.getScriptProperties();
  return m02Json_({ ok: true, service: 'm02-evaluator', rubricVersion: SCIW_RUBRIC02.VERSION,
    ready: Boolean(props.getProperty('OPENAI-API-KEY')) && props.getProperty('M02_JUDGE_ENABLED') === 'true' });
}
function doPost(e) {
  try {
    var raw = e && e.postData && e.postData.contents || '';
    if (!raw || raw.length > 32000) throw new Error('INVALID_REQUEST');
    var body = JSON.parse(raw);
    if (body.action !== 'judgeM02') throw new Error('INVALID_REQUEST');
    var payload = SCIW_RUBRIC02.prepare(body);
    var props = PropertiesService.getScriptProperties();
    var key = props.getProperty('OPENAI-API-KEY');
    if (!key) throw new Error('KEY_NOT_CONFIGURED');
    // 명시적으로 활성화하기 전에는 유료 API를 부르지 않는다.
    if (props.getProperty('M02_JUDGE_ENABLED') !== 'true') throw new Error('JUDGE_NOT_CONFIGURED');
    m02ReserveCall_(props);
    var model = props.getProperty('M02_OPENAI_MODEL') || 'gpt-5.4-mini-2026-03-17';
    var response = UrlFetchApp.fetch('https://api.openai.com/v1/responses', {
      method: 'post', contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + key },
      payload: JSON.stringify(SCIW_RUBRIC02.request(payload, model)), muteHttpExceptions: true
    });
    var status = response.getResponseCode();
    if (status !== 200) throw new Error(status === 401 ? 'KEY_REJECTED' : status === 429 ? 'RATE_LIMIT' : 'PROVIDER_ERROR');
    var result = SCIW_RUBRIC02.parseResponse(payload, JSON.parse(response.getContentText()));
    result.model = model; result.requestId = Utilities.getUuid();
    return m02Json_({ ok: true, result: result });
  } catch (error) {
    // 공급자 응답/키/학생 원문을 오류 메시지에 포함하지 않는다.
    var code = String(error && error.message || 'EVALUATION_ERROR');
    if (!/^(INVALID_[A-Z_]+|MISSING_[A-Z_]+|INCOMPLETE_RESPONSE|MODEL_REFUSAL|EMPTY_RESPONSE|KEY_NOT_CONFIGURED|KEY_REJECTED|JUDGE_NOT_CONFIGURED|RATE_LIMIT|DAILY_LIMIT|BUSY|PROVIDER_ERROR)$/.test(code)) code = 'EVALUATION_ERROR';
    return m02Json_({ ok: false, code: code });
  }
}
// 공개 주소의 유료 호출은 서버에서 상한을 적용한다. 실패한 공급자 요청도 사용량에 센다.
function m02ReserveCall_(props) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) throw new Error('BUSY');
  try {
    var day = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd');
    var minute = Math.floor(Date.now() / 60000);
    var usage = JSON.parse(props.getProperty('M02_USAGE') || '{}');
    var dailyLimit = m02Limit_(props.getProperty('M02_DAILY_LIMIT'), 300);
    var minuteLimit = m02Limit_(props.getProperty('M02_MINUTE_LIMIT'), 30);
    var dailyCount = usage.day === day ? Number(usage.dailyCount) || 0 : 0;
    var minuteCount = usage.minute === minute ? Number(usage.minuteCount) || 0 : 0;
    if (dailyCount >= dailyLimit) throw new Error('DAILY_LIMIT');
    if (minuteCount >= minuteLimit) throw new Error('RATE_LIMIT');
    props.setProperty('M02_USAGE', JSON.stringify({ day: day, minute: minute,
      dailyCount: dailyCount + 1, minuteCount: minuteCount + 1 }));
  } finally { lock.releaseLock(); }
}
function m02Limit_(raw, fallback) {
  var value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}
function m02Json_(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}
