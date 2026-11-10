import csv
import io
import json
import unittest
from local_server import HEADERS, parse_records, catalog

def make_row(kind, record, id=None):
    return [kind,id or record.get('attemptId',record.get('sessionId')),record.get('sessionId'),record.get('classCode'),record.get('studentNo'),'m02','','',json.dumps(record)]

def csv_text(rows):
    out=io.StringIO(); writer=csv.writer(out);writer.writerow(HEADERS);writer.writerows(rows);return out.getvalue()

class SheetParsingTests(unittest.TestCase):
    def test_multiline_answers_remain_original_and_json_fields_are_decoded(self):
        record={'sessionId':'s','classCode':'A','studentNo':'02','missionId':'m02','finalAnswer':'산소가 들어왔다.\n질량이 늘었다.','finalJudgment':'{"C":true}'}
        data=parse_records(csv_text([make_row('session',record)]))
        self.assertEqual(data['sessions'][0]['finalAnswer'],record['finalAnswer'])
        self.assertTrue(data['sessions'][0]['finalJudgment']['C'])
    def test_catalog_separates_test_classes_and_never_lists_automated_qa(self):
        records=[{'sessionId':'s','classCode':'A','studentNo':'02'},{'sessionId':'t','classCode':'A','studentNo':'2'},{'sessionId':'z','classCode':'test','studentNo':'1'},{'sessionId':'qa_run','classCode':'A','studentNo':'9'},{'sessionId':'qa2','classCode':'QA_RUN','studentNo':'1'}]
        data={'sessions':records,'fetchedAt':'now','sheetUrl':'url','invalidRows':0}
        groups=catalog(data)['classes']
        self.assertEqual(len(groups),2)
        self.assertEqual({k:groups[0][k] for k in ('classCode','isTest','plays','numbers')},{'classCode':'A','isTest':False,'plays':2,'numbers':1})
        self.assertTrue(groups[1]['isTest'])
    def test_invalid_rows_are_not_misattributed_to_another_class(self):
        s={'sessionId':'s','classCode':'A','studentNo':'1','missionId':'m02'}
        row=make_row('session',s);row[3]='B'
        data=parse_records(csv_text([row]))
        self.assertEqual(data['sessions'],[])
        self.assertEqual(data['invalidRows'],1)
    def test_unknown_sheet_schema_is_rejected(self):
        with self.assertRaises(ValueError):parse_records('A,B\n1,2')
    def test_duplicate_record_ids_do_not_multiply_students(self):
        s={'sessionId':'s','classCode':'A','studentNo':'1','missionId':'m02'}
        data=parse_records(csv_text([make_row('session',s),make_row('session',s)]))
        self.assertEqual(len(data['sessions']),1)
        self.assertEqual(data['invalidRows'],1)


class LocalEndpointTests(unittest.TestCase):
    def setUp(self):
        import threading
        from functools import partial
        from http.server import ThreadingHTTPServer
        from local_server import Handler, LocalTeacherAuth
        class Reader:
            def read(self, refresh=False):
                sessions=[{'sessionId':'a','classCode':'A','studentNo':'1'},{'sessionId':'b','classCode':'B','studentNo':'2'},{'sessionId':'test-play','classCode':'test','studentNo':'2'},{'sessionId':'qa_auto','classCode':'test','studentNo':'9'}]
                for s in sessions:s.update(missionId='m02',firstAnswer='산소와 철의 결합')
                return {'sessions':sessions,'attempts':[{'attemptId':'aa','sessionId':'a'},{'attemptId':'bb','sessionId':'b'}],'invalidRows':0,'fetchedAt':'now','sheetUrl':'url'}
        self.server=ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,reader=Reader(),auth=LocalTeacherAuth('synthetic-password')))
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True);self.thread.start()
        self.base='http://127.0.0.1:'+str(self.server.server_port)
        self.authorization=''
        self.authorization='Bearer '+self.request('/api/sheet/login',data=b'{"password":"synthetic-password"}',headers={'Origin':self.base,'Content-Type':'application/json'})['token']
    def tearDown(self):
        self.server.shutdown();self.server.server_close();self.thread.join()
    def request(self,path,**kwargs):
        import urllib.request
        kwargs['headers']={'Authorization':self.authorization,**kwargs.get('headers',{})}
        with urllib.request.urlopen(urllib.request.Request(self.base+path,**kwargs)) as r:return json.load(r)
    def test_class_queries_never_return_another_class_or_its_attempts(self):
        value=self.request('/api/sheet/class?classCode=A')
        self.assertEqual([s['sessionId'] for s in value['sessions']],['a'])
        self.assertEqual([a['attemptId'] for a in value['attempts']],['aa'])
    def test_class_catalog_includes_aggregated_overview_without_student_answers(self):
        value=self.request('/api/sheet/classes')
        self.assertEqual(value['overview']['version'],'teacher-overview-v1')
        self.assertEqual(len([c for c in value['overview']['classes'] if not c['isTest']]),2)
        for key in ('firstAnswer','finalAnswer','studentNo','sessionId'):
            self.assertNotIn(key,json.dumps(value['overview']))
    def test_test_records_require_explicit_mode_and_qa_never_appears(self):
        self.assertEqual(self.request('/api/sheet/class?classCode=test')['sessions'],[])
        value=self.request('/api/sheet/class?classCode=test&includeTests=1')
        self.assertEqual([s['sessionId'] for s in value['sessions']],['test-play'])
    def test_other_web_origins_cannot_read_the_local_bridge(self):
        import urllib.error
        with self.assertRaises(urllib.error.HTTPError) as caught:self.request('/api/sheet/classes',headers={'Origin':'https://example.invalid'})
        self.assertEqual(caught.exception.code,403)
        caught.exception.close()
    def test_analysis_requires_same_origin_and_rejects_untrusted_request_shape(self):
        import urllib.error
        for payload,headers,status in [
            ({'classCode':'A'}, {'Origin':'https://example.invalid','Content-Type':'application/json'},403),
            ({'classCode':'A'}, {'Content-Type':'application/json'},403),
            ({'classCode':'A','mode':'all'}, {'Origin':self.base,'Content-Type':'application/json'},400),
            ({'classCode':'A','includeTests':'false'}, {'Origin':self.base,'Content-Type':'application/json'},400),
        ]:
            with self.assertRaises(urllib.error.HTTPError) as caught:
                self.request('/api/sheet/analysis',data=json.dumps(payload).encode(),headers=headers)
            self.assertEqual(caught.exception.code,status)
            caught.exception.close()
    def test_analysis_rebuilds_only_selected_class_and_passes_no_identifiers_to_script(self):
        from unittest.mock import patch,MagicMock
        import http.client
        upstream=MagicMock()
        upstream.__enter__.return_value.read.return_value=json.dumps({'ok':True,'analysis':{'model':'gpt-6-luna','effort':'medium','result':{'summary':'합성 테스트 응답'}}}).encode()
        with patch('local_server.urllib.request.urlopen',return_value=upstream) as fetch:
            connection=http.client.HTTPConnection('127.0.0.1',self.server.server_port)
            connection.request('POST','/api/sheet/analysis',json.dumps({'classCode':'A','mode':'latest','evidence':{'participants':999}}),{'Origin':self.base,'Content-Type':'application/json','Authorization':self.authorization})
            response=connection.getresponse();value=json.loads(response.read());connection.close()
            self.assertEqual(response.status,200)
            self.assertEqual(value['basis']['participants'],1)
            self.assertEqual(value['classCode'],'A')
            body=json.loads(fetch.call_args.args[0].data)
            self.assertEqual(body['action'],'analyzeClass')
            self.assertEqual(body['evidence']['participants'],1)
            for key in ('sessionId','classCode','studentNo'):
                self.assertNotIn(key,json.dumps(body))

