/*
 * 게임 엔진 — 미션 02 「늘어난 강철솜」
 * 흐름: 탐색 → 주장(처음 답 직접 쓰기 + 고르기) → 드러내기(꼬투리 셋: 카드 뒤집기와 교수의 오독 → 현미경 조사 → 뒷면 쓰기 → 합치기 장면) → 완전한 설명(답안 짜기) → 클리어
 * 코드와 기록의 단계 이름(rebuttal, defense)은 그대로 둔다.
 * 화면 규칙: 다음 물건은 세 번 깜빡인 뒤 빛 테두리로 남고, 할 말은 교수 말풍선이 한다. 할 일이 바뀌는 말은 가운데에 크게 떴다가 머리 위로 옮겨 간다.
 * 교수의 말이 아닌 안내는 게임 시스템의 말(#sysPop, #sysLine)로 따로 보인다.
 * 장면은 1280×640 크기로 그리고 화면에 맞게 줄여 보여 준다.
 */
(function () {
  const M = window.SCIW_MISSIONS.m02;
  const API = window.SCIW_API;
  const RUBRIC = window.SCIW_RUBRIC02;
  const STAGES = RUBRIC.STAGES;
  const ART = window.SCIW_ART02;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const now = () => Date.now();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const W = 1280; const H = 640;
  const nextFrame = (fn) => setTimeout(() => fn(performance.now()), 16);

  const S = {
    stage: 'explore', nose: 2, sessionId: null, classCode: '', studentNo: '',
    tray: [], cards: Object.assign({}, M.cards), done: {}, firstAnswer: '', firstTag: '',
    claim: null, evidence: [null, null], q: null, errCount: {}, concl: {},
    scope: { mode: 'closed', bonded: { closed: 0, open: 0 }, locked: true }, gas: [],
    link: 0, linkBoard: false, gap: null, lensOn: null, notePages: 1, noteView: 1, linkTries: {}, inserted: [], ownMode: false, ownEver: false,
    hint: 0, hintReason: '', submits: 0, predicted: false,
    composeStart: 0, lastInput: now(), glowKey: null, nudged: {}, sel: null, times: {}, firstSubmitText: '',
    tutorial: 'none' // 튜토리얼 시청 여부: none(안 봄) · skipped(건너뜀) · done(끝까지 봄). 처음 생각 진단을 구분해 읽으려고 남긴다.
  };

  async function evaluateText(stage, text) {
    const displayedPrompt = $('#bubble .body').innerText;
    const offset = stage === 'final' ? $('#answer').value.indexOf(text) : 0;
    const cardSpans = stage === 'final' ? RUBRIC.cardSpans(S.answerOrigins || [], offset, text.length) : [];
    const evaluationInput = { initialAnswer: S.firstAnswer, cardSpans };
    const attemptId = API.recordInput(S.sessionId, {stage:S.stage,input:text,displayedPrompt,evaluationStage:stage,
      ...(stage === 'final' ? { evaluationInput, evaluationStatus:'pending' } : {})});
    S.lastAnswerAttempt = attemptId;
    await say(stage === 'final' ? M.lines.finalWait : ['흠…']);
    const started = now();
    judgeWait(true);
    try {
      const result = await API.judge({ stage, text, ...evaluationInput });
      return Object.assign(result, { displayedPrompt, canonicalQuestion: STAGES[stage].question, inReplyTo:attemptId });
    } catch (error) {
      if (stage === 'final') {
        logAttempt({stage:'compose',questId:'finalEvaluation',inReplyTo:attemptId,
          evaluationStatus:'failed',evaluationErrorCode:error.code || 'EVALUATION_ERROR'});
        API.flush();
      }
      throw error;
    } finally {
      judgeWait(false);
      // 서버를 기다린 시간을 학생의 무입력 시간으로 세지 않는다.
      if (stage === 'final') S.composeStart += now() - started;
      S.lastInput = now();
    }
  }
  // 판정 대기 표시: 판정은 최대 65초까지 걸릴 수 있어서, 멈춘 게 아니라 읽는 중임을 움직이는 그림과 글로 알린다.
  let waitTimer = null;
  function judgeWait(on) {
    let el = $('#judgeWait');
    clearInterval(waitTimer);
    document.body.classList.toggle('judging', on);
    if (!on) { if (el) el.hidden = true; return; }
    if (!el) {
      el = document.createElement('div');
      el.id = 'judgeWait'; el.setAttribute('role', 'status');
      el.innerHTML = '<div class="jw-art" aria-hidden="true"><i class="jw-paper"><i></i><i></i><i></i><i></i></i><i class="jw-lens"></i></div>'
        + '<div class="jw-text"><b></b><small>쓴 답은 저장되어 있어요. 창을 닫지 말고 기다려 주세요.</small></div>';
      document.body.appendChild(el);
    }
    const t0 = now();
    const msg = () => {
      const s = (now() - t0) / 1000;
      const text = s < 10 ? '교수님이 답을 읽고 있어요' : s < 30 ? '꼼꼼히 읽는 중이에요' : s < 50 ? '거의 다 읽었어요. 조금만 기다려요' : '조금 오래 걸리네요. 곧 끝나요';
      if ($('b', el).textContent !== text) $('b', el).textContent = text;
    };
    msg();
    el.hidden = false;
    placeWait(el);
    waitTimer = setInterval(msg, 1000);
  }
  // 판정 대기 카드는 방금 답을 쓴 칸 바로 아래에 둔다(답은 가리지 않는다). 아래에 자리가 없으면 교수 아래 책상에 둔다.
  function placeWait(el) {
    const box = !$('#reply').hidden ? $('#reply') : $('#answer');
    const zone = $('#sceneZone').getBoundingClientRect();
    el.style.maxWidth = '420px'; el.classList.remove('narrow');
    if (box) {
      const r = box.getBoundingClientRect(); const y = r.bottom + 8;
      if (r.width && y + el.offsetHeight <= zone.bottom - 4) {
        el.style.left = Math.max(zone.left + 8, Math.min(r.left, zone.right - el.offsetWidth - 8)) + 'px';
        el.style.top = y + 'px';
        return;
      }
    }
    putAt(el, 'belowProf');
  }
  function judgmentRecord(r) {
    return { judgedBy: 'openai', rubricVersion: r.rubricVersion, model: r.model, requestId: r.requestId,
      outcome: r.outcome, inReplyTo: r.inReplyTo, displayedPrompt: r.displayedPrompt, canonicalQuestion: r.canonicalQuestion,
      feedbackQuestion: r.nextQuestion, analysis: r.analysis, highlights: r.highlights };
  }
  function feedbackLines(stage, followup) {
    // 보완을 거듭해도 지금 답해야 하는 원래 질문이 함께 보이게 한다.
    const lines = Array.isArray(followup) ? followup : [followup];
    return [...new Set([STAGES[stage].question, ...lines].filter(Boolean))];
  }
  const finalDraftKey = () => `sciw_m02_final_${S.classCode}_${S.studentNo}`;
  async function evaluationFailure(error) {
    const setup = ['JUDGE_NOT_CONFIGURED', 'KEY_NOT_CONFIGURED'].includes(error.code);
    await say([setup ? '아직 답을 읽을 준비가 안 됐군. 연결 설정을 확인해 주게.' : '지금은 답을 읽지 못했네. 잠시 뒤 다시 제출해 주게.',
      '자네가 쓴 답은 남겨 두었네. 오답으로 세지 않겠네.']);
  }

  /* ───────── 배치: 1280×640 장면을 화면에 맞추기 ───────── */
  function fit() {
    const zone = $('#sceneZone');
    const s = Math.min(zone.clientWidth / W, zone.clientHeight / H);
    const st = $('#stage');
    // 교수 쪽 확대(S.zoom): 그 점을 화면 가운데 쪽으로 끌어오며 키우되, 장면 가장자리가 드러나지 않게 한다
    let z = '';
    if (S.zoom) {
      const { k, x, y } = S.zoom;
      const cx = Math.min(Math.max(W * 0.55, W - (W - x) * k), x * k);
      const cy = Math.min(Math.max(H * 0.5, H - (H - y) * k), y * k);
      z = ` translate(${cx}px, ${cy}px) scale(${k}) translate(${-x}px, ${-y}px)`;
    }
    st.style.transform = `scale(${s})${z}`;
    st.style.left = ((zone.clientWidth - W * s) / 2) + 'px';
    st.style.top = ((zone.clientHeight - H * s) / 2) + 'px';
    S.scale = s;
    if (document.querySelector('#scope:not([hidden])')) placeScopeWin();
  }
  window.addEventListener('resize', fit);

  /* ───────── 교수 ───────── */
  function expr(level) { return level >= 3 ? 'proud' : level === 2 ? 'skeptical' : level === 1 ? 'surprised' : 'acknowledging'; }
  // 콧대: 미션 01(감자)과 같이 콧대 단계가 교수 그림을 정한다. 3~4 거만, 2 턱 괴기, 1 놀람, 0 웃음.
  // 코도 실제로 줄어든다. 같은 그림을 두 겹으로 쓴다: 코끝 구역을 도려낸 얼굴(pf-base)과 코끝만(pf-tip).
  // 코끝을 뿌리 쪽으로 밀어 넣고(d) 자른 선(cut) 너머는 가리며, 세로로 키워(s) 자른 선의 코 두께에 맞춘다.
  // 표정별 값: cut=자른 선 x, y0~y1=코끝 구역, cyc=자른 선에서 코 중심 높이, lv[콧대]=[d, s, 밀기 전 코 중심 높이]. 236×315 기준.
  const NOSE = {"proud": {"cut": 83.88, "y0": 60.91, "y1": 93.11, "cyc": 77.88, "lv": [[15.02, 1.75, 73.96], [12.1, 1.448, 74.62], [8.76, 1.273, 75.49], [4.59, 1.135, 76.36], [0.0, 1.0, 77.88]]}, "skeptical": {"cut": 69.1, "y0": 84.84, "y1": 112.25, "cyc": 100.72, "lv": [[15.02, 1.708, 99.2], [12.1, 1.414, 99.42], [8.76, 1.281, 99.63], [4.59, 1.079, 100.07], [0.0, 1.0, 100.72]]}, "surprised": {"cut": 83.04, "y0": 95.65, "y1": 123.47, "cyc": 110.17, "lv": [[14.42, 1.64, 109.35], [11.61, 1.414, 109.35], [8.41, 1.281, 109.56], [4.41, 1.108, 109.77], [0.0, 1.0, 110.17]]}, "acknowledging": {"cut": 63.02, "y0": 109.64, "y1": 135.75, "cyc": 125.3, "lv": [[12.52, 1.652, 126.39], [10.08, 1.407, 125.96], [7.3, 1.267, 125.74], [3.82, 1.086, 125.52], [0.0, 1.0, 125.3]]}};
  function noseStyle(face, level, animate) {
    const n = NOSE[face]; const [d, s, cy] = n.lv[level];
    const tip = $('#profTip');
    $('#profBase').style.clipPath = `path(evenodd, 'M0 0H236V315H0Z M0 ${n.y0}H${n.cut}V${n.y1}H0Z')`;
    $('#profTipWrap').style.clipPath = `inset(0 ${236 - n.cut}px 0 0)`;
    tip.style.clipPath = `inset(${n.y0}px ${236 - n.cut}px ${315 - n.y1}px 0)`;
    tip.style.transition = animate ? '' : 'none';
    tip.style.transformOrigin = `0 ${cy}px`;
    tip.style.transform = `translate(${d}px, ${n.cyc - cy}px) scaleY(${s})`;
  }
  // 교수 얼굴 쪽으로 다가갔다가(zoomProf) 돌아온다(zoomOut). 장면 좌표: 교수 그림 왼쪽 위가 (1038, 135).
  async function zoomProf(k) {
    if (reduced) return;
    $('#bubble').classList.remove('show');
    S.zoom = { k, x: 1100, y: 225 };
    $('#stage').classList.add('zooming');
    fit();
    await sleep(750);
  }
  async function zoomOut() {
    if (!S.zoom) return;
    S.zoom = null;
    fit();
    await sleep(750);
    $('#stage').classList.remove('zooming');
  }
  function setNose(level) {
    const prev = S.nose;
    S.nose = Math.max(0, Math.min(4, level));
    // 지금 얼굴에서 코 길이가 먼저 바뀌고, 그다음 그 단계의 그림으로 바뀐다
    const prof = $('#prof');
    const was = prof.dataset.expression || expr(prev); const face = expr(S.nose);
    if (!prof.dataset.expression) prof.dataset.expression = was;
    noseStyle(was, S.nose, true);
    clearTimeout(S.noseTimer);
    if (face !== was) S.noseTimer = setTimeout(() => { prof.dataset.expression = face; noseStyle(face, S.nose, false); }, reduced ? 0 : 750);
    const meter = $('#noseMeter');
    $$('#noseMeter i').forEach((el, i) => {
      const was = el.classList.contains('on'); const on = i < S.nose;
      el.classList.toggle('on', on);
      if (was && !on) { el.classList.remove('snap'); void el.offsetWidth; el.classList.add('snap'); }
    });
    $('#noseValue').textContent = `${S.nose} / 4`;
    meter.setAttribute('aria-valuenow', S.nose);
    meter.setAttribute('aria-valuetext', `콧대 ${S.nose}칸 남음`);
    if (S.nose !== prev) {
      const cls = S.nose < prev ? 'drop' : 'rise';
      meter.classList.remove('drop', 'rise'); void meter.offsetWidth; meter.classList.add(cls);
    }
  }
  const pick = (v) => (Array.isArray(v) && Array.isArray(v[0]) ? v[Math.floor(Math.random() * v.length)] : v);

  // 말풍선: 두 문장씩 한 장. 다음 장이 있으면 탭을 기다린다. 마지막 장은 띄워 둔 채로 끝낸다.
  // opts.center: 할 일이 바뀌는 말은 화면 가운데에 크게 띄웠다가, 읽고 나면 교수 머리 위로 옮겨 간다.
  let sayToken = 0;
  async function say(lines, opts = {}) {
    const my = ++sayToken;
    const arr = pick(lines).slice();
    const pages = [];
    for (let i = 0; i < arr.length; i += 2) pages.push(arr.slice(i, i + 2));
    const bubble = $('#bubble');
    $('#sysLine').hidden = true;
    if (opts.center) centerIn(); else centerOff();
    for (let p = 0; p < pages.length; p++) {
      if (my !== sayToken) return;
      logAttempt({stage:S.stage,questId:'professorSpeech',feedbackText:pages[p],inReplyTo:S.lastAnswerAttempt||'',feedbackSource:'displayed'});
      bubble.querySelector('.body').innerHTML = pages[p].map((l) => `<p>${esc(l)}</p>`).join('');
      bubble.classList.add('show');
      bubble.classList.remove('pop'); void bubble.offsetWidth; bubble.classList.add('pop');
      if (opts.center) drawTail();
      const more = p < pages.length - 1;
      bubble.classList.toggle('has-more', more);
      if (more) await waitTap();
    }
    placeReply();
    if (opts.center && my === sayToken) {
      // 마지막 장은 읽을 시간을 주고 저절로 옮겨 간다. 누르면 바로 옮겨 간다.
      const chars = pages[pages.length - 1].join('').length;
      bubble.classList.add('has-more');
      await waitTap(reduced ? 1500 : Math.min(6000, 1800 + chars * 70));
      bubble.classList.remove('has-more');
      if (my === sayToken) await centerOut();
    }
  }
  // 교수 그림(236×315) 안에서 입 왼쪽 자리. 가운데 말풍선의 꼬리가 여기까지 이어진다.
  const MOUTH = { proud: [87, 102], skeptical: [74, 126], surprised: [100, 138], acknowledging: [81, 139] };
  function drawTail() {
    const b = $('#bubble'); const prof = $('#prof');
    const m = MOUTH[prof.dataset.expression] || MOUTH.skeptical;
    const tx = prof.offsetLeft + m[0]; const ty = prof.offsetTop + m[1];
    const x0 = b.offsetLeft; const y0 = b.offsetTop; const x1 = x0 + b.offsetWidth; const y1 = y0 + b.offsetHeight;
    const bx = Math.max(x0 + 40, Math.min(tx, x1 - 40)); const by = Math.max(y0 + 30, Math.min(ty, y1 - 30));
    const len = Math.hypot(tx - bx, ty - by) || 1;
    const nx = -(ty - by) / len * 22; const ny = (tx - bx) / len * 22;
    const mx = (bx + tx) / 2; const my = (by + ty) / 2 + 10;
    $('#bubbleTail path').setAttribute('d', `M${bx + nx} ${by + ny} Q${mx + nx * 0.4} ${my + ny * 0.4} ${tx} ${ty} Q${mx - nx * 0.4} ${my - ny * 0.4} ${bx - nx} ${by - ny} Z`);
  }
  function centerIn() {
    const b = $('#bubble');
    if (b.classList.contains('center')) return;
    b.classList.add('no-move', 'center');
    void b.offsetWidth;
    b.classList.remove('no-move');
    $('#talkVeil').classList.add('on');
    $('#bubbleTail').classList.add('on');
  }
  function centerOff() {
    $('#bubble').classList.remove('center', 'moving');
    $('#talkVeil').classList.remove('on');
    $('#bubbleTail').classList.remove('on');
  }
  // 머리 위 자리로 옮겨 가며 글자가 작아지고, 꼬리는 따라가다 사라진다
  async function centerOut() {
    const b = $('#bubble');
    if (!b.classList.contains('center')) return;
    b.classList.add('moving');
    b.classList.remove('center');
    $('#talkVeil').classList.remove('on');
    const t0 = now();
    while (!reduced && now() - t0 < 560) {
      drawTail();
      if (now() - t0 > 280) $('#bubbleTail').classList.remove('on');
      await sleep(16);
    }
    $('#bubbleTail').classList.remove('on');
    b.classList.remove('moving');
  }
  // 게임 시스템이 잠깐 띄우는 알림. 교수의 말이 아니므로 말풍선을 쓰지 않는다.
  let sysToken = 0;
  async function sysPop(lines, ms = 3000, wide = false) {
    const my = ++sysToken;
    const el = $('#sysPop');
    el.innerHTML = `<b>${esc(lines[0])}</b>${lines[1] ? `<span>${esc(lines[1])}</span>` : ''}`;
    el.classList.remove('out');
    el.classList.toggle('wide', wide);
    el.hidden = false;
    await Promise.race([sleep(reduced ? Math.max(1800, ms) : ms), new Promise((res) => { el.onclick = res; })]);
    if (my !== sysToken) return;
    el.onclick = null;
    el.classList.add('out');
    await sleep(reduced ? 0 : 300);
    if (my === sysToken) el.hidden = true;
  }
  // 답장 카드는 교수 얼굴을 가리지 않게 교수 아래 책상 쪽에 둔다 (위치는 CSS의 bottom).
  // 칠판에 답을 쓸 때만 칠판 바로 아래에 둔다.
  function placeReply() {
    const box = $('#reply'); const b = $('#board');
    if (document.body.classList.contains('arena')) { placeGap(); return; }
    box.style.top = box.classList.contains('under-board') ? (b.offsetTop + b.offsetHeight + 10) + 'px' : '';
  }
  // timeout을 주면 그 시간이 지나도 넘어간다
  function waitTap(timeout) {
    return new Promise((resolve) => {
      const c = $('#catcher');
      c.hidden = false;
      let timer = null;
      const done = () => { clearTimeout(timer); c.hidden = true; c.removeEventListener('pointerdown', done); window.removeEventListener('keydown', key); resolve(); };
      const key = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); done(); } };
      setTimeout(() => { c.addEventListener('pointerdown', done); window.addEventListener('keydown', key); }, 250);
      if (timeout) timer = setTimeout(done, timeout);
    });
  }

  /* ───────── 답장 카드 (교수 말풍선 바로 아래) ───────── */
  function openReply(cfg) {
    const box = $('#reply');
    let html = cfg.frame ? `<div class="r-frame">${esc(cfg.frame.pre)}</div>` : '';
    if (cfg.choices) {
      html += `<div class="r-choices" role="radiogroup">${cfg.choices.map((c) => `<button type="button" class="r-choice" data-id="${c.id}">${esc(c.text)}</button>`).join('')}</div>`;
    }
    if (cfg.text && cfg.line) {
      html += `<div class="r-text"><input id="replyText" type="text" maxlength="200" autocomplete="off" aria-label="교수님께 답하기" value="${esc(cfg.value ?? cfg.starter ?? '')}"></div>`;
    } else if (cfg.text) {
      html += `<div class="r-text"><textarea id="replyText" rows="${cfg.rows || 3}" maxlength="${cfg.frame ? 150 : 400}" aria-label="교수님께 답하기">${esc(cfg.value ?? cfg.starter ?? '')}</textarea></div>`;
    }
    if (cfg.frame) html += `<div class="r-frame r-frame-end">${esc(cfg.frame.post)}</div>`;
    html += `<button type="button" class="r-send" id="replySend" disabled ${cfg.instant ? 'hidden' : ''}>${esc(cfg.send || '교수님께 말하기')}</button>`;
    box.innerHTML = html;
    box.hidden = false;
    box.classList.toggle('under-board', !!cfg.underBoard);
    box.classList.toggle('framed', !!cfg.frame);
    placeReply();
    box.classList.remove('pop'); void box.offsetWidth; box.classList.add('pop');
    let choice = null;
    const send = $('#replySend');
    const ta = $('#replyText');
    const ready = () => {
      const typed = ta ? (cfg.starter && ta.value.startsWith(cfg.starter.trim()) ? ta.value.slice(cfg.starter.trim().length) : ta.value).trim() : '';
      const tOk = !cfg.text || typed.length >= 1;
      const cOk = !cfg.choices || choice;
      send.disabled = !(tOk && cOk);
    };
    $$('.r-choice', box).forEach((b) => b.addEventListener('click', () => {
      choice = b.dataset.id;
      $$('.r-choice', box).forEach((x) => x.classList.toggle('on', x === b));
      if (cfg.instant) { finish(); return; }
      ready();
    }));
    if (ta) {
      ta.addEventListener('input', () => { S.lastInput = now(); ready(); });
      if (cfg.line || cfg.enterSends) ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !send.disabled) { e.preventDefault(); finish(); } });
      setTimeout(() => { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }, 60);
    }
    let finished = false;
    async function finish() {
      if (finished) return;
      finished = true;
      const text = ta ? ta.value.trim() : '';
      const controls = Array.from(box.querySelectorAll('input, textarea, button'));
      controls.forEach((el) => { el.disabled = true; });
      send.textContent = cfg.text ? '흠…' : (cfg.send || '교수님께 말하기');
      box.setAttribute('aria-busy', 'true');
      try {
        const accepted = await cfg.onSubmit({ choice, text });
        if (accepted === false) finished = false;
      } catch (error) {
        finished = false;
        await evaluationFailure(error);
      } finally {
        box.removeAttribute('aria-busy');
        if (document.body.contains(send)) {
          controls.forEach((el) => { el.disabled = false; });
          send.textContent = cfg.send || '교수님께 말하기';
          ready();
        }
      }
    }
    send.addEventListener('click', finish);
    ready();
    return { reopen() { finished = false; }, get text() { return ta ? ta.value : ''; } };
  }
  function closeReply() { const b = $('#reply'); b.hidden = true; b.innerHTML = ''; }

  /* ───────── 깜빡임 안내 + 무조작 한마디 ───────── */
  let glowTimer = null;
  function glow(el, key) {
    $$('.glow, .blink').forEach((e) => e.classList.remove('glow', 'blink'));
    clearTimeout(glowTimer);
    sparkle(null);
    S.glowKey = key || null;
    S.lastInput = now();
    if (!el) return;
    sparkle(el); // 꼭 해야 하는 조작: 조작할 때까지 반짝이는 별이 둘레를 돈다
    if (reduced) { el.classList.add('glow'); return; }
    el.classList.add('blink');
    glowTimer = setTimeout(() => { el.classList.remove('blink'); el.classList.add('glow'); }, 2500);
  }
  let sparkleBox = null; let sparkleTimer = null;
  function sparkle(el) {
    clearInterval(sparkleTimer);
    if (sparkleBox) { sparkleBox.remove(); sparkleBox = null; }
    if (!el) return;
    sparkleBox = document.createElement('div');
    sparkleBox.className = 'sparkle-ring';
    sparkleBox.innerHTML = '<i></i><i></i><i></i><i></i><i></i>';
    document.body.appendChild(sparkleBox);
    const place = () => {
      if (!document.body.contains(el) || el.closest('[hidden]')) { sparkleBox.style.display = 'none'; return; }
      const r = el.getBoundingClientRect();
      if (!r.width) { sparkleBox.style.display = 'none'; return; }
      Object.assign(sparkleBox.style, { display: '', left: (r.left - 10) + 'px', top: (r.top - 10) + 'px', width: (r.width + 20) + 'px', height: (r.height + 20) + 'px' });
    };
    place();
    sparkleTimer = setInterval(place, 300);
  }
  function blinkOnce(el) {
    if (!el) return;
    el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
  }
  setInterval(() => {
    if (!S.glowKey || !S.started || !$('#catcher').hidden || S.submitting || $('#reply').getAttribute('aria-busy') === 'true') return;
    const idle = now() - S.lastInput;
    const key = S.glowKey;
    // 12초 동안 아무것도 안 하면 한마디. 계속 막혀 있으면 20초마다 다시 한다.
    // 근거 칸의 두 번째 한마디만 첫 한마디 8초 뒤(무조작 20초째)에 나온다. 그 뒤로는 20초마다 되풀이한다.
    const gap = key === 'evidence2' && !S.evNudged2 ? 8000 : 20000;
    if (idle > 12000 && now() - (S.nudged[key] || 0) > gap && M.lines.nudge[key]) {
      S.nudged[key] = now();
      say(M.lines.nudge[key]);
      if (key === 'evidence') { S.evNudged = true; S.glowKey = 'evidence2'; S.nudged.evidence2 = now(); }
      if (key === 'evidence2') { S.evNudged2 = true; setTimeout(demoDrag, 700); }
    }
  }, 1000);
  ['pointerdown', 'keydown'].forEach((ev) => window.addEventListener(ev, () => { S.lastInput = now(); }, true));

  // 지금 할 일 칩: 대사를 빨리 넘겨도 지금 해야 할 행동이 화면에 남아 있다. 다음 setNote까지 그대로다.
  // tapHint는 도구나 카드를 눌러 집어 든 동안 칩 아래에 붙는 짧은 안내다.
  // 칩은 늘 body 아래 fixed로 두고 좌표만 바꾼다(장면 배율과 상관없이 같은 글자 크기).
  function noteBox() {
    let el = $('#todoNote');
    if (!el) {
      el = document.createElement('div');
      el.id = 'todoNote'; el.setAttribute('role', 'status'); el.hidden = true;
      el.innerHTML = '<b>지금 할 일</b><span></span><em></em>';
      // 다 끝난 애니메이션 표시는 지운다. 남아 있으면 다시 나타날 때 엉뚱하게 다시 재생된다.
      el.addEventListener('animationend', () => el.classList.remove('flash', 'shake-me'));
      document.body.appendChild(el);
    }
    return el;
  }
  // 칩은 학생이 혼자 무언가를 해야 진행되는 순간(조작하기, 답 쓰기)에만 보인다.
  // 교수 대사를 넘기는 중, 교수 확대·축소, 가운데 큰 말풍선, 시스템 알림, 판정 대기 중에는 숨긴다.
  // 그런 일이 다 끝나고 0.9초 동안 그대로면 그때 나타난다. 자리는 상황마다 setNote(글, 자리)로 미리 정해 둔다.
  // 자리(장면 1280×640 좌표): x 또는 right는 칩의 왼쪽 끝 또는 오른쪽 끝, w는 쓸 수 있는 너비
  const NOTE_SPOTS = {
    topLeft: { x: 12, y: 12, w: 266 },          // 실험대: 작은 칠판(x 288~) 왼쪽
    faceLeft: { right: 1030, y: 150, w: 160 },   // 현미경: 현미경 창 오른쪽, 교수 얼굴 왼편. 말풍선 아래, 콧대 게이지 위
    aboveProf: { right: 1268, y: 14, w: 276 },   // 뒷면 쓰기: 말풍선 오른쪽, 교수 머리 위
    belowProf: { x: 884, y: 462, w: 386 }        // 큰 칠판 화면(근거 고르기, 합치기, 완전한 설명): 교수 아래 책상
  };
  // 칩이나 판정 대기 카드를 정해 둔 자리에 놓는다. 좁은 자리면 '지금 할 일'을 윗줄에 두고 글을 접는다.
  function putAt(el, name) {
    const sp = NOTE_SPOTS[name] || NOTE_SPOTS.topLeft;
    const st = $('#stage').getBoundingClientRect(); const k = st.width / W;
    el.style.maxWidth = Math.max(120, sp.w * k) + 'px';
    el.classList.toggle('narrow', sp.w * k < 230);
    const x = sp.right !== undefined ? st.left + sp.right * k - el.offsetWidth : st.left + sp.x * k;
    el.style.left = x + 'px'; el.style.top = (st.top + sp.y * k) + 'px';
  }
  function noteReady() {
    return !!(S.note || S.tapHint) && $('#catcher').hidden && !$('#stage').classList.contains('zooming')
      && !$('#talkVeil').classList.contains('on') && !$('#bubble').classList.contains('moving') && $('#sysPop').hidden
      && !document.body.classList.contains('judging') && $('#reply').getAttribute('aria-busy') !== 'true';
  }
  let noteReadySince = 0;
  setInterval(() => {
    const el = $('#todoNote');
    if (!el) return;
    if (!noteReady()) { el.hidden = true; noteReadySince = 0; return; }
    if (!el.hidden) return;
    noteReadySince = noteReadySince || now();
    if (now() - noteReadySince < 900) return;
    el.hidden = false;
    putAt(el, S.noteSpot);
    if (!reduced) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
  }, 150);
  window.addEventListener('resize', () => {
    const el = $('#todoNote'); if (el && !el.hidden) putAt(el, S.noteSpot);
    const w = $('#judgeWait'); if (w && !w.hidden) placeWait(w);
  });
  // 할 일이 없는 동안(대사, 장면 전환)에는 setNote('')로 비워 둔다
  function setNote(text, spot) {
    const el = noteBox();
    const moved = spot && spot !== S.noteSpot;
    if (spot) S.noteSpot = spot;
    if (S.note === (text || '') && !moved) return;
    S.note = text || '';
    $('span', el).textContent = S.note;
    if (el.hidden) return; // 아직 숨어 있으면 나타날 때 자리를 잡는다
    if (!S.note && !S.tapHint) { el.hidden = true; return; }
    putAt(el, S.noteSpot);
    if (!reduced) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
  }
  // 8초 동안 아무 조작이 없으면 칩을 흔들어 눈길을 끈다. 계속 가만히 있으면 8초마다 다시 흔든다.
  // 교수 대사를 넘기는 중이거나 판정을 기다리는 중에는 흔들지 않는다(학생이 할 일이 아니다).
  let noteShookAt = 0;
  setInterval(() => {
    const el = $('#todoNote');
    if (!el || el.hidden || !S.started || !$('#catcher').hidden || S.submitting) return;
    if ($('#reply').getAttribute('aria-busy') === 'true' || ($('#judgeWait') && !$('#judgeWait').hidden)) return;
    if (now() - S.lastInput < 8000 || now() - noteShookAt < 8000) return;
    noteShookAt = now();
    el.classList.remove('flash', 'shake-me'); void el.offsetWidth; el.classList.add('shake-me');
  }, 500);
  function tapHint(text) {
    const el = noteBox();
    S.tapHint = text || '';
    $('em', el).textContent = S.tapHint;
    if (!el.hidden) putAt(el, S.noteSpot); // 줄이 늘고 줄면 오른쪽에 붙은 자리는 다시 맞춘다
  }

  function setStage(stage) {
    S.stage = stage;
    S.times[stage] = now();
    const order = ['explore', 'claim', 'rebuttal', 'defense'];
    $$('#track li').forEach((li) => {
      const i = order.indexOf(li.dataset.stage); const c = order.indexOf(stage);
      li.classList.toggle('now', i === c); li.classList.toggle('done', i < c);
    });
    updateSession({ stage });
  }

  /* ───────── 기록 ───────── */
  function updateSession(fields, immediate) { if (S.sessionId) API.updateSession(S.sessionId, fields, immediate); }
  // 시트(Apps Script) 열 이름에 맞춘다: diag→diagnosis, hint→hintLevel, elements→judgment. 나머지 값은 extra 열에 모인다.
  function logAttempt(o) {
    if(S.restoring)return;
    if (!S.sessionId) return;
    const { diag, hint, elements, ...rest } = o;
    const a = Object.assign({ attemptId: API.uid('a'), sessionId: S.sessionId, missionId: M.id, missionVersion: 'm02-1.2', hintSchemaVersion: 'm02-note-pages-v1', rubricVersion: RUBRIC.VERSION, classCode: S.classCode, studentNo: S.studentNo, createdAt: new Date().toISOString() }, rest);
    if (diag !== undefined) a.diagnosis = diag;
    if (hint !== undefined) a.hintLevel = hint;
    if (elements !== undefined) a.judgment = elements;
    if(a.input)S.lastAnswerAttempt=a.attemptId;
    API.logAttempt(a);
    return a.attemptId;
  }

  /* ───────── 카드 ───────── */
  // 단서는 그 증거의 모양으로 보인다: 실험 결과는 장치 사진, 현미경 결과는 관찰 슬라이드,
  // 학생이 쓴 결론은 손글씨 메모, 주장은 작은 칠판
  function cardHTML(id, extra = '', badge = '') {
    const c = S.cards[id];
    const look = c.look || ({ concl: 'memo', claim: 'slate', model: 'lens' }[c.kind]) || 'note';
    const title = c.title ? `<b>${esc(c.title)}</b>` : '';
    const pic = look === 'photo' ? `<div class="pic">${ART.miniPhoto(c.art)}</div>` : look === 'slide' ? `<div class="pic">${ART.miniSlide(c.art)}</div>` : '';
    const fold = c.kind === 'clue' ? `<i class="fold-flap" aria-hidden="true">${ART.blankCorner()}</i><i class="back-face" aria-hidden="true"></i>` : '';
    return `<div class="card k-${c.kind} look-${look} ${c.kind === 'clue' ? 'folded' : ''} ${extra}" data-card="${id}" tabindex="0">${badge}${pic}${title}<span>${esc(c.text)}</span>${fold}</div>`;
  }
  // 돋보기. on-card면 카드에 댄 모습으로, 방금 본 장면이 되풀이된다.
  function lensHTML(id, extra = '') {
    const c = S.cards[id];
    const act = /act|on-card/.test(extra);
    return `<div class="lens ${extra}" data-card="${id}" ${act ? 'tabindex="0" role="button"' : 'role="img"'} aria-label="${esc(c.title)}">${extra.includes('on-card') ? ART.lensScene(c.mode) : ART.lensMini(c.mode)}</div>`;
  }
  // 수집함의 뒷면 표시: 비었으면 ?, 교수가 적었으면 낙서, 학생이 채웠으면 ✓
  function backBadge(id) {
    const c = S.cards[id];
    if (c.kind !== 'clue' || !['rebuttal', 'defense'].includes(S.stage)) return '';
    return c.back ? '<i class="bk ok">뒷면 ✓</i>' : c.mis ? '<i class="bk no">뒷면 낙서</i>' : '<i class="bk q">뒷면 ?</i>';
  }
  function renderTray() {
    const box = $('#trayCards');
    // 변론에서 칸에 놓은 카드는 수집함에서 뺀다.
    const ids = S.tray.filter((id) => !(S.stage === 'defense' && S.placedOut && S.placedOut.has(id)));
    box.innerHTML = ids.map((id) => (S.cards[id].kind === 'lens' ? `<div class="lens-card">${lensHTML(id)}<em>${esc(S.cards[id].title)}</em></div>` : cardHTML(id, S.dimmed && S.dimmed.has(id) ? 'dim' : '', backBadge(id)))).join('');
    $$('.card', box).forEach((el) => { bindCard(el); bindPeek(el); });
    $$('.lens', box).forEach(bindPeek);
    updateTrayNav();
  }
  // 좌우로 넘겨 보기: 화살표, 마우스 휠(세로 휠도 가로로), 스크롤바
  function updateTrayNav() {
    const box = $('#trayCards');
    const more = box.scrollWidth > box.clientWidth + 2;
    $('#trayPrev').hidden = !more; $('#trayNext').hidden = !more;
    $('#trayPrev').disabled = box.scrollLeft <= 2;
    $('#trayNext').disabled = box.scrollLeft + box.clientWidth >= box.scrollWidth - 2;
  }
  function setupTrayScroll() {
    const box = $('#trayCards');
    $('#trayPrev').addEventListener('click', () => { box.scrollLeft -= box.clientWidth * 0.7; });
    $('#trayNext').addEventListener('click', () => { box.scrollLeft += box.clientWidth * 0.7; });
    box.addEventListener('wheel', (e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { box.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
    box.addEventListener('scroll', updateTrayNav);
    window.addEventListener('resize', updateTrayNav);
  }
  // 마우스를 올리면 카드 위에 전체 글을 띄운다(수집함 카드는 세 줄에서 잘리므로)
  function bindPeek(el) {
    const peek = $('#cardPeek');
    el.addEventListener('mouseenter', () => {
      const c = S.cards[el.dataset.card]; if (!c) return;
      peek.innerHTML = `${c.title ? `<b>${esc(c.title)}</b>` : ''}${esc(c.sentence || c.text)}${c.back && S.phase !== 'compose' ? `<span class="peek-b">뒷면: ${esc(c.back)}</span>` : ''}`;
      peek.hidden = false;
      const r = el.getBoundingClientRect();
      peek.style.left = Math.max(8, Math.min(r.left, innerWidth - peek.offsetWidth - 8)) + 'px';
      peek.style.top = (r.top - peek.offsetHeight - 8) + 'px';
    });
    el.addEventListener('mouseleave', () => { peek.hidden = true; });
    el.addEventListener('pointerdown', () => { peek.hidden = true; });
  }
  function addCard(id, fromEl) {
    if (S.tray.includes(id)) return;
    S.tray.push(id);
    renderTray();
    const target = $(`#trayCards [data-card="${id}"]`);
    if (fromEl && target && !reduced) {
      const a = fromEl.getBoundingClientRect(); const b = target.getBoundingClientRect();
      const fly = document.createElement('div');
      fly.className = 'fly';
      fly.style.cssText = `left:${a.left}px;top:${a.top}px;width:${a.width}px;height:${a.height}px`;
      document.body.appendChild(fly);
      nextFrame(() => { fly.style.transform = `translate(${b.left - a.left}px,${b.top - a.top}px) scale(.5)`; fly.style.opacity = '0'; });
      setTimeout(() => fly.remove(), 650);
    }
    if (target) target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'nearest', inline: 'nearest' });
    blinkOnce(target);
  }

  // 끌어 놓기와 눌러서 놓기를 함께 지원한다. 놓을 곳은 [data-drop].
  // 끌어 놓기 시범: 커서가 수집함 카드를 집어 빈 근거 칸까지 끌고 갔다가 사라진다. 실제로 놓지는 않는다.
  const CURSOR_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 2 L4 19 L8.5 14.8 L11.6 21.6 L14.6 20.3 L11.6 13.6 L17.6 13.6 Z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>';
  async function demoDrag() {
    if (reduced || S.demoing || S.stage !== 'claim') return;
    const slotIdx = S.evidence.indexOf(null);
    if (slotIdx < 0) return;
    const slot = $(`[data-drop="ev${slotIdx}"]`);
    const src = $$('#trayCards .card').find((c) => S.cards[c.dataset.card].kind === 'clue' && !S.evidence.includes(c.dataset.card));
    if (!slot || !src) return;
    S.demoing = true;
    const a = src.getBoundingClientRect(); const b = slot.getBoundingClientRect();
    const ax = a.left + a.width / 2; const ay = a.top + a.height / 2; const bx = b.left + b.width / 2; const by = b.top + b.height / 2;
    const px = (x, y) => ({ left: x + 'px', top: y + 'px' });
    const cur = document.createElement('div'); cur.className = 'demo-cursor'; cur.innerHTML = CURSOR_SVG;
    document.body.appendChild(cur);
    await cur.animate([Object.assign({ opacity: 0 }, px(ax + 70, ay + 40)), Object.assign({ opacity: 1 }, px(ax, ay))], { duration: 450, easing: 'ease-out', fill: 'forwards' }).finished;
    cur.classList.add('press');
    await sleep(200);
    const ghost = src.cloneNode(true); ghost.classList.add('ghost', 'demo'); ghost.style.width = a.width + 'px';
    Object.assign(ghost.style, px(ax, ay));
    document.body.appendChild(ghost); src.classList.add('lifted'); slot.classList.add('can-drop');
    const go = { duration: 1000, easing: 'cubic-bezier(.45, 0, .25, 1)', fill: 'forwards' };
    await Promise.all([cur.animate([px(ax, ay), px(bx, by)], go).finished, ghost.animate([px(ax, ay), px(bx, by)], go).finished]);
    await sleep(250);
    cur.classList.remove('press');
    await Promise.all([ghost.animate([{ opacity: 0.85 }, { opacity: 0 }], { duration: 350, fill: 'forwards' }).finished,
      cur.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 450, delay: 150, fill: 'forwards' }).finished]);
    ghost.remove(); cur.remove(); src.classList.remove('lifted'); slot.classList.remove('can-drop');
    S.demoing = false;
  }

  function bindCard(el) {
    const id = el.dataset.card;
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const sx = e.clientX; const sy = e.clientY;
      let ghost = null;
      const move = (ev) => {
        if (!ghost && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 6) {
          ghost = el.cloneNode(true);
          ghost.classList.add('ghost');
          const r = el.getBoundingClientRect();
          ghost.style.width = r.width + 'px';
          document.body.appendChild(ghost);
          el.classList.add('lifted');
        }
        if (ghost) { ghost.style.left = ev.clientX + 'px'; ghost.style.top = ev.clientY + 'px'; }
      };
      const up = (ev) => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        el.classList.remove('lifted');
        if (ghost) {
          ghost.remove();
          const t = document.elementFromPoint(ev.clientX, ev.clientY);
          const drop = t && t.closest('[data-drop]');
          if (drop) onDrop(id, drop.dataset.drop, drop, ev);
          else onTapCard(id, el);
        } else onTapCard(id, el);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTapCard(id, el); } });
  }
  function onTapCard(id, el) {
    if (S.stage === 'defense' && S.phase === 'compose') { insertCard(id); return; }
    S.sel = S.sel === id ? null : id;
    $$('.card').forEach((c) => c.classList.toggle('selected', c.dataset.card === S.sel));
    $$('[data-drop]').forEach((d) => d.classList.toggle('can-drop', !!S.sel));
    tapHint(S.sel && $('[data-drop]') ? '놓을 곳을 누르세요' : '');
  }
  // 키보드: 카드를 Enter/Space로 고른 뒤, 놓을 곳으로 Tab 이동해 Enter/Space
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const drop = e.target.closest && e.target.closest('[data-drop]');
    if (!drop || drop.tagName === 'TEXTAREA' || !S.sel) return;
    e.preventDefault();
    const id = S.sel; S.sel = null;
    $$('.card').forEach((c) => c.classList.remove('selected')); $$('[data-drop]').forEach((d) => d.classList.remove('can-drop'));
    onDrop(id, drop.dataset.drop, drop, e);
  });
  document.addEventListener('click', (e) => {
    const drop = e.target.closest('[data-drop]');
    if (drop && S.sel && !e.target.closest('.card')) { const id = S.sel; S.sel = null; $$('.card').forEach((c) => c.classList.remove('selected')); $$('[data-drop]').forEach((d) => d.classList.remove('can-drop')); onDrop(id, drop.dataset.drop, drop, e); }
  });
  function onDrop(id, where, el) {
    S.sel = null;
    tapHint('');
    $$('.card').forEach((c) => c.classList.remove('selected'));
    $$('[data-drop]').forEach((d) => d.classList.remove('can-drop'));
    if (where.startsWith('ev')) dropEvidence(id, Number(where.slice(2)));
    else if (where === 'answer') insertCard(id);
  }

  /* ───────── 1. 탐색 ───────── */
  function buildBench() {
    const d = M.devices;
    $('#bench').innerHTML = `
      <div class="device" id="devA">
        <div class="dev-art">${ART.deviceA()}</div>
        <div class="scale-win" id="winA"><span class="lbl">${esc(d.A.label)}</span><span class="num" id="numA">${d.A.before.toFixed(1)} g</span><span class="tag" id="tagA"></span></div>
      </div>
      <div class="device" id="devB">
        <div class="dev-art">${ART.deviceB()}</div>
        <div class="scale-win" id="winB"><span class="lbl">${esc(d.B.label)}</span><span class="num" id="numB">${d.B.before.toFixed(1)} g</span><span class="tag" id="tagB"></span></div>
      </div>
      <svg class="wires" viewBox="0 0 ${W} ${H}" aria-hidden="true"><path id="wireMinus" d="${WIRE.minusD}"/><path id="wirePlus" d=""/></svg>
      <div class="power" id="power">${ART.power()}</div>
      <div class="clip-tool" id="clipB" role="button" tabindex="0" aria-label="전선 집게">${ART.clip()}</div>
      <div class="flame-tool" id="flameA" role="button" tabindex="0" aria-label="불꽃 막대">${ART.torch()}</div>
      <button type="button" class="thing" id="microscope" aria-label="마법 현미경">${ART.microscope()}<span class="lock" aria-hidden="true"></span></button>`;
    setupClipB();
    $('#microscope').addEventListener('click', onMicroscope);
    setupFlameA();
  }

  function renderSmallBoard() {
    const b = $('#board');
    b.className = 'board small';
    b.removeAttribute('data-drop');
    if (S.linkBoard) { renderLinkBoard(b); return; }
    let html = `<div class="chalk q">${esc(M.boardQuestion)}</div>`;
    if (S.firstAnswer) html += `<div class="chalk first">${esc(S.firstAnswer)}</div>`;
    if (S.claim) html += `<div class="chalk claim">→ ${esc(S.claim.text)}</div>`;
    b.innerHTML = html;
    b.onclick = S.stage === 'explore' && S.boardOpen ? openClaimFlow : null;
  }
  const linkState = (i) => (S.cards[M.links[i].data].back ? 'done' : i === S.link ? 'now' : 'wait');
  // 드러내기 칠판: 카드 앞면, 그 뒷면(교수의 빨간 글씨 또는 학생의 문장), 주장이 늘 함께 보인다.
  function renderLinkBoard(b) {
    const rows = M.links.map((L, i) => {
      const c = S.cards[L.data]; const have = S.tray.includes(L.data);
      const back = c.back ? ['ok', c.back] : c.mis ? ['red', c.mis] : have ? ['wait', '뒷면 비어 있음'] : ['wait', L.row];
      return `<div class="cb-row ${linkState(i)}"><b>${'①②③'[i]}</b><div class="cb-f ${have ? '' : 'none'}">${have ? L.chip.map(esc).join('<br>') : '카드 없음'}</div><div class="cb-a">›</div><div class="cb-b ${back[0]}">${esc(back[1])}</div></div>`;
    }).join('');
    b.innerHTML = `<div class="chalk cb-t">${esc(M.boardLinksTitle)}</div>${rows}<div class="cb-c">→ ${esc(M.claimShort)}.</div>`;
    b.onclick = null;
    // 긴 문장은 두 줄에서 잘리고, 누르면 전체가 보인다
    $$('.cb-row.done', b).forEach((el) => el.addEventListener('click', () => el.classList.toggle('open')));
  }
  // 구조도: 자료 → 꼬투리 → 주장. pick이면 학생이 빠진 곳을 누르는 칠판, 아니면 다 이어진 모습이다.
  function structHTML({ pick = false } = {}) {
    const T = pick ? 'button' : 'div';
    const node = (cls, id, label) => `<${T} ${pick ? `type="button" data-pick="${id}"` : ''} class="n ${cls}">${esc(label)}</${T}>`;
    const rows = M.links.map((L, r) => node(`d r${r}`, 'd' + r, L.node) + node(`w r${r} ${pick ? '' : 'done'}`, 'w' + r, pick ? `${'①②③'[r]} ${L.pickLabel}` : `${'①②③'[r]} ✓`)).join('');
    const lines = pick ? 'M33 13 H37 M33 50 H37 M33 87 H37 M65 13 H69 V87 H65 M65 50 H74' : 'M40 13 H44 M40 50 H44 M40 87 H44 M57 13 H61 V87 H57 M57 50 H66';
    return `<div class="st${pick ? ' pick' : ''} chalk"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d="${lines}"/></svg>${rows}${node('c', 'claim', M.claimShort)}</div>`;
  }

  async function countUp(el, from, to, ms) {
    if (reduced || from === to) { el.textContent = to.toFixed(1) + ' g'; return; }
    const t0 = now();
    while (now() - t0 < ms) {
      const k = (now() - t0) / ms;
      el.textContent = (from + (to - from) * k).toFixed(1) + ' g';
      await sleep(40);
    }
    el.textContent = to.toFixed(1) + ' g';
  }

  // 끌기가 어려운 기기(터치패드·태블릿)를 위한 "누르고 → 놓을 곳 누르기".
  // 도구를 짧게 누르면 집어 든 상태(armed)가 되고, 다음에 누른 곳을 fn(e)에 넘긴다. 그 누름은 다른 곳에 전달하지 않는다.
  const shake = (el) => { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); };
  const isTap = (down, e) => down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 8 && now() - down.t < 500;
  function swallowClick() {
    const f = (e) => { e.stopPropagation(); e.preventDefault(); };
    window.addEventListener('click', f, true);
    setTimeout(() => window.removeEventListener('click', f, true), 500);
  }
  function nextTap(tool, fn) {
    const h = (e) => {
      if (tool.contains(e.target)) return; // 도구를 다시 누르면 도구 쪽에서 내려놓는다
      window.removeEventListener('pointerdown', h, true);
      if (e.target.closest('#catcher')) { fn(null); return; } // 대사 넘기기 누름은 그대로 둔다
      e.preventDefault(); e.stopPropagation(); swallowClick();
      fn(e);
    };
    window.addEventListener('pointerdown', h, true);
    return () => window.removeEventListener('pointerdown', h, true);
  }
  // 집어 든 동안: 도구가 들썩이고, 놓을 곳이 빛나고, 할 일 칩에 안내가 붙는다
  function armTool(el, target, on) {
    el.classList.toggle('armed', on);
    if (target) target.classList.toggle('tap-target', on);
    tapHint(on ? '놓을 곳을 누르세요' : '');
  }

  // 불꽃 막대 끌기: 누르고 있는 동안 따라오고, 놓으면 제자리로 돌아간다.
  // 짧게 누르면 집어 들고, 대상(opts.hit)을 누르면 그 자리(opts.spot)에 대고 있는다. 아무 곳이나 다시 누르면 내려놓는다.
  // opts.near(clientX, clientY) → 불꽃 끝이 대상 가까이 있는가, opts.tick(dt, near) → 매 프레임, opts.release()
  // opts.hit(clientX, clientY) → 눌러서 댈 때 대상을 누른 것으로 칠까(기본: near), opts.spot() → 댈 자리 [clientX, clientY], opts.target() → 빛낼 대상
  function flameDrag(el, opts) {
    const holder = el.parentElement;
    const home = { left: el.style.left, top: el.style.top };
    let held = false; let last = 0; let tip = null;
    let down = null; let parked = false; let cancelTap = null;
    const target = () => (opts.target ? opts.target() : null);
    const place = (e) => {
      const r = holder.getBoundingClientRect();
      const x = (e.clientX - r.left) / S.scale; const y = (e.clientY - r.top) / S.scale;
      el.style.left = (x - el.offsetWidth / 2) + 'px';
      el.style.top = (y - 6) + 'px'; // 불꽃 끝이 포인터 바로 위에 오게
      tip = { x: e.clientX, y: e.clientY };
    };
    const frame = (t) => {
      if (!held) return;
      // 다 끝났거나 장면이 닫히면 대고 있던 불꽃을 내려놓는다
      if (parked && (!el.isConnected || (opts.enabled && !opts.enabled()))) { up(); return; }
      const dt = last ? Math.min(100, t - last) : 0; last = t;
      const near = tip ? opts.near(tip.x, tip.y) : false;
      el.classList.toggle('touching', near);
      opts.tick(dt, near);
      nextFrame(frame);
    };
    const disarm = () => { if (cancelTap) cancelTap(); cancelTap = null; armTool(el, target(), false); };
    const arm = () => {
      armTool(el, target(), true);
      cancelTap = nextTap(el, (e) => {
        cancelTap = null; armTool(el, target(), false);
        if (!e || (opts.enabled && !opts.enabled())) return;
        if (!(opts.hit || opts.near)(e.clientX, e.clientY)) { shake(el); return; }
        const [x, y] = opts.spot ? opts.spot() : [e.clientX, e.clientY];
        held = true; parked = true; last = 0;
        el.classList.add('parked');
        place({ clientX: x, clientY: y });
        S.lastInput = now();
        // 대고 있는 동안 아무 곳이나 누르면 내려놓는다
        cancelTap = nextTap(el, () => { cancelTap = null; up(); });
        nextFrame(frame);
      });
    };
    el.addEventListener('pointerdown', (e) => {
      if (parked) { e.preventDefault(); up(); return; }
      if (cancelTap) { e.preventDefault(); disarm(); return; }
      if (opts.enabled && !opts.enabled()) { shake(el); return; }
      e.preventDefault();
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* 합성 이벤트 */ }
      held = true; last = 0; down = { x: e.clientX, y: e.clientY, t: now() };
      el.classList.add('held');
      glow(null);
      S.lastInput = now();
      place(e);
      nextFrame(frame);
    });
    el.addEventListener('pointermove', (e) => { if (held && !parked) { place(e); S.lastInput = now(); } });
    function up(e) {
      if (!held || (e && parked)) return;
      const tap = e && e.type === 'pointerup' && isTap(down, e);
      held = false; tip = null; down = null; parked = false;
      if (cancelTap) { cancelTap(); cancelTap = null; }
      el.classList.remove('held', 'touching', 'parked');
      el.style.left = home.left; el.style.top = home.top;
      if (opts.release) opts.release();
      if (tap) arm();
    }
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }
  function rectPoint(el, fx, fy) { const r = el.getBoundingClientRect(); return [r.left + r.width * fx, r.top + r.height * fy]; }
  function inRect(el, x, y) { const r = el.getBoundingClientRect(); return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; }
  function nearRect(el, cx, cy, fx, fy, pad) {
    const r = el.getBoundingClientRect();
    const x = r.left + r.width * fx; const y = r.top + r.height * fy;
    return Math.hypot(cx - x, cy - y) < pad * S.scale;
  }

  // 장치 A: 불꽃을 강철솜에 대고 있는 동안 타고, 저울이 그 자리에서 올라간다
  function setupFlameA() {
    const el = $('#flameA');
    const art = () => $('#devA .dev-art');
    const NEED = 2400; // 다 타는 데 대고 있어야 하는 시간(ms)
    let burnt = 0;
    flameDrag(el, {
      enabled: () => S.stage === 'explore' && !S.done.burnA,
      near: (x, y) => nearRect(art(), x, y, 0.5, 0.55, 60),
      hit: (x, y) => inRect($('#devA'), x, y),
      spot: () => rectPoint(art(), 0.5, 0.55),
      target: () => $('#devA'),
      tick: (dt, near) => {
        art().classList.toggle('burning', near);
        if (!near || S.done.burnA) return;
        burnt = Math.min(NEED, burnt + dt);
        const k = burnt / NEED;
        $('#devA .wool-dark').style.opacity = k.toFixed(2);
        $('#numA').textContent = (M.devices.A.before + (M.devices.A.after - M.devices.A.before) * k).toFixed(1) + ' g';
        if (burnt >= NEED) finishBurnA();
      },
      release: () => { art().classList.remove('burning'); }
    });
  }
  function finishBurnA() {
    S.done.burnA = true;
    $('#devA .dev-art').classList.remove('burning');
    $('#numA').textContent = M.devices.A.after.toFixed(1) + ' g';
    $('#tagA').textContent = '2.0 → 2.5 g';
    logAttempt({ stage: 'explore', questId: 'burnA' });
    acquire(['cA'], async () => { await say(M.lines.afterA, { center: true }); glow($('#clipB'), 'deviceB'); setNote('집게를 빨간 단자에 물리기'); }, $('#devA'));
  }

  // 집게: 끌어서 전원 장치 빨간 단자 가까이 놓으면 물리고(전류가 흐름), 다시 끌면 떨어진다.
  // o.container 기준 좌표(장면 단위). o.from() 전선이 나오는 자리, o.terminal() 빨간 단자, o.home() 놓여 있는 자리
  function makeClip(o) {
    let held = false; let connected = false;
    const local = (e) => { const r = o.container.getBoundingClientRect(); return [(e.clientX - r.left) / S.scale, (e.clientY - r.top) / S.scale]; };
    const draw = (p) => {
      if (o.curve) { o.path.setAttribute('d', o.curve(o.from(), p)); return; }
      const [x0, y0] = o.from(); const sag = Math.max(30, Math.abs(p[0] - x0) * 0.4);
      o.path.setAttribute('d', `M${x0} ${y0} C ${x0 + 40} ${y0 + sag}, ${p[0] - 10} ${p[1] + sag * 0.6}, ${p[0] - 18} ${p[1]}`);
    };
    const at = (p) => { o.el.style.left = (p[0] - 22) + 'px'; o.el.style.top = (p[1] - 13) + 'px'; draw(p); };
    const set = (on) => { connected = on; o.el.classList.toggle('connected', on); o.power.classList.toggle('on', on); o.onChange(on); };
    // 눌러서 물리기: 집게를 짧게 누르면 집어 들고, 전원 장치(빨간 단자)를 누르면 물린다
    let down = null; let wasOn = false; let cancelTap = null;
    const disarm = () => { if (cancelTap) cancelTap(); cancelTap = null; armTool(o.el, o.power, false); };
    const arm = () => {
      armTool(o.el, o.power, true);
      cancelTap = nextTap(o.el, (e) => {
        cancelTap = null; armTool(o.el, o.power, false);
        if (!e || (o.enabled && !o.enabled())) return;
        const p = local(e); const t = o.terminal();
        if (o.power.contains(e.target) || Math.hypot(p[0] - t[0], p[1] - t[1]) < 60) { at(t); set(true); S.lastInput = now(); } else shake(o.el);
      });
    };
    o.el.addEventListener('pointerdown', (e) => {
      if (cancelTap) { e.preventDefault(); disarm(); return; }
      if (o.enabled && !o.enabled()) { shake(o.el); if (o.denied) o.denied(); return; }
      e.preventDefault();
      try { o.el.setPointerCapture(e.pointerId); } catch (err) { /* 합성 이벤트 */ }
      held = true; glow(null);
      down = { x: e.clientX, y: e.clientY, t: now() }; wasOn = connected;
      if (connected) set(false);
      o.el.classList.add('held');
      at(local(e));
    });
    o.el.addEventListener('pointermove', (e) => { if (held) { at(local(e)); S.lastInput = now(); } });
    const up = (e) => {
      if (!held) return;
      held = false; o.el.classList.remove('held');
      // 짧게 눌렀으면: 물려 있던 집게는 떼어 제자리로, 놓여 있던 집게는 집어 든다
      if (e.type === 'pointerup' && isTap(down, e)) { at(o.home()); if (!wasOn) arm(); return; }
      const p = local(e); const t = o.terminal();
      if (Math.hypot(p[0] - t[0], p[1] - t[1]) < 34) { at(t); set(true); } else { at(o.home()); }
    };
    o.el.addEventListener('pointerup', up);
    o.el.addEventListener('pointercancel', up);
    at(o.home());
    return { reset() { held = false; disarm(); if (connected) set(false); at(o.home()); }, get connected() { return connected; } };
  }
  // 전원 장치 그림 속 단자의 위치. 빨간 단자는 그 그림의 28/110, 검은 단자는 82/110, 높이는 8/80 지점이다.
  function terminalOf(powerEl, container, fx = 0.255) {
    const r = powerEl.getBoundingClientRect(); const c = container.getBoundingClientRect();
    return [(r.left + r.width * fx - c.left) / S.scale, (r.top + r.height * 0.1 - c.top) / S.scale];
  }

  // 장치 B: 막힌 플라스크라 불꽃을 댈 수 없다. 집게를 전원 장치의 빨간 단자에 물리면 전류가 흘러 안에서 탄다.
  // 저울은 처음부터 끝까지 150.0 g 그대로다.
  const WIRE = {
    from: [550, 302],      // 플라스크 전극(빨강)이 장치 그림 오른쪽 끝에서 나오는 자리
    home: [612, 522],      // 집게가 놓여 있는 자리
    minusD: 'M550 322 C 610 330, 680 360, 676 444'
  };
  function setupClipB() {
    const NEED = 2400;
    let burnt = 0; let timer = null;
    S.clipB = makeClip({
      el: $('#clipB'), container: $('#bench'), path: $('#wirePlus'), power: $('#power'),
      from: () => WIRE.from, home: () => WIRE.home, terminal: () => terminalOf($('#power'), $('#bench')),
      enabled: () => S.stage === 'explore' && !S.done.burnB && S.done.burnA && !S.acquiring,
      denied: () => { if (!S.done.burnA) say(M.lines.nudge.deviceA); },
      onChange: (on) => {
        $('#devB .dev-art').classList.toggle('burning', on && !S.done.burnB);
        clearInterval(timer);
        if (!on || S.done.burnB) return;
        logAttempt({ stage: 'explore', questId: 'clipB' });
        timer = setInterval(() => {
          burnt = Math.min(NEED, burnt + 100);
          $('#devB .wool-dark').style.opacity = (burnt / NEED).toFixed(2);
          if (burnt >= NEED) { clearInterval(timer); finishBurnB(); }
        }, 100);
      }
    });
  }
  function finishBurnB() {
    if (S.done.burnB) return;
    S.done.burnB = true;
    $('#devB .dev-art').classList.remove('burning');
    // 다 탔으면 집게를 떼어 제자리로, 전원 램프도 끈다
    setTimeout(() => { if (S.clipB) S.clipB.reset(); }, 600);
    blinkOnce($('#winB'));
    $('#tagB').textContent = '150.0 → 150.0 g';
    logAttempt({ stage: 'explore', questId: 'burnB' });
    acquire(['cB'], async () => {
      await say(M.lines.afterB, { center: true }); S.boardOpen = true; renderSmallBoard(); setNote('칠판을 눌러 내 생각 쓰기');
      glow($('#board'), 'board');
    }, $('#devB'));
  }

  // 단서 획득: 학생이 '획득'을 눌러야 수집함으로 간다. 그동안 장면은 그대로 남아 있어서, 방금 본 것을 다시 살펴보거나 현미경의 '다시 하기'로 다시 볼 수 있다.
  // 실험대 단서는 조작한 장치(beside) 바로 오른편에 뜬다. 현미경 단서는 가운데에 크게 보여 준 뒤 우측 하단으로 옮겨 간다.
  function acquire(ids, after, beside) {
    S.acquiring = true;
    $('#bubble').classList.remove('show');
    const box = $('#acqPanel');
    const isLens = S.cards[ids[0]].kind === 'lens';
    box.innerHTML = `<div class="acq-head">${isLens ? '새 돋보기 발견' : '새 단서 발견'}</div>${ids.map((id) => `${isLens ? `<div class="acq-lens">${lensHTML(id)}<b>${esc(S.cards[id].title)}</b></div>` : cardHTML(id, 'big').replace('xMidYMid slice', 'xMidYMid meet')}<p class="acq-seen">${esc(S.cards[id].sentence || '')}</p>`).join('')}<button type="button" class="acq-btn" id="acqBtn">획득</button>`;
    box.className = beside ? 'acq-panel beside' : 'acq-panel';
    box.style.cssText = '';
    box.hidden = false;
    logAttempt({ stage: S.stage, questId: 'acquire', input: ids.join('+') });
    setNote('획득 눌러 단서 챙기기');
    const btn = $('#acqBtn');
    btn.addEventListener('click', () => {
      glow(null);
      setNote(''); // 다음 할 일은 획득 뒤의 대사가 끝나고 정한다
      S.acquiring = false;
      const els = $$('[data-card]', box);
      ids.forEach((id, i) => addCard(id, els[i]));
      box.hidden = true;
      box.innerHTML = '';
      if (after) after();
    }, { once: true });
    if (beside) {
      box.style.left = (beside.offsetLeft + beside.offsetWidth + 14) + 'px';
      box.style.top = Math.min(beside.offsetTop, $('#stage').offsetHeight - 10 - box.offsetHeight) + 'px';
    }
    if (beside || reduced) glow(btn, null);
    else acquireFromCenter(box, btn, ids.map((id) => S.cards[id].sentence || '').join('').length);
  }
  // 버튼은 가운데에 있는 동안 접어 두고, 옮겨 가면서 펼친다. 그래도 자리가 틀어지지 않게 왼쪽 위를 기준으로 줄인다.
  async function acquireFromCenter(box, btn, chars) {
    const stage = $('#stage'); const K = 1.5;
    btn.disabled = true;
    box.style.top = (stage.offsetHeight - 10 - box.offsetHeight) + 'px';
    box.style.bottom = 'auto';
    box.classList.add('at-center');
    const x = (stage.offsetWidth - box.offsetWidth * K) / 2 - box.offsetLeft;
    const y = (stage.offsetHeight - box.offsetHeight * K) / 2 - box.offsetTop;
    box.style.transform = `translate(${x}px, ${y}px) scale(${K})`;
    $('#talkVeil').classList.add('on');
    await waitTap(Math.min(6000, 1800 + chars * 70));
    $('#talkVeil').classList.remove('on');
    box.classList.add('moving');
    box.classList.remove('at-center');
    box.style.transform = '';
    await sleep(680);
    btn.disabled = false;
    glow(btn, null);
  }

  function onMicroscope() {
    if (S.scope.locked) { const m = $('#microscope'); m.classList.remove('shake'); void m.offsetWidth; m.classList.add('shake'); return; }
    openScope();
  }

  /* ───────── 2. 주장 (보완안 1: 처음 답을 학생이 직접 쓴다) ───────── */
  async function openClaimFlow(restoredText = '') {
    if(typeof restoredText !== 'string')restoredText='';
    if (S.stage !== 'explore' || !S.boardOpen) return;
    S.resumePoint = 'first';
    setStage('claim');
    $('#board').onclick = null;
    glow(null);
    setNote('왜 무거워졌는지 내 생각 쓰기', 'topLeft');
    await say([RUBRIC.STAGES.first.question, ...M.lines.firstAsk.slice(1)], { center: true });
    openReply({
      text: true, rows: 3, send: '교수님께 말하기', underBoard: true, value:restoredText,
      onSubmit: async ({ text }) => {
        const r = await evaluateText('first', text);
        logAttempt(Object.assign({stage:'claim',questId:'first',input:text,diag:r.diag,pass:r.pass},judgmentRecord(r)));
        if (!r.pass) { await say(feedbackLines('first', r.nextQuestion)); return false; }
        S.firstAnswer = text;
        S.firstTag = r.diag;
        closeReply();
        updateSession(Object.assign({ firstAnswer: text, firstError: S.firstTag }, judgmentRecord(r)));
        renderSmallBoard();
        await say(M.lines.firstThanks, { center: true });
        openClaimBoard();
      }
    });
  }

  function openClaimBoard() {
    S.resumePoint = 'claim';
    const b = $('#board');
    b.className = 'board big';
    b.innerHTML = `
      <div class="chalk q">${esc(M.boardQuestion)}</div>
      <div class="chalk first"><small>자네가 한 말</small>${esc(S.firstAnswer)}</div>
      <div class="claim-opts">${M.claimOptions.map((o) => `<button type="button" class="claim-opt" data-id="${o.id}">${esc(o.text)}</button>`).join('')}</div>
      <div class="ev-row" id="evRow" hidden><div class="ev-slot" data-drop="ev0" tabindex="0" role="button" aria-label="근거 칸 1"></div><div class="ev-slot" data-drop="ev1" tabindex="0" role="button" aria-label="근거 칸 2"></div></div>
      <button type="button" class="chalk-btn" id="claimSubmit" disabled>교수님께 제출</button>`;
    $$('.claim-opt', b).forEach((x) => x.addEventListener('click', () => {
      S.claimPick = x.dataset.id;
      $$('.claim-opt', b).forEach((y) => y.classList.toggle('on', y === x));
      updateClaimSubmit();
      // 주장을 처음 고르는 순간 교수가 근거를 요구하고, 근거 칸이 열린다. 수집함 카드가 들썩이고 칸이 빛난다.
      if (!S.evAsked) {
        S.evAsked = true;
        $('#evRow').hidden = false;
        $('#tray').classList.add('call');
        glow($('#evRow'), 'evidence');
        say(M.lines.evidenceAsk, { center: true });
      }
    }));
    $('#claimSubmit').addEventListener('click', submitClaim);
    S.evidence = [null, null];
    renderEvidence();
    setNote('까닭 고르고 근거 카드 두 장 올리기', 'belowProf');
  }
  function dropEvidence(id, idx) {
    if (S.stage !== 'claim') return;
    const c = S.cards[id];
    if (c.kind !== 'clue') return;
    const other = S.evidence.indexOf(id);
    if (other >= 0) S.evidence[other] = null;
    S.evidence[idx] = id;
    renderEvidence();
  }
  function renderEvidence() {
    S.evidence.forEach((id, i) => {
      const slot = $(`[data-drop="ev${i}"]`);
      if (!slot) return;
      slot.innerHTML = id ? `<div class="mini k-${S.cards[id].kind} folded">${esc(S.cards[id].text)}<i class="fold-flap" aria-hidden="true">${ART.blankCorner()}</i></div>` : `<span class="ev-hint">${esc(M.system.evSlot)}</span>`;
      slot.classList.toggle('filled', !!id);
    });
    updateClaimSubmit();
  }
  function updateClaimSubmit() {
    const btn = $('#claimSubmit');
    if (!btn) return;
    const ok = S.claimPick && S.evidence.every(Boolean);
    if (ok) $('#tray').classList.remove('call');
    btn.disabled = !ok;
    if (S.stage === 'claim') setNote(ok ? '교수님께 제출 누르기' : '까닭 고르고 근거 카드 두 장 올리기');
    if (ok) glow(btn, null);
  }
  async function submitClaim() {
    const opt = M.claimOptions.find((o) => o.id === S.claimPick);
    const ev = S.evidence.slice();
    const evKey = ev.slice().sort().join('+');
    const evTag = ev.includes('cA') && ev.includes('cB') ? 'N3쪽' : ev.includes('cA') ? 'N1쪽' : 'other';
    logAttempt({ stage: 'claim', questId: 'claim', choice: opt.id, input: evKey, diag: opt.correct ? 'pass' : opt.diag });
    glow(null);
    if (!opt.correct) {
      await say(M.lines.claimWrong[opt.diag]);
      // 학생이 근거로 올린 칸의 플라스크 카드를 가리킨다
      const bSlot = $(`[data-drop="ev${S.evidence.indexOf('cB')}"]`);
      if (bSlot) { bSlot.classList.remove('blink'); void bSlot.offsetWidth; bSlot.classList.add('blink'); }
      return;
    }
    S.claim = opt;
    S.cards.claim = { kind: 'claim', title: '내 주장', text: '강철솜이 공기 중의 산소와 결합했다.', sentence: opt.text.replace('때문이다.', '때문이다.') };
    updateSession({ claim: opt.id, evidence: evKey, evidenceTag: evTag });
    startRebuttal();
  }

  /* ───────── 3. 드러내기 ───────── */
  async function startRebuttal() {
    S.resumePoint = 'scope';
    setStage('rebuttal');
    setNote(''); // 콧대가 솟고 꼬투리가 적히는 동안에는 학생이 할 일이 없다
    renderSmallBoard();
    renderTray();
    $('#stage').classList.add('spot');
    // 교수 얼굴로 다가가 콧대가 솟는 것부터 보여 준다
    await zoomProf(2.2);
    setNose(4);
    await sleep(reduced ? 200 : 1200);
    await zoomOut();
    // 왜 다음 단계로 넘어가는지 교수가 정리한다
    await say(S.evNudged ? M.lines.rebuttalWhyNudged : M.lines.rebuttalWhy, { center: true });
    await sleep(reduced ? 100 : 400); // 말풍선이 제자리로 옮겨 간 뒤에 나오도록 잠깐 쉰다
    // 콧대 게이지는 이때 처음 나타난다
    $('#noseMeter').hidden = false;
    await sysPop(M.system.press);
    // 교수가 잡은 꼬투리 셋이 칠판에 적힌다. 학생이 그 주장을 고른 까닭을 물어 첫 꼬투리를 짚는다.
    S.link = 0;
    S.linkBoard = true;
    renderSmallBoard();
    await say(M.lines.linkIntro.concat(M.lines.linkLead), { center: true });
    await nextGap(0);
  }

  // 현미경 개념 모형: 철과 공기 중의 네 기체. 불이 붙어 있는 동안 산소만 하나씩 철에 붙고, 다른 기체는 부딪혀 튕겨 나간다.
  // 막힘: 밀폐 용기가 통째로 저울 위에 있어 저울 위 원자 수와 질량이 그대로다.
  // 열림: 용기가 사라지고 철만 저울 위에 남아, 붙는 산소만큼 저울 위 원자 수와 질량이 는다.
  const CX = 235; // 장면 가운데. 그림 오른쪽은 기체 표와 저울 게이지 자리다.
  const FE = [[175, 328], [199, 314], [223, 330], [247, 315], [271, 329], [295, 316]];
  const N_O = 5; // 산소 분자 5개가 붙는다. 하나 붙을 때마다 0.1 g (모형용 예시, 화면 대사에서는 개수와 무게를 잇지 않는다)
  const BOND = FE.slice(0, N_O).map(([x, y]) => [x, y - 21]);
  const WOOL = [CX, 322];
  const AIR_MIX = { inside: { n: 6, o: 5, ar: 1, co2: 1 }, outside: { n: 8, o: 3, ar: 1, co2: 1 } };
  const AIR_TOTAL = { n: 14, o: 8, ar: 2, co2: 2 };
  const ATOMS_CLOSED = FE.length + AIR_MIX.inside.n * 2 + AIR_MIX.inside.o * 2 + AIR_MIX.inside.ar + AIR_MIX.inside.co2 * 3;
  const JAR = 'M180 62 L180 84 Q120 94 120 134 L120 336 Q120 358 142 358 L328 358 Q350 358 350 336 L350 134 Q350 94 290 84 L290 62 Z';
  const STOPPER = { closed: { x: 170, y: 38, r: 0 }, open: { x: 6, y: 410, r: -5 } };
  const ZONE = {
    jar: { x1: 138, y1: 112, x2: 332, y2: 286 },
    closed: { x1: 12, y1: 16, x2: 462, y2: 345 },
    open: { x1: 12, y1: 16, x2: 462, y2: 284 }
  };
  const inZone = (z, x, y) => x >= z.x1 && x <= z.x2 && y >= z.y1 && y <= z.y2;
  // 막힘일 때 바깥 공기가 들어가지 않는 자리: 용기 둘레와 전원 장치
  const inAirClosed = (x, y) => inZone(ZONE.closed, x, y) && !(x > 104 && x < 366 && y > 18) && !(x < 112 && y > 292);
  const gasOk = (a, x, y) => (S.scope.mode === 'open' ? inZone(ZONE.open, x, y) : a.inside ? inZone(ZONE.jar, x, y) : inAirClosed(x, y));

  const LEDGER_ICON = {
    n: '<svg viewBox="0 0 30 16"><circle cx="10" cy="8" r="6.5" fill="#3f7fd6"/><circle cx="20" cy="8" r="6.5" fill="#3f7fd6"/></svg>',
    o: '<svg viewBox="0 0 30 16"><circle cx="10" cy="8" r="6.5" fill="#e2553a"/><circle cx="20" cy="8" r="6.5" fill="#e2553a"/></svg>',
    ar: '<svg viewBox="0 0 30 16"><circle cx="15" cy="8" r="6.5" fill="#d9b23f"/></svg>',
    co2: '<svg viewBox="0 0 30 16"><circle cx="6" cy="8" r="5" fill="#e2553a"/><circle cx="24" cy="8" r="5" fill="#e2553a"/><circle cx="15" cy="8" r="6" fill="#34383c"/></svg>'
  };
  const LEDGER_NAME = { n: '질소', o: '산소', ar: '아르곤', co2: '이산화탄소' };

  function openScope() {
    glow(null);
    $('#bench').hidden = true;
    $('#board').hidden = true;
    // 꼬투리 ①②는 밀폐 용기에서 시작한다(②는 ①을 태운 용기 그대로). ③은 용기 없이 새 철로 다시 태운다.
    S.scope.mode = S.link === 2 ? 'open' : 'closed';
    if (S.link === 2) S.scope.bonded.open = 0;
    const sc = $('#scope');
    sc.hidden = false;
    sc.innerHTML = `
      <div class="scope-frame">
        <div class="scope-strip" id="scopeStrip">꼬투리 ${'①②③'[S.link]} ${esc(M.links[S.link].row)}</div>
        <div class="scope-view" id="scopeView">
          <svg id="atoms" viewBox="0 0 720 440" aria-label="철과 공기 중의 기체 모형"></svg>
          <svg class="scope-wires" aria-hidden="true"><path id="scopeWireMinus"/><path id="scopeWire"/></svg>
          <div class="sc-ledger" id="scLedger">
            <h4><span id="lgTitle"></span><small>처음 → 지금</small><em id="lgCalm" hidden>잠잠…</em></h4>
            ${Object.keys(LEDGER_NAME).map((k) => `<div class="lg-row" data-gas="${k}"><span class="lg-icon">${LEDGER_ICON[k]}</span>${LEDGER_NAME[k]}<b id="lg-${k}"></b></div>`).join('')}
          </div>
          <div class="sc-mass" id="scMass">
            <small>저울이 재는 질량</small>
            <div class="sc-num"><b id="gNum"></b><span id="gTag"></span></div>
            <div class="gauge" aria-hidden="true"><i id="gBase"></i><i id="gPlus"></i><u id="gTick"></u></div>
            <div class="gauge-scale"><span>0 g</span><span id="gMax"></span></div>
            <div class="sc-atoms"><span>저울 위 원자 수</span><b id="gAtoms"></b></div>
          </div>
          <div class="flame-tool in-scope" id="flameS" role="button" tabindex="0" aria-label="불꽃 막대">${ART.torch()}</div>
          <div class="power in-scope" id="scopePower">${ART.power()}</div>
          <div class="scale-win big on-balance" id="scopeWin"><span class="num"></span></div>
          <div class="clip-tool" id="clipS" role="button" tabindex="0" aria-label="전선 집게">${ART.clip()}</div>
        </div>
        <div class="scope-base">
          <button type="button" class="dev-btn small" id="scopeReset">다시 하기</button>
        </div>
        <div class="engrave">⚠️ 실제 관찰 영상이 아닌 개념 모형 · 분자 수는 예시</div>
      </div>`;
    $('#scopeReset').addEventListener('click', () => {
      if (S.uncorking || S.gas.some((a) => a.state === 'moving')) return;
      S.scope.bonded[S.scope.mode] = 0; drawAtoms(); logAttempt({ stage: 'rebuttal', questId: 'reset-' + S.scope.mode });
    });
    setupFlameS();
    drawAtoms();
    setupClipS();
    S.scopeLoop = true;
    nextFrame(scopeFrame);
    startLink(S.link);
  }
  function closeScope() {
    S.scopeLoop = false;
    clearInterval(S.clipTimer);
    S.clipS = null;
    $('#scope').hidden = true;
    $('#scope').innerHTML = '';
    $('#bench').hidden = false;
    $('#board').hidden = false;
  }

  function svgEl(tag, attrs, parent) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attrs || {}).forEach(([k, v]) => el.setAttribute(k, v));
    if (parent) parent.appendChild(el);
    return el;
  }
  // 철은 원자 하나, 질소·산소는 원자 둘, 아르곤은 원자 하나, 이산화탄소는 산소-탄소-산소로 그린다
  const MOLECULE = {
    fe: [[0, 0, 12, '#5b6168']],
    n: [[-6.5, 0, 8, '#3f7fd6'], [6.5, 0, 8, '#3f7fd6']],
    o: [[-6.5, 0, 8, '#e2553a'], [6.5, 0, 8, '#e2553a']],
    ar: [[0, 0, 9, '#d9b23f']],
    co2: [[-12, 0, 6.5, '#e2553a'], [12, 0, 6.5, '#e2553a'], [0, 0, 8, '#34383c']]
  };
  function atom(svg, x, y, type) {
    const g = svgEl('g', { class: 'atom ' + type, transform: `translate(${x} ${y})` }, svg);
    MOLECULE[type].forEach(([cx, cy, r, col]) => {
      svgEl('circle', { cx, cy, r, fill: col, stroke: '#00000033', 'stroke-width': 1.5 }, g);
      svgEl('circle', { r: r * 0.35, cx: cx - r * 0.35, cy: cy - r * 0.35, fill: '#fff', opacity: 0.45 }, g);
    });
    return { g, x, y, vx: 0, vy: 0, type, state: 'free', inside: false };
  }
  function setAt(a, x, y) { a.x = x; a.y = y; a.g.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`); }

  function randomSpot(where, rnd) {
    const ok = where === 'jar' ? (x, y) => inZone(ZONE.jar, x, y) : where === 'open' ? (x, y) => inZone(ZONE.open, x, y) : inAirClosed;
    const z = ZONE[where];
    for (let i = 0; i < 80; i++) {
      const x = z.x1 + rnd() * (z.x2 - z.x1); const y = z.y1 + rnd() * (z.y2 - z.y1);
      if (ok(x, y)) return [x, y];
    }
    return [z.x1 + 10, z.y1 + 10];
  }

  // carry: 용기가 사라질 때 떠다니던 기체의 자리를 이어받는다
  function drawAtoms(carry) {
    const svg = $('#atoms');
    svg.innerHTML = '';
    const mode = S.scope.mode; const closed = mode === 'closed';
    let seed = closed ? 5 : 17;
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    // 저울과 게이지를 잇는 선: 오른쪽 게이지가 이 저울의 값임을 보여 준다
    svgEl('path', { d: 'M375 400 H472', stroke: '#e6c77a', 'stroke-width': 2.5, 'stroke-dasharray': '3 6', 'stroke-linecap': 'round', fill: 'none' }, svg);
    svgEl('rect', { id: 'balBody', x: 95, y: 380, width: 280, height: 40, rx: 8, fill: '#d9dcd7', stroke: '#9a9e98', 'stroke-width': 1.5 }, svg);
    svgEl('rect', { x: CX - 10, y: 366, width: 20, height: 16, fill: '#a8b0b3' }, svg);
    svgEl('ellipse', { cx: CX, cy: 366, rx: 112, ry: 12, fill: '#cfd6d9', stroke: '#7f878b', 'stroke-width': 1.2 }, svg);
    svgEl('ellipse', { id: 'scopeDish', cx: CX, cy: 350, rx: 96, ry: 12, fill: '#f6f4ef', stroke: '#c9c4b8', 'stroke-width': 1.5, opacity: closed ? 0 : 1 }, svg);
    if (closed) svgEl('path', { class: 'flask-part', d: JAR, fill: 'rgba(214,240,246,.2)', stroke: '#d7eef2', 'stroke-width': 3 }, svg);
    svgEl('path', { d: 'M' + FE.map((p) => p.join(' ')).join(' L'), stroke: '#8b9197', 'stroke-width': 4, fill: 'none', 'stroke-linecap': 'round', opacity: 0.7 }, svg);
    if (closed) svgEl('path', { class: 'flask-part', d: 'M225 50 L225 302 M245 50 L245 302', stroke: '#b9872f', 'stroke-width': 2 }, svg);
    const sp = svgEl('g', { id: 'woolSparks', class: 'scope-sparks' }, svg);
    // 타는 동안: 철 위로 일렁이는 불꽃, 막힘이면 전극 끝 사이의 전기 불꽃
    sp.insertAdjacentHTML('beforeend', ART.flames(WOOL[0], WOOL[1] - 4, 90, 46));
    if (closed) svgEl('path', { class: 'fx-arc', d: 'M225 302 l5 -7 l4 9 l5 -8 l4 7', stroke: '#fffbe0', 'stroke-width': 3, fill: 'none', 'stroke-linejoin': 'round' }, sp);
    S.fe = FE.map((p) => atom(svg, p[0], p[1], 'fe'));
    const feLabel = svgEl('text', { x: 310, y: 336, fill: '#f4efe0', 'font-size': 15, 'font-weight': 700 }, svg);
    feLabel.textContent = '철';
    const nb = S.scope.bonded[mode];
    S.gas = [];
    for (let i = 0; i < nb; i++) { const a = atom(svg, BOND[i][0], BOND[i][1], 'o'); a.state = 'bonded'; S.gas.push(a); }
    const add = (type, n, where, inside) => {
      for (let i = 0; i < n; i++) {
        const kept = carry && carry[type] && carry[type].shift();
        const p = kept || randomSpot(where, rnd);
        const a = atom(svg, p[0], p[1], type);
        a.inside = inside;
        if (carry && !kept) a.g.classList.add('gas-in');
        S.gas.push(a);
      }
    };
    if (closed) {
      const I = AIR_MIX.inside; const O = AIR_MIX.outside;
      add('n', I.n, 'jar', true); add('o', I.o - nb, 'jar', true); add('ar', I.ar, 'jar', true); add('co2', I.co2, 'jar', true);
      add('n', O.n, 'closed', false); add('o', O.o, 'closed', false); add('ar', O.ar, 'closed', false); add('co2', O.co2, 'closed', false);
    } else {
      add('n', AIR_TOTAL.n, 'open', false); add('o', AIR_TOTAL.o - nb, 'open', false); add('ar', AIR_TOTAL.ar, 'open', false); add('co2', AIR_TOTAL.co2, 'open', false);
    }
    const st = STOPPER[mode];
    const stopper = svgEl('g', { class: 'stopper', id: 'stopper', transform: `translate(${st.x} ${st.y}) rotate(${st.r})`, tabindex: 0, role: 'button', 'aria-label': closed ? '뚜껑 열기' : '뚜껑 닫기' }, svg);
    svgEl('rect', { x: 0, y: 0, width: 130, height: 26, rx: 6, fill: '#6b4630', stroke: '#2f1d12', 'stroke-width': 2 }, stopper);
    svgEl('rect', { x: 7, y: 4, width: 116, height: 6, rx: 3, fill: '#8d6044' }, stopper);
    stopper.addEventListener('click', toggleStopper);
    stopper.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleStopper(); } });
    // 막힘이면 불꽃 대신 전기(집게), 열림이면 불꽃
    $('#flameS').hidden = closed;
    $('#scopePower').hidden = !closed; $('#clipS').hidden = !closed; $('.scope-wires').style.display = closed ? '' : 'none';
    if (closed) drawMinusWire();
    if (S.clipS) S.clipS.reset();
    readings();
    placeScopeWin();
  }
  // 현미경 저울 액정은 그림 속 저울 몸체 위에 겹친다. 교수 쪽으로 확대하는 동안에도 틀어지지 않게 그림 좌표로 계산한다.
  function placeScopeWin() {
    const view = $('#scopeView'); const win = $('#scopeWin');
    if (!view || !win) return;
    const k = Math.min(view.clientWidth / 720, view.clientHeight / 440);
    win.style.left = ((view.clientWidth - 720 * k) / 2 + CX * k - win.offsetWidth / 2) + 'px';
    win.style.top = ((view.clientHeight - 440 * k) / 2 + 400 * k - win.offsetHeight / 2) + 'px';
  }

  // 저울 게이지, 저울 위 원자 수, 공기 중의 기체 표를 지금 상태로 다시 쓴다
  function readings() {
    const closed = S.scope.mode === 'closed'; const nb = S.scope.bonded[S.scope.mode];
    const d = closed ? M.devices.B : M.devices.A;
    const value = closed ? d.before : d.before + 0.1 * nb;
    const delta = value - d.before;
    const txt = value.toFixed(1) + ' g';
    $('#scopeWin .num').textContent = txt;
    $('#gNum').textContent = txt;
    $('#gTag').textContent = !nb ? '' : closed ? '잠잠…' : '← 무게 +' + delta.toFixed(1) + ' g';
    $('#gTag').classList.toggle('calm', closed);
    const max = closed ? 200 : 3;
    $('#gBase').style.width = (d.before / max * 100) + '%';
    $('#gPlus').style.left = (d.before / max * 100) + '%';
    $('#gPlus').style.width = (delta / max * 100) + '%';
    $('#gTick').style.left = (d.before / max * 100) + '%';
    $('#gMax').textContent = max + ' g';
    const from = closed ? ATOMS_CLOSED : FE.length;
    $('#gAtoms').textContent = `${from} → ${closed ? from : from + nb * 2}`;
    // 밀폐 용기 장면의 표는 용기 외부 공기만 센다. 밖의 기체는 드나들지 않으므로 숫자가 그대로다.
    const air = closed ? AIR_MIX.outside : AIR_TOTAL;
    $('#lgTitle').textContent = closed ? '용기 외부 공기 중' : '공기 중의 기체';
    $('#lgCalm').hidden = !(closed && nb);
    Object.keys(air).forEach((k) => {
      const left = !closed && k === 'o' ? air.o - nb : air[k];
      $(`#lg-${k}`).textContent = `${air[k]} → ${left}`;
    });
    $('#scLedger [data-gas="o"]').classList.toggle('hot', !closed && nb > 0);
  }
  // 봐야 할 곳: 이번 꼬투리에서 눈여겨볼 판을 빛으로 짚는다. 다른 판은 흐리게 하지 않는다.
  function lookAt(id) {
    ['scMass', 'scLedger'].forEach((x) => { const el = $('#' + x); if (el) el.classList.toggle('look', x === id); });
  }
  function pop(el) { if (!el) return; el.classList.remove('pop-num'); void el.getBoundingClientRect(); el.classList.add('pop-num'); }
  // 철에 닿는 순간의 표시: 붙으면 밝은 고리, 튕겨 나가면 흐린 고리
  function ringAt(x, y, cls) {
    const svg = $('#atoms'); if (!svg) return;
    const c = svgEl('circle', { class: 'ring ' + cls, cx: x, cy: y, r: 16 }, svg);
    setTimeout(() => c.remove(), 800);
  }

  function scopeFrame() {
    if (!S.scopeLoop) return;
    S.gas.forEach((a) => {
      if (a.state !== 'free') return;
      a.vx = (a.vx + (Math.random() - 0.5) * 0.25) * 0.96; a.vy = (a.vy + (Math.random() - 0.5) * 0.25) * 0.96;
      let x = a.x + a.vx; let y = a.y + a.vy;
      if (!gasOk(a, x, y)) {
        a.vx *= -1; a.vy *= -1;
        // 장면이 바뀌어 자리 밖에 남은 기체는 가운데 쪽으로 천천히 돌아온다
        if (gasOk(a, a.x, a.y)) { x = a.x; y = a.y; } else { x = a.x + (CX - a.x) * 0.01; y = a.y + (150 - a.y) * 0.01; }
      }
      setAt(a, x, y);
    });
    nextFrame(scopeFrame);
  }

  function tweenAtom(a, to, ms) {
    return new Promise((res) => {
      const from = [a.x, a.y]; const t0 = performance.now();
      const step = (t) => {
        const k = reduced ? 1 : Math.min(1, (t - t0) / ms); const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        setAt(a, from[0] + (to[0] - from[0]) * e, from[1] + (to[1] - from[1]) * e);
        if (k < 1) nextFrame(step); else res();
      };
      nextFrame(step);
    });
  }

  // 열림: 불꽃을 철에 대고 있는 동안 0.7초마다 가까운 산소 하나가 철에 붙는다
  function setupFlameS() {
    const el = $('#flameS');
    let acc = 0; let beat = 0;
    const toAtoms = (x, y) => { const svg = $('#atoms'); const pt = svg.createSVGPoint(); pt.x = x; pt.y = y; return pt.matrixTransform(svg.getScreenCTM().inverse()); };
    flameDrag(el, {
      near: (x, y) => { const p = toAtoms(x, y); return Math.hypot(p.x - WOOL[0], p.y - WOOL[1]) < 80; },
      // 눌러서 댈 때는 철 둘레를 넉넉히 받아 주고, 불꽃 끝은 철 바로 위에 둔다
      hit: (x, y) => { const p = toAtoms(x, y); return Math.hypot(p.x - WOOL[0], p.y - WOOL[1]) < 160; },
      spot: () => { const m = $('#atoms').getScreenCTM(); return [m.a * WOOL[0] + m.e, m.d * (WOOL[1] - 20) + m.f]; },
      tick: (dt, near) => {
        const sp = $('#woolSparks'); if (sp) sp.classList.toggle('on', near);
        if (!near) { acc = 0; return; }
        acc += dt;
        if (acc >= 700) { acc = 0; beat++; if (beat % 2 === 0) bounceOne(); bondOne(); }
      },
      release: () => { const sp = $('#woolSparks'); if (sp) sp.classList.remove('on'); acc = 0; }
    });
  }
  // 막힘: 집게를 빨간 단자에 물려 둔 동안 0.7초마다 하나씩 붙는다
  function lidTop() {
    const m = $('#atoms').getScreenCTM(); const r = $('#scopeView').getBoundingClientRect();
    return [(m.a * CX + m.e - r.left) / S.scale, (m.d * 40 + m.f - r.top) / S.scale];
  }
  // 검은 전선: 실험대의 장치 B처럼 검은 단자와 뚜껑을 늘 잇고 있다. 용기를 가로지르지 않게 왼쪽으로 돌아 내려간다.
  function drawMinusWire() {
    const [x0, y0] = lidTop(); const [x, y] = terminalOf($('#scopePower'), $('#scopeView'), 0.745);
    $('#scopeWireMinus').setAttribute('d', `M${x0} ${y0} C ${x0 - 170} ${y0 - 26}, ${x - 28} ${y - 190}, ${x} ${y}`);
  }
  function setupClipS() {
    const view = $('#scopeView');
    let beat = 0;
    S.clipS = makeClip({
      el: $('#clipS'), container: view, path: $('#scopeWire'), power: $('#scopePower'),
      from: lidTop,
      // 뚜껑 위에서 왼쪽으로 빠져 내려가 전원 장치로 이어진다 (용기를 가로지르지 않게)
      curve: ([x0, y0], p) => `M${x0} ${y0} C ${x0 - 90} ${y0 - 34}, ${p[0] - 30} ${p[1] - 130}, ${p[0] - 18} ${p[1]}`,
      terminal: () => terminalOf($('#scopePower'), view),
      home: () => { const t = terminalOf($('#scopePower'), view); return [t[0] + 34, t[1] - 62]; },
      onChange: (on) => {
        clearInterval(S.clipTimer);
        const sp = $('#woolSparks'); if (sp) sp.classList.toggle('on', on);
        if (!on) return;
        S.clipTimer = setInterval(() => { if (S.scope.mode !== 'closed') return; beat++; if (beat % 2 === 0) bounceOne(); bondOne(); }, 700);
      }
    });
  }
  async function bondOne() {
    const mode = S.scope.mode; const closed = mode === 'closed';
    const free = S.gas.filter((a) => a.type === 'o' && a.state === 'free' && (!closed || a.inside));
    if (!free.length || S.scope.bonded[mode] + S.gas.filter((a) => a.type === 'o' && a.state === 'moving').length >= N_O) return;
    free.sort((p, q) => Math.hypot(p.x - WOOL[0], p.y - WOOL[1]) - Math.hypot(q.x - WOOL[0], q.y - WOOL[1]));
    const a = free[0];
    const slot = S.gas.filter((o) => o.type === 'o' && o.state !== 'free').length;
    a.state = 'moving';
    await tweenAtom(a, BOND[slot], 700);
    if (S.scope.mode !== mode || !$('#atoms') || !a.g.isConnected) return;
    a.state = 'bonded';
    S.scope.bonded[mode] = S.gas.filter((o) => o.type === 'o' && o.state === 'bonded').length;
    readings();
    ringAt(BOND[slot][0], BOND[slot][1], 'ring-o');
    // 밀폐 용기에서는 저울도 바깥 공기도 그대로이므로 숫자를 움직이지 않는다
    if (!closed) { pop($('#lg-o')); pop($('#gNum')); pop($('#gTag')); pop($('#gAtoms')); }
    if (S.scope.bonded[mode] === N_O) {
      logAttempt({ stage: 'rebuttal', questId: 'burn-' + mode });
      // 다 타면 집게를 떼어 제자리로, 전원 램프도 끈다 (장치 B와 같다)
      if (closed) { clearInterval(S.clipTimer); if (S.clipS) S.clipS.reset(); }
      if (S.onAllBonded) S.onAllBonded(mode);
    }
  }
  // 산소가 아닌 기체는 철에 부딪혀도 붙지 않고 제자리로 돌아간다
  let bouncing = false;
  async function bounceOne() {
    if (bouncing) return;
    const closed = S.scope.mode === 'closed';
    const pool = S.gas.filter((a) => a.type !== 'o' && a.state === 'free' && (!closed || a.inside));
    if (!pool.length) return;
    pool.sort((p, q) => Math.hypot(p.x - WOOL[0], p.y - WOOL[1]) - Math.hypot(q.x - WOOL[0], q.y - WOOL[1]));
    const a = pool[Math.floor(Math.random() * Math.min(4, pool.length))];
    const spot = FE[Math.floor(Math.random() * FE.length)];
    const hit = [spot[0], spot[1] - 42];
    const home = [a.x, a.y];
    bouncing = true;
    a.state = 'moving';
    await tweenAtom(a, hit, 420);
    ringAt(hit[0], hit[1] + 12, 'ring-x');
    await tweenAtom(a, home, 480);
    if (a.state === 'moving') a.state = 'free';
    bouncing = false;
  }

  async function toggleStopper() {
    if (!S.canToggle || S.acquiring || S.uncorking || S.gas.some((a) => a.state === 'moving')) { const s = $('#stopper'); if (s) blinkOnce(s); return; }
    clearInterval(S.clipTimer);
    glow(null);
    const opening = S.scope.mode === 'closed';
    logAttempt({ stage: 'rebuttal', questId: 'stopper', choice: opening ? 'open' : 'closed' });
    S.stopperToggles = (S.stopperToggles || 0) + 1;
    if (opening) await uncork();
    else { S.scope.mode = 'closed'; drawAtoms(); }
    if (S.onToggle) S.onToggle(S.scope.mode);
  }
  function tween(ms, fn) {
    return new Promise((res) => {
      if (reduced) { fn(1); res(); return; }
      const t0 = performance.now();
      const step = (t) => { const k = Math.min(1, (t - t0) / ms); fn(k); if (k < 1) nextFrame(step); else res(); };
      nextFrame(step);
    });
  }
  // 뚜껑을 열 때: 밀폐 용기 장면에서 이어서, 뚜껑이 뽑혀 바닥에 떨어지고 용기는 사라진다.
  // 떠다니던 기체는 그대로 공기 중에 남고, 철만 접시에 놓여 저울 위에 남는다.
  async function uncork() {
    S.uncorking = true;
    const view = $('#scopeView'); const stopper = $('#stopper'); const dish = $('#scopeDish');
    const glass = $$('.flask-part', $('#atoms'));
    const attached = S.gas.filter((a) => a.state === 'bonded');
    const { closed: from, open: to } = STOPPER;
    const put = (x, y, r) => stopper.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${r.toFixed(1)})`);
    const top = { x: from.x - 6, y: from.y - 34, r: -12 };
    view.classList.add('uncorking');
    // 뽑힌다
    await tween(280, (k) => { const e = 1 - (1 - k) * (1 - k); put(from.x + (top.x - from.x) * e, from.y + (top.y - from.y) * e, from.r + (top.r - from.r) * e); });
    // 날아가 떨어지는 동안 용기가 사라진다
    const fade = tween(760, (k) => {
      const e = k * k * (3 - 2 * k);
      glass.forEach((el) => el.setAttribute('opacity', (1 - e).toFixed(2)));
      attached.forEach((a) => a.g.setAttribute('opacity', (1 - e).toFixed(2)));
      dish.setAttribute('opacity', e.toFixed(2));
    });
    await tween(620, (k) => put(top.x + (to.x - top.x) * k, top.y + (to.y - top.y) * k * k - 46 * Math.sin(Math.PI * k), top.r + (to.r - 360 - top.r) * k));
    // 바닥에서 한 번 튀어 오른다
    await tween(260, (k) => put(to.x, to.y - 22 * Math.sin(Math.PI * k), to.r));
    await fade;
    const carry = {};
    S.gas.filter((a) => a.state === 'free').forEach((a) => { (carry[a.type] = carry[a.type] || []).push([a.x, a.y]); });
    S.scope.mode = 'open';
    S.scope.bonded.open = 0;
    drawAtoms(carry);
    view.classList.remove('uncorking');
    S.uncorking = false;
  }

  function questErr(qid, diag) {
    const k = qid + ':' + diag;
    S.errCount[k] = (S.errCount[k] || 0) + 1;
    return S.errCount[k];
  }
  function toSentence(t) { t = t.trim(); return /[.!?]$/.test(t) ? t : t + '.'; }

  /* ───────── 드러내기: 꼬투리 하나마다 카드 뒤집기 → 현미경 조사 → 뒷면에 "…라는 것은 ___라는 뜻이다" ───────── */
  // 실험실에서 교수가 보내고, 학생이 현미경을 열면 이 조사가 시작된다
  async function startLink(i) {
    S.round = i + 1;
    S.onToggle = null;
    setNote(['집게를 빨간 단자에 물리기', '뚜껑 열고 불꽃을 철에 대기', '불꽃을 철에 대고 기체 수 보기'][i], 'faceLeft');
    await say(M.links[i].doLines, { center: true });
    if (i === 0) {
      S.canToggle = false;
      lookAt('scMass');
      glow($('#clipS'), 'clip');
    } else if (i === 1) {
      lookAt('scMass');
      S.canToggle = true;
      glow($('#stopper'), 'stopper');
      S.onToggle = (mode) => {
        if (mode === 'open' && S.scope.bonded.open < N_O) { say(M.lines.afterOpen); pop($('#gNum')); pop($('#gAtoms')); glow($('#flameS'), 'flame'); }
        else if (mode === 'closed') glow($('#stopper'), 'stopper');
      };
    } else {
      S.canToggle = false;
      lookAt('scLedger');
      glow($('#flameS'), 'flame');
    }
    const wanted = i === 0 ? 'closed' : 'open';
    S.onAllBonded = async (mode) => {
      if (mode !== wanted) return;
      S.onAllBonded = null; S.onToggle = null;
      await sleep(900);
      acquire([M.links[i].clue], () => {
        if (M.links[i].lens !== M.links[i].clue) addCard(M.links[i].lens);
        if (window.SCIW_DEMO && window.SCIW_DEMO.reached('scope' + i)) return; // 발표 시연 2는 현미경 관찰 단서를 얻으면 멈춘다
        askLink(i);
      });
    };
  }

  // 꼬투리 화면: 실험실·현미경·수집함을 걷어 내고, 왼쪽에 카드 앞면, 오른쪽에 그 뒷면(종이)을 놓는다.
  // state: blank(비어 있음) · mis(교수가 빨간 글씨를 적는 순간) · write(답 쓰는 중) · done(학생의 문장이 빨간 글씨를 지움)
  function enterArena() {
    if (S.arena) return;
    S.arena = true;
    glow(null);
    $('#arena').setAttribute('aria-hidden', 'false');
    document.body.classList.add('arena');
    setTimeout(placeGap, 560); // 말풍선이 커지는 동안 잰 자리를 바로잡는다
  }
  function exitArena() {
    if (!S.arena) return;
    S.arena = false;
    S.gap = null;
    $('#gapView').innerHTML = '';
    $('#lensRow').hidden = true;
    $('#arena').setAttribute('aria-hidden', 'true');
    document.body.classList.remove('arena');
  }
  function renderGap(i, state) {
    const L = M.links[i]; const c = S.cards[L.data];
    const prev = S.gap && S.gap.i === i ? S.gap.state : null;
    S.gap = { i, state };
    const mis = state === 'blank' ? '' : `<div class="mis ${state === 'mis' ? 'fresh' : ''} ${state === 'done' ? 'off' : ''}">${esc(L.mis)}</div>`;
    const body = state === 'blank' ? '<div class="faint">(비어 있음)</div>'
      : state === 'done' ? `<div class="mine">${esc(STAGES[L.quest].starter + c.back)}</div><div class="stamp">뒷면 완성</div>` : '';
    $('#gapView').innerHTML = `
      <div class="gap-front" id="gapFront">${cardHTML(L.data, 'big').replace('xMidYMid slice', 'xMidYMid meet')}</div>
      <div class="paper ${state === 'done' ? 'done' : ''} ${state === 'blank' && prev !== 'blank' ? 'flip-in' : ''}" id="gapPaper" data-state="${state}"><div id="gapHead"><div class="hd">뒷면 · 이 숫자의 뜻</div>${mis}</div>${body}</div>`;
    renderLens();
    placeGap();
  }
  // 말풍선이 길어져도 카드와 종이가 가리지 않게 내려 둔다. 답 틀은 종이 위, 빨간 글씨 아래에 놓인다.
  function placeGap() {
    const paper = $('#gapPaper');
    if (!paper) return;
    const talk = $('#bubble'); const head = $('#gapHead');
    const top = Math.max(162, talk.offsetTop + talk.offsetHeight + 12);
    paper.style.top = top + 'px';
    $('#gapFront').style.top = top + 'px';
    $('#reply').style.top = (top + head.offsetTop + head.offsetHeight + 4) + 'px';
  }
  // 돋보기: 쓰는 동안 아래 줄에 놓여 있고, 숫자 카드에 대면 방금 본 장면이 그 위에서 되풀이된다.
  function renderLens() {
    const row = $('#lensRow');
    const on = S.gap && S.gap.state === 'write';
    row.hidden = !on;
    if (!on) { row.innerHTML = ''; return; }
    const ids = S.tray.filter((id) => S.cards[id].kind === 'lens');
    row.innerHTML = `${ids.map((id) => `<div class="lens-slot">${S.lensOn === id ? '' : lensHTML(id, 'act')}</div>`).join('')}<div class="sys-note"><small>▸ SYSTEM</small>${M.system.lensHint.map(esc).join('<br>')}</div>`;
    $$('.lens', row).forEach(bindLens);
    const front = $('#gapFront');
    const old = $('.lens.on-card', front);
    if (old) old.remove();
    if (!S.lensOn) return;
    front.insertAdjacentHTML('beforeend', lensHTML(S.lensOn, 'on-card'));
    const placed = $('.lens.on-card', front);
    bindPeek(placed);
    const lift = () => { S.lensOn = null; renderLens(); };
    placed.addEventListener('click', lift);
    placed.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); lift(); } });
  }
  // 누르거나 끌어서 숫자 카드에 댄다
  function bindLens(el) {
    const id = el.dataset.card;
    const place = () => { S.lensOn = id; logAttempt({ stage: 'rebuttal', questId: 'lens', choice: id }); renderLens(); };
    bindPeek(el);
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const sx = e.clientX; const sy = e.clientY;
      let ghost = null;
      const move = (ev) => {
        if (!ghost && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 6) {
          ghost = el.cloneNode(true);
          ghost.classList.add('ghost');
          document.body.appendChild(ghost);
        }
        if (ghost) { ghost.style.left = ev.clientX + 'px'; ghost.style.top = ev.clientY + 'px'; }
      };
      const up = (ev) => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        if (!ghost) { place(); return; }
        ghost.remove();
        const t = document.elementFromPoint(ev.clientX, ev.clientY);
        if (t && t.closest('#gapFront')) place();
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); place(); } });
  }
  async function sayTap(lines) {
    await say(lines);
    const b = $('#bubble');
    b.classList.add('has-more');
    await waitTap();
    b.classList.remove('has-more');
  }
  // 꼬투리를 여는 장면: 교수가 카드를 뒤집는다. 뒷면이 비었으니 제멋대로 읽어 빨간 글씨로 적어 둔다.
  async function openGap(i) {
    const L = M.links[i];
    enterArena();
    renderGap(i, 'blank');
    await sayTap(L.flip);
    S.cards[L.data].mis = L.mis;
    renderGap(i, 'mis');
    renderTray();
    await sayTap(L.misLines);
  }
  // 다음 꼬투리로: 카드가 있으면 뒤집어 보이고, 실험실로 돌아와 현미경으로 보낸다
  async function nextGap(i) {
    S.resumePoint = 'scope';
    setNote(''); // 카드를 뒤집고 실험실로 돌아오는 동안에는 숨긴다
    if (S.tray.includes(M.links[i].data)) await openGap(i);
    exitArena();
    renderSmallBoard();
    await say(M.links[i].go, { center: true });
    S.scope.locked = false;
    $('#microscope').classList.add('unlocked');
    glow($('#microscope'), 'scope');
    setNote('현미경 눌러 열기', 'topLeft');
  }

  // 학생이 빈칸에 쓴 말을 답 틀의 끝말과 잇는다. 끝 글자에 맞춰 "~다는 / ~라는 / ~이라는 뜻이다"가 된다.
  function meaningSentence(typed) {
    const t = typed.trim().replace(/[.!?。]+$/, '');
    if (/뜻(이다|입니다|이에요|임)?$/.test(t)) return t.replace(/뜻(이다|입니다|이에요|임)?$/, '뜻이다.');
    if (/(이|아니)다$/.test(t)) return t.replace(/다$/, '라는 뜻이다.'); // 질량이다 → 질량이라는, 아니다 → 아니라는
    if (t.endsWith('다')) return t + '는 뜻이다.';
    const last = t.charCodeAt(t.length - 1);
    const batchim = last >= 0xAC00 && last <= 0xD7A3 && (last - 0xAC00) % 28 !== 0;
    return t + (batchim ? '이라는 뜻이다.' : '라는 뜻이다.');
  }

  async function askLink(i) {
    S.resumePoint = 'link';
    const L = M.links[i];
    S.lensOn = null;
    if (!S.cards[L.data].mis) await openGap(i); // 현미경에서 앞면을 얻은 카드는 이제 뒤집는다
    enterArena();
    renderGap(i, 'write');
    setNote('카드 뒷면에 이 숫자의 뜻 쓰기', 'aboveProf');
    await say(M.lines.writeAsk);
    linkReply(i);
  }
  function linkReply(i, value) {
    const L = M.links[i]; const qid = L.quest; const stageDef = STAGES[qid];
    openReply({
      text: true, rows: 2, enterSends: true, frame: { pre: stageDef.starter.trim(), post: stageDef.ending }, value: value || (window.SCIW_DEMO ? window.SCIW_DEMO.prefill(qid) : ''), send: '말하기',
      onSubmit: async ({ text: typed }) => {
        const sentence = meaningSentence(typed);
        const text = stageDef.starter + sentence;
        S.linkTries[i] = (S.linkTries[i] || 0) + 1;
        const r = await evaluateText(qid, text);
        logAttempt(Object.assign({ stage: 'rebuttal', questId: qid, input: text, diag: r.diag, pass: r.pass }, judgmentRecord(r)));
        closeReply();
        if (!r.pass) {
          const n = r.outcome === 'clarify' ? 0 : questErr(qid, r.diag);
          await say(linkFeedback(qid, r, n));
          linkReply(i, typed);
          return;
        }
        S.cards[L.data].back = sentence;
        updateSession({ ['debate' + (i + 1) + 'Tries']: S.linkTries[i] });
        await passLink(i);
      }
    });
  }
  // 되묻기: 답 틀만으로는 짐작하기 어려웠던 부분을 더 말해 보게 한다. 맞게 쓴 부분은 먼저 인정한다.
  function linkFeedback(qid, r, fails) {
    if (r.analysis.inputStatus === 'unclear') return M.lines.unclear;
    if (fails >= 3 && M.lines.stuck[qid]) return [M.lines.stuck[qid]];
    const partial = !r.errors.length && r.analysis.checks[STAGES[qid].keys[0]].status === 'partial';
    return (partial ? M.lines.partOk : []).concat(r.nextQuestion);
  }

  // 통과하면 학생의 문장이 뒷면에 남아 교수의 빨간 글씨를 지우고, 콧대가 한 칸 꺾인다. 그다음 꼬투리로 넘어간다.
  async function passLink(i) {
    setNote(''); // 콧대가 꺾이는 장면 동안에는 숨긴다
    S.link = i < M.links.length - 1 ? i + 1 : null;
    S.resumePoint = S.link === null ? 'combine' : 'scope';
    S.lensOn = null;
    renderGap(i, 'done');
    renderTray();
    await sayTap(M.lines.pass);
    await zoomProf(1.7);
    setNose(S.nose - 1);
    await sleep(reduced ? 200 : 1300);
    await zoomOut();
    if (window.SCIW_DEMO && window.SCIW_DEMO.reached('link' + i)) return; // 발표 시연 1은 꼬투리 ① 통과에서 멈춘다
    closeScope();
    if (S.link === null) { exitArena(); startCombine(); return; }
    nextGap(S.link);
  }

  /* ───────── 합치기: 세 줄이 다 이어지면 학생의 설명대로 두 실험을 장면으로 확인해 준다 ───────── */
  async function startCombine() {
    S.resumePoint = 'combine';
    S.linkBoard = false;
    $('#stage').classList.remove('spot');
    const b = $('#board');
    b.className = 'board big';
    b.innerHTML = '<div class="chalk q">두 실험에서 벌어진 일</div><svg id="bars" viewBox="0 0 700 230" aria-hidden="true"></svg>'
      + '<div class="bars-foot"><button type="button" class="dev-btn" id="barsReplay" disabled>↻ 다시 보기</button><button type="button" class="chalk-btn" id="barsNext" disabled>다음</button></div>';
    $('#barsReplay').addEventListener('click', () => { logAttempt({ stage: 'rebuttal', questId: 'combineReplay' }); playBars(); });
    $('#barsNext').addEventListener('click', () => { glow(null); startCompose(); }, { once: true });
    setNote(''); // 장면이 도는 동안에는 볼 뿐이다
    await say(M.lines.combineLine);
    await playBars();
    logAttempt({ stage: 'rebuttal', questId: 'combine', pass: true });
    await say(M.lines.combineDone);
    glow($('#barsNext'), null);
    setNote('다 봤으면 다음 누르기', 'belowProf');
  }
  // 장면이 도는 동안에는 다시 보기와 다음을 잠근다
  async function playBars() {
    const btns = [$('#barsReplay'), $('#barsNext')];
    btns.forEach((x) => { x.disabled = true; });
    await drawBars();
    btns.forEach((x) => { x.disabled = false; });
  }
  // 합치기: 막대 대신 두 실험의 작은 장면을 나란히. 산소 분자가 실제로 움직이고 저울 숫자가 함께 바뀐다.
  async function drawBars() {
    const svg = $('#bars');
    svg.setAttribute('viewBox', '0 0 700 230');
    svg.innerHTML = '';
    const chalk = '#f6f3ea';
    const pair = (x, y) => {
      const gg = svgEl('g', { transform: `translate(${x} ${y})` }, svg);
      [-5, 5].forEach((cx) => svgEl('circle', { cx, r: 6, fill: '#e2553a', stroke: '#00000033' }, gg));
      gg.p = [x, y];
      return gg;
    };
    const move = (gg, to, ms) => new Promise((res) => {
      const from = gg.p; const t0 = performance.now();
      const step = (t) => {
        const k = reduced ? 1 : Math.min(1, (t - t0) / ms); const e2 = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        const x = from[0] + (to[0] - from[0]) * e2; const y = from[1] + (to[1] - from[1]) * e2;
        gg.setAttribute('transform', `translate(${x} ${y})`);
        if (k < 1) nextFrame(step); else { gg.p = to; res(); }
      };
      nextFrame(step);
    });
    const scene = (ox, flask) => {
      // 저울 + 액정
      svgEl('rect', { x: ox + 40, y: 186, width: 220, height: 30, rx: 6, fill: '#d9dcd7', stroke: '#9a9e98' }, svg);
      svgEl('ellipse', { cx: ox + 150, cy: 180, rx: 80, ry: 8, fill: '#cfd6d9', stroke: '#7f878b' }, svg);
      svgEl('rect', { x: ox + 104, y: 191, width: 92, height: 20, rx: 3, fill: '#b9c7a5', stroke: '#2f3a3e' }, svg);
      const lcd = svgEl('text', { x: ox + 190, y: 206, 'text-anchor': 'end', 'font-size': 15, fill: '#1b261c', 'font-family': "'Share Tech Mono', monospace" }, svg);
      if (flask) svgEl('path', { d: `M${ox + 132} 20 L${ox + 132} 58 Q${ox + 78} 80 ${ox + 82} 120 Q${ox + 90} 170 ${ox + 150} 172 Q${ox + 210} 170 ${ox + 218} 120 Q${ox + 222} 80 ${ox + 168} 58 L${ox + 168} 20 Z`, fill: 'rgba(214,240,246,.15)', stroke: '#d7eef2', 'stroke-width': 2 }, svg);
      if (flask) svgEl('rect', { x: ox + 128, y: 10, width: 44, height: 14, rx: 3, fill: '#6b4630' }, svg);
      // 플라스크 안의 철과 산소는 유리 밖으로 나가지 않게 조금 위에, 좁게 놓는다
      const fe = [0, 1, 2, 3, 4].map((i) => (flask ? [ox + 118 + i * 16, 146 + (i % 2 ? -3 : 3)] : [ox + 110 + i * 20, 160 + (i % 2 ? -4 : 4)]));
      svgEl('path', { d: 'M' + fe.map((p) => p.join(' ')).join(' L'), stroke: '#8b9197', 'stroke-width': 3, fill: 'none' }, svg);
      fe.forEach(([x, y]) => svgEl('circle', { cx: x, cy: y, r: 7, fill: '#5b6168' }, svg));
      return { lcd, slots: fe.map(([x, y], i) => [x, y + (flask || i % 2 ? -14 : 14)]) };
    };
    const L = scene(0, true); const R = scene(380, false);
    L.lcd.textContent = '150.0 g'; R.lcd.textContent = '2.0 g';
    // 막힘: 산소는 처음부터 플라스크 안에 있다 / 열림: 산소는 접시 밖 공기에 있다
    const inside = [[120, 90], [170, 78], [150, 118], [190, 112], [112, 130]].map(([x, y]) => pair(x, y));
    const outside = [[420, 40], [650, 30], [470, 90], [680, 110], [400, 140]].map(([x, y]) => pair(x, y));
    // 막힌 플라스크 바깥에도 공기 속 산소가 있다(들어오지 못한다)
    [[30, 44], [268, 34], [24, 128], [282, 112]].forEach(([x, y]) => pair(x, y));
    await sleep(reduced ? 100 : 500);
    for (let i = 0; i < 5; i++) {
      await Promise.all([move(inside[i], L.slots[i], 420), move(outside[i], R.slots[i], 420)]);
      L.lcd.textContent = '150.0 g';
      R.lcd.textContent = (2.0 + 0.1 * (i + 1)).toFixed(1) + ' g';
    }
    await sleep(reduced ? 100 : 400);
  }


  /* ───────── 완전한 설명: 답안 짜기. 카드를 누르면 앞면(자료)만 붙고, 뜻은 학생이 직접 쓴다 ───────── */
  function shelfCard(id) {
    const c = S.cards[id]; const L = M.links.find((x) => x.data === id);
    return `<div class="card k-${c.kind} look-${c.look || 'slate'} shelf-card ${L ? 'has-back' : ''}" data-card="${id}" tabindex="0"><span>${esc(L ? L.chip.join(' ') : c.text)}</span>${L ? `<button type="button" class="curl-btn" data-back="${id}" aria-label="뒷면 보기"><i class="curl-label">뒷면</i><i class="curl-flap">${ART.cardCorner()}</i></button>` : ''}</div>`;
  }
  async function startCompose(restored = null) {
    S.resumePoint = 'compose';
    setStage('defense');
    S.phase = 'compose';
    S.composeStart = now();
    if (!S.tray.includes('claim')) S.tray.push('claim');
    $('#tray').classList.add('hide-in-compose');
    const b = $('#board');
    b.className = 'board big compose';
    const lenses = S.tray.filter((id) => S.cards[id].kind === 'lens');
    const shelf = `<div class="shelf my-cards"><div class="shelf-h chalk">내 카드</div>${['claim', ...M.links.map((L) => L.data)].map(shelfCard).join('')}</div>`
      + `<div class="shelf"><div class="shelf-h chalk">돋보기</div><div class="lens-shelf">${lenses.map((id) => lensHTML(id, 'act')).join('')}</div></div><div class="back-peek" id="backPeek" hidden></div>`;
    // 혼자 힘으로 쓸 때는 카드 대신 단서 그림만 보여 준다(옮겨 적을 글자가 없게)
    const meet = (svg) => svg.replace('xMidYMid slice', 'xMidYMid meet');
    const gallery = [['cA', meet(ART.miniPhoto('A'))], ['cB', meet(ART.miniPhoto('B'))], ['e1', meet(ART.miniSlide('closed'))], ['e2', meet(ART.miniSlide('open'))], ['e3', meet(ART.miniSlide('ledger'))]]
      .filter(([id]) => S.tray.includes(id))
      .map(([id, svg]) => `<figure class="own-fig">${svg}<figcaption>${esc(M.ownCaptions[id])}</figcaption></figure>`).join('');
    b.innerHTML = `
      <div class="shelves" id="shelves">${shelf}</div>
      <div class="own-gallery" id="ownGallery" aria-label="단서 그림">${gallery}</div>
      <div class="sheet">
        <div class="sheet-q"><b>${esc(M.boardQuestion)}</b>${M.dataLines.map((l) => `<div>${esc(l)}</div>`).join('')}</div>
        <div class="sheet-tools">
          <label class="own"><input type="checkbox" id="ownMode"> 혼자 힘으로 설명하기</label>
          <div class="own-note">${M.ownNote.map(esc).join('<br>')}</div>
          <button type="button" class="hint-book glow" id="hintBook" aria-label="교수의 강의 노트"><span>강의 노트</span></button>
        </div>
        <div class="answer-wrap">
          <textarea id="answer" data-drop="answer" rows="9" maxlength="1500" aria-label="최종 답안"></textarea>
          <div class="hint-note" id="hintNote" hidden></div>
        </div>
        <button type="button" class="chalk-btn" id="finalSubmit" disabled>교수님께 제출</button>
      </div>`;
    $$('#shelves .card').forEach((el) => { bindCard(el); bindPeek(el); });
    // 뒷면 보기: 카드를 누른 것으로 치지 않는다
    $$('#shelves [data-back]').forEach((x) => {
      x.addEventListener('pointerdown', (ev) => ev.stopPropagation());
      x.addEventListener('keydown', (ev) => ev.stopPropagation());
      x.addEventListener('click', () => showBack(x.dataset.back));
      x.addEventListener('mouseenter', () => { $('#cardPeek').hidden = true; }); // 모서리에서는 앞면 문장 말풍선을 띄우지 않는다
    });
    $$('#shelves .lens').forEach((el) => {
      bindPeek(el);
      el.addEventListener('click', () => showLens(el.dataset.card));
      el.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); showLens(el.dataset.card); } });
    });
    const ta = $('#answer');
    S.answerSnapshot = ''; S.answerOrigins = [];
    ta.addEventListener('input', () => {
      S.answerOrigins = RUBRIC.editOrigins(S.answerSnapshot, ta.value, S.answerOrigins);
      S.answerSnapshot = ta.value;
      S.caret = ta.selectionStart;
      $('#backPeek').hidden = true; // 쓰기 시작하면 뒷면이 덮인다
      syncCorners();
      S.lastInput = now(); $('#finalSubmit').disabled = S.submitting || ta.value.trim().length < 1;
      try { if(!API.isExperience) sessionStorage.setItem(finalDraftKey(), ta.value); } catch (err) { /* 저장소를 못 쓰는 브라우저 */ }
    });
    ta.addEventListener('blur', () => { S.caret = ta.selectionStart; });
    // 혼자 힘으로 쓸 때는 붙여넣기와 끌어다 놓기를 막는다
    const noPaste = (e) => { if (!S.ownMode) return; e.preventDefault(); say(M.lines.ownNoPaste); };
    ta.addEventListener('paste', noPaste);
    ta.addEventListener('drop', noPaste);
    $('#ownGallery').addEventListener('copy', (e) => e.preventDefault());
    $('#ownMode').addEventListener('change', (e) => setOwnMode(e.target.checked));
    $('#hintBook').addEventListener('click', onHintBook);
    $('#finalSubmit').addEventListener('click', submitFinal);
    // 판정을 기다리다 창을 새로 고쳤어도, 같은 학생이 이 화면에 다시 오면 쓰던 답이 돌아온다
    let saved = '';
    try { if(!API.isExperience) saved = sessionStorage.getItem(finalDraftKey()) || ''; } catch (err) { /* 저장소를 못 쓰는 브라우저 */ }
    if (restored) saved = restored.text || '';
    if (saved) { ta.value = saved; ta.dispatchEvent(new Event('input')); }
    if(restored){ S.answerOrigins=restored.origins || Array(saved.length).fill('typed');S.answerSnapshot=saved;$('#ownMode').checked=!!restored.ownMode;setOwnMode(!!restored.ownMode); }
    setNote('처음부터 끝까지 설명하기', 'belowProf');
    await say(M.lines.composeAsk, { center: true });
    say(M.lines.hintOpen);
    S.glowKey = 'compose';
    ta.focus();
    waveCorners();
  }
  // 답안 화면이 열리면 뒷면이 있는 카드의 모서리가 차례로 한 번씩 들린다. 커서가 없는 터치 화면에서도 뒷면이 있다는 걸 알린다.
  async function waveCorners() {
    if (reduced) return;
    await sleep(500);
    for (const c of $$('#shelves .card.has-back')) {
      c.classList.add('wave');
      c.addEventListener('animationend', () => c.classList.remove('wave'), { once: true });
      await sleep(260);
    }
  }
  // 뒷면을 열어 둔 카드는 모서리가 들린 채로 남아, 아래 쪽지가 어느 카드의 것인지 보여 준다
  function syncCorners() {
    const p = $('#backPeek');
    $$('#shelves .card.has-back').forEach((c) => c.classList.toggle('peeking', !p.hidden && S.peekKey === c.dataset.card));
  }
  // 왼쪽 아래 자리에 뒷면이나 돋보기 장면을 잠깐 보여 준다. 같은 것을 다시 누르면 닫힌다.
  function showPeek(key, html) {
    const p = $('#backPeek');
    if (!p.hidden && S.peekKey === key) { p.hidden = true; syncCorners(); return; }
    S.peekKey = key;
    p.innerHTML = html;
    p.hidden = false;
    syncCorners();
  }
  function showBack(id) {
    logAttempt({ stage: 'compose', questId: 'backPeek', choice: id });
    showPeek(id, `<small>뒷면 · 쓰기 시작하면 덮여요</small><div class="bp-back">${esc(S.cards[id].back)}</div>`);
  }
  function showLens(id) {
    const c = S.cards[id];
    logAttempt({ stage: 'compose', questId: 'lens', choice: id });
    showPeek(id, `<small>${esc(c.title)}</small><div class="lens bp-lens">${ART.lensScene(c.mode)}</div><div class="bp-note">${esc(c.sentence)}</div>`);
    // 현미경은 상상으로 그려 본 모형이다. 처음 볼 때 한 번만 일러 준다.
    if (!S.modelNoted) { S.modelNoted = true; sysPop(M.system.modelNote, 8000, true); }
  }
  function setOwnMode(on) {
    S.ownMode = on;
    if (on) S.ownEver = true;
    $('#board').classList.toggle('own-on', on);
    updateSession({ ownMode: on });
  }
  function insertCard(id) {
    if (S.phase !== 'compose' || S.ownMode || S.submitting) return;
    const c = S.cards[id];
    if (!c) return;
    const ta = $('#answer');
    const sentence = c.sentence || c.text;
    const pos = Math.max(0, Math.min(S.caret ?? ta.value.length, ta.value.length));
    const before = ta.value.slice(0, pos); const after = ta.value.slice(pos);
    const sep = before && !/\s$/.test(before) ? ' ' : '';
    const tailSep = /^\s/.test(after) ? '' : ' '; // 바로 이어 쓸 수 있게 한 칸 띄운다
    ta.value = before + sep + sentence + tailSep + after;
    S.answerOrigins.splice(pos, 0, ...Array(sep.length).fill('typed'), ...Array(sentence.length).fill(id), ...Array(tailSep.length).fill('typed'));
    S.answerSnapshot = ta.value;
    S.caret = (before + sep + sentence + tailSep).length;
    S.inserted.push(sentence);
    ta.dispatchEvent(new Event('input'));
    ta.focus();
    ta.setSelectionRange(S.caret, S.caret);
    blinkOnce(ta);
    // 앞면이 붙는 순간 교수가 어깨너머로 읽고 묻는다
    if (M.lines.pasteAsk[id]) say(M.lines.pasteAsk[id]);
  }
  function remainingCardSentences(text) { return S.inserted.filter((s) => text.includes(s)); }

  // 강의 노트는 처음부터 떨어져 있다. S.hint는 학생이 실제로 펼쳐 본 쪽수다.
  function onHintBook() {
    const n = $('#hintNote');
    $('#hintBook').classList.remove('glow');
    if (!n.hidden) { n.hidden = true; return; }
    renderHintNote();
  }
  function renderHintNote() {
    const n = $('#hintNote');
    const tabs = S.notePages > 1 ? [1, 2].map((p) => `<button type="button" class="pg ${p === S.noteView ? 'on' : ''}" data-page="${p}">${p}쪽</button>`).join('') : '<span class="pg">1쪽</span>';
    n.innerHTML = `<div class="hn-h">강의 노트 <span class="pgs">${tabs}</span></div>${M.hintNote[S.noteView - 1].map((l) => `<div>${esc(l)}</div>`).join('')}`;
    n.hidden = false;
    $$('[data-page]', n).forEach((b) => b.addEventListener('click', () => { S.noteView = Number(b.dataset.page); renderHintNote(); }));
    if (S.noteView > S.hint) {
      S.hint = S.noteView;
      S.hintAt = new Date().toISOString();
      updateSession({ hintLevel: S.hint, hintReason: '노트 열람', hintAt: S.hintAt });
    }
    logAttempt({ stage: 'compose', questId: 'hintView', choice: String(S.noteView) });
  }
  // 첫 제출이 부족하면 노트가 한 장 넘어간다
  function turnNote() {
    S.notePages = 2;
    S.noteView = 2;
    if (!$('#hintNote').hidden) renderHintNote();
    else $('#hintBook').classList.add('glow');
  }

  // 학생이 교수 대신 꼬투리를 잡는 칠판. 누른 칸의 이름을 돌려준다.
  function pickGap() {
    return new Promise((res) => {
      const box = document.createElement('div');
      box.className = 'board predict-board';
      box.innerHTML = `<div class="chalk pick-title">${esc(M.predictTitle)}</div>${structHTML({ pick: true })}`;
      $('#stage').appendChild(box);
      $$('[data-pick]', box).forEach((b) => b.addEventListener('click', () => { box.remove(); res(b.dataset.pick); }));
    });
  }

  async function submitFinal() {
    if (S.submitting || S.phase !== 'compose') return;
    S.submitting = true;
    const btn = $('#finalSubmit'); btn.disabled = true;
    const ta = $('#answer'); ta.readOnly = true;
    $('#ownMode').disabled = true;
    const label = btn.textContent;
    btn.textContent = '흠…';
    try { await submitFinalInner(); } catch (error) {
      await evaluationFailure(error);
    } finally {
      S.submitting = false;
      ta.readOnly = false; $('#ownMode').disabled = false;
      btn.textContent = label;
      if (document.body.contains(btn)) btn.disabled = S.phase !== 'compose' || ta.value.trim().length < 1;
    }
  }
  async function submitFinalInner() {
    const ta = $('#answer');
    const text = ta.value.trim();
    if (text.length < 1) return;
    const r = await evaluateText('final', text);
    if (r.outcome === 'clarify') {
      logAttempt(Object.assign({ stage: 'compose', questId: 'clarify', input: text, diag: r.diag, pass: false }, judgmentRecord(r)));
      API.flush();
      await say(feedbackLines('final', r.nextQuestion)); return;
    }
    const remain = remainingCardSentences(text);
    const finalAttemptId = logAttempt(Object.assign({ stage: 'compose', questId: 'final', input: text, diag: r.diag, pass: r.pass, elements: r.elements, hint: S.hint, own: S.ownMode, cardSentences: remain.length }, judgmentRecord(r)));
    API.flush();
    // 보완안 5: 첫 제출이 부족하면 교수가 "부족하다"고 먼저 말하고, 학생이 꼬투리 잡힐 곳을 고른다
    let lead = [];
    if (!S.predicted && !r.pass && r.ask !== 'unclear') {
      S.predicted = true;
      await say(M.lines.predictAsk);
      setNote('꼬투리 잡힐 곳 고르기', 'belowProf');
      const choice = await pickGap();
      setNote('처음부터 끝까지 설명하기');
      const match = M.predictOptions[choice].includes(r.ask);
      logAttempt({ stage: 'compose', questId: 'predict', choice, input: r.ask, pass: match });
      updateSession({ selfPredict: choice, selfPredictMatch: match });
      turnNote();
      if (match) { await say(M.lines.predictMatch.concat(M.lines.noteNext, [RUBRIC.STAGES.final.question])); ta.focus(); return; }
      lead = M.lines.predictMiss.concat(M.lines.noteNext);
    }
    if (finalAttemptId) S.lastAnswerAttempt = finalAttemptId;
    S.submits++;
    if (S.submits === 1 || !S.firstSubmitText) { S.firstSubmitText = text; updateSession({ firstSubmitBeforeHint: S.hint === 0 ? text : '', firstSubmitDiag: r.diag }); }
    if (r.pass) { finish('full', text, r); return; }
    if (S.submits >= 3) { finish('partial', text, r); return; }
    const line = feedbackLines('final', r.nextQuestion);
    await say(lead.concat(line));
    setNose(S.nose);
  }

  /* ───────── 클리어 ───────── */
  function aiFeedback(text, r) {
    // 원문을 바꾸지 않고 겹치는 표시를 한 번만 나눈다. 모델 HTML은 사용하지 않는다.
    // 조각마다 어떤 칭찬 항목(data-h)에 속하는지 남겨, 결과 화면에서 항목 순서대로 형광펜을 칠한다.
    const marks = r.highlights;
    const cuts = [...new Set([0, text.length, ...marks.flatMap((h) => [h.start, h.end])])].sort((a, b) => a - b);
    const finalHTML = cuts.slice(0, -1).map((start, i) => {
      const end = cuts[i + 1];
      const ids = marks.map((h, k) => (h.start < end && h.end > start ? k : -1)).filter((k) => k >= 0);
      if (!ids.length) return esc(text.slice(start, end));
      const here = ids.map((k) => marks[k]);
      const isNew = here.some((h) => h.isNew);
      const roles = [...new Set(here.flatMap((h) => h.roles))].join(', ');
      return `<span class="hl ${isNew ? 'new-connection' : ''}" data-h="${ids.join(' ')}" title="${esc(roles + (isNew ? ' · 처음 생각에서 새롭게 발전한 연결' : ' · 잘 드러난 연결'))}">${esc(text.slice(start, end))}</span>`;
    }).join('');
    const praise = marks.map((h) => {
      const source = h.source === 'mixed' ? ' 카드 구절과 직접 쓴 부분이 함께 있어요.' : '';
      const growth = h.isNew ? ' 처음 생각보다 새롭게 드러난 연결이에요.' : '';
      return `“${h.quote}” — ${h.explanation}${source}${growth}`;
    });
    const pops = marks.map((h) => h.explanation + (h.isNew ? ' 처음 생각보다 새롭게 드러난 연결이에요.' : ''));
    return { finalHTML, praise, pops };
  }
  // 결과 화면은 처음 → 지금(글) → 형광펜 항목별 → 피드백 모음 순으로 천천히 드러낸다. 화면을 누르면 다음으로 넘어간다.
  const SUBMIT_LOCK_S = (window.SCIW_CONFIG || {}).DEMO ? 3 : 60; // 발표 시연 모드(js/demo02.js)에서는 기다림을 줄인다
  function revealWait(ms) {
    return new Promise((resolve) => {
      const scr = $('#clearScreen');
      const done = () => { clearTimeout(t); scr.removeEventListener('pointerdown', done); resolve(); };
      const t = setTimeout(done, reduced ? Math.min(ms, 400) : ms);
      scr.addEventListener('pointerdown', done);
    });
  }
  // 편지를 쓰듯 한 글자씩 나타낸다. 글자는 미리 자리를 잡아 두어(투명) 화면이 출렁이지 않는다.
  function prepType(el) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
    const chars = [];
    nodes.forEach((node) => {
      const frag = document.createDocumentFragment();
      Array.from(node.textContent).forEach((c) => {
        if (/\s/.test(c)) { frag.append(c); return; }
        const sp = document.createElement('span'); sp.className = 'ch'; sp.textContent = c;
        frag.append(sp); chars.push(sp);
      });
      node.replaceWith(frag);
    });
    return chars;
  }
  // 화면을 누르면 지금 쓰는 글을 한 번에 마저 보여 준다. 문장 부호 뒤에서는 잠깐 숨을 고른다.
  function typeOut(chars, ms = 40) {
    return new Promise((resolve) => {
      const scr = $('#clearScreen');
      let i = 0; let t;
      const end = () => { clearTimeout(t); scr.removeEventListener('pointerdown', end); chars.forEach((c) => c.classList.add('on')); resolve(); };
      if (reduced || !chars.length) { end(); return; }
      const step = () => {
        if (i >= chars.length) { end(); return; }
        const c = chars[i++]; c.classList.add('on');
        t = setTimeout(step, /[.,?!…”]/.test(c.textContent) ? ms + 220 : ms);
      };
      scr.addEventListener('pointerdown', end);
      step();
    });
  }
  async function revealResult(pops) {
    const wrap = $('#clearScreen .wrap');
    const show = (sel) => wrap.querySelectorAll(sel).forEach((el) => el.classList.add('show'));
    const typed = (sel) => [...wrap.querySelectorAll(sel)].map(prepType);
    const [sayChars] = typed('.top .say');
    const [wasChars] = typed('.col.was p');
    const [nowChars] = typed('.col.now .final');
    const finalEls = [...wrap.querySelectorAll('.rv-final .next-line, .rv-final .praise-title, .rv-final .praise li, .rv-final .reward-label, .rv-final .keyring-reward h3, .rv-final .keyring-reward p, .rv-final .keyring-reward strong')];
    finalEls.forEach((el) => el.classList.add('tw-wait')); // 글머리 점까지 차례가 올 때 나타나게
    const finalChars = finalEls.map(prepType);
    await sleep(30);
    show('.top');
    lockSubmit(); // 60초는 첫 글이 나타나기 시작할 때부터 센다
    await sleep(reduced ? 0 : 500);
    await typeOut(sayChars, 70);
    await revealWait(900);
    show('.col.was');
    await sleep(reduced ? 0 : 500);
    await typeOut(wasChars, 55);
    await revealWait(1200);
    show('.col.now');
    await sleep(reduced ? 0 : 500);
    await typeOut(nowChars, 45);
    await revealWait(1400);
    const col = wrap.querySelector('.col.now');
    const pop = col.querySelector('.hl-pop');
    for (let k = 0; k < pops.length; k++) {
      const segs = [...col.querySelectorAll('.hl')].filter((s) => s.dataset.h.split(' ').includes(String(k)));
      if (!segs.length) continue;
      segs.forEach((s) => s.classList.add('lit'));
      // 피드백 창은 글을 가리지 않게 '지금' 글 바로 아래에 띄우고, 꼬리가 칠한 구절을 가리킨다
      const box = col.getBoundingClientRect();
      const last = [...segs[segs.length - 1].getClientRects()].pop();
      pop.querySelector('.n').textContent = `${k + 1} / ${pops.length}`;
      const tEl = pop.querySelector('.t'); tEl.textContent = pops[k];
      const popChars = prepType(tEl);
      const aim = (last.left + last.right) / 2 - box.left;
      const left = Math.max(12, Math.min(aim - 40, box.width - pop.offsetWidth - 12));
      pop.style.top = `${col.querySelector('.final').getBoundingClientRect().bottom - box.top + 14}px`;
      pop.style.left = `${left}px`;
      pop.style.setProperty('--tail', `${Math.max(14, Math.min(aim - left, pop.offsetWidth - 14))}px`);
      pop.classList.add('show');
      pop.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
      await sleep(reduced ? 0 : 900); // 형광펜이 칠해지는 동안 기다렸다가 쓴다
      await typeOut(popChars, 50);
      await revealWait(2600);
      pop.classList.remove('show');
      await sleep(reduced ? 50 : 350);
    }
    show('.rv-final');
    wrap.querySelector('.rv-final').scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
    for (let i = 0; i < finalEls.length; i++) { finalEls[i].classList.remove('tw-wait'); await typeOut(finalChars[i], 32); }
  }
  function lockSubmit() {
    const btn = $('#submitBtn');
    const until = Date.now() + SUBMIT_LOCK_S * 1000;
    const tick = () => {
      const left = Math.ceil((until - Date.now()) / 1000);
      if (left > 0) {
        btn.querySelector('.lock').textContent = `${left}초 뒤에 낼 수 있어요`;
        btn.style.setProperty('--lock', String(left / SUBMIT_LOCK_S));
        setTimeout(tick, 250);
        return;
      }
      btn.disabled = false;
      btn.querySelector('.lock').textContent = '';
      btn.style.setProperty('--lock', '0');
    };
    tick();
  }
  async function submitToTeacher() {
    const btn = $('#submitBtn');
    btn.disabled = true;
    btn.querySelector('.label').textContent = '제출하는 중…';
    if (S.sessionId) API.updateSession(S.sessionId, { submittedToTeacher: true, submittedAt: new Date().toISOString() }, true);
    API.captureProgress();
    const saved = await API.whenSaved(S.sessionId, 20000);
    if (!saved) {
      btn.disabled = false;
      btn.querySelector('.label').textContent = '저장 다시 시도';
      let notice = $('#submissionSaveNotice');
      if (!notice) { notice = document.createElement('p'); notice.id = 'submissionSaveNotice'; notice.setAttribute('role','status'); btn.after(notice); }
      notice.textContent = '서버 저장을 아직 확인하지 못했어요. 답안은 이 브라우저에 보관 중입니다. 연결을 확인하고 다시 눌러 주세요.';
      return;
    }
    const wrap = $('#clearScreen .wrap');
    wrap.classList.add('submitted');
    wrap.innerHTML = `
      <div class="top show"><div class="professor-art" data-expression="acknowledging"></div>
        <div class="say">${esc(API.isExperience ? '체험을 마쳤어요. 플레이 기록은 저장하지 않았어요.' : M.lines.submitted)}</div></div>
      <div class="btns two show"><button type="button" class="ghost" id="exitBtn">나가기</button><button type="button" id="againBtn">다시하기</button></div>`;
    $('#againBtn').addEventListener('click', () => location.reload());
    $('#exitBtn').addEventListener('click', () => { location.href = '../../index.html'; });
    typeOut(prepType(wrap.querySelector('.say')), 60);
    if (window.SCIW_DEMO) window.SCIW_DEMO.reached('submitted'); // 발표 시연 3은 선생님께 제출하면 끝난다
  }
  function finish(type, text, r, restoring = false) {
    S.resumePoint = 'complete';
    S.resumeResult = {type,text,result:{elements:r.elements,highlights:r.highlights,ask:r.ask,path:r.path}};
    S.phase = 'complete';
    const offset = $('#answer').value.indexOf(text);
    const hasCard = RUBRIC.cardSpans(S.answerOrigins || [], offset, text.length).length > 0;
    const own = S.ownMode && !hasCard && type === 'full';
    if(!restoring) updateSession(Object.assign({ clearType: type, finalAnswer: text, finalJudgment: r.elements, path: r.path || '', ownReward: own, endedAt: new Date().toISOString() }, judgmentRecord(r)), true);
    API.flush();
    const { finalHTML, praise, pops } = aiFeedback(text, r);
    // 게임 중 교수의 nextQuestion과 결과 페이지의 안내 문체를 분리한다.
    const resultNextSteps = {
      W2a: '다음엔 150.0 g이 그대로인 이유를 플라스크 안 산소의 이동과 연결해 보세요.',
      W2b: '다음엔 늘어난 0.5 g이 무엇의 질량인지도 써 보세요.',
      W1b: '다음엔 더해진 물질이 왜 산소인지도 설명해 보세요.',
      W1a: '다음엔 질량이 저절로 생기지 않는다는 원리를 A의 질량 증가와 연결해 보세요.',
      'D-B': '다음엔 막아 둔 플라스크 전체의 측정 결과도 써 보세요.',
      'D-A': '다음엔 실험 A에서 잰 질량과 증가분도 써 보세요.',
      C: '다음엔 강철솜이 무거워진 까닭을 분명히 설명해 보세요.',
      E1: '다음엔 반응을 일으키는 열의 역할과 질량이 더해지는 까닭을 구분해 보세요.',
      E2: '다음엔 산소도 질량이 있다는 점을 반영해 보세요.',
      E3: '다음엔 저울이 재는 범위를 생각하며 질량 보존을 설명해 보세요.',
      E4: '다음엔 새 물질이 생기는 것과 질량이 새로 생기는 것을 구분해 보세요.',
      E5: '다음엔 측정 대상과 전체 질량, 늘어난 부분의 질량을 구분해 보세요.',
      E6: '다음엔 실험 결과와 설명이 서로 맞는지 확인해 보세요.'
    };
    const missLine = type === 'partial' ? (resultNextSteps[r.ask] || '다음엔 숫자가 무슨 뜻인지까지 설명해 보세요.') : '';
    if(!restoring) logAttempt({stage:'compose',questId:'resultFeedback',feedbackText:[type === 'full' ? M.lines.clearFull : M.lines.clearPartial,...praise,...pops,missLine].filter(Boolean),feedbackSource:'result'});
    const first = S.firstAnswer || '(없음)';
    $('#clearScreen .wrap').innerHTML = `
      <div class="top rv"><div class="professor-art" data-expression="${type === 'full' ? 'acknowledging' : 'skeptical'}"></div>
        <div class="say">${esc(type === 'full' ? M.lines.clearFull : M.lines.clearPartial)}</div></div>
      <div class="compare">
        <div class="col was rv"><h3>처음</h3><p>${esc(first)}</p></div>
        <div class="col now rv"><h3>지금</h3><p class="final">${finalHTML}</p><div class="hl-pop" role="status"><span class="n"></span><span class="t"></span></div></div>
      </div>
      <div class="rv rv-final">
        ${type === 'full' ? `<div class="st-mini">${structHTML()}</div><p class="next-line">${esc(M.lines.clearEcho)}</p>` : ''}
        ${praise.length ? `<h3 class="praise-title">교수의 피드백 모음</h3><ul class="praise">${praise.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}
        ${missLine ? `<p class="next-line">${esc(missLine)}</p>` : ''}
        ${own ? `<section class="keyring-reward" aria-label="혼자 힘으로 설명한 연구원에게 주는 강철솜 키링"><img src="assets/steel-wool-keyring.png" width="120" height="180" alt="안경과 나비넥타이를 단 강철솜 키링"><div><div class="reward-label">교수님의 깜짝 선물</div><h3>“카드 없이 해낸 건 인정하지. 이건… 자네가 가지게.”</h3><p>카드 문장에 기대지 않고 자신의 말로 끝까지 설명했어요!</p><strong>나만의 강철솜 키링 획득</strong></div></section>` : '<div class="next-keyring"><span class="key-sil"><img src="assets/steel-wool-silhouette.webp" width="388" height="520" alt="물음표가 그려진 강철솜 키링 실루엣"><span class="qm" aria-hidden="true">?</span></span><p class="next-line">“다음엔 이걸 줄 수도 있겠군.”</p></div>'}
        <div class="btns"><button type="button" id="submitBtn" disabled><span class="label">선생님께 제출하기</span><span class="lock"></span></button></div>
      </div>`;
    $('#submitBtn').addEventListener('click', submitToTeacher);
    if(API.isExperience) $('#submitBtn .label').textContent='체험 마치기';
    setNote('');
    try { if(!API.isExperience) sessionStorage.removeItem(finalDraftKey()); } catch (err) { /* 저장소를 못 쓰는 브라우저 */ }
    const open = () => { $('#clearScreen').hidden = false; $('#clearScreen').scrollTop = 0; revealResult(pops); };
    // 완전 클리어면 마지막 콧대가 꺾이는 것을 보여 준 뒤 결과를 띄운다
    if (type === 'full') {
      (async () => {
        await zoomProf(2);
        setNose(0);
        await sleep(reduced ? 200 : 1400);
        open();
        zoomOut();
      })();
    }
    else open();
  }

  // 이어 하기는 동작/애니메이션 중간이 아니라 마지막 활동 지점에서 복원한다.
  // 상태·원문·카드 삽입 출처는 저장하되 DOM, 타이머, 기체 좌표, 함수는 저장하지 않는다.
  const RESUME_FIELDS = ['done','firstAnswer','firstTag','evidence','claimPick','evAsked','evNudged','errCount','concl','link','linkBoard','notePages','noteView','linkTries','inserted','ownMode','ownEver','hint','hintReason','submits','predicted','nudged','firstSubmitText','tutorial','boardOpen','nose'];
  function progressSnapshot() {
    if(!S.started || !S.resumePoint || S.restoring || S.acquiring) return null;
    const state={}; RESUME_FIELDS.forEach(k=>{if(S[k]!==undefined)state[k]=S[k];});
    state.tray=S.tray.slice();state.scopeBonded={...S.scope.bonded};
    state.cardBacks=Object.fromEntries(Object.entries(S.cards).filter(([,c])=>c.back||c.mis).map(([id,c])=>[id,{back:c.back||'',mis:c.mis||''}]));
    state.claimId=S.claim?.id || null;
    if(S.resumePoint==='complete') state.result=S.resumeResult;
    const draft={reply: !$('#reply').hidden ? ($('#replyText')?.value || '') : ''};
    if(S.resumePoint==='compose'||S.resumePoint==='complete') Object.assign(draft,{text:$('#answer')?.value || '',origins:S.answerOrigins||[],ownMode:S.ownMode});
    return {schema:'student-resume-v1',missionId:M.id,point:S.resumePoint,state,draft};
  }
  function canResume(previous) {
    const p=previous?.checkpoint;
    return !!(p && p.schema==='student-resume-v1' && p.missionId===M.id && p.state && Array.isArray(p.state.tray)
      && ['explore','first','claim','scope','link','combine','compose','complete'].includes(p.point)
      && (p.point!=='complete' || p.state.result?.result?.highlights));
  }
  async function restoreProgress(previous) {
    if(!canResume(previous))throw new Error('이 기록은 이어 할 수 없어요. 새로 하기를 선택해 주세요.');
    const cp=previous.checkpoint, saved=cp.state;
    S.restoring=true;
    S.classCode=previous.classCode; S.studentNo=previous.studentNo; S.sessionId=previous.sessionId;
    RESUME_FIELDS.forEach(k=>{if(saved[k]!==undefined)S[k]=saved[k];});
    S.cards=JSON.parse(JSON.stringify(M.cards));
    if(saved.scopeBonded)for(const k of ['closed','open'])S.scope.bonded[k]=Math.max(0,Math.min(5,Number(saved.scopeBonded[k])||0));
    Object.entries(saved.cardBacks||{}).forEach(([id,c])=>{if(S.cards[id]){S.cards[id].back=String(c.back||'');S.cards[id].mis=String(c.mis||'');}});
    S.claim=M.claimOptions.find(o=>o.id===saved.claimId)||null;
    if(S.claim) S.cards.claim={kind:'claim',title:'내 주장',text:'강철솜이 공기 중의 산소와 결합했다.',sentence:S.claim.text};
    S.tray=saved.tray.filter(id=>!!S.cards[id]);
    S.resumePoint=cp.point; S.started=true;
    API.resumeSession({sessionId:S.sessionId,classCode:S.classCode,studentNo:S.studentNo,missionId:M.id});
    API.watchDrafts(()=>({stage:S.stage}));API.watchProgress(progressSnapshot);
    $('#who').textContent=`${S.classCode} · ${S.studentNo}번 · 이어 하기`;
    $('#startScreen').hidden=true;
    buildBench();renderTray();
    const passed=M.links.filter(l=>S.cards[l.data]?.back).length;
    setNose(cp.point==='complete'?0:['scope','link','combine','compose'].includes(cp.point)?4-passed:(saved.nose??2));fit();
    if(S.done.burnA){$('#numA').textContent='2.5 g';$('#tagA').textContent='2.0 → 2.5 g';}
    if(S.done.burnB){$('#numB').textContent='150.0 g';$('#tagB').textContent='150.0 → 150.0 g';}
    if(S.done.burnB)S.boardOpen=true;
    // 완료한 단서는 획득 연출 중에 종료했더라도 사라지지 않게 한다.
    if(S.done.burnA&&!S.tray.includes('cA'))addCard('cA');
    if(S.done.burnB&&!S.tray.includes('cB'))addCard('cB');
    const draft=cp.draft||{};
    if(cp.point==='explore'){
      setStage('explore');renderSmallBoard();
      glow(S.done.burnB?$('#board'):S.done.burnA?$('#clipB'):$('#flameA'),S.done.burnB?'board':S.done.burnA?'deviceB':'deviceA');
      setNote(S.done.burnB?'칠판을 눌러 내 생각 쓰기':S.done.burnA?'집게를 빨간 단자에 물리기':'불꽃 막대를 강철솜에 대기','topLeft');
    }else if(cp.point==='first'){
      S.stage='explore';S.boardOpen=true;renderSmallBoard();await openClaimFlow(draft.reply||'');
    }else if(cp.point==='claim'){
      setStage('claim'); const evidence=(saved.evidence||[null,null]).slice();
      openClaimBoard();S.evidence=evidence;S.evAsked=!!saved.evAsked;
      if(S.claimPick){$('.claim-opt[data-id="'+S.claimPick+'"]')?.classList.add('on');$('#evRow').hidden=false;}
      renderEvidence();
    }else if(cp.point==='scope'||cp.point==='link'){
      setStage('rebuttal');S.linkBoard=true;$('#noseMeter').hidden=false;renderSmallBoard();
      const i=Number.isInteger(S.link)&&S.link>=0&&S.link<3?S.link:0;S.link=i;
      if(cp.point==='link'&&S.tray.includes(M.links[i].data)){
        enterArena();renderGap(i,'write');setNote('카드 뒷면에 이 숫자의 뜻 쓰기','aboveProf');
        await say(M.lines.writeAsk);linkReply(i,draft.reply||'');
      }else{
        S.scope.locked=false;$('#microscope').classList.add('unlocked');glow($('#microscope'),'scope');setNote('현미경 눌러 열기','topLeft');
      }
    }else{
      setStage('defense');S.linkBoard=true;$('#noseMeter').hidden=false;renderSmallBoard();
      if(cp.point==='combine')await startCombine();
      else{
        await startCompose(draft);
        if(cp.point==='complete') {S.resumeResult=saved.result;finish(saved.result.type,saved.result.text,saved.result.result,true);}
      }
    }
    S.restoring=false;API.captureProgress();
  }

  /* ───────── 시작 ───────── */
  function setupStart() {
    $('#missionTitle').textContent = `${M.label} · ${M.title}`;
    $('#startTag').textContent = M.label;
    $('#startTitle').textContent = M.title;
    window.SciwClassEntry.bindStart((classCode,studentNo,choice)=>start(classCode,studentNo,choice), {
      findSession:(c,n)=>API.findSession(c,n,M.id), canResume:canResume
    });
  }
  // 튜토리얼은 미션 고르기 화면에서 따로 열린다(js/tutorial02.js가 남긴다). 같은 탭의 다음 학생에게 넘어가지 않게 읽으면 지운다.
  function takeTutorialStatus() {
    if(API.isExperience)return;
    try {
      const status = sessionStorage.getItem('sciw_tutorial');
      sessionStorage.removeItem('sciw_tutorial');
      if (status) S.tutorial = status;
    } catch (e) { /* 저장소를 못 쓰면 none으로 남는다 */ }
  }
  async function start(classCode, studentNo, choice = {}) {
    if(choice.mode === 'experience') API.setExperienceMode();
    else if(!window.SciwClassEntry.valid(classCode))return;
    if(choice.previous) return restoreProgress(choice.previous);
    if(!API.isExperience) { try{sessionStorage.removeItem(`sciw_m02_final_${classCode}_${studentNo}`);}catch(_){} }
    S.classCode = classCode; S.studentNo = studentNo;
    S.sessionId = API.uid('s');
    takeTutorialStatus();
    API.startSession({ sessionId: S.sessionId, missionId: M.id, classCode, studentNo, startedAt: new Date().toISOString(), stage: 'explore', tutorial: S.tutorial, missionVersion: 'm02-1.2', eventSchemaVersion: 'm02-events-v2', hintSchemaVersion: 'm02-note-pages-v1', rubricVersion: RUBRIC.VERSION, hintLevel: 0 });
    API.watchDrafts(() => ({stage:S.stage}));
    API.flush();
    $('#who').textContent = API.isExperience ? '체험·심사 모드' : `${classCode} · ${studentNo}번`;
    $('#startScreen').hidden = true;
    S.started = true;
    S.resumePoint = 'explore';
    API.watchProgress(progressSnapshot);
    buildBench();
    renderSmallBoard();
    renderTray();
    setNose(2);
    fit();
    setStage('explore');
    await tareScene();
    await say(M.lines.intro, { center: true });
    glow($('#flameA'), 'deviceA');
    setNote('불꽃 막대를 강철솜에 대기', 'topLeft'); // 시작 장면과 첫 대사가 끝나고, 학생이 조작할 차례가 되어서야 띄운다
  }

  // 시작 장면: 빈 접시를 올린 저울 → TARE를 눌러 0.0 g → 강철솜을 올리면 2.0 g (강철솜만 잰다는 것을 보여 준다)
  async function tareScene() {
    const art = $('#devA .dev-art'); const num = $('#numA');
    art.classList.add('nowool');
    num.textContent = '31.4 g';
    await sleep(reduced ? 200 : 900);
    const btn = art.querySelector('.btn-tare');
    if (btn) btn.classList.add('press');
    await sleep(reduced ? 100 : 350);
    if (btn) btn.classList.remove('press');
    num.textContent = '0.0 g'; blinkOnce(num);
    await sleep(reduced ? 200 : 700);
    art.classList.remove('nowool');
    await sleep(reduced ? 100 : 450);
    await countUp(num, 0, M.devices.A.before, 500);
    blinkOnce(num);
    await sleep(reduced ? 100 : 400);
  }

  if ($('#startForm') && !(window.SCIW_CONFIG || {}).DEMO) setupStart(); // 튜토리얼 페이지와 발표 시연 모드에는 시작 화면이 없다
  setupTrayScroll();
  fit();
  window.__m02 = { S, say, fit, renderTray, setNose, finish }; // 디버그용
  // 튜토리얼(js/tutorial02.js)이 쓰는 화면 부품
  // 발표 시연 모드(js/demo02.js)가 장면을 미리 채울 때 쓰는 부품: buildBench, openGap, askLink, nextGap, startCompose
  window.SCIW_ENGINE02 = { S, M, STAGES, buildBench, openGap, askLink, nextGap, startCompose, $, $$, esc, sleep, reduced, nextFrame, say, sayTap, drawTail, waitTap, sysPop, openReply, closeReply, glow, blinkOnce, setStage, setNose, zoomProf, zoomOut, fit, acquire, renderTray, renderSmallBoard, renderEvidence, flameDrag, enterArena, exitArena, renderGap, closeScope, setNote };
})();
