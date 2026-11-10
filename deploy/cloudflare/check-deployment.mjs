import {readFileSync} from 'node:fs';
const config=JSON.parse(readFileSync(new URL('./wrangler.jsonc',import.meta.url),'utf8'));
const database=config.d1_databases?.find(entry=>entry.binding==='DB');
if(!database?.database_id||database.database_id==='00000000-0000-4000-8000-000000000000'){
  console.error('Set the deployed D1 database ID before publishing. npm run dev uses a local database.');
  process.exitCode=1;
}
