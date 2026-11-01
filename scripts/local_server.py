#!/usr/bin/env python3
"""Local preview + read-only Google Sheets connection; no student records on disk.

Uses the workbook's existing link-readable access. Does not change sharing,
Apps Script authentication, or any sheet contents. Binds to loopback only.
"""
import argparse
import csv
import datetime as dt
import io
import json
import re
import threading
import time
import urllib.parse
import urllib.request
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SHEET_ID = '1oA71tk0hqCXC0ImV3c5MZq938hZFKcj2XkJnB3XNnAU'
SHEET_URL = f'https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit#gid=807310002'
HEADERS = ['recordType','recordId','sessionId','classCode','studentNo','missionId','createdAt','updatedAt','payload']
JSON_FIELDS = ('stageTimes','clueCards','modelCards','questPassed','finalJudgment','errorCounts','hintMax','judgment','extra')

def flag(value):
    return value is True or str(value).lower() == 'true'

def automated(record):
    return str(record.get('classCode','')).upper().startswith('QA_') or str(record.get('sessionId','')).lower().startswith('qa_')

def test_record(record):
    return flag(record.get('isTest')) or bool(re.match(r'^TEST', str(record.get('classCode','')), re.I)) or bool(re.match(r'^TEST', str(record.get('studentNo','')), re.I))

def parse_records(text):
    reader = csv.DictReader(io.StringIO(text))
    if reader.fieldnames != HEADERS:
        raise ValueError('강철솜 탭의 제목 행을 확인해 주세요. 기존 9개 열이 필요합니다.')
    sessions, attempts, seen, invalid = [], [], set(), 0
    for row in reader:
        if not row.get('recordId'):
            continue
        kind = row.get('recordType')
        if kind not in ('session', 'attempt'):
            invalid += 1
            continue
        try:
            record = json.loads(row['payload'])
            if not isinstance(record, dict):
                raise ValueError()
            if record.get('missionId', row['missionId']) != 'm02':
                continue
            key = (kind, row['recordId'])
            if key in seen:
                raise ValueError('동일 ID의 기록이 둘 이상입니다.')
            seen.add(key)
            if str(record.get('sessionId','')) != row['sessionId'] or str(record.get('classCode','')) != row['classCode']:
                raise ValueError('기록의 반 또는 세션이 일치하지 않습니다.')
            for field in JSON_FIELDS:
                if isinstance(record.get(field), str) and record[field]:
                    try:
                        record[field] = json.loads(record[field])
                    except ValueError:
                        pass
            (sessions if kind == 'session' else attempts).append(record)
        except (ValueError, KeyError, TypeError):
            invalid += 1
    return {'sessions':sessions, 'attempts':attempts, 'invalidRows':invalid}

class SheetReader:
    def __init__(self):
        self.lock = threading.Lock()
        self.cached = None
        self.loaded_at = 0
    def read(self, refresh=False):
        with self.lock:
            if not refresh and self.cached and time.monotonic()-self.loaded_at < 12:
                return self.cached
            query = urllib.parse.urlencode({'tqx':'out:csv','headers':'1','gid':'807310002','range':'A1:I10000'})
            request = urllib.request.Request(f'https://docs.google.com/spreadsheets/d/{SHEET_ID}/gviz/tq?{query}', headers={'User-Agent':'SciwLab-LocalPreview/1.0'})
            try:
                with urllib.request.urlopen(request, timeout=20) as response:
                    if 'text/csv' not in response.headers.get('Content-Type',''):
                        raise ValueError('시트 접근 권한을 확인해 주세요. 로그인 응답이 반환됐습니다.')
                    text = response.read(8_000_001)
                    if len(text)>8_000_000:
                        raise ValueError('기록이 너무 많아 조회를 멈췄습니다.')
                data = parse_records(text.decode('utf-8-sig'))
            except (OSError, ValueError) as exc:
                raise ValueError('Google 시트에서 기록을 읽지 못했습니다. 연결 또는 시트 공유 상태를 확인해 주세요.') from exc
            data['fetchedAt'] = dt.datetime.now(dt.timezone.utc).isoformat()
            data['sheetUrl'] = SHEET_URL
            self.cached = data
            self.loaded_at = time.monotonic()
            return data

