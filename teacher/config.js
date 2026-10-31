// 공개 설정만 넣는다. 비밀키나 사용자 토큰을 여기에 넣지 않는다.
window.SCIW_TEACHER_CONFIG = { API_URL: '', REFRESH_MS: 20000, TIMEOUT_MS: 12000 };
// 운영 전 window.SCIW_TEACHER_AUTH.signIn() 제공자를 별도 연결해야 한다.
// Promise<string>으로 교사 credential을 반환해야 하며, 토큰은 메모리에만 보관한다.
