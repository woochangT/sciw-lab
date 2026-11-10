/* The game and Worker share one origin, including local development and branch previews. */
(function () {
  const origin = window.location?.origin || '';
  const base = origin === 'https://woochangt.github.io'
    ? 'https://sciw-lab-preview.yoodison.workers.dev'
    : '';
  const available = !window.location || window.location.protocol !== 'file:';
  window.SCIW_CONFIG = {
    API_URL: available ? base + '/api/student' : '',
    MISSION_ID: 'm01',
    LLM_TIMEOUT_MS: 3000,
    USE_LLM: true,
    HEATMAP_REFRESH_MS: 20000
  };
})();
