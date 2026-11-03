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
import subprocess
import threading
import time
import urllib.parse
import urllib.request
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SHEET_ID = '1oA71tk0hqCXC0ImV3c5MZq938hZFKcj2XkJnB3XNnAU'
MISSIONS = {'m01':{'name':'감자 삼투','gid':'807310001'}, 'm02':{'name':'강철솜 질량 보존','gid':'807310002'}}
SHEET_URL = f'https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit#gid=807310002'
HEADERS = ['recordType','recordId','sessionId','classCode','studentNo','missionId','createdAt','updatedAt','payload']
SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxS7kGYURyYRhRZHWZZw0B0sChUE5UAFP3TqUhxLcAMDty_1OGk0OrxVQzKv2RdhCG4/exec'
HISTORY_HEADERS = ['history1','history2','history3','history4','history5','history6','history7','history8','처음 생각','최종 답안','단계별 대화']
JSON_FIELDS = ('stageTimes','clueCards','modelCards','questPassed','finalJudgment','errorCounts','hintMax','judgment','extra')

def flag(value):
    return value is True or str(value).lower() == 'true'

def automated(record):
    return str(record.get('classCode','')).upper().startswith('QA_') or str(record.get('sessionId','')).lower().startswith('qa_')

def test_record(record):
    return flag(record.get('isTest')) or bool(re.match(r'^TEST', str(record.get('classCode','')), re.I)) or bool(re.match(r'^TEST', str(record.get('studentNo','')), re.I))

def parse_records(text, mission_id='m02'):
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames or reader.fieldnames[:9] != HEADERS or any(h and h != (HISTORY_HEADERS[i] if i < len(HISTORY_HEADERS) else None) for i,h in enumerate(reader.fieldnames[9:])):
        raise ValueError('미션 탭의 제목 행을 확인해 주세요. 기존 9개 열이 필요합니다.')
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
            if row['missionId'] != mission_id or record.get('missionId', row['missionId']) != mission_id:
                raise ValueError('미션 탭과 기록이 일치하지 않습니다.')
            record['missionId'] = mission_id
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
            journal = ''.join(row.get(h,'') or '' for h in HISTORY_HEADERS[:8])
            history = json.loads(journal) if journal else []
            if not isinstance(history,list) or any(not isinstance(a,dict) or not isinstance(a.get('attemptId'),str) or a.get('sessionId') != record['sessionId'] or a.get('missionId') != mission_id or str(a.get('classCode')) != str(record.get('classCode')) for a in history):
                raise ValueError('대화 기록 범위가 일치하지 않습니다.')
            (sessions if kind == 'session' else attempts).append(record)
            if kind == 'session':
                attempts.extend(history)
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
            data={'sessions':[], 'attempts':[], 'invalidRows':0}
            for mission_id, mission in MISSIONS.items():
                query = urllib.parse.urlencode({'tqx':'out:csv','headers':'1','gid':mission['gid'],'range':'A:T'})
                request = urllib.request.Request(f'https://docs.google.com/spreadsheets/d/{SHEET_ID}/gviz/tq?{query}', headers={'User-Agent':'SciwLab-LocalPreview/2.0'})
                try:
                    with urllib.request.urlopen(request, timeout=20) as response:
                        if 'text/csv' not in response.headers.get('Content-Type',''):
                            raise ValueError('시트 접근 권한을 확인해 주세요.')
                        text=response.read(8_000_001)
                        if len(text)>8_000_000:raise ValueError('기록이 너무 많습니다.')
                    part=parse_records(text.decode('utf-8-sig'),mission_id)
                    data['sessions'].extend(part['sessions']);data['attempts'].extend(part['attempts']);data['invalidRows']+=part['invalidRows']
                except (OSError,ValueError) as exc:
                    raise ValueError(mission['name']+' 시트에서 기록을 읽지 못했습니다. 연결 또는 공유 상태를 확인해 주세요.') from exc
            data['fetchedAt'] = dt.datetime.now(dt.timezone.utc).isoformat()
            data['sheetUrl'] = SHEET_URL
            self.cached = data
            self.loaded_at = time.monotonic()
            return data

