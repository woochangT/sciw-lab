import {DurableObject} from 'cloudflare:workers';
import {createHandler} from './worker.mjs';

// One stream per game and test/live scope. Only change notices leave this object.
export class ClassProgress extends DurableObject {
  async fetch(request) {
    const pair=new WebSocketPair();
    const expiry=Number(request.headers.get('X-Sciw-Expiry'));
    this.ctx.acceptWebSocket(pair[1]);
    pair[1].serializeAttachment({expiry});
    return new Response(null,{status:101,webSocket:pair[0],headers:{'Sec-WebSocket-Protocol':'sciw-progress'}});
  }
  publish(change) {
    const message=JSON.stringify(change);
    for(const socket of this.ctx.getWebSockets()){
      try{
        if(socket.deserializeAttachment().expiry<=Math.floor(Date.now()/1000))socket.close(1008,'Session expired');
        else socket.send(message);
      }catch{socket.close(1011,'Reconnect');}
    }
  }
  webSocketMessage() {}
  webSocketClose(socket,code){try{socket.close(code===1006?1001:code)}catch{}}
}

const handler=createHandler(fetch);
export default {
 fetch(request,env,ctx){
  if(!env.DB)return Response.json({ok:false,error:'기록 DB를 설정해 주세요.'},{status:503});
  const bindings=env.SCIW_LOCAL==='yes'?{
   ...env,TEACHER_PASSWORD:'teacher-local',TEACHER_PROXY_SECRET:'local-preview-signing-key-2026-not-for-production'
  }:env;
  return handler(request,bindings,ctx);
 }
};
