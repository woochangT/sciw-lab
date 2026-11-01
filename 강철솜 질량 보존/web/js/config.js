/*
 * 배포 설정 — 미션 02
 * API_URL: Apps Script 웹 앱 URL(…/exec). 비워 두면 "로컬 모드"로 동작해 기록이 이 브라우저(localStorage)에만 저장된다.
 * 기록은 기존 검증된 운영 주소를 유지하고, 모든 직접 서술 판정은 별도 AI 평가 서버를 사용한다.
 */
window.SCIW_CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbxS7kGYURyYRhRZHWZZw0B0sChUE5UAFP3TqUhxLcAMDty_1OGk0OrxVQzKv2RdhCG4/exec',
  MISSION_ID: 'm02',
  // 미션 02 쓰기 검증 완료. 교사 서버 조회는 별도 인증 설정이 필요하다.
  M02_SERVER_VERIFIED: true,
  // 미션02 평가 전용 Apps Script. 기존 기록 서버 주소와 분리한다.
  // 로컬 실험 서버는 복사본에서만 이 값을 로컬 평가 주소로 바꾼다.
  JUDGE_API_URL: 'https://script.google.com/macros/s/AKfycbxhtRFI4cX2Kq_DiImTX_oEbuSGOOvr7F9Wa_JqJjdVOVYsLSchmHEEI70xKsQYjtr1kA/exec',
  LLM_TIMEOUT_MS: 65000
};