def class_identity(code):
    # Only explicit grade/class forms are interpreted. Never invent a grade for test/A/etc.
    match=re.fullmatch(r'\s*(\d{1,2})\s*(?:학년|[-_/])\s*(\d{1,3})\s*반?\s*',code)
    if match and 1<=int(match[1])<=12 and 1<=int(match[2])<=99:
        grade,room=map(int,match.groups())
        return {'classKey':f'g:{grade}:r:{room}','grade':grade,'classNo':room,'label':f'{grade}학년 {room}반'}
    return {'classKey':'code:'+code,'grade':None,'classNo':None,'label':code}

def natural_key(value):
    return [(0,int(p)) if p.isdigit() else (1,p.casefold()) for p in re.split(r'(\d+)',value)]

def catalog(data):
    groups={}
    for session in data['sessions']:
        if automated(session):continue
        name=str(session.get('classCode',''))
        if not name.strip():continue
        identity=class_identity(name);key=(identity['classKey'],test_record(session))
        group=groups.setdefault(key,{**identity,'classCode':name,'classCodes':set(),'isTest':key[1],'plays':0,'numbers':set(),'byMission':{}})
        group['classCodes'].add(name);group['plays']+=1
        mission=session.get('missionId','m02')
        stat=group['byMission'].setdefault(mission,{'plays':0,'numbers':set()});stat['plays']+=1
        number=str(session.get('studentNo','')).strip()
        declared=str(session.get('studentNoNormalized') or number).strip()
        if re.fullmatch(r'\d{1,6}',number) and int(number)>0 and declared.isdecimal() and int(declared)==int(number):
            group['numbers'].add(str(int(number)));stat['numbers'].add(str(int(number)))
    classes=[]
    for group in groups.values():
        classes.append({**group,'numbers':len(group['numbers']),'classCodes':sorted(group['classCodes'],key=natural_key),'byMission':{m:{**v,'numbers':len(v['numbers'])} for m,v in group['byMission'].items()}})
    classes.sort(key=lambda g:(g['isTest'],g['grade'] is None,g['grade'] or 0,g['classNo'] or 0,natural_key(g['label'])))
    return {'ok':True,'classes':classes,'fetchedAt':data['fetchedAt'],'sheetUrl':data['sheetUrl'],'invalidRows':data['invalidRows']}

