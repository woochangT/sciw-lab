const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const code=fs.readFileSync('teacher/config.js','utf8');
test('Pages uses hosted sheet API while localhost and hosted preview retain their own server',()=>{
 for(const [origin,expected] of [
  ['https://woochangt.github.io','https://sciw-lab-preview.yoodison.workers.dev/api/sheet'],
  ['http://127.0.0.1:8765','/api/sheet'],
  ['http://localhost:8765','/api/sheet'],
  ['https://sciw-lab-preview.yoodison.workers.dev','/api/sheet']
 ]){
  const window={location:{origin}};vm.runInNewContext(code,{window});
  assert.equal(window.SCIW_TEACHER_CONFIG.SHEET_API,expected);
 }
});
