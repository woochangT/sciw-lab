#!/usr/bin/env python3
"""Password-gated team preview in front of the unchanged loopback-only server.

Run behind an HTTPS tunnel with one explicit public origin. No records or
credentials are logged; only web assets and the three teacher API routes pass.
"""
import argparse
import html
import http.client
from http.cookies import SimpleCookie, CookieError
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import PurePosixPath
import secrets
import threading
import time
import urllib.parse

COOKIE = '__Host-sciw_preview'
API_PATHS = {'/api/sheet/classes', '/api/sheet/class', '/api/sheet/analysis'}
WEB_ROOTS = ('teacher/', 'intro/', 'ui/', '감자 삼투/web/', '강철솜 질량 보존/web/')
WEB_TYPES = {'.html', '.js', '.css', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.ico', '.woff', '.woff2', '.mp4', '.webm', '.gif', '.mp3', '.json'}


def public_origin(value):
    parsed = urllib.parse.urlsplit(value)
    if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password or parsed.port or parsed.path not in ('', '/') or parsed.query or parsed.fragment:
        raise ValueError('HTTPS 공개 주소 하나를 지정하세요.')
    return 'https://' + parsed.hostname


def web_path(path):
    path = urllib.parse.unquote(path)
    if not path.startswith('/') or path.startswith('//') or '\\' in path or any(ord(c) < 32 for c in path):
        return False
    if any(p.startswith('.') for p in path.split('/') if p):
        return False
    if path in ('/', '/index.html', '/teacher.html'):
        return True
    return path.lstrip('/').startswith(WEB_ROOTS) and PurePosixPath(path).suffix.lower() in WEB_TYPES


class PreviewServer(ThreadingHTTPServer):
    def __init__(self, address, origin, code, upstream_port):
        self.origin = public_origin(origin)
        self.public_host = urllib.parse.urlsplit(self.origin).netloc
        self.code = code
        self.session = secrets.token_urlsafe(32)
        self.expires = time.monotonic() + 8 * 3600
        self.upstream_port = upstream_port
        self.failures = {}
        self.failures_lock = threading.Lock()
        super().__init__(address, Handler)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def reply(self, status, body=b'', content_type='text/plain; charset=utf-8', headers=None):
        if isinstance(body, str):
            body = body.encode()
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'private, no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('X-Frame-Options', 'DENY')
        self.send_header('Referrer-Policy', 'same-origin')
        self.send_header('X-Robots-Tag', 'noindex, nofollow, noarchive')
        for k, v in (headers or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(body)

    def valid_host(self):
        return self.headers.get('Host') == self.server.public_host

    def same_origin(self):
        return self.headers.get('Origin') == self.server.origin and self.headers.get('Sec-Fetch-Site') not in ('cross-site', 'same-site')

    def signed_in(self):
        try:
            jar = SimpleCookie(self.headers.get('Cookie', ''))
            token = jar[COOKIE].value if COOKIE in jar else ''
            return time.monotonic() < self.server.expires and secrets.compare_digest(token, self.server.session)
        except (CookieError, TypeError):
            return False

    def login_page(self, message='', status=200):
        self.reply(status, '''<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>팀 미리보기 · 서술 실험실</title>
<style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#203c32;color:#2b2a28;font:16px/1.6 system-ui,sans-serif}main{width:min(100%,420px);padding:36px;background:#fffdf8;border:7px solid #8a6a45;border-radius:12px}small{color:#756e60}h1{margin:8px 0;font-size:28px}p{margin:10px 0 24px}label{display:block;font-weight:700}input,button{width:100%;padding:13px 16px;border-radius:7px;font:inherit}input{margin:8px 0 18px;border:1px solid #877c67}button{background:#2f5446;color:white;border:0;font-weight:700;cursor:pointer}:focus-visible{outline:3px solid #c99a3e;outline-offset:3px}.error{color:#9b362c}</style>
<main><small>서술 실험실 · 팀 검토용</small><h1>실험실 미리보기</h1><p>전달받은 입장코드를 입력해 주세요.<br>학생 게임과 교사 화면을 함께 확인할 수 있어요.</p>
<form method="post" action="/_preview/login"><label for="code">입장코드</label><input id="code" name="code" type="password" autocomplete="current-password" maxlength="100" required autofocus><button>미리보기 열기 →</button></form>
<p class="error" role="status">''' + html.escape(message) + '''</p><small>팀 검토용 임시 주소입니다. 학생 답안이 포함된 화면은 팀 안에서만 공유해 주세요.</small></main></html>''', 'text/html; charset=utf-8', {'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"})

    def login(self):
        if not self.same_origin():
            return self.reply(403, '같은 미리보기 화면에서 입장해 주세요.')
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if not 0 < size <= 1024 or self.headers.get('Content-Type', '').split(';')[0] != 'application/x-www-form-urlencoded':
                raise ValueError()
            # This header is supplied by Cloudflare; it is only a rate-limit key.
            visitor = self.headers.get('CF-Connecting-IP', self.client_address[0])[:100]
            now = time.monotonic()
            with self.server.failures_lock:
                self.server.failures = {k: v for k, v in self.server.failures.items() if now - v[0] < 60}
                started, count = self.server.failures.get(visitor, (now, 0))
                if count >= 5 or len(self.server.failures) >= 10000:
                    return self.login_page('잠시 후 다시 시도해 주세요.', 429)
                self.server.failures[visitor] = (started, count + 1)
            values = urllib.parse.parse_qs(self.rfile.read(size).decode())
            entered = values.get('code', [''])[0]
            if not secrets.compare_digest(entered.encode(), self.server.code.encode()) or time.monotonic() >= self.server.expires:
                return self.login_page('입장코드를 다시 확인해 주세요.', 401)
            self.reply(303, headers={'Location': '/', 'Set-Cookie': f'{COOKIE}={self.server.session}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age={max(0, int(self.server.expires-time.monotonic()))}'})
        except (ValueError, UnicodeError):
            self.reply(400, '입장 요청을 확인해 주세요.')

    def forward(self):
        parsed = urllib.parse.urlsplit(self.path)
        if parsed.scheme or parsed.netloc or parsed.fragment or (parsed.path not in API_PATHS and not web_path(parsed.path)):
            return self.reply(404, '찾을 수 없는 화면입니다.')
        if self.command == 'POST' and parsed.path != '/api/sheet/analysis':
            return self.reply(405)
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if not 0 <= size <= 1024 or self.headers.get('Transfer-Encoding'):
                return self.reply(413)
            upstream = f'127.0.0.1:{self.server.upstream_port}'
            headers = {'Host': upstream, 'Sec-Fetch-Site': 'same-origin'}
            if self.command == 'POST':
                if not self.same_origin():
                    return self.reply(403, '같은 미리보기 화면에서 요청해 주세요.')
                headers.update({'Origin': 'http://' + upstream, 'Content-Type': self.headers.get('Content-Type', '')})
            conn = http.client.HTTPConnection('127.0.0.1', self.server.upstream_port, timeout=150)
            try:
                conn.request(self.command, self.path, self.rfile.read(size) if size else None, headers)
                res = conn.getresponse()
                payload = res.read(20_000_001)
                if len(payload) > 20_000_000:
                    return self.reply(502, '미리보기 응답이 너무 큽니다.')
                self.reply(res.status, payload, res.getheader('Content-Type', 'application/octet-stream'))
            finally:
                conn.close()
        except (ValueError, OSError, http.client.HTTPException):
            self.reply(502, '미리보기 서버 연결을 확인해 주세요.')

    def do_GET(self):
        if not self.valid_host():
            return self.reply(403)
        if not self.signed_in():
            if urllib.parse.urlsplit(self.path).path.startswith('/api/'):
                return self.reply(401, '{"ok":false,"error":"입장코드를 먼저 입력해 주세요."}', 'application/json; charset=utf-8')
            return self.login_page()
        self.forward()

    def do_HEAD(self):
        self.do_GET()

    def do_POST(self):
        if not self.valid_host():
            return self.reply(403)
        if self.path == '/_preview/login':
            return self.login()
        if not self.signed_in():
            return self.reply(401)
        self.forward()


def main():
    from pathlib import Path
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--port', type=int, default=8767)
    p.add_argument('--upstream-port', type=int, default=8765)
    p.add_argument('--public-url', required=True)
    p.add_argument('--code-file', type=Path, required=True)
    args = p.parse_args()
    code = args.code_file.read_text().strip()
    if len(code) < 12:
        p.error('입장코드는 12자 이상으로 생성해 주세요.')
    server = PreviewServer(('127.0.0.1', args.port), args.public_url, code, args.upstream_port)
    print(f'Team preview gateway ready on 127.0.0.1:{args.port} (8 hours)', flush=True)
    server.serve_forever()


if __name__ == '__main__':
    main()