def class_scope(data, name, class_key, include, mission):
    group=next((c for c in catalog(data)['classes'] if c['classKey']==class_key and c['isTest']==include),None) if class_key else None
    codes=group['classCodes'] if group else ([name] if not class_key and name else [])
    sessions=[s for s in data['sessions'] if str(s.get('classCode','')) in codes and s.get('missionId','m02')==mission and not automated(s) and (test_record(s) if include else not test_record(s))]
    ids={s.get('sessionId') for s in sessions}
    return {**data,'sessions':sessions,'attempts':[a for a in data['attempts'] if a.get('sessionId') in ids and a.get('missionId',mission)==mission and ('classCode' not in a or str(a['classCode']) in codes)], 'classCodes':codes,'classKey':class_key or (class_identity(name)['classKey'] if name else ''),'classLabel':group['label'] if group else name,'missionId':mission,'isTest':include,'sheetUrl':f'https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit#gid={MISSIONS[mission]["gid"]}'}

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
    def do_POST(self):
        # AI requests must come from the local UI, not a cross-site form or fetch.
        if not self.local_request() or self.headers.get('Origin') != 'http://'+self.headers.get('Host',''):
            self.json({'ok':False,'error':'로컬 수업 화면에서 요청해 주세요.'},403)
            return
        if self.path != '/api/sheet/analysis':
            self.json({'ok':False,'error':'지원하지 않는 요청'},404)
            return
        try:
            size=int(self.headers.get('Content-Length','0'))
            if size<1 or size>1024 or self.headers.get('Content-Type','').split(';')[0]!='application/json':
                raise ValueError('잘못된 분석 요청입니다.')
            body=json.loads(self.rfile.read(size))
            if not isinstance(body,dict):
                raise ValueError('잘못된 분석 요청입니다.')
            name=body.get('classCode','')
            class_key=body.get('classKey','')
            mission=body.get('missionId','m02')
            regenerate=body.get('regenerate',False)
            mode=body.get('mode','latest')
            include=body.get('includeTests',False)
            if not isinstance(name,str) or len(name)>20 or not isinstance(class_key,str) or len(class_key)>100 or not (name or class_key) or mission not in MISSIONS or mode not in ('first','latest') or not isinstance(include,bool) or not isinstance(regenerate,bool):
                raise ValueError('반과 분석할 판을 확인해 주세요.')
            data=self.reader.read(True)
            # Recompute from the sheet. Never trust browser-supplied answers/counts.
            scoped=class_scope(data,name,class_key,include,mission)
            evidence=build_evidence(scoped,name,mode,include,mission)
            if not evidence['participants']:
                raise ValueError('분석할 참여 기록이 없습니다.')
            request=urllib.request.Request(SCRIPT_URL,data=json.dumps({'action':'analyzeClass','evidence':evidence,'regenerate':regenerate},ensure_ascii=False).encode(),headers={'Content-Type':'text/plain;charset=utf-8'})
            with urllib.request.urlopen(request,timeout=115) as response:
                raw=response.read(150001)
                if len(raw)>150000:
                    raise ValueError('분석 응답이 너무 큽니다.')
                value=json.loads(raw)
            if not value.get('ok'):
                raise ValueError(value.get('error','OpenAI 분석을 완료하지 못했습니다.'))
            self.json({'ok':True,'analysis':value['analysis'],'basis':evidence,'fetchedAt':data['fetchedAt'],'classCode':name,'classKey':scoped['classKey'],'missionId':mission})
        except (ValueError,KeyError,TypeError) as exc:
            self.json({'ok':False,'error':str(exc)},400)
        except (OSError,subprocess.SubprocessError):
            self.json({'ok':False,'error':'OpenAI 분석 서버에 연결하지 못했습니다. 잠시 후 다시 요청해 주세요.'},502)
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
                    self.json({**catalog(data),'overview':build_overview(data)})
                    return
                name=query.get('classCode',[''])[0]
                class_key=query.get('classKey',[''])[0]
                mission=query.get('missionId',['m02'])[0]
                if len(name)>20 or len(class_key)>100 or not (name or class_key) or mission not in MISSIONS:
                    self.json({'ok':False,'error':'반을 선택해 주세요.'},400)
                    return
                include=query.get('includeTests')==['1']
                self.json({'ok':True,**class_scope(data,name,class_key,include,mission)})
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

def build_overview(data):
    result=subprocess.run(['node',str(ROOT/'teacher/overview-input.cjs')],input=json.dumps(data,ensure_ascii=False),capture_output=True,text=True,timeout=10,cwd=ROOT)
    if result.returncode:
        raise ValueError('학급 요약을 구성하지 못했습니다.')
    return json.loads(result.stdout)

def build_evidence(data, name, mode, include, mission='m02'):
    result=subprocess.run(['node',str(ROOT/'teacher/analysis-input.cjs')],input=json.dumps({'db':data,'classCode':name,'mode':mode,'includeTests':include,'missionId':mission},ensure_ascii=False),capture_output=True,text=True,timeout=10,cwd=ROOT)
    if result.returncode:
        raise ValueError('분석 자료를 구성하지 못했습니다.')
    return json.loads(result.stdout)

if __name__=='__main__':
    main()
