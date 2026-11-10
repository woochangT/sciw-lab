const encoder=new TextEncoder();
const signKey=secret=>crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
const hex=bytes=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
const bytes=text=>Uint8Array.from(text.match(/../g),x=>parseInt(x,16));
const TTL=8*60*60;
export function configured(env){return typeof env.TEACHER_PASSWORD==='string'&&env.TEACHER_PASSWORD.length>=8&&typeof env.TEACHER_PROXY_SECRET==='string'&&env.TEACHER_PROXY_SECRET.length>=32}
export async function passwordMatches(env,value){
 if(typeof value!=='string'||value.length>128)return false;
 const key=await signKey(env.TEACHER_PROXY_SECRET),expected=await crypto.subtle.sign('HMAC',key,encoder.encode('password:'+env.TEACHER_PASSWORD));
 return crypto.subtle.verify('HMAC',key,expected,encoder.encode('password:'+value));
}
export async function signedProgress(env,payload,signature){
 return /^[a-f0-9]{64}$/.test(signature||'')&&crypto.subtle.verify('HMAC',await signKey(env.TEACHER_PROXY_SECRET),bytes(signature),encoder.encode(payload));
}
async function sessionKey(env){
 const signing=await signKey(env.TEACHER_PROXY_SECRET);
 const derived=await crypto.subtle.sign('HMAC',signing,encoder.encode('teacher-session:'+env.TEACHER_PASSWORD));
 return crypto.subtle.importKey('raw',derived,{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
}
export async function issueToken(env,now=Math.floor(Date.now()/1000)){
 const message=`${now+TTL}.${crypto.randomUUID()}`;
 return `${message}.${hex(await crypto.subtle.sign('HMAC',await sessionKey(env),encoder.encode(message)))}`;
}
export async function hasSession(request,env,now=Math.floor(Date.now()/1000)){
 const auth=/^Bearer (\d{1,11}\.[a-f0-9-]{36})\.([a-f0-9]{64})$/.exec(request.headers.get('Authorization')||'');
 if(!auth||Number(auth[1].split('.')[0])<=now)return false;
 return crypto.subtle.verify('HMAC',await sessionKey(env),bytes(auth[2]),encoder.encode(auth[1]));
}
