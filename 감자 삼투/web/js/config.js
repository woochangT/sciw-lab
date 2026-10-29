/*
 * 배포 설정
 * API_URL: Apps Script 웹 앱을 배포하고 받은 URL(…/exec)을 붙여 넣는다.
 *          비워 두면 "로컬 모드"로 동작해 기록이 이 브라우저(localStorage)에만 저장된다.
 */
window.SCIW_CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbxS7kGYURyYRhRZHWZZw0B0sChUE5UAFP3TqUhxLcAMDty_1OGk0OrxVQzKv2RdhCG4/exec',
  MISSION_ID: 'm01',
  LLM_TIMEOUT_MS: 3000,   // LLM 판정을 기다리는 최대 시간. 넘으면 키워드 규칙으로 판정
  USE_LLM: true,          // Apps Script에 API 키가 없으면 서버가 알아서 거절하고 키워드 판정으로 넘어간다
  HEATMAP_REFRESH_MS: 20000
};
