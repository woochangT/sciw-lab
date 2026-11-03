(function(root){
 'use strict';
 async function getJSON(url,signal,fetcher=fetch){
  for(let attempt=0;attempt<2;attempt++){
   let response;
   try{response=await fetcher(url,{signal,cache:'no-store'})}
   catch(error){if(signal?.aborted||error.name==='AbortError'||attempt)throw error;continue}
   if([502,503,504].includes(response.status)&&!attempt){await response.body?.cancel();continue}
   const value=response.headers.get('Content-Type')?.includes('application/json')?await response.json():null;
   if(!response.ok||!value?.ok)throw Error(value?.error||'시트 연결 서버가 응답하지 않습니다. (HTTP '+response.status+')');
   return value;
  }
 }
 root.TeacherConnection={getJSON};
})(typeof window==='undefined'?globalThis:window);
