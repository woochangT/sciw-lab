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
  publish(changes) {
    const message=JSON.stringify(changes);
    for(const socket of this.ctx.getWebSockets()){
      try{
        if(socket.deserializeAttachment().expiry<=Math.floor(Date.now()/1000))socket.close(1008,'Session expired');
        else socket.send(message);
      }catch{try{socket.close(1011,'Reconnect')}catch{}}
    }
  }
  webSocketMessage() {}
  webSocketClose(socket,code){try{socket.close(code===1006?1001:code)}catch{}}
}

const handler=createHandler(fetch);
export default {fetch:handler};
