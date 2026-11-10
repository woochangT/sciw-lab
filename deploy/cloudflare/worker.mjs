import {RecordError,saveRecords,findSession,readRecords} from './records.mjs';
import {judgePotato,judgeSteel,teachingReport} from './evaluators.mjs';
import {rejudge} from './rejudge.mjs';
import {configured,hasSession,issueToken,passwordMatches} from './teacher-auth.mjs';
import '../../teacher/model.js';
import '../../teacher/scope.js';
import '../../teacher/evidence.js';
import '../../teacher/insights.js';
const M=globalThis.TeacherModel,S=globalThis.TeacherScope,E=globalThis.TeacherEvidence,I=globalThis.TeacherInsights;
const SHEET='1oA71tk0hqCXC0ImV3c5MZq938hZFKcj2XkJnB3XNnAU';
const MISSIONS={m01:{name:'감자 삼투',gid:'807310001'},m02:{name:'강철솜 질량 보존',gid:'807310002'}};
const SCRIPT='https://script.google.com/macros/s/AKfycbxS7kGYURyYRhRZHWZZw0B0sChUE5UAFP3TqUhxLcAMDty_1OGk0OrxVQzKv2RdhCG4/exec';
const HEADERS=['recordType','recordId','sessionId','classCode','studentNo','missionId','createdAt','updatedAt','payload'];
const HISTORY_HEADERS=['history1','history2','history3','history4','history5','history6','history7','history8','처음 생각','최종 답안','단계별 대화'];
const JSON_FIELDS=['stageTimes','clueCards','modelCards','questPassed','finalJudgment','errorCounts','hintMax','judgment','extra'];
const PAGES_ORIGIN='https://woochangt.github.io';
const API_PATHS=new Map([['/api/student','POST'],['/api/student/judge','POST'],['/api/sheet/live','GET'],['/api/sheet/login','POST'],['/api/sheet/session','GET'],['/api/sheet/classes','GET'],['/api/sheet/class','GET'],['/api/sheet/analysis','POST'],['/api/sheet/rejudge','POST']]);
const allowedOrigin=(origin,url)=>origin===url.origin||origin===PAGES_ORIGIN;
const sheetUrl=m=>`https://docs.google.com/spreadsheets/d/${SHEET}/edit#gid=${MISSIONS[m].gid}`;
class HttpError extends Error{constructor(status,message){super(message);this.status=status}}
export async function boundedText(message,limit){
  if(Number(message.headers.get('Content-Length'))>limit)throw new HttpError(413,'응답 또는 요청이 너무 큽니다.');
  if(!message.body)return '';
  const reader=message.body.getReader(),decoder=new TextDecoder();let size=0,text='';
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();throw new HttpError(413,'응답 또는 요청이 너무 큽니다.')}text+=decoder.decode(value,{stream:true})}return text+decoder.decode()}
  finally{reader.releaseLock()}
}
export function parseRecords([head,...rows],mission){
  if(JSON.stringify(head?.slice(0,9))!==JSON.stringify(HEADERS)||head.slice(9).some((h,i)=>h&&h!==HISTORY_HEADERS[i]))throw new HttpError(502,'미션 탭의 제목 행을 확인해 주세요.');
  const result={sessions:[],attempts:[],invalidRows:0},seen=new Set();
  for(const values of rows){
    if(!values[1])continue;
    try{
      const r=Object.fromEntries(HEADERS.map((key,i)=>[key,values[i]])),record=JSON.parse(r.payload),key=r.recordType+':'+r.recordId;
      if(values.length<9||values.length>20||!['session','attempt'].includes(r.recordType)||!record||Array.isArray(record)||typeof record!=='object'||r.missionId!==mission||(record.missionId&&record.missionId!==mission)||seen.has(key)||String(record.sessionId??'')!==r.sessionId||String(record.classCode??'')!==r.classCode)throw Error();
      seen.add(key);record.missionId=mission;
      for(const field of JSON_FIELDS)if(typeof record[field]==='string'&&record[field]){try{record[field]=JSON.parse(record[field])}catch{}}
      const journal=values.slice(9,17).join('');
      const history=journal?JSON.parse(journal):[];
      if(!Array.isArray(history)||history.some(a=>!a||typeof a.attemptId!=='string'||a.sessionId!==record.sessionId||a.missionId!==mission||String(a.classCode)!==String(record.classCode)))throw Error();
      result[r.recordType==='session'?'sessions':'attempts'].push(record);
      if(r.recordType==='session')result.attempts.push(...history);
    }catch{result.invalidRows++}
  }
  return result;
}
export async function readSheet(fetcher,proxySecret){
  try{
    const res=await fetcher(SCRIPT,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},
      body:JSON.stringify({action:'teacherDashboardData',proxySecret}),redirect:'follow',signal:AbortSignal.timeout(20000)});
    if(!res.ok)throw Error();
    const value=JSON.parse(await boundedText(res,16_000_000));
    if(!value.ok)throw Error();
    const parts=Object.keys(MISSIONS).map(mission=>parseRecords(value.records[mission],mission));
    return {sessions:parts.flatMap(p=>p.sessions),attempts:parts.flatMap(p=>p.attempts),invalidRows:parts.reduce((n,p)=>n+p.invalidRows,0),fetchedAt:new Date().toISOString(),sheetUrl:sheetUrl('m02')};
  }catch{throw new HttpError(502,'시트 기록을 읽지 못했습니다. 잠시 후 새로고침해 주세요.')}
}
export function catalog(data){return S.catalog({...data,sessions:data.sessions.filter(s=>String(s.classCode||'').trim())})}
export function scoped(data,{classKey='',classCode='',includeTests=false,missionId='m02'}){
  const group=classKey?catalog(data).find(c=>c.classKey===classKey&&c.isTest===includeTests):null;
  const codes=group?group.classCodes:(!classKey&&classCode?[classCode]:[]);
  const sessions=data.sessions.filter(s=>codes.includes(String(s.classCode))&&s.missionId===missionId&&!/^QA_/i.test(s.classCode)&&!/^qa_/i.test(s.sessionId)&&M.test(s)===includeTests),ids=new Set(sessions.map(s=>s.sessionId));
  return {...data,sessions,attempts:data.attempts.filter(a=>ids.has(a.sessionId)&&(!a.missionId||a.missionId===missionId)&&(!Object.hasOwn(a,'classCode')||codes.includes(String(a.classCode)))),classCodes:codes,classKey:classKey||(classCode?S.identity(classCode).classKey:''),classLabel:group?.label||classCode,missionId,isTest:includeTests,sheetUrl:sheetUrl(missionId)};
}
function validScope(body){
  const {classKey='',classCode='',missionId='m02',mode='latest',includeTests=false,regenerate=false}=body;
  if(typeof classKey!=='string'||classKey.length>100||typeof classCode!=='string'||classCode.length>20||!(classKey||classCode)||(typeof missionId!=='string'||!Object.hasOwn(MISSIONS,missionId))||!['first','latest'].includes(mode)||typeof includeTests!=='boolean'||typeof regenerate!=='boolean')throw new HttpError(400,'반과 분석할 판을 확인해 주세요.');
  return {classKey,classCode,missionId,mode,includeTests,regenerate};
}
function json(value,status=200){return Response.json(value,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow, noarchive'}})}
function progressChannel(env,mission,isTest){return env.PROGRESS?.getByName(mission+(isTest?':test':':live'))}
function announce(env,ctx,changes){
 const unique=new Map(changes.map(change=>[JSON.stringify(change),change]));
 const notice=Promise.allSettled([...unique.values()].map(async change=>progressChannel(env,change.missionId,change.isTest)?.publish(change)));
 ctx?.waitUntil(notice);
}
async function student(request,env,ctx,fetcher,pathname){
 if(!env.DB)throw new HttpError(503,'기록 DB를 설정해 주세요.');
 let body;
 try{body=JSON.parse(await boundedText(request,pathname.endsWith('/judge')?32000:150000))}
 catch(error){if(error instanceof HttpError)throw error;return json({ok:false,error:'잘못된 요청 크기'},400)}
 if(!body||typeof body!=='object'||Array.isArray(body))return json({ok:false,error:'잘못된 기록'},400);
 if(pathname.endsWith('/judge')){
  try{
   if(!['judge','judgeM02'].includes(body.action))throw Error('INVALID_REQUEST');
   const result=await (body.action==='judge'?judgePotato(body,env,fetcher):judgeSteel(body,env,fetcher));
   return json({ok:true,result});
  }catch(error){return json({ok:false,code:/^[A-Z_]{2,40}$/.test(error.message)?error.message:'EVALUATION_ERROR'},400)}
 }
 try{
  if(body.action==='findStudentSession')return json({ok:true,schema:'student-resume-v1',session:await findSession(env.DB,body)});
  const result=await saveRecords(env.DB,body);
  announce(env,ctx,result.changed);
  return json({ok:true,applied:result.applied});
 }catch(error){if(error instanceof RecordError)return json({ok:false,error:error.message});throw error}
}
function coreHandler(fetcher){return async(request,env,ctx)=>{
  const url=new URL(request.url);
  try{
    if(url.pathname==='/api/health')return json({ok:true,service:'sciw-lab-hosted-preview',hosting:'cloudflare-workers'});
    if(!url.pathname.startsWith('/api/')){
      if(!['GET','HEAD'].includes(request.method))throw new HttpError(405,'지원하지 않는 요청');
      const assetUrl=new URL(request.url);if(assetUrl.pathname.endsWith('/'))assetUrl.pathname+='index.html';
      const res=await env.ASSETS.fetch(new Request(assetUrl,request)),headers=new Headers(res.headers);headers.set('X-Robots-Tag','noindex, nofollow, noarchive');
      return new Response(res.body,{status:res.status,headers});
    }
    const origin=request.headers.get('Origin');
    if(origin?!allowedOrigin(origin,url):request.headers.get('Sec-Fetch-Site')==='cross-site')throw new HttpError(403,'같은 수업 화면에서 요청해 주세요.');
    const method=API_PATHS.get(url.pathname);
    if(!method)throw new HttpError(404,'지원하지 않는 조회');
    if(request.method!==method)throw new HttpError(405,'지원하지 않는 요청');
    if(url.pathname.startsWith('/api/student'))return await student(request,env,ctx,fetcher,url.pathname);
    if(!configured(env))throw new HttpError(503,'교사 암호 설정을 확인해 주세요.');
    if(url.pathname==='/api/sheet/login'){
      if(!allowedOrigin(origin,url))throw new HttpError(403,'같은 수업 화면에서 요청해 주세요.');
      if(request.headers.get('Content-Type')?.split(';')[0]!=='application/json')throw new HttpError(400,'잘못된 로그인 요청입니다.');
      if(!env.TEACHER_LOGIN_LIMIT)throw new HttpError(503,'교사 암호 설정을 확인해 주세요.');
      const {success}=await env.TEACHER_LOGIN_LIMIT.limit({key:request.headers.get('CF-Connecting-IP')||'unknown'});
      if(!success)throw new HttpError(429,'잠시 후 다시 시도해 주세요.');
      let credentials;try{credentials=JSON.parse(await boundedText(request,1024))}catch(error){if(error instanceof HttpError)throw error;throw new HttpError(400,'잘못된 로그인 요청입니다.')}
      if(!await passwordMatches(env,credentials?.password))throw new HttpError(401,'암호가 맞지 않습니다.');
      return json({ok:true,token:await issueToken(env)});
    }
    if(url.pathname==='/api/sheet/live'){
      const [protocol,token]=String(request.headers.get('Sec-WebSocket-Protocol')||'').split(/,\s*/);
      if(!allowedOrigin(origin,url)||request.headers.get('Upgrade')?.toLowerCase()!=='websocket'||protocol!=='sciw-progress')throw new HttpError(403,'실시간 연결을 확인해 주세요.');
      const proof=new Request(url,{headers:{Authorization:'Bearer '+(token||'')}});
      if(!await hasSession(proof,env))throw new HttpError(401,'교사 암호를 입력해 주세요.');
      const mission=url.searchParams.get('missionId'),channel=Object.hasOwn(MISSIONS,mission)&&progressChannel(env,mission,url.searchParams.get('includeTests')==='1');
      if(!channel)throw new HttpError(404,'실시간 연결을 사용할 수 없습니다.');
      return channel.fetch(new Request(url,{headers:{Upgrade:'websocket','X-Sciw-Expiry':token.split('.')[0]}}));
    }
    if(!await hasSession(request,env))throw new HttpError(401,'교사 암호를 입력해 주세요.');
    if(url.pathname==='/api/sheet/session')return json({ok:true});
    if(request.method==='GET'&&['/api/sheet/classes','/api/sheet/class'].includes(url.pathname)){
      if(url.pathname.endsWith('/classes')){const d=env.DB?await readRecords(env.DB):await readSheet(fetcher,env.TEACHER_PROXY_SECRET);return json({ok:true,classes:catalog(d),overview:I.overview(d),fetchedAt:d.fetchedAt,sheetUrl:d.sheetUrl,storage:d.storage,invalidRows:d.invalidRows})}
      const scope=validScope({classKey:url.searchParams.get('classKey')||'',classCode:url.searchParams.get('classCode')||'',missionId:url.searchParams.get('missionId')||'m02',includeTests:url.searchParams.get('includeTests')==='1'});
      return json({ok:true,...scoped(env.DB?await readRecords(env.DB,scope):await readSheet(fetcher,env.TEACHER_PROXY_SECRET),scope)});
    }
    if(!allowedOrigin(origin,url))throw new HttpError(403,'같은 수업 화면에서 요청해 주세요.');
    if(request.headers.get('Content-Type')?.split(';')[0]!=='application/json')throw new HttpError(400,'잘못된 분석 요청입니다.');
    let body;try{body=JSON.parse(await boundedText(request,1024))}catch(error){if(error instanceof HttpError)throw error;throw new HttpError(400,'잘못된 분석 요청입니다.')}
    if(!body||Array.isArray(body)||typeof body!=='object')throw new HttpError(400,'잘못된 분석 요청입니다.');
    if(url.pathname==='/api/sheet/rejudge'){
      if(env.DB){
        const result=await rejudge(body,env,fetcher);
        if(result.ok)announce(env,ctx,[false,true].map(isTest=>({classKey:S.identity(body.classCode).classKey,missionId:body.missionId,isTest})));
        return json(result,result.ok?200:['STALE_SUBMISSION','REJUDGE_BUSY','REJUDGE_NOT_NEEDED'].includes(result.code)?409:400);
      }
      const {classCode,missionId,sessionId,attemptId,requestId}=body;
      const upstream=await fetcher(SCRIPT,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},
        body:JSON.stringify({action:'rejudge',classCode,missionId,sessionId,attemptId,requestId,proxySecret:env.TEACHER_PROXY_SECRET}),
        redirect:'follow',signal:AbortSignal.timeout(145000)});
      if(!upstream.ok)throw new HttpError(502,'재판정 서버에 연결하지 못했습니다.');
      const result=JSON.parse(await boundedText(upstream,60000));
      if(result.ok&&result.rejudgment?.requestId===requestId)return json({ok:true,rejudgment:result.rejudgment});
      const code=typeof result.code==='string'&&/^[A-Z_]{2,40}$/.test(result.code)?result.code:'REJUDGE_UNAVAILABLE';
      return json({ok:false,code},['STALE_SUBMISSION','REJUDGE_BUSY','REJUDGE_NOT_NEEDED'].includes(code)?409:400);
    }
    const scope=validScope(body),data=scoped(env.DB?await readRecords(env.DB,scope):await readSheet(fetcher,env.TEACHER_PROXY_SECRET),scope);
    const evidence=E.build(data,scope.classCode,scope.mode,{missionId:scope.missionId,includeTests:scope.includeTests,classCodes:data.classCodes});
    if(!evidence.participants)throw new HttpError(400,'분석할 참여 기록이 없습니다.');
    if(env.DB){
      const analysis=await teachingReport(evidence,scope.regenerate,env,fetcher).catch(error=>{throw new HttpError(502,error.message==='KEY_NOT_CONFIGURED'?'수업 요약 API 키를 설정해 주세요.':'수업 요약을 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.')});
      return json({ok:true,analysis,basis:evidence,fetchedAt:data.fetchedAt,classCode:scope.classCode,classKey:data.classKey,missionId:scope.missionId});
    }
    const res=await fetcher(SCRIPT,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'analyzeClass',evidence,regenerate:scope.regenerate}),redirect:'follow',signal:AbortSignal.timeout(120000)});
    if(!res.ok)throw new HttpError(502,'OpenAI 분석 서버에 연결하지 못했습니다.');
    let value;try{value=JSON.parse(await boundedText(res,150000))}catch{throw new HttpError(502,'분석 응답을 확인하지 못했습니다.')}
    if(!value.ok)throw new HttpError(400,value.error||'OpenAI 분석을 완료하지 못했습니다.');
    return json({ok:true,analysis:value.analysis,basis:evidence,fetchedAt:data.fetchedAt,classCode:scope.classCode,classKey:data.classKey,missionId:scope.missionId});
  }catch(error){
    const status=error instanceof HttpError?error.status:502;
    if(status>=500)console.error(JSON.stringify({event:'preview_api_error',status}));
    return json({ok:false,error:error instanceof HttpError?error.message:'서버 연결을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.'},status);
  }
}}
export function createHandler(fetcher){
  const handle=coreHandler(fetcher);
  return async(request,env,ctx)=>{
    const url=new URL(request.url),origin=request.headers.get('Origin');
    if(!url.pathname.startsWith('/api/'))return handle(request,env,ctx);
    let response;
    if(request.method==='OPTIONS'){
      const method=API_PATHS.get(url.pathname),requestedHeaders=(request.headers.get('Access-Control-Request-Headers')||'').split(',').map(h=>h.trim().toLowerCase()).filter(Boolean);
      if(!allowedOrigin(origin,url)||!method||request.headers.get('Access-Control-Request-Method')!==method||requestedHeaders.some(h=>!['content-type','authorization'].includes(h))){
        response=json({ok:false,error:'허용하지 않는 교사 화면 요청입니다.'},403);
      }else{
        response=new Response(null,{status:204,headers:{'Access-Control-Allow-Methods':method,'Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Max-Age':'600','Cache-Control':'private, no-store'}});
      }
    }else response=await handle(request,env,ctx);
    if(response.status===101)return response;
    const headers=new Headers(response.headers);
    headers.append('Vary','Origin');
    if(allowedOrigin(origin,url))headers.set('Access-Control-Allow-Origin',origin);
    return new Response(response.body,{status:response.status,headers});
  };
}
export default {fetch:(request,env)=>createHandler(fetch)(request,env)};
