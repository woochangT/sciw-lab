import http.client
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import threading
import unittest
import urllib.parse

from share_preview import COOKIE, PreviewServer, public_origin


class PreviewTests(unittest.TestCase):
    def setUp(self):
        self.calls = []
        calls = self.calls

        class Upstream(BaseHTTPRequestHandler):
            def log_message(self, *_):
                pass

            def respond(self):
                body = self.rfile.read(int(self.headers.get('Content-Length', '0')))
                calls.append((self.command, self.path, dict(self.headers), body))
                payload = json.dumps({'ok': True, 'synthetic': True}).encode()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Content-Length', str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)

            do_GET = respond
            do_POST = respond

        self.upstream = ThreadingHTTPServer(('127.0.0.1', 0), Upstream)
        self.origin = 'https://team-preview.example'
        self.code = 'synthetic-code-123456'
        self.gateway = PreviewServer(('127.0.0.1', 0), self.origin, self.code, self.upstream.server_port)
        self.threads = []
        for server in (self.upstream, self.gateway):
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            self.threads.append(thread)

    def tearDown(self):
        for server in (self.gateway, self.upstream):
            server.shutdown()
            server.server_close()
        for thread in self.threads:
            thread.join()

    def request(self, path='/', method='GET', body=None, cookie='', **headers):
        merged = {'Host': 'team-preview.example', **headers}
        if cookie:
            merged['Cookie'] = cookie
        conn = http.client.HTTPConnection('127.0.0.1', self.gateway.server_port)
        conn.request(method, path, body, merged)
        res = conn.getresponse()
        value = (res.status, dict(res.getheaders()), res.read())
        conn.close()
        return value

    def login(self, code=None):
        return self.request('/_preview/login', 'POST', urllib.parse.urlencode({'code': code or self.code}),
                            Origin=self.origin, **{'Content-Type': 'application/x-www-form-urlencoded'})

    def cookie(self):
        status, headers, _ = self.login()
        self.assertEqual(status, 303)
        return headers['Set-Cookie'].split(';')[0]

    def test_explicit_public_mode_needs_no_cookie_but_keeps_host_origin_and_file_boundaries(self):
        self.gateway.is_public = True
        for path in ('/', '/teacher.html', '/api/sheet/classes'):
            self.assertEqual(self.request(path)[0], 200)
        self.assertEqual(len(self.calls), 3)
        self.assertEqual(self.request('/.git/config')[0], 404)
        self.assertEqual(self.request(Host='evil.example')[0], 403)
        self.assertEqual(self.request('/api/sheet/analysis', 'POST', '{}', Origin='https://evil.example')[0], 403)
        self.assertEqual(len(self.calls), 3)
        self.gateway.expires = 0
        for path in ('/', '/api/sheet/classes'):
            status, _, body = self.request(path)
            self.assertEqual(status, 410)
            self.assertNotIn('입장코드'.encode(), body)
        self.assertEqual(len(self.calls), 3)

    def test_unauthenticated_visitors_cannot_read_answers_or_source(self):
        status, headers, body = self.request('/teacher.html')
        self.assertEqual(status, 200)
        self.assertIn('입장코드'.encode(), body)
        self.assertEqual(headers['Cache-Control'], 'private, no-store')
        self.assertEqual(self.request('/api/sheet/class?classKey=g:3:r:2')[0], 401)
        self.assertEqual(self.request('/api/sheet/analysis', 'POST', '{}')[0], 401)
        self.assertEqual(self.calls, [])

    def test_login_cookie_is_secure_and_expired_sessions_stop_before_upstream(self):
        status, headers, _ = self.login()
        self.assertEqual(status, 303)
        self.assertEqual(headers['Location'], '/')
        for flag in ('Secure', 'HttpOnly', 'SameSite=Strict', 'Path=/'):
            self.assertIn(flag, headers['Set-Cookie'])
        cookie = headers['Set-Cookie'].split(';')[0]
        self.assertEqual(self.request('/api/sheet/classes', cookie=cookie)[0], 200)
        self.gateway.expires = 0
        self.assertEqual(self.request('/api/sheet/classes', cookie=cookie)[0], 401)
        self.assertEqual(len(self.calls), 1)

    def test_only_web_files_and_scoped_api_routes_pass(self):
        cookie = self.cookie()
        for path in ('/.git/config', '/.local/key', '/README.md', '/apps-script/Code.gs',
                     '/teacher/../config.js', '/teacher/%2e%2e/config.js',
                     '/api/other', '/scripts/local_server.py', '//another.example/'):
            self.assertEqual(self.request(path, cookie=cookie)[0], 404, path)
        self.assertEqual(self.calls, [])
        for path in ('/', '/teacher.html', '/teacher/app.js', '/intro/lab-room.webp',
                     '/%EA%B0%95%EC%B2%A0%EC%86%9C%20%EC%A7%88%EB%9F%89%20%EB%B3%B4%EC%A1%B4/web/js/config.js',
                     '/api/sheet/class?classKey=g:3:r:2&missionId=m01'):
            self.assertEqual(self.request(path, cookie=cookie)[0], 200, path)

    def test_public_host_and_post_origin_are_required_before_rewriting(self):
        cookie = self.cookie()
        self.assertEqual(self.request(cookie=cookie, Host='evil.example')[0], 403)
        for origin in ('https://evil.example', ''):
            self.assertEqual(self.request('/api/sheet/analysis', 'POST', '{}', cookie=cookie,
                                          Origin=origin, **{'Content-Type': 'application/json'})[0], 403)
        payload = '{"classKey":"g:3:r:2","missionId":"m01","mode":"latest"}'
        self.assertEqual(self.request('/api/sheet/analysis', 'POST', payload, cookie=cookie,
                                      Origin=self.origin, **{'Content-Type': 'application/json'})[0], 200)
        method, path, headers, body = self.calls[0]
        self.assertEqual((method, path, body), ('POST', '/api/sheet/analysis', payload.encode()))
        self.assertEqual(headers['Origin'], f'http://127.0.0.1:{self.upstream.server_port}')
        self.assertEqual(headers['Host'], f'127.0.0.1:{self.upstream.server_port}')
        self.assertNotIn('Cookie', headers)

    def test_wrong_codes_are_rate_limited_and_cross_site_login_is_blocked(self):
        self.assertEqual(self.request('/_preview/login', 'POST', 'code=synthetic',
                                      Origin='https://evil.example', **{'Content-Type':'application/x-www-form-urlencoded'})[0], 403)
        for _ in range(5):
            self.assertEqual(self.login('incorrect')[0], 401)
        self.assertEqual(self.login()[0], 429)
        self.assertEqual(self.calls, [])

    def test_invalid_cookie_and_oversized_requests_never_reach_the_upstream(self):
        self.assertEqual(self.request('/api/sheet/classes', cookie=f'{COOKIE}=forged')[0], 401)
        cookie = self.cookie()
        self.assertEqual(self.request('/api/sheet/analysis', 'POST', 'x'*1025, cookie=cookie,
                                      Origin=self.origin)[0], 413)
        self.assertEqual(self.request('/teacher.html', 'POST', '{}', cookie=cookie,
                                      Origin=self.origin)[0], 405)
        self.assertEqual(self.calls, [])


class OriginTests(unittest.TestCase):
    def test_requires_one_https_origin(self):
        self.assertEqual(public_origin('https://preview.example/'), 'https://preview.example')
        for url in ('http://preview.example', 'https://u:p@preview.example',
                    'https://preview.example/path', 'https://preview.example?code=x'):
            with self.assertRaises(ValueError):
                public_origin(url)


if __name__ == '__main__':
    unittest.main()
