#!/usr/bin/env node
/* 로컬 전용: 실제 Apps Script 코드를 실행하되 Google Sheets 대신 .local의 파일에 저장한다.
 * 운영 시트/배포에는 접근하지 않는다. 두 게임의 기록 주소는 응답 시에만 로컬로 바꾼다.
 */
'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ROOT=path.resolve(__dirname,'..'),PORT=Number(process.env.SCIW_PREVIEW_PORT||8796),ORIGIN='http://127.0.0.1:'+PORT;
const DATA=path.join(ROOT,'.local/session-preview/sheets.json');
fs.mkdirSync(path.dirname(DATA),{recursive:true});
let db=fs.existsSync(DATA)?JSON.parse(fs.readFileSync(DATA,'utf8')):{},dirty=false;
function persist(){if(!dirty)return;fs.writeFileSync(DATA+'.tmp',JSON.stringify(db,null,2),{mode:0o600});fs.renameSync(DATA+'.tmp',DATA);dirty=false;}
function sheet(name){
  return {
    getLastRow:()=>db[name].length,
    getLastColumn:()=>Math.max(0,...db[name].map(r=>r.length)),
    setFrozenRows(){return this;},
    getRange(row,col,height=1,width=1){
      const range={
        getValues:()=>Array.from({length:height},(_,i)=>Array.from({length:width},(_,j)=>db[name][row-1+i]?.[col-1+j]??'')),
        getDisplayValues(){return this.getValues().map(r=>r.map(String));},
        setValues(values){for(let i=0;i<height;i++){const r=db[name][row-1+i]||=[];for(let j=0;j<width;j++)r[col-1+j]=values[i][j];}dirty=true;return range;},
        setNumberFormat(){return range;},setFontWeight(){return range;},
        createTextFinder(value){return {matchEntireCell(){return this;},findNext(){for(let i=0;i<height;i++)if(String(db[name][row-1+i]?.[col-1]??'')===value)return {getRow:()=>row+i};return null;}};}
      };return range;
    }
  };
}
const book={getUrl:()=> 'local-file',getSheetByName:name=>db[name]?sheet(name):null,insertSheet(name){db[name]=[];dirty=true;return sheet(name);}};
const sandbox=vm.createContext({console,Logger:{log(){}},SpreadsheetApp:{openById:()=>book,flush(){}},ContentService:{MimeType:{JSON:'application/json'},createTextOutput:text=>({setMimeType:()=>text})},LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},PropertiesService:{getScriptProperties:()=>({getProperty:()=>null})}});
vm.runInContext(fs.readFileSync(path.join(ROOT,'apps-script/Code.gs'),'utf8'),sandbox,{filename:'apps-script/Code.gs'});
sandbox.setup();persist();
function json(res,status,value){res.writeHead(status,{'Content-Type':'application/json;charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));}
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2','.ico':'image/x-icon'};
http.createServer(async(req,res)=>{
  try{
    if(req.headers.host!=='127.0.0.1:'+PORT)return json(res,403,{ok:false,error:'잘못된 호스트'});
    const url=new URL(req.url,ORIGIN);
    if(url.pathname==='/api/records'&&req.method==='POST'){
      if(req.headers.origin!==ORIGIN)return json(res,403,{ok:false,error:'로컬 화면에서만 사용할 수 있습니다'});
      let body='';for await(const part of req){body+=part;if(body.length>150000)return json(res,413,{ok:false,error:'요청 크기 한도'});}
      const input=JSON.parse(body);
      // 허용한 로컬 기록 작업만 실행한다. 관리/교사 API, 원격 기록 전송은 제공하지 않는다.
      if(!['batch','findStudentSession'].includes(input.action))return json(res,400,{ok:false,error:'로컬 기록 서버가 지원하지 않는 요청'});
      const result=JSON.parse(sandbox.doPost({postData:{contents:body}}));persist();return json(res,200,result);
    }
    if(req.method!=='GET'&&req.method!=='HEAD')return json(res,405,{ok:false});
    let route=decodeURIComponent(url.pathname);if(route.endsWith('/'))route+='index.html';
    if(route.split('/').some(p=>p.startsWith('.')||p.includes('\\')))return json(res,404,{ok:false});
    const file=path.resolve(ROOT,'.'+route),type=MIME[path.extname(file)];
    if(!file.startsWith(ROOT+path.sep)||!type||!fs.existsSync(file)||!fs.statSync(file).isFile())return json(res,404,{ok:false});
    let content=fs.readFileSync(file);
    if(route.endsWith('/web/js/config.js')){
      content=Buffer.from(content.toString().replace(/\bAPI_URL:[^\n]+/,"API_URL: '/api/records',"));
    }
    res.writeHead(200,{'Content-Type':type+'; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:content);
  }catch(error){json(res,500,{ok:false,error:'로컬 요청을 처리하지 못했습니다'});}
}).listen(PORT,'127.0.0.1',()=>console.log('로컬 플레이: '+ORIGIN+'/ (기록: .local/session-preview/sheets.json · 운영 시트 전송 없음)'));
