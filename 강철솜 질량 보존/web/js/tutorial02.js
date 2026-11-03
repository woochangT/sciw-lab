/*
 * 튜토리얼 흐름 — 미션 02 앞에서 여는 연습 한 판 (tutorial.html)
 * 흐름: 실험실의 규칙 → 숫자는 측정기도 읽는다 → 실 잡아 보기 → 칠판에 올리기 → 제멋대로 읽기 → 현미경 다녀오기 → 뒷면 채우기 → 콧대 꺾기 → 오늘의 사건으로
 * 본 게임 엔진(game02.js)의 화면 부품을 그대로 쓴다. 이 페이지는 따로 뜨는 창이므로 M과 S를 고쳐도 본 게임에 섞이지 않는다.
 * 세션을 시작하지 않으므로 엔진의 기록 함수는 아무것도 남기지 않는다. 대사와 수치는 missions/tutorial02.js에 있다.
 */
(function () {
  const { S, M, STAGES, $, $$, esc, sleep, reduced, nextFrame, say, sayTap, drawTail, waitTap, sysPop, openReply, closeReply, glow, blinkOnce, setStage, setNose, zoomProf, zoomOut, fit, acquire, renderTray, renderSmallBoard, renderEvidence, flameDrag, enterArena, exitArena, renderGap, closeScope } = window.SCIW_ENGINE02;
  const T = window.SCIW_TUTORIAL02;
  const ART = window.SCIW_ART02;
  const L = T.lines;
  const until = async (ok) => { while (!ok()) await sleep(80); };
  // 칠판의 빈 자리(장면 좌표 y): 증거·뜻·주장 칸 위, 네 단계 칸 아래
  const CHAIN_TALK_TOP = 170;
  const MAP_TALK_TOP = 330;

  // 끝까지 보면 미션 02 시작 화면으로, 건너뛰면 미션 고르기 화면으로 간다. 시청 여부는 본 게임이 세션을 시작할 때 읽어 간다.
  function leave(status) {
    try {
      // 끝까지 본 기록은 건너뛰기로 덮어쓰지 않는다
      if (sessionStorage.getItem('sciw_tutorial') !== 'done') sessionStorage.setItem('sciw_tutorial', status);
    } catch (e) { /* 저장소를 못 쓰면 기록 없이 넘어간다 */ }
    location.href = (status === 'done' ? 'index.html' : '../../index.html') + location.search;
  }

  // 답장 카드에서 고른 것을 돌려준다. after는 카드가 열린 뒤에 부른다.
  function ask(cfg) {
    return new Promise((resolve) => {
      openReply(Object.assign({}, cfg, { onSubmit: ({ choice }) => { closeReply(); resolve(choice); } }));
      if (cfg.after) cfg.after();
    });
  }
  // 칠판을 가리키는 말: 말풍선이 커지며 칠판의 빈 자리로 옮겨 가고, 꼬리는 교수 입에 남는다. 누르면 넘어간다.
  async function sayOnBoard(lines, top) {
    const b = $('#bubble');
    await say(lines);
    b.style.top = `${top}px`;
    b.classList.add('on-board');
    $('#bubbleTail').classList.add('on');
    const t0 = Date.now();
    do { drawTail(); await sleep(16); } while (!reduced && Date.now() - t0 < 560);
    drawTail();
    b.classList.add('has-more');
    await waitTap();
    b.classList.remove('has-more', 'on-board');
    b.style.top = '';
    $('#bubbleTail').classList.remove('on');
  }
  // 시스템의 말: 읽을 시간을 주고, 누르면 바로 넘어간다
  async function sysTap(lines) {
    const shown = sysPop(lines, 7000, true);
    await waitTap(6500);
    const el = $('#sysPop');
    if (el.onclick) el.onclick();
    await shown;
  }

  /* ───────── 손으로 실 잡기: 본 게임의 불꽃 막대와 같은 손놀림 ───────── */
  // 2초쯤 잡고 있다가 떼면 끝난다. 일찍 떼면 다시 잡게 한다.
  function holdString(el, key, opts) {
    return new Promise((resolve) => {
      const NEED = 2000;
      let held = 0; let ready = false; let finished = false;
      const letGo = () => {
        opts.contact(false);
        if (ready) { finished = true; resolve(); return; }
        if (held > 0) say(L.tooShort);
        held = 0;
      };
      flameDrag(el, {
        enabled: () => !finished,
        near: opts.near,
        tick: (dt, near) => {
          if (finished) return;
          if (!near) { if (held > 0) letGo(); return; }
          opts.contact(true);
          held += dt;
          if (!ready && held >= NEED) { ready = true; say(L.letGo); }
        },
        release: () => {
          if (finished) return;
          letGo();
          if (!finished) glow(el, key);
        }
      });
      glow(el, key);
    });
  }

  /* ───────── 실험대: 실 전화기 ───────── */
  function buildBench() {
    $('#bench').innerHTML = `
      <div class="t-phone" id="tPhone">${ART.stringPhone()}</div>
      <div class="scale-win t-lcd" id="tLcd"><span class="lbl">${esc(T.meterLabel)}</span><span class="num" id="tNum">${T.sound.open} dB</span></div>
      <div class="flame-tool hand-tool" id="tHand" role="button" tabindex="0" aria-label="손">${ART.hand()}</div>
      <button type="button" class="thing" id="microscope" aria-label="마법 현미경">${ART.microscope()}<span class="lock" aria-hidden="true"></span></button>`;
    $('#microscope').addEventListener('click', () => {
      if (!S.tScopeOpen) { const m = $('#microscope'); m.classList.remove('shake'); void m.offsetWidth; m.classList.add('shake'); return; }
      S.tScopeOpen = false;
      S.tScopeGo();
    });
  }
  // 측정기 숫자는 목표값을 향해 움직인다
  function meter(show) {
    const m = { level: T.sound.open, target: T.sound.open, stop() { clearInterval(timer); } };
    const timer = setInterval(() => {
      m.level = reduced ? m.target : m.level + (m.target - m.level) * 0.2;
      if (Math.abs(m.target - m.level) < 0.5) m.level = m.target;
      show(m.level);
    }, 40);
    return m;
  }
  async function phoneExperiment() {
    const box = $('#tPhone');
    const m = meter((v) => { $('#tNum').textContent = `${Math.round(v)} dB`; });
    await holdString($('#tHand'), 'hand', {
      near: (x, y) => {
        const r = $('#tString').getBoundingClientRect();
        return x > r.left + 30 && x < r.right - 30 && Math.abs(y - r.top) < 40 * S.scale;
      },
      contact: (on) => { m.target = on ? T.sound.held : T.sound.open; box.classList.toggle('quiet', on); }
    });
    await until(() => m.level === T.sound.open);
    m.stop();
    await sleep(reduced ? 100 : 400);
    await new Promise((resolve) => acquire(['tA'], resolve, box));
  }

  /* ───────── 칠판 ───────── */
  // 증거 · 뜻 · 주장. 뜻이 비어 있으면 빈틈이 드러나고, 채워지면 세 칸이 이어진다.
  function renderChain(filled) {
    const b = $('#board');
    b.className = 'board big';
    b.onclick = null;
    b.innerHTML = `
      <div class="chalk q">${esc(T.boardQuestion)}</div>
      <div class="t-chain">
        <div class="t-node d"><small>증거</small>${esc(T.evidenceShort)}</div>
        <div class="t-arrow">→</div>
        <div class="t-node ${filled ? 'w' : 'gap'}"><small>뜻</small>${filled ? esc(T.meaningShort) : '?'}</div>
        <div class="t-arrow">→</div>
        <div class="t-node c"><small>주장</small>${esc(T.claimShort)}</div>
      </div>`;
  }
  async function openClaim() {
    setStage('claim');
    await say(L.ask, { center: true });
    await ask({ choices: [{ id: 'claim', text: T.claimVoice }], instant: true, underBoard: true });
    S.claim = { text: T.claim };
    const b = $('#board');
    b.className = 'board big';
    b.innerHTML = `
      <div class="chalk q">${esc(T.boardQuestion)}</div>
      <div class="chalk claim">→ ${esc(T.claim)}</div>
      <div class="ev-row one"><div class="ev-slot" data-drop="ev0" tabindex="0" role="button" aria-label="근거 칸"></div></div>`;
    S.evidence = [null];
    renderEvidence();
    await say(L.askCard);
    glow($('#trayCards [data-card="tA"]'), 'card');
    await until(() => S.evidence[0]);
    glow(null);
    await sleep(reduced ? 100 : 500);
  }

  /* ───────── 제멋대로 읽기 ───────── */
  async function misread() {
    setStage('rebuttal');
    renderTray();
    $('#stage').classList.add('spot');
    renderChain(false);
    await sayOnBoard(L.noVibration, CHAIN_TALK_TOP);
    enterArena();
    renderGap(0, 'blank');
    await sayTap(L.blank);
    S.cards.tA.mis = T.link.mis;
    renderGap(0, 'mis');
    renderTray();
    await say(L.mis);
    await ask({ choices: [{ id: 'no', text: T.protest }], instant: true });
    await sayTap(L.obvious);
    await sysTap(T.system.red);
  }

  /* ───────── 현미경: 실의 떨림 모형 ───────── */
  const N = 26; const X0 = 175; const X1 = 610; const Y = 150; const AMP = 24; const REST = 1.5;
  const beadX = (i) => X0 + ((X1 - X0) * i) / (N - 1);
  function openPhoneScope() {
    return new Promise((resolve) => {
      S.tScopeGo = async () => {
        glow(null);
        $('#bench').hidden = true;
        $('#board').hidden = true;
        const sc = $('#scope');
        sc.hidden = false;
        sc.innerHTML = `
          <div class="scope-frame">
            <div class="scope-strip">${esc(T.scopeStrip)}</div>
            <div class="scope-view" id="scopeView">
              <svg id="tWave" viewBox="0 0 760 470" aria-label="실의 떨림 모형">${ART.phoneModel(X0, X1, Y)}<polyline id="tThread" fill="none" stroke="#e6c77a" stroke-width="3"/>${Array.from({ length: N }, (_, i) => `<circle class="t-bead" data-i="${i}" r="7" cx="${beadX(i).toFixed(1)}" cy="${Y}"/>`).join('')}</svg>
              <div class="sc-mass look t-gauge">
                <small>${esc(T.meterLabel)}</small>
                <div class="sc-num"><b id="tScNum">${T.sound.open} dB</b></div>
                <div class="gauge" aria-hidden="true"><i id="gBase" style="width:100%"></i></div>
                <div class="gauge-scale"><span>0 dB</span><span>${T.sound.open} dB</span></div>
              </div>
              <div class="flame-tool hand-tool in-scope" id="tHandS" role="button" tabindex="0" aria-label="손">${ART.hand()}</div>
            </div>
            <div class="engrave">${esc(T.scopeNote)}</div>
          </div>`;
        await waveModel();
        S.tLoop = false;
        await new Promise((res) => acquire(['tL'], res));
        closeScope();
        resolve();
      };
    });
  }
  // 왼쪽 컵에서 시작한 떨림이 실을 따라간다. 손을 대면 그 자리에서 멈추고 너머는 잠잠해지며, 떼면 다시 이어진다.
  async function waveModel() {
    const svg = $('#tWave');
    const beads = $$('.t-bead', svg); const thread = $('#tThread'); const arcs = $('#tModelArcs');
    const amp = Array(N).fill(AMP);
    let block = null; let spot = 0; let front = N; let t = 0; let level = T.sound.open;
    S.tLoop = true;
    const frame = () => {
      if (!S.tLoop) return;
      if (!reduced) t += 0.016;
      front = block === null ? Math.min(N, front + (reduced ? N : 0.3)) : Math.min(front, block);
      const pts = beads.map((c, i) => {
        amp[i] += ((i <= front ? AMP : REST) - amp[i]) * (reduced ? 1 : 0.14);
        const y = i === block ? Y : Y + amp[i] * Math.sin(t * 9 - i * 0.7);
        c.setAttribute('cy', y.toFixed(1));
        return `${beadX(i).toFixed(1)},${y.toFixed(1)}`;
      });
      thread.setAttribute('points', pts.join(' '));
      const k = (amp[N - 1] - REST) / (AMP - REST);
      level = T.sound.held + (T.sound.open - T.sound.held) * Math.max(0, k);
      $('#tScNum').textContent = `${Math.round(level)} dB`;
      $('#gBase').style.width = `${(level / T.sound.open) * 100}%`;
      arcs.style.opacity = (0.15 + 0.85 * Math.max(0, k)).toFixed(2);
      nextFrame(frame);
    };
    frame();
    await say(L.scopeDo, { center: true });
    await holdString($('#tHandS'), 'handS', {
      near: (x, y) => {
        const pt = svg.createSVGPoint(); pt.x = x; pt.y = y;
        const p = pt.matrixTransform(svg.getScreenCTM().inverse());
        spot = Math.max(1, Math.min(N - 2, Math.round(((p.x - X0) / (X1 - X0)) * (N - 1))));
        return p.x > X0 && p.x < X1 && Math.abs(p.y - Y) < 60;
      },
      contact: (on) => { block = on ? spot : null; }
    });
    await until(() => Math.round(level) >= T.sound.open);
    await sleep(reduced ? 100 : 400);
  }

  /* ───────── 뒷면 채우기 ───────── */
  async function writeBack() {
    S.lensOn = null;
    enterArena();
    renderGap(0, 'write');
    await say(L.writeAsk);
    glow($('#lensRow .lens'), 'lens');
    await until(() => S.lensOn);
    glow(null);
    await sleep(reduced ? 300 : 2200);
    const options = T.options.slice().sort(() => Math.random() - 0.5);
    const tried = new Set();
    for (;;) {
      const id = await ask({
        frame: { pre: T.frame.starter.trim(), post: T.frame.ending },
        choices: options,
        send: '말하기',
        after: () => $$('#reply .r-choice').forEach((x) => { if (tried.has(x.dataset.id)) { x.disabled = true; x.classList.add('tried'); } })
      });
      const opt = options.find((o) => o.id === id);
      if (opt.pass) { S.cards.tA.back = `${opt.text}는 뜻이다.`; return; }
      tried.add(id);
      await say(opt.reply);
    }
  }

  /* ───────── 콧대 꺾기 ───────── */
  async function pressNose() {
    renderGap(0, 'done');
    renderTray();
    await sayTap(M.lines.pass);
    await zoomProf(1.7);
    $('#noseMeter').hidden = false;
    setNose(3);
    await sleep(reduced ? 200 : 1300);
    await zoomOut();
    await sysTap(M.system.press);
    exitArena();
    renderChain(true);
    await sayOnBoard(L.written, CHAIN_TALK_TOP);
  }

  /* ───────── 오늘의 사건으로 ───────── */
  async function toMission() {
    setNose(4);
    const b = $('#board');
    b.className = 'board big';
    b.innerHTML = `
      <div class="t-map">${T.map.map((m, i) => `<div class="t-step" data-i="${i}"><b>${i + 1}</b><strong>${esc(m.name)}</strong><span>${esc(m.line)}</span></div>`).join('')}</div>
      <div class="t-tease" id="tTease" hidden><span class="t-wool"><img src="assets/steel-wool-silhouette.webp" alt="" width="388" height="520"></span><div class="chalk">${esc(T.tease)}</div></div>
      <button type="button" class="chalk-btn" id="tGo" hidden>${esc(T.goLabel)}</button>`;
    for (let i = 0; i < T.map.length; i++) {
      setStage(T.map[i].stage);
      $(`.t-step[data-i="${i}"]`).classList.add('on');
      await sleep(reduced ? 100 : 750);
    }
    await sayOnBoard(L.outro, MAP_TALK_TOP);
    $('#tTease').hidden = false;
    await say(L.last);
    const go = $('#tGo');
    go.hidden = false;
    go.addEventListener('click', () => leave('done'));
    glow(go, 'goLab');
  }

  /* ───────── 시작 ───────── */
  async function run() {
    Object.assign(S.cards, T.cards);
    M.links = [T.link];
    M.boardQuestion = T.boardQuestion;
    M.boardLinksTitle = T.boardLinksTitle;
    M.claimShort = T.claimShort;
    M.system.lensHint = T.system.lensHint;
    Object.assign(M.lines.nudge, T.nudge);
    STAGES.T1 = { starter: T.frame.starter, ending: T.frame.ending };

    $('#missionTitle').textContent = T.label;
    $('#tSkip').addEventListener('click', () => leave('skipped'));
    S.nose = 4;
    $('#prof').dataset.expression = 'proud';
    setNose(4);
    fit();
    S.started = true;
    renderTray();

    // 1. 실험실의 규칙
    await say(L.rule, { center: true });
    // 2. 숫자는 측정기도 읽는다
    buildBench();
    blinkOnce($('#tLcd'));
    await say(L.role, { center: true });
    // 3. 실 잡아 보기
    setStage('explore');
    renderSmallBoard();
    await say(L.tryIt, { center: true });
    await phoneExperiment();
    await say(L.toBoard);
    // 4. 칠판에 올리기
    await new Promise((resolve) => {
      const b = $('#board');
      b.onclick = () => { b.onclick = null; glow(null); resolve(); };
      glow(b, 'board');
    });
    await openClaim();
    // 5. 제멋대로 읽기
    await misread();
    // 6. 현미경 다녀오기
    exitArena();
    S.linkBoard = true;
    S.link = 0;
    renderSmallBoard();
    await say(L.toScope, { center: true });
    $('#microscope').classList.add('unlocked');
    S.tScopeOpen = true;
    glow($('#microscope'), 'scope');
    await openPhoneScope();
    await sysTap(T.system.model);
    // 7. 뒷면 채우기
    await writeBack();
    // 8. 콧대 꺾기
    await pressNose();
    // 9. 오늘의 사건으로
    await toMission();
  }

  if (document.readyState === 'complete') run();
  else window.addEventListener('load', run);
})();
