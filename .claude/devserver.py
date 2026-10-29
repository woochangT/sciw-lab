"""로컬 미리보기용 정적 서버. 브라우저가 옛 파일을 캐시하지 않게 no-store 헤더를 붙인다.

사용: python devserver.py <포트> <폴더>
"""
import functools
import http.server
import sys


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


if __name__ == '__main__':
    port = int(sys.argv[1])
    folder = sys.argv[2]
    handler = functools.partial(NoCacheHandler, directory=folder)
    http.server.ThreadingHTTPServer(('', port), handler).serve_forever()
