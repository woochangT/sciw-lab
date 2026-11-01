#!/usr/bin/env node
// 로컬 파일 생성만 한다. clasp, 로그인, 업로드, 배포는 실행하지 않는다.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.join(root, '.local', 'm02-apps-script');
fs.mkdirSync(output, { recursive: true });
const source = fs.readFileSync(path.join(root, '강철솜 질량 보존/web/js/rubric02.js'), 'utf8');
// Apps Script에서 접근할 전역 이름을 명시한다.
const rubric = 'var SCIW_RUBRIC02;\n' + source.replace('else root.SCIW_RUBRIC02 = api;', 'else SCIW_RUBRIC02 = api;');
fs.writeFileSync(path.join(output, 'Rubric.gs'), rubric);
fs.copyFileSync(path.join(root, 'apps-script/m02-evaluator/Code.gs'), path.join(output, 'Code.gs'));
fs.copyFileSync(path.join(root, 'apps-script/m02-evaluator/appsscript.json'), path.join(output, 'appsscript.json'));
console.log('로컬 배포 준비 파일: ' + output + ' (업로드하지 않음)');
