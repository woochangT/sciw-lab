// GitHub Pages has no API server; it uses the same hosted API as the preview.
window.SCIW_TEACHER_CONFIG = {
  REFRESH_MS: 20000,
  SHEET_API: window.location.origin === 'https://woochangt.github.io'
    ? 'https://sciw-lab-preview.yoodison.workers.dev/api/sheet'
    : '/api/sheet',
  SHEET_URL: 'https://docs.google.com/spreadsheets/d/1oA71tk0hqCXC0ImV3c5MZq938hZFKcj2XkJnB3XNnAU/edit#gid=807310002'
};
