#!/usr/bin/env node
/* 운영 기록 주소를 지운 복사본 + 로컬 OpenAI 평가 프록시. Node 20 이상, 추가 패키지 없음. */
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '..');
const DST = path.join(ROOT, '.local', 'llm-site');
const WEB = '강철솜 질량 보존/web';
const rubric = require(path.join(ROOT, WEB, 'js/rubric02.js'));
const PORT = Number(process.env.M02_PORT || 8793);
const ORIGIN = 'http://127.0.0.1:' + PORT;
const MODEL = process.env.OPENAI_MODEL || 'gpt-5.4-mini-2026-03-17';
// .local은 정적 제공하지 않는다. 키는 브라우저나 저장소에 들어가지 않는다.
const keyFile = path.join(ROOT, '.local', 'openai-api-key');
function readKey() {
  const key = process.env.OPENAI_API_KEY || (fs.existsSync(keyFile) ? fs.readFileSync(keyFile, 'utf8').trim() : '');
  return key.trim();
}
function snapshot() {
  fs.mkdirSync(DST, { recursive: true });
  // 복사본만 갱신한다. symlink와 로컬/비밀 파일은 복사하지 않는다.
  fs.rmSync(DST, { recursive: true, force: true });
  fs.mkdirSync(DST, { recursive: true });
  const options = { recursive: true, filter(source) {
    const rel = path.relative(ROOT, source);
    if (rel && rel.split(path.sep).some((p) => p.startsWith('.'))) return false;
    return !fs.lstatSync(source).isSymbolicLink();
  } };
  // cpSync는 부모 폴더를 그 자신의 하위 폴더로 복사할 수 없어 항목별로 복사한다.
  for (const entry of fs.readdirSync(ROOT)) {
    if (!entry.startsWith('.')) fs.cpSync(path.join(ROOT, entry), path.join(DST, entry), options);
  }
  for (const mission of ['강철솜 질량 보존', '감자 삼투']) {
    const file = path.join(DST, mission, 'web/js/config.js');
    let cfg = fs.readFileSync(file, 'utf8').replace(/\bAPI_URL:\s*'[^']*'/g, "API_URL: ''");
    if (mission === '강철솜 질량 보존') {
      cfg += "\nObject.assign(window.SCIW_CONFIG, { API_URL: '', USE_LLM: true, JUDGE_API_URL: '/api/m02/judge', LLM_TIMEOUT_MS: 65000 });\n";
    }
    fs.writeFileSync(file, cfg);
  }
  // 교사 페이지도 운영 서버에 접근하지 않는다.
  const teacherConfig = path.join(DST, 'teacher/config.js');
  if (fs.existsSync(teacherConfig)) fs.writeFileSync(teacherConfig, fs.readFileSync(teacherConfig, 'utf8').replace(/\bAPI_URL:\s*'[^']*'/g, "API_URL: ''"));
}
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.json': 'application/json; charset=utf-8', '.ico': 'image/x-icon' };
function reply(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}
async function readBody(req) {
  const parts = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 32000) throw new Error('INVALID_REQUEST');
    parts.push(chunk);
  }
  return JSON.parse(Buffer.concat(parts).toString('utf8'));
}
let busy = false;
async function judge(req, res) {
  // Loopback에서도 다른 웹사이트가 유료 호출을 시키지 못하게 한다.
  if (req.headers.origin !== ORIGIN || req.headers['x-sciw-local'] !== 'm02') return reply(res, 403, { ok: false, code: 'FORBIDDEN' });
  if (busy) return reply(res, 429, { ok: false, code: 'BUSY' });
  const key = readKey();
  if (!key) return reply(res, 503, { ok: false, code: 'KEY_NOT_CONFIGURED' });
  busy = true;
  try {
    const body = await readBody(req);
    if (body.action !== 'judgeM02') throw new Error('INVALID_REQUEST');
    const payload = rubric.prepare(body);
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify(rubric.request(payload, MODEL)), signal: AbortSignal.timeout(60000)
    });
    if (!response.ok) {
      // 공급자 응답 원문에는 요청 정보가 섞일 수 있어 클라이언트/로그로 내보내지 않는다.
      const code = response.status === 401 ? 'KEY_REJECTED' : response.status === 429 ? 'RATE_LIMIT' : 'PROVIDER_ERROR';
      return reply(res, 502, { ok: false, code });
    }
    const message = await response.json();
    if (process.env.M02_DEBUG === '1') fs.writeFileSync(path.join(ROOT, '.local', 'm02-debug-response.json'), JSON.stringify(message, null, 2), { mode: 0o600 });
    const result = rubric.parseResponse(payload, message);
    result.model = MODEL;
    result.requestId = crypto.randomUUID();
    reply(res, 200, { ok: true, result });
  } catch (err) {
    const code = /Timeout|Abort/.test(err.name) ? 'TIMEOUT' : /^(INVALID_|MISSING_|INCOMPLETE_|MODEL_REFUSAL|EMPTY_RESPONSE)/.test(err.message) ? err.message : 'EVALUATION_ERROR';
    reply(res, 502, { ok: false, code });
  } finally { busy = false; }
}
const server = http.createServer(async (req, res) => {
  try {
    // Host 검증으로 DNS rebinding을 막고, 단일 origin으로만 사용한다.
    if (req.headers.host !== '127.0.0.1:' + PORT) return reply(res, 403, { ok: false, code: 'FORBIDDEN_HOST' });
    const url = new URL(req.url, ORIGIN);
    if (url.pathname === '/api/m02/judge' && req.method === 'POST') return await judge(req, res);
    if (req.method !== 'GET' && req.method !== 'HEAD') return reply(res, 405, { ok: false });
    if (url.pathname === '/api/m02/status') return reply(res, 200, { ok: true, hasKey: Boolean(readKey()), model: MODEL, rubricVersion: rubric.VERSION, records: 'local-only' });
    const parts = decodeURIComponent(url.pathname).split('/');
    if (parts.some((p) => p.startsWith('.') || p.includes('\\'))) return reply(res, 404, { ok: false });
    let file = path.resolve(DST, '.' + decodeURIComponent(url.pathname));
    if (!file.startsWith(DST + path.sep) && file !== DST) return reply(res, 404, { ok: false });
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    const mime = MIME[path.extname(file).toLowerCase()];
    if (!mime || !fs.existsSync(file)) return reply(res, 404, { ok: false });
    res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  } catch (_) { if (!res.headersSent) reply(res, 500, { ok: false, code: 'LOCAL_SERVER_ERROR' }); else res.end(); }
});
snapshot();
server.listen(PORT, '127.0.0.1', () => {
  console.log('미션 02 API 실험: ' + ORIGIN + '/' + encodeURIComponent('강철솜 질량 보존') + '/web/');
  console.log('기록: 로컬 전용 / 루브릭: ' + rubric.VERSION + ' / 모델: ' + MODEL);
  console.log(readKey() ? 'OpenAI 키: 설정됨 (실제 호출은 답안을 제출할 때만)' : 'OpenAI 키: 미설정. .local/openai-api-key에 직접 입력하면 재시작 없이 적용됩니다.');
});
server.on('error', (err) => { console.error(err.code === 'EADDRINUSE' ? '8793 포트가 사용 중입니다. 기존 서버를 종료하거나 M02_PORT를 지정하세요.' : '로컬 서버를 시작하지 못했습니다.'); process.exitCode = 1; });
