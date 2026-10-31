/*
 * 배포 설정 — 미션 02
 * API_URL: Apps Script 웹 앱 URL(…/exec). 비워 두면 "로컬 모드"로 동작해 기록이 이 브라우저(localStorage)에만 저장된다.
 * 2026-10-31 운영 API에서 미션별 저장과 재전송 중복 방지를 확인했다. 판정은 키워드 규칙을 사용한다.
 */
window.SCIW_CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbxS7kGYURyYRhRZHWZZw0B0sChUE5UAFP3TqUhxLcAMDty_1OGk0OrxVQzKv2RdhCG4/exec',
  MISSION_ID: 'm02',
  // 미션 02 쓰기 검증 완료. 교사 서버 조회는 별도 인증 설정이 필요하다.
  M02_SERVER_VERIFIED: true,
  LLM_TIMEOUT_MS: 3000,
  USE_LLM: false
};
