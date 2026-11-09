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
const API_PATHS=new Map([['/api/sheet/classes','GET'],['/api/sheet/class','GET'],['/api/sheet/analysis','POST'],['/api/sheet/rejudge','POST']]);
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
export function csv(text){
  const rows=[];let row=[],field='',quoted=false;
  text=text.replace(/^\uFEFF/,'');
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++}else if(quoted||!field)quoted=!quoted;else field+=c}
    else if(c===','&&!quoted){row.push(field);field=''}
    else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);if(row.some(Boolean))rows.push(row);row=[];field=''}
    else field+=c;
  }
  if(quoted)throw new HttpError(502,'시트 CSV 형식을 확인해 주세요.');
  if(field||row.length){row.push(field);rows.push(row)}
  return rows;
}
export function parseRecords(text,mission){
  const rows=csv(text),head=rows.shift();
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
export async function readSheet(fetcher){
  const parts=await Promise.all(Object.entries(MISSIONS).map(async([mission,info])=>{
    const query=new URLSearchParams({tqx:'out:csv',headers:'1',gid:info.gid,range:'A:T'});
    try{
      const res=await fetcher(`https://docs.google.com/spreadsheets/d/${SHEET}/gviz/tq?${query}`,{signal:AbortSignal.timeout(20000)});
      if(!res.ok||!res.headers.get('Content-Type')?.includes('text/csv'))throw Error();
      return parseRecords(await boundedText(res,8_000_000),mission);
    }catch{throw new HttpError(502,info.name+' 시트에서 기록을 읽지 못했습니다. 연결 또는 공유 상태를 확인해 주세요.')}
  }));
  return {sessions:parts.flatMap(p=>p.sessions),attempts:parts.flatMap(p=>p.attempts),invalidRows:parts.reduce((n,p)=>n+p.invalidRows,0),fetchedAt:new Date().toISOString(),sheetUrl:sheetUrl('m02')};
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
function coreHandler(fetcher){return async(request,env)=>{
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
    if(request.method==='GET'&&['/api/sheet/classes','/api/sheet/class'].includes(url.pathname)){
      if(url.pathname.endsWith('/classes')){const d=await readSheet(fetcher);return json({ok:true,classes:catalog(d),overview:I.overview(d),fetchedAt:d.fetchedAt,sheetUrl:d.sheetUrl,invalidRows:d.invalidRows})}
      const scope=validScope({classKey:url.searchParams.get('classKey')||'',classCode:url.searchParams.get('classCode')||'',missionId:url.searchParams.get('missionId')||'m02',includeTests:url.searchParams.get('includeTests')==='1'});
      return json({ok:true,...scoped(await readSheet(fetcher),scope)});
    }
    if(!['/api/sheet/analysis','/api/sheet/rejudge'].includes(url.pathname))throw new HttpError(404,'지원하지 않는 조회');
    if(request.method!=='POST')throw new HttpError(405,'지원하지 않는 요청');
    if(!allowedOrigin(origin,url))throw new HttpError(403,'같은 수업 화면에서 요청해 주세요.');
    if(request.headers.get('Content-Type')?.split(';')[0]!=='application/json')throw new HttpError(400,'잘못된 분석 요청입니다.');
    let body;try{body=JSON.parse(await boundedText(request,1024))}catch(error){if(error instanceof HttpError)throw error;throw new HttpError(400,'잘못된 분석 요청입니다.')}
    if(!body||Array.isArray(body)||typeof body!=='object')throw new HttpError(400,'잘못된 분석 요청입니다.');
    if(url.pathname==='/api/sheet/rejudge'){
      const {classCode,missionId,sessionId,attemptId,requestId,teacherKey}=body;
      const upstream=await fetcher(SCRIPT,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},
        body:JSON.stringify({action:'rejudge',classCode,missionId,sessionId,attemptId,requestId,teacherKey}),
        redirect:'follow',signal:AbortSignal.timeout(145000)});
      if(!upstream.ok)throw new HttpError(502,'재판정 서버에 연결하지 못했습니다.');
      const result=JSON.parse(await boundedText(upstream,60000));
      if(result.ok&&result.rejudgment?.requestId===requestId)return json({ok:true,rejudgment:result.rejudgment});
      const code=typeof result.code==='string'&&/^[A-Z_]{2,40}$/.test(result.code)?result.code:'REJUDGE_UNAVAILABLE';
      return json({ok:false,code},code==='TEACHER_ACCESS'?403:code==='STALE_SUBMISSION'||code==='REJUDGE_BUSY'?409:400);
    }
    const scope=validScope(body),data=scoped(await readSheet(fetcher),scope);
    const evidence=E.build(data,scope.classCode,scope.mode,{missionId:scope.missionId,includeTests:scope.includeTests,classCodes:data.classCodes});
    if(!evidence.participants)throw new HttpError(400,'분석할 참여 기록이 없습니다.');
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
  return async(request,env)=>{
    const url=new URL(request.url),origin=request.headers.get('Origin');
    if(!url.pathname.startsWith('/api/'))return handle(request,env);
    let response;
    if(request.method==='OPTIONS'){
      const method=API_PATHS.get(url.pathname),requestedHeaders=(request.headers.get('Access-Control-Request-Headers')||'').split(',').map(h=>h.trim().toLowerCase()).filter(Boolean);
      if(!allowedOrigin(origin,url)||!method||request.headers.get('Access-Control-Request-Method')!==method||requestedHeaders.some(h=>h!=='content-type')){
        response=json({ok:false,error:'허용하지 않는 교사 화면 요청입니다.'},403);
      }else{
        response=new Response(null,{status:204,headers:{'Access-Control-Allow-Methods':method,'Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'600','Cache-Control':'private, no-store'}});
      }
    }else response=await handle(request,env);
    const headers=new Headers(response.headers);
    headers.append('Vary','Origin');
    if(allowedOrigin(origin,url))headers.set('Access-Control-Allow-Origin',origin);
    return new Response(response.body,{status:response.status,headers});
  };
}
export default {fetch:(request,env)=>createHandler(fetch)(request,env)};
