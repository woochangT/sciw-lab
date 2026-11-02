import {readdir, lstat, mkdir, copyFile, rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../../',import.meta.url));
const out=path.join(root,'.local/cloudflare-site');
const allowed=new Set(['.html','.js','.css','.svg','.png','.jpg','.jpeg','.webp','.ico','.woff','.woff2','.mp4','.webm','.gif','.mp3','.json']);
await rm(out,{recursive:true,force:true});
await mkdir(out,{recursive:true});
let count=0;
async function copy(rel){
  const source=path.join(root,rel),stat=await lstat(source);
  if(stat.isSymbolicLink())throw Error('Symlinks are not preview assets');
  if(stat.isDirectory()){
    for(const entry of await readdir(source))if(!entry.startsWith('.')&&!['tests','design'].includes(entry))await copy(path.join(rel,entry));
  }else if(allowed.has(path.extname(rel).toLowerCase())){
    if(stat.size>25*1024*1024)throw Error('Asset exceeds Workers limit: '+rel);
    const dest=path.join(out,rel);await mkdir(path.dirname(dest),{recursive:true});await copyFile(source,dest);count++;
  }
}
for(const rel of ['index.html','teacher.html','teacher','intro','ui','감자 삼투/web','강철솜 질량 보존/web'])await copy(rel);
console.log(`Built ${count} web assets; repository documents, tools and private files excluded.`);
