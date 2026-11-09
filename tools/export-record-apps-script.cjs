#!/usr/bin/env node
// Build the recording project without uploading or contacting a service.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function evaluatorSources() {
  const context = vm.createContext({ window: {} });
  for (const file of ['감자 삼투/web/missions/mission01.js', '강철솜 질량 보존/web/js/config.js']) {
    vm.runInContext(read(file), context, { filename: file });
  }
  const { lexicon, answer, llmContext, llmDefenseChecks } = context.window.SCIW_MISSIONS.m01;
  const judge = read('감자 삼투/web/js/judge.js');
  const browserExport = 'window.SCIW_JUDGE = { normalize, analyze, judgeQuestText, judgeDefense };';
  if (!judge.includes(browserExport)) throw Error('미션 01 판정기 내보내기 형식이 바뀌었습니다.');
  const runtime = 'var SCIW_M01_JUDGE;\n' + judge.replace(browserExport, 'SCIW_M01_JUDGE = judgeDefense;');
  const settings = { lexicon, answer, llmContext, llmDefenseChecks, m02Url: context.window.SCIW_CONFIG.JUDGE_API_URL };
  return runtime + '\nvar SCIW_REJUDGE_SETTINGS = ' + JSON.stringify(settings) + ';\n';
}

if (require.main === module) {
  const output = path.join(root, '.local', 'record-apps-script');
  fs.mkdirSync(output, { recursive: true });
  for (const file of ['Code.gs', 'Rejudge.gs', 'appsscript.json']) {
    fs.copyFileSync(path.join(root, 'apps-script', file), path.join(output, file));
  }
  fs.writeFileSync(path.join(output, 'Evaluators.gs'), evaluatorSources());
  console.log('로컬 배포 준비 파일: ' + output);
}
module.exports = { evaluatorSources };
