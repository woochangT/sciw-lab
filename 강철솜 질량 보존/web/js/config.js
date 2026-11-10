/* The game and Worker share one origin, including local development and branch previews. */
(function () {
  const origin = window.location?.origin || '';
  const base = origin === 'https://woochangt.github.io'
    ? 'https://sciw-lab-preview.yoodison.workers.dev'
    : '';
  const available = !window.location || window.location.protocol !== 'file:';
  window.SCIW_CONFIG = {
    API_URL: available ? base + '/api/student' : '',
    MISSION_ID: 'm02',
    M02_SERVER_VERIFIED: true,
    JUDGE_API_URL: available ? base + '/api/student/judge' : '',
    LLM_TIMEOUT_MS: 65000
  };
})();