def catalog(data):
    groups = {}
    for session in data['sessions']:
        if automated(session):
            continue
        name = str(session.get('classCode',''))
        if not name.strip():
            continue
        key = (name, test_record(session))
        group = groups.setdefault(key, {'classCode':name,'isTest':key[1],'plays':0,'numbers':set()})
        group['plays'] += 1
        number = str(session.get('studentNoNormalized') or session.get('studentNo','')).strip()
        if number.isdecimal() and int(number)>0:
            group['numbers'].add(str(int(number)))
    classes = [{**g,'numbers':len(g['numbers'])} for g in groups.values()]
    classes.sort(key=lambda g:(g['isTest'],g['classCode']))
    return {'ok':True,'classes':classes,'fetchedAt':data['fetchedAt'],'sheetUrl':data['sheetUrl'],'invalidRows':data['invalidRows']}

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, reader, **kwargs):
        self.reader=reader
        super().__init__(*args,directory=str(ROOT),**kwargs)
    def local_request(self):
        host = self.headers.get('Host','')
        allowed = {f'127.0.0.1:{self.server.server_port}', f'localhost:{self.server.server_port}'}
        origin = self.headers.get('Origin')
        return host in allowed and (not origin or origin in {'http://'+h for h in allowed}) and self.headers.get('Sec-Fetch-Site') != 'cross-site'
    def json(self, value, status=200):
        payload=json.dumps(value,ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type','application/json; charset=utf-8')
        self.send_header('Cache-Control','no-store')
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Content-Length',str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)
    def do_GET(self):
        if not self.local_request():
            self.json({'ok':False,'error':'로컬 미리보기에서만 사용할 수 있습니다.'},403)
            return
        parsed=urllib.parse.urlsplit(self.path)
        if parsed.path.startswith('/api/'):
            if parsed.path not in ('/api/sheet/classes','/api/sheet/class'):
                self.json({'ok':False,'error':'지원하지 않는 조회'},404)
                return
            query=urllib.parse.parse_qs(parsed.query)
            try:
                data=self.reader.read(query.get('refresh')==['1'])
                if parsed.path=='/api/sheet/classes':
                    self.json(catalog(data))
                    return
                name=query.get('classCode',[''])[0]
                if not name or len(name)>20:
                    self.json({'ok':False,'error':'반을 선택해 주세요.'},400)
                    return
                include=query.get('includeTests')==['1']
                sessions=[s for s in data['sessions'] if str(s.get('classCode',''))==name and not automated(s) and (test_record(s) if include else not test_record(s))]
                ids={s.get('sessionId') for s in sessions}
                self.json({'ok':True,'sessions':sessions,'attempts':[a for a in data['attempts'] if a.get('sessionId') in ids], 'fetchedAt':data['fetchedAt'],'sheetUrl':data['sheetUrl'],'isTest':bool(sessions) and all(test_record(s) for s in sessions)})
            except ValueError as exc:
                self.json({'ok':False,'error':str(exc)},502)
            return
        if any(part.startswith('.') for part in Path(urllib.parse.unquote(parsed.path)).parts if part not in ('/','')):
            self.send_error(404)
            return
        super().do_GET()
    def end_headers(self):
        if not urllib.parse.urlsplit(self.path).path.startswith('/api/'):
            self.send_header('Cache-Control','no-cache')
        super().end_headers()
    def list_directory(self, path):
        self.send_error(404)
        return None
    def log_message(self, format, *args):
        pass  # No class codes, answers, or query values in process logs.

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--port',type=int,default=8765)
    args=parser.parse_args()
    server=ThreadingHTTPServer(('127.0.0.1',args.port),partial(Handler,reader=SheetReader()))
    print(f'Sciw Lab + sheet connection: http://127.0.0.1:{args.port}',flush=True)
    server.serve_forever()

if __name__=='__main__':
    main()