if __name__=='__main__':unittest.main()

class ClassSelectionTests(unittest.TestCase):
    def test_grade_room_sort_and_aliases_merge_without_inventing_unknown_grades(self):
        from local_server import catalog
        sessions=[{'sessionId':str(i),'classCode':c,'studentNo':'02','missionId':'m02'} for i,c in enumerate(['3-2','1-10','1-2','3학년 2반','A','test'])]
        data={'sessions':sessions,'attempts':[],'fetchedAt':'now','sheetUrl':'url','invalidRows':0}
        rows=catalog(data)['classes']
        self.assertEqual([r['label'] for r in rows],['1학년 2반','1학년 10반','3학년 2반','A','test'])
        self.assertEqual(rows[2]['classCodes'],['3-2','3학년 2반'])
        self.assertEqual(rows[2]['numbers'],1)
        self.assertIsNone(rows[3]['grade'])
    def test_selected_class_key_isolates_aliases_and_game(self):
        from local_server import class_scope
        sessions=[{'sessionId':'a','classCode':'3-2','studentNo':'1','missionId':'m01'},{'sessionId':'b','classCode':'3학년 2반','studentNo':'2','missionId':'m01'},{'sessionId':'c','classCode':'3-2','studentNo':'1','missionId':'m02'},{'sessionId':'d','classCode':'3-3','studentNo':'1','missionId':'m01'}]
        data={'sessions':sessions,'attempts':[{'sessionId':s['sessionId'],'classCode':s['classCode'],'missionId':s['missionId']} for s in sessions],'fetchedAt':'now','sheetUrl':'url','invalidRows':0}
        scoped=class_scope(data,'','g:3:r:2',False,'m01')
        self.assertEqual([s['sessionId'] for s in scoped['sessions']],['a','b'])
        self.assertEqual([a['sessionId'] for a in scoped['attempts']],['a','b'])
        self.assertEqual(class_scope(data,'','missing',False,'m01')['sessions'],[])

class MultiMissionReaderTests(unittest.TestCase):
    def test_reader_loads_both_tabs_and_never_silently_truncates_at_10000_rows(self):
        from local_server import SheetReader
        from unittest.mock import patch,MagicMock
        import urllib.parse
        requested=[]
        def read(request,timeout):
            query=urllib.parse.parse_qs(urllib.parse.urlsplit(request.full_url).query)
            requested.append(query)
            mission='m01' if query['gid']==['807310001'] else 'm02'
            record={'sessionId':mission,'classCode':'3-2','studentNo':'1','missionId':mission}
            row=make_row('session',record);row[5]=mission
            response=MagicMock();response.__enter__.return_value=response;response.headers={'Content-Type':'text/csv'};response.read.return_value=csv_text([row]).encode()
            return response
        with patch('local_server.urllib.request.urlopen',side_effect=read):data=SheetReader().read()
        self.assertEqual({s['missionId'] for s in data['sessions']},{'m01','m02'})
        self.assertEqual(len(requested),2)
        self.assertTrue(all(q['range']==['A:T'] for q in requested))
