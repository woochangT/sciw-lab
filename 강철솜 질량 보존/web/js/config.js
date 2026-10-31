/*
 * 배포 설정 — 미션 02
 * API_URL: Apps Script 웹 앱 URL(…/exec). 비워 두면 "로컬 모드"로 동작해 기록이 이 브라우저(localStorage)에만 저장된다.
 * 지금은 팀 시트를 건드리지 않도록 비워 두었다. LLM 판정도 쓰지 않고 키워드 규칙으로만 판정한다.
 */
window.SCIW_CONFIG = {
  API_URL: '',
  MISSION_ID: 'm02',
  LLM_TIMEOUT_MS: 3000,
  USE_LLM: false
};
