/*
 * 게임 엔진 — 미션 02 「늘어난 강철솜」
 * 흐름: 탐색 → 주장(처음 답 직접 쓰기 + 고르기) → 반박(현미경 Q1~Q3) → 결론 합치기 → 변론(분류 → 답안 짜기) → 클리어
 * 화면 규칙: 가운데 지시문 없음. 다음 물건은 세 번 깜빡인 뒤 빛 테두리로 남고, 할 말은 교수 머리 위 말풍선이 한다.
 * 장면은 1280×640 크기로 그리고 화면에 맞게 줄여 보여 준다.
 */
(function () {
  const M = window.SCIW_MISSIONS.m02;
  const J = window.SCIW_JUDGE02;
  const API = window.SCIW_API;
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
    scope: { mode: 'closed', bonded: { closed: 0, open: 0 }, locked: true },
    sortFirst: {}, sortPlaced: {}, inserted: [], ownMode: false, ownEver: false,
    hint: 0, hintReason: '', submits: 0, predicted: false, cardsOnlyWarned: false,
    composeStart: 0, lastInput: now(), glowKey: null, nudged: {}, sel: null, times: {}, firstSubmitText: ''
  };

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
    $('#prof').dataset.expression = expr(S.nose);
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
  let sayToken = 0;
  async function say(lines, opts = {}) {
    const my = ++sayToken;
    const arr = pick(lines).slice();
    const pages = [];
    for (let i = 0; i < arr.length; i += 2) pages.push(arr.slice(i, i + 2));
    const bubble = $('#bubble');
    for (let p = 0; p < pages.length; p++) {
      if (my !== sayToken) return;
      bubble.querySelector('.body').innerHTML = pages[p].map((l) => `<p>${esc(l)}</p>`).join('');
      bubble.classList.add('show');
      bubble.classList.remove('pop'); void bubble.offsetWidth; bubble.classList.add('pop');
      const more = p < pages.length - 1;
      bubble.classList.toggle('has-more', more);
      if (more) await waitTap();
    }
    placeReply();
  }
  // 답장 카드는 교수 얼굴을 가리지 않게 교수 아래 책상 쪽에 둔다 (위치는 CSS의 bottom)
  function placeReply() {}
  function waitTap() {
    return new Promise((resolve) => {
      const c = $('#catcher');
      c.hidden = false;
      const done = () => { c.hidden = true; c.removeEventListener('pointerdown', done); window.removeEventListener('keydown', key); resolve(); };
      const key = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); done(); } };
      setTimeout(() => { c.addEventListener('pointerdown', done); window.addEventListener('keydown', key); }, 250);
    });
  }

  /* ───────── 답장 카드 (교수 말풍선 바로 아래) ───────── */
  function openReply(cfg) {
    const box = $('#reply');
    let html = '';
    if (cfg.choices) {
      html += `<div class="r-choices" role="radiogroup">${cfg.choices.map((c) => `<button type="button" class="r-choice" data-id="${c.id}">${esc(c.text)}</button>`).join('')}</div>`;
    }
    if (cfg.text && cfg.line) {
      html += `<div class="r-text"><input id="replyText" type="text" maxlength="200" autocomplete="off" aria-label="교수님께 답하기" value="${esc(cfg.starter || '')}"></div>`;
    } else if (cfg.text) {
      html += `<div class="r-text"><textarea id="replyText" rows="${cfg.rows || 3}" maxlength="400" aria-label="교수님께 답하기">${esc(cfg.starter || '')}</textarea></div>`;
    }
    html += `<button type="button" class="r-send" id="replySend" disabled ${cfg.instant ? 'hidden' : ''}>${esc(cfg.send || '교수님께 말하기')}</button>`;
    box.innerHTML = html;
    box.hidden = false;
    placeReply();
    box.classList.remove('pop'); void box.offsetWidth; box.classList.add('pop');
    let choice = null;
    const send = $('#replySend');
    const ta = $('#replyText');
    const ready = () => {
      const tOk = !cfg.text || (ta.value.replace(cfg.starter || '', '').trim().length >= 2);
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
      if (cfg.line) ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing && !send.disabled) { e.preventDefault(); finish(); } });
      setTimeout(() => { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }, 60);
    }
    let finished = false;
    function finish() {
      if (finished) return;
      finished = true;
      const text = ta ? ta.value.trim() : '';
      cfg.onSubmit({ choice, text });
    }
    send.addEventListener('click', finish);
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
    if (!S.glowKey || !S.started || !$('#catcher').hidden) return;
    const idle = now() - S.lastInput;
    const key = S.glowKey;
    // 12초 동안 아무것도 안 하면 한마디. 계속 막혀 있으면 20초마다 다시 한다.
    if (idle > 12000 && now() - (S.nudged[key] || 0) > 20000 && M.lines.nudge[key]) {
      S.nudged[key] = now();
      // 반박 중에는 교수의 말(단서를 댈 곳)을 지우지 않고 한 줄만 덧붙인다
      if (key === 'debate') { if (!$('#bubble .nudge-line')) $('#bubble .body').insertAdjacentHTML('beforeend', `<p class="nudge-line">${esc(M.lines.nudge.debate[0])}</p>`); }
      else say(M.lines.nudge[key]);
    }
  }, 1000);
  ['pointerdown', 'keydown'].forEach((ev) => window.addEventListener(ev, () => { S.lastInput = now(); }, true));

  function setNote() { /* 화면 설명 글을 쓰지 않는다. 할 일은 교수 대사와 깜빡임으로만 알린다 */ }

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
  function updateSession(fields) { if (S.sessionId) API.updateSession(S.sessionId, fields); }
  // 시트(Apps Script) 열 이름에 맞춘다: diag→diagnosis, hint→hintLevel, elements→judgment. 나머지 값은 extra 열에 모인다.
  function logAttempt(o) {
    if (!S.sessionId) return;
    const { diag, hint, elements, ...rest } = o;
    const a = Object.assign({ attemptId: API.uid('a'), sessionId: S.sessionId, missionId: M.id, classCode: S.classCode, studentNo: S.studentNo, createdAt: new Date().toISOString() }, rest);
    if (diag !== undefined) a.diagnosis = diag;
    if (hint !== undefined) a.hintLevel = hint;
    if (elements !== undefined) a.judgment = elements;
    API.logAttempt(a);
  }

  /* ───────── 카드 ───────── */
  // 단서는 그 증거의 모양으로 보인다: 실험 결과는 장치 사진, 현미경 결과는 관찰 슬라이드,
  // 학생이 쓴 결론은 손글씨 메모, 주장은 작은 칠판
  function cardHTML(id, extra = '') {
    const c = S.cards[id];
    const look = c.look || ({ concl: 'memo', claim: 'slate', model: 'lens' }[c.kind]) || 'note';
    const title = c.title ? `<b>${esc(c.title)}</b>` : '';
    const pic = look === 'photo' ? `<div class="pic">${ART.miniPhoto(c.art)}</div>` : look === 'slide' ? `<div class="pic">${ART.miniSlide(c.art)}</div>` : '';
    return `<div class="card k-${c.kind} look-${look} ${extra}" data-card="${id}" tabindex="0">${pic}${title}<span>${esc(c.text)}</span></div>`;
  }
  function renderTray() {
    const box = $('#trayCards');
    // 변론에서 칸에 놓은 카드는 수집함에서 뺀다.
    const ids = S.tray.filter((id) => !(S.stage === 'defense' && S.placedOut && S.placedOut.has(id)));
    box.innerHTML = ids.map((id) => cardHTML(id, S.dimmed && S.dimmed.has(id) ? 'dim' : '')).join('');
    $$('.card', box).forEach((el) => { bindCard(el); bindPeek(el); });
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
      peek.innerHTML = `${c.title ? `<b>${esc(c.title)}</b>` : ''}${esc(c.text)}`;
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
    if (S.arena) renderDeck();
    const target = S.arena ? $(`#arenaDeck [data-card="${id}"]`) : $(`#trayCards [data-card="${id}"]`);
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
    $$('.card').forEach((c) => c.classList.remove('selected'));
    $$('[data-drop]').forEach((d) => d.classList.remove('can-drop'));
    if (where.startsWith('ev')) dropEvidence(id, Number(where.slice(2)));
    else if (where.startsWith('cmb')) dropCombine(id, where);
    else if (where.startsWith('col-')) dropSort(id, where.slice(4), el);
    else if (where === 'answer') insertCard(id);
    else if (where.startsWith('weak-')) debateHit(id, Number(where.slice(5)));
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
    let html = `<div class="chalk q">${esc(M.boardQuestion)}</div>`;
    if (S.firstAnswer) html += `<div class="chalk first">${esc(S.firstAnswer)}</div>`;
    if (S.claim) html += `<div class="chalk claim">→ ${esc(S.claim.text)}</div>`;
    b.innerHTML = html;
    b.onclick = S.stage === 'explore' && S.boardOpen ? openClaimFlow : null;
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

  // 불꽃 막대 끌기: 누르고 있는 동안 따라오고, 놓으면 제자리로 돌아간다.
  // opts.near(clientX, clientY) → 불꽃 끝이 대상 가까이 있는가, opts.tick(dt, near) → 매 프레임, opts.release()
  function flameDrag(el, opts) {
    const holder = el.parentElement;
    const home = { left: el.style.left, top: el.style.top };
    let held = false; let last = 0; let tip = null;
    const place = (e) => {
      const r = holder.getBoundingClientRect();
      const x = (e.clientX - r.left) / S.scale; const y = (e.clientY - r.top) / S.scale;
      el.style.left = (x - el.offsetWidth / 2) + 'px';
      el.style.top = (y - 6) + 'px'; // 불꽃 끝이 포인터 바로 위에 오게
      tip = { x: e.clientX, y: e.clientY };
    };
    const frame = (t) => {
      if (!held) return;
      const dt = last ? Math.min(100, t - last) : 0; last = t;
      const near = tip ? opts.near(tip.x, tip.y) : false;
      el.classList.toggle('touching', near);
      opts.tick(dt, near);
      nextFrame(frame);
    };
    el.addEventListener('pointerdown', (e) => {
      if (opts.enabled && !opts.enabled()) { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); return; }
      e.preventDefault();
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* 합성 이벤트 */ }
      held = true; last = 0;
      el.classList.add('held');
      glow(null);
      S.lastInput = now();
      place(e);
      nextFrame(frame);
    });
    el.addEventListener('pointermove', (e) => { if (held) { place(e); S.lastInput = now(); } });
    const up = () => {
      if (!held) return;
      held = false; tip = null;
      el.classList.remove('held', 'touching');
      el.style.left = home.left; el.style.top = home.top;
      if (opts.release) opts.release();
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }
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
    acquire(['cA'], async () => { await say(M.lines.afterA); glow($('#clipB'), 'deviceB'); setNote('플라스크도 태우기'); });
  }

  // 집게: 끌어서 전원 장치 빨간 단자 가까이 놓으면 물리고(전류가 흐름), 다시 끌면 떨어진다.
  // o.container 기준 좌표(장면 단위). o.from() 전선이 나오는 자리, o.terminal() 빨간 단자, o.home() 놓여 있는 자리
  function makeClip(o) {
    let held = false; let connected = false;
    const local = (e) => { const r = o.container.getBoundingClientRect(); return [(e.clientX - r.left) / S.scale, (e.clientY - r.top) / S.scale]; };
    const draw = (p) => {
      const [x0, y0] = o.from(); const sag = Math.max(30, Math.abs(p[0] - x0) * 0.4);
      o.path.setAttribute('d', `M${x0} ${y0} C ${x0 + 40} ${y0 + sag}, ${p[0] - 10} ${p[1] + sag * 0.6}, ${p[0] - 18} ${p[1]}`);
    };
    const at = (p) => { o.el.style.left = (p[0] - 22) + 'px'; o.el.style.top = (p[1] - 13) + 'px'; draw(p); };
    const set = (on) => { connected = on; o.el.classList.toggle('connected', on); o.power.classList.toggle('on', on); o.onChange(on); };
    o.el.addEventListener('pointerdown', (e) => {
      if (o.enabled && !o.enabled()) { o.el.classList.remove('shake'); void o.el.offsetWidth; o.el.classList.add('shake'); if (o.denied) o.denied(); return; }
      e.preventDefault();
      try { o.el.setPointerCapture(e.pointerId); } catch (err) { /* 합성 이벤트 */ }
      held = true; glow(null);
      if (connected) set(false);
      o.el.classList.add('held');
      at(local(e));
    });
    o.el.addEventListener('pointermove', (e) => { if (held) { at(local(e)); S.lastInput = now(); } });
    const up = (e) => {
      if (!held) return;
      held = false; o.el.classList.remove('held');
      const p = local(e); const t = o.terminal();
      if (Math.hypot(p[0] - t[0], p[1] - t[1]) < 34) { at(t); set(true); } else { at(o.home()); }
    };
    o.el.addEventListener('pointerup', up);
    o.el.addEventListener('pointercancel', up);
    at(o.home());
    return { reset() { held = false; if (connected) set(false); at(o.home()); }, get connected() { return connected; } };
  }
  // 전원 장치 그림 속 빨간 단자의 위치(그 그림의 28/110, 8/80 지점)
  function terminalOf(powerEl, container) {
    const r = powerEl.getBoundingClientRect(); const c = container.getBoundingClientRect();
    return [(r.left + r.width * 0.255 - c.left) / S.scale, (r.top + r.height * 0.1 - c.top) / S.scale];
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
      enabled: () => S.stage === 'explore' && !S.done.burnB && S.done.burnA,
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
      await say(M.lines.afterB); S.boardOpen = true; renderSmallBoard(); setNote('칠판에 내 생각 쓰기');
      glow($('#board'), 'board');
    });
  }

  // 단서 획득: 카드가 화면 가운데로 날아들어 도장이 찍힌 뒤 수집함으로 간다. 누르면 바로 넘어간다.
  function acquire(ids, after) {
    const ov = document.createElement('div');
    ov.className = 'acquire';
    ov.innerHTML = `<div class="acq-cards">${ids.map((id) => cardHTML(id, 'big acq')).join('')}</div><div class="acq-stamp">단서 획득</div>`;
    document.body.appendChild(ov);
    logAttempt({ stage: S.stage, questId: 'acquire', input: ids.join('+') });
    let done = false;
    const finish = () => {
      if (done) return; done = true;
      const els = $$('.card', ov);
      ids.forEach((id, i) => addCard(id, els[i]));
      ov.classList.add('out');
      setTimeout(() => ov.remove(), 300);
      if (after) after();
    };
    ov.addEventListener('pointerdown', finish);
    setTimeout(finish, reduced ? 900 : 1700);
  }

  function onMicroscope() {
    if (S.scope.locked) { const m = $('#microscope'); m.classList.remove('shake'); void m.offsetWidth; m.classList.add('shake'); return; }
    openScope();
  }

  /* ───────── 2. 주장 (보완안 1: 처음 답을 학생이 직접 쓴다) ───────── */
  async function openClaimFlow() {
    if (S.stage !== 'explore' || !S.boardOpen) return;
    setStage('claim');
    $('#board').onclick = null;
    glow(null);
    setNote('내 생각 말하기');
    await say(M.lines.firstAsk);
    openReply({
      text: true, rows: 3, send: '교수님께 말하기',
      onSubmit: async ({ text }) => {
        S.firstAnswer = text;
        S.firstTag = J.tagFirst(text);
        closeReply();
        logAttempt({ stage: 'claim', questId: 'first', input: text, diag: S.firstTag });
        updateSession({ firstAnswer: text, firstError: S.firstTag });
        renderSmallBoard();
        await say(M.lines.firstThanks);
        openClaimBoard();
      }
    });
  }

  function openClaimBoard() {
    const b = $('#board');
    b.className = 'board big';
    b.innerHTML = `
      <div class="chalk q">${esc(M.boardQuestion)}</div>
      <div class="chalk first">${esc(S.firstAnswer)}</div>
      <div class="claim-opts">${M.claimOptions.map((o) => `<button type="button" class="claim-opt" data-id="${o.id}">${esc(o.text)}</button>`).join('')}</div>
      <div class="ev-row"><div class="ev-slot" data-drop="ev0" tabindex="0" role="button" aria-label="근거 칸 1"></div><div class="ev-slot" data-drop="ev1" tabindex="0" role="button" aria-label="근거 칸 2"></div></div>
      <button type="button" class="chalk-btn" id="claimSubmit" disabled>교수님께 제출</button>`;
    $$('.claim-opt', b).forEach((x) => x.addEventListener('click', () => {
      S.claimPick = x.dataset.id;
      $$('.claim-opt', b).forEach((y) => y.classList.toggle('on', y === x));
      updateClaimSubmit();
    }));
    $('#claimSubmit').addEventListener('click', submitClaim);
    S.evidence = [null, null];
    renderEvidence();
    setNote('까닭 고르고 근거 올리기');
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
      slot.innerHTML = id ? `<div class="mini k-${S.cards[id].kind}">${esc(S.cards[id].text)}</div>` : '';
      slot.classList.toggle('filled', !!id);
    });
    updateClaimSubmit();
  }
  function updateClaimSubmit() {
    const btn = $('#claimSubmit');
    if (!btn) return;
    const ok = S.claimPick && S.evidence.every(Boolean);
    btn.disabled = !ok;
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
      blinkOnce($('#trayCards [data-card="cB"]'));
      return;
    }
    S.claim = opt;
    S.cards.claim = { kind: 'claim', col: 'event', title: '내 주장', text: '강철솜이 공기 중의 산소와 결합했다.', sentence: opt.text.replace('때문이다.', '때문이다.') };
    updateSession({ claim: opt.id, evidence: evKey, evidenceTag: evTag });
    startRebuttal();
  }

  /* ───────── 3. 반박 ───────── */
  async function startRebuttal() {
    setStage('rebuttal');
    renderSmallBoard();
    renderTray();
    $('#stage').classList.add('spot');
    setNote('강철솜이 스스로 무거워질까?');
    // 교수 얼굴로 다가가 콧대가 솟는 것을 보여 준 뒤 반박을 건다
    await zoomProf(2.2);
    setNose(4);
    await sleep(reduced ? 200 : 1200);
    await zoomOut();
    await say(M.lines.rebuttal);
    S.scope.locked = false;
    $('#microscope').classList.add('unlocked');
    glow($('#microscope'), 'scope');
  }

  // 현미경 원자 모형: 산소는 떠다니고, 학생이 불꽃을 강철솜에 대고 있는 동안 가까운 산소부터 하나씩 철에 붙는다.
  // 저울 숫자와 '점선 안 원자'는 원자가 점선을 넘나드는 그 순간에 바뀐다.
  const FE = [[238, 318], [262, 302], [286, 320], [310, 303], [334, 319], [358, 304]];
  const N_O = 5; // 산소 분자(원자 두 개짜리) 5개. 하나 붙을 때마다 0.1 g (모형용 예시, 화면 대사에서는 개수와 무게를 잇지 않는다)
  const BOND = FE.slice(0, N_O).map(([x, y], i) => [x + (i % 2 ? 4 : -4), y + (i % 2 ? -19 : 19)]);
  const WOOL = [298, 312];
  const BOX = { closed: { x: 140, y: 34, w: 320, h: 344 }, open: { x: 196, y: 268, w: 208, h: 92 } };
  const BULB = { cx: 300, cy: 228, rx: 108, ry: 86 };
  const AIR = { x1: 30, y1: 30, x2: 570, y2: 340 };

  function openScope() {
    glow(null);
    $('#bench').hidden = true;
    $('#board').hidden = true;
    const sc = $('#scope');
    sc.hidden = false;
    sc.innerHTML = `
      <div class="scope-frame">
        <div class="scope-view" id="scopeView">
          <svg id="atoms" viewBox="0 0 600 440" aria-label="강철솜과 산소 원자 모형"></svg>
          <svg class="scope-wires" aria-hidden="true"><path id="scopeWire"/></svg>
          <div class="count" id="count"></div>
          <div class="flame-tool in-scope" id="flameS" role="button" tabindex="0" aria-label="불꽃 막대">${ART.torch()}</div>
          <div class="power in-scope" id="scopePower">${ART.power()}</div>
          <div class="scale-win big on-balance" id="scopeWin"><span class="lbl"></span><span class="num"></span><span class="tag"></span></div>
          <div class="clip-tool" id="clipS" role="button" tabindex="0" aria-label="전선 집게">${ART.clip()}</div>
        </div>
        <div class="scope-base">
          <button type="button" class="dev-btn small" id="scopeReset">다시 하기</button>
        </div>
        <div class="engrave">실제 관찰 영상이 아닌 개념 모형 · 원자 수는 예시</div>
      </div>`;
    $('#scopeReset').addEventListener('click', () => {
      if (S.ox.some((a) => a.state === 'moving')) return;
      S.scope.bonded[S.scope.mode] = 0; drawAtoms(); logAttempt({ stage: 'rebuttal', questId: 'reset-' + S.scope.mode });
    });
    setupFlameS();
    drawAtoms();
    setupClipS();
    S.scopeLoop = true;
    nextFrame(scopeFrame);
    if (!S.round) startRound1();
  }
  function closeScope() {
    S.scopeLoop = false;
    clearInterval(S.clipTimer);
    $('#scope').hidden = true;
    $('#bench').hidden = false;
    $('#board').hidden = false;
  }

  function svgEl(tag, attrs, parent) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attrs || {}).forEach(([k, v]) => el.setAttribute(k, v));
    if (parent) parent.appendChild(el);
    return el;
  }
  function atom(svg, x, y, type) {
    const g = svgEl('g', { class: 'atom ' + type, transform: `translate(${x} ${y})` }, svg);
    const r = type === 'fe' ? 12 : 8;
    const col = type === 'fe' ? '#5b6168' : type === 'o' ? '#e2553a' : '#3f7fd6';
    // 철은 원자 하나, 공기 중의 산소·질소는 원자 두 개가 붙은 분자로 그린다
    const xs = type === 'fe' ? [0] : [-6.5, 6.5];
    xs.forEach((cx) => {
      svgEl('circle', { cx, r, fill: col, stroke: '#00000033', 'stroke-width': 1.5 }, g);
      svgEl('circle', { r: r * 0.35, cx: cx - r * 0.35, cy: -r * 0.35, fill: '#fff', opacity: 0.45 }, g);
    });
    return { g, x, y, vx: 0, vy: 0, type, state: 'free' };
  }
  function setAt(a, x, y) { a.x = x; a.y = y; a.g.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`); }
  function inBox(p, b) { return p[0] > b.x && p[0] < b.x + b.w && p[1] > b.y && p[1] < b.y + b.h; }

  // 떠다니는 자리: 막힘이면 플라스크 몸통 안, 열림이면 점선 밖 공기
  function randomSpot(mode, rnd) {
    for (let i = 0; i < 50; i++) {
      if (mode === 'closed') {
        const a = rnd() * Math.PI * 2; const r = Math.sqrt(rnd()) * 0.8;
        const p = [BULB.cx + Math.cos(a) * BULB.rx * r, BULB.cy - 10 + Math.sin(a) * BULB.ry * r * 0.8];
        if (p[1] < 280) return p;
      } else {
        const p = [AIR.x1 + rnd() * (AIR.x2 - AIR.x1), AIR.y1 + rnd() * (AIR.y2 - AIR.y1)];
        if (!inBox(p, { x: BOX.open.x - 30, y: BOX.open.y - 40, w: BOX.open.w + 60, h: BOX.open.h + 60 })) return p;
      }
    }
    return mode === 'closed' ? [BULB.cx, BULB.cy] : [80, 80];
  }

  function drawAtoms() {
    const svg = $('#atoms');
    svg.innerHTML = '';
    const mode = S.scope.mode; const box = BOX[mode];
    let seed = mode === 'closed' ? 5 : 17;
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    svgEl('rect', { id: 'balBody', x: 140, y: 374, width: 320, height: 40, rx: 8, fill: '#d9dcd7', stroke: '#9a9e98', 'stroke-width': 1.5 }, svg);
    svgEl('rect', { x: 290, y: 360, width: 20, height: 16, fill: '#a8b0b3' }, svg);
    svgEl('ellipse', { cx: 300, cy: 360, rx: 112, ry: 12, fill: '#cfd6d9', stroke: '#7f878b', 'stroke-width': 1.2 }, svg);
    svgEl('ellipse', { cx: 300, cy: 346, rx: 96, ry: 12, fill: '#f6f4ef', stroke: '#c9c4b8', 'stroke-width': 1.5 }, svg);
    if (mode === 'closed') svgEl('path', { d: 'M266 58 L266 120 Q160 160 168 250 Q178 340 300 342 Q422 340 432 250 Q440 160 334 120 L334 58 Z', fill: 'rgba(214,240,246,.22)', stroke: '#d7eef2', 'stroke-width': 3 }, svg);
    svgEl('path', { d: 'M' + FE.map((p) => p.join(' ')).join(' L'), stroke: '#8b9197', 'stroke-width': 4, fill: 'none', 'stroke-linecap': 'round', opacity: 0.7 }, svg);
    if (mode === 'closed') svgEl('path', { d: 'M290 46 L290 300 M310 46 L310 300', stroke: '#b9872f', 'stroke-width': 2 }, svg);
    svgEl('rect', { x: box.x, y: box.y, width: box.w, height: box.h, rx: 14, fill: 'none', stroke: '#fff7d6', 'stroke-width': 2.5, 'stroke-dasharray': '9 7' }, svg);
    const lbl = svgEl('text', { x: box.x + 10, y: box.y - 8, fill: '#fff7d6', 'font-size': 15 }, svg);
    lbl.textContent = '저울이 재는 범위';
    const sp = svgEl('g', { id: 'woolSparks', class: 'scope-sparks' }, svg);
    // 타는 동안: 강철솜 위로 일렁이는 불꽃, 막힘이면 전극 끝 사이의 전기 불꽃
    sp.insertAdjacentHTML('beforeend', ART.flames(WOOL[0], WOOL[1] - 4, 90, 46));
    if (mode === 'closed') svgEl('path', { class: 'fx-arc', d: 'M290 300 l5 -7 l4 9 l5 -8 l4 8 l2 -2', stroke: '#fffbe0', 'stroke-width': 3, fill: 'none', 'stroke-linejoin': 'round' }, sp);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      svgEl('path', { d: `M${WOOL[0] + Math.cos(a) * 30} ${WOOL[1] + Math.sin(a) * 18} L${WOOL[0] + Math.cos(a) * 52} ${WOOL[1] + Math.sin(a) * 30}`, stroke: i % 2 ? '#ffd36b' : '#ff8a3d', 'stroke-width': 3, 'stroke-linecap': 'round' }, sp);
    }
    S.fe = FE.map((p) => atom(svg, p[0], p[1], 'fe'));
    const nb = S.scope.bonded[mode];
    S.ox = [];
    for (let i = 0; i < N_O; i++) {
      if (i < nb) { const a = atom(svg, BOND[i][0], BOND[i][1], 'o'); a.state = 'bonded'; S.ox.push(a); } else { const p = randomSpot(mode, rnd); S.ox.push(atom(svg, p[0], p[1], 'o')); }
    }
    S.nx = mode === 'open' ? [0, 1, 2, 3].map(() => { const p = randomSpot('open', rnd); return atom(svg, p[0], p[1], 'n'); }) : [];
    const st = mode === 'closed' ? { x: 262, y: 34, r: 0 } : { x: 60, y: 352, r: -14 };
    const stopper = svgEl('g', { class: 'stopper', id: 'stopper', transform: `translate(${st.x} ${st.y}) rotate(${st.r})`, tabindex: 0, role: 'button', 'aria-label': mode === 'closed' ? '마개 열기' : '마개 막기' }, svg);
    svgEl('rect', { x: 0, y: 0, width: 76, height: 28, rx: 6, fill: '#6b4630', stroke: '#2f1d12', 'stroke-width': 2 }, stopper);
    svgEl('rect', { x: 6, y: 4, width: 64, height: 6, rx: 3, fill: '#8d6044' }, stopper);
    stopper.addEventListener('click', toggleStopper);
    stopper.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleStopper(); } });
    // 막힘이면 불꽃 대신 전기(집게), 열림이면 불꽃
    const closed = mode === 'closed';
    $('#flameS').hidden = closed;
    $('#scopePower').hidden = !closed; $('#clipS').hidden = !closed; $('.scope-wires').style.display = closed ? '' : 'none';
    if (S.clipS) S.clipS.reset();
    readings();
    placeScopeWin();
  }
  // 현미경 저울 액정은 그림 속 저울 몸체 위에 겹친다 (산소가 붙는 접시 바로 아래)
  function placeScopeWin() {
    const body = $('#balBody'); const view = $('#scopeView'); const win = $('#scopeWin');
    if (!body || !view || !win) return;
    const b = body.getBoundingClientRect(); const v = view.getBoundingClientRect();
    const w = win.offsetWidth; const h = win.offsetHeight;
    win.style.left = ((b.left - v.left) / S.scale + (b.width / S.scale - w) / 2) + 'px';
    win.style.top = ((b.top - v.top) / S.scale + (b.height / S.scale - h) / 2) + 'px';
  }

  // 저울 창과 '점선 안 원자'를 지금 원자 위치로 다시 센다
  function readings() {
    const mode = S.scope.mode; const b = BOX[mode];
    const oPairsIn = S.ox.filter((a) => inBox([a.x, a.y], b)).length;
    const oIn = oPairsIn * 2; // 표에는 산소 원자 수
    const feIn = FE.filter((p) => inBox(p, b)).length;
    const d = mode === 'closed' ? M.devices.B : M.devices.A;
    const value = mode === 'closed' ? d.before : d.before + 0.1 * oPairsIn;
    const win = $('#scopeWin');
    win.querySelector('.lbl').textContent = d.label;
    const num = win.querySelector('.num');
    const txt = value.toFixed(1) + ' g';
    if (num.textContent && num.textContent !== txt) blinkOnce(num);
    num.textContent = txt;
    const delta = value - d.before;
    win.querySelector('.tag').textContent = S.scope.bonded[mode] ? (delta > 0.001 ? '+' + delta.toFixed(1) + ' g' : '변화 없음') : '';
    const el = $('#count');
    el.style.left = ((b.x + b.w) / 600 * 100) + '%';
    el.style.top = (b.y / 440 * 100) + '%';
    el.innerHTML = `<div><i class="dot fe"></i>철 ${feIn}</div><div><i class="dot o"></i>산소 ${oIn}</div>` + (mode === 'open' ? '<div class="ct-n"><i class="dot n"></i>질소</div>' : '');
  }

  function scopeFrame() {
    if (!S.scopeLoop) return;
    const mode = S.scope.mode;
    const drift = (a) => {
      if (a.state !== 'free') return;
      a.vx = (a.vx + (Math.random() - 0.5) * 0.25) * 0.96; a.vy = (a.vy + (Math.random() - 0.5) * 0.25) * 0.96;
      let x = a.x + a.vx; let y = a.y + a.vy;
      if (mode === 'closed') {
        const dx = (x - BULB.cx) / (BULB.rx * 0.85); const dy = (y - BULB.cy) / (BULB.ry * 0.85);
        if (dx * dx + dy * dy > 1 || y > 285) { a.vx *= -1; a.vy *= -1; x = a.x; y = a.y; }
      } else {
        if (x < AIR.x1 || x > AIR.x2) { a.vx *= -1; x = a.x; }
        if (y < AIR.y1 || y > AIR.y2) { a.vy *= -1; y = a.y; }
        const pad = { x: BOX.open.x - 20, y: BOX.open.y - 30, w: BOX.open.w + 40, h: BOX.open.h + 50 };
        if (inBox([x, y], pad)) { a.vx *= -1; a.vy *= -1; x = a.x; y = a.y; }
      }
      setAt(a, x, y);
    };
    S.ox.forEach(drift); S.nx.forEach(drift);
    nextFrame(scopeFrame);
  }

  function tweenAtom(a, to, ms) {
    return new Promise((res) => {
      const from = [a.x, a.y]; const t0 = performance.now();
      const step = (t) => {
        const k = reduced ? 1 : Math.min(1, (t - t0) / ms); const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        setAt(a, from[0] + (to[0] - from[0]) * e, from[1] + (to[1] - from[1]) * e);
        readings();
        if (k < 1) nextFrame(step); else res();
      };
      nextFrame(step);
    });
  }

  // 열림: 불꽃을 강철솜에 대고 있는 동안 0.7초마다 가까운 산소 하나가 철에 붙는다
  function setupFlameS() {
    const el = $('#flameS');
    let acc = 0;
    flameDrag(el, {
      near: (x, y) => {
        const svg = $('#atoms'); const pt = svg.createSVGPoint(); pt.x = x; pt.y = y;
        const p = pt.matrixTransform(svg.getScreenCTM().inverse());
        return Math.hypot(p.x - WOOL[0], p.y - WOOL[1]) < 80;
      },
      tick: (dt, near) => {
        const sp = $('#woolSparks'); if (sp) sp.classList.toggle('on', near);
        if (!near) { acc = 0; return; }
        acc += dt;
        if (acc >= 700) { acc = 0; bondOne(); }
      },
      release: () => { const sp = $('#woolSparks'); if (sp) sp.classList.remove('on'); acc = 0; }
    });
  }
  // 막힘: 집게를 빨간 단자에 물려 둔 동안 0.7초마다 하나씩 붙는다
  function setupClipS() {
    const view = $('#scopeView');
    const stopperTop = () => {
      const svg = $('#atoms'); const m = svg.getScreenCTM(); const r = view.getBoundingClientRect();
      return [(m.a * 300 + m.e - r.left) / S.scale, (m.d * 40 + m.f - r.top) / S.scale];
    };
    S.clipS = makeClip({
      el: $('#clipS'), container: view, path: $('#scopeWire'), power: $('#scopePower'),
      from: stopperTop,
      terminal: () => terminalOf($('#scopePower'), view),
      home: () => { const t = terminalOf($('#scopePower'), view); return [t[0] - 10, t[1] + 92]; },
      onChange: (on) => {
        clearInterval(S.clipTimer);
        const sp = $('#woolSparks'); if (sp) sp.classList.toggle('on', on);
        if (!on) return;
        S.clipTimer = setInterval(() => { if (S.scope.mode === 'closed') bondOne(); }, 700);
      }
    });
  }
  async function bondOne() {
    const mode = S.scope.mode;
    const free = S.ox.filter((a) => a.state === 'free');
    if (!free.length) return;
    free.sort((p, q) => Math.hypot(p.x - WOOL[0], p.y - WOOL[1]) - Math.hypot(q.x - WOOL[0], q.y - WOOL[1]));
    const a = free[0];
    const slot = S.ox.filter((o) => o.state !== 'free').length;
    a.state = 'moving';
    await tweenAtom(a, BOND[slot], 700);
    if (S.scope.mode !== mode) return;
    a.state = 'bonded';
    S.scope.bonded[mode] = S.ox.filter((o) => o.state === 'bonded').length;
    readings();
    if (S.scope.bonded[mode] === N_O) {
      logAttempt({ stage: 'rebuttal', questId: 'burn-' + mode });
      if (mode === 'closed') { clearInterval(S.clipTimer); const sp = $('#woolSparks'); if (sp) sp.classList.remove('on'); }
      if (S.onAllBonded) S.onAllBonded(mode);
    }
  }

  async function toggleStopper() {
    if (!S.canToggle || S.ox.some((a) => a.state === 'moving')) { const s = $('#stopper'); if (s) blinkOnce(s); return; }
    clearInterval(S.clipTimer);
    S.scope.mode = S.scope.mode === 'closed' ? 'open' : 'closed';
    logAttempt({ stage: 'rebuttal', questId: 'stopper', choice: S.scope.mode });
    S.stopperToggles = (S.stopperToggles || 0) + 1;
    drawAtoms();
    if (S.onToggle) S.onToggle(S.scope.mode);
  }

  function questErr(qid, diag) {
    const k = qid + ':' + diag;
    S.errCount[k] = (S.errCount[k] || 0) + 1;
    return S.errCount[k];
  }
  function toSentence(t) { t = t.trim(); return /[.!?]$/.test(t) ? t : t + '.'; }

  /* ───────── 반박 라운드: 조사 → 새 단서 → 교수 말 속 틀린 곳에 단서를 댄다 → 한 줄 이유 ───────── */
  // 라운드 1 · 막아 두고 태워 본다 → "스스로 무거워졌다 / 열이 무게를 더했다"를 반박
  async function startRound1() {
    S.round = 1;
    S.canToggle = false;
    setNote('막은 채로 전기 점화');
    await say(M.lines.r1Do);
    glow($('#clipS'), 'clip');
    S.onAllBonded = async (mode) => {
      if (mode !== 'closed') return;
      S.onAllBonded = null;
      await sleep(500);
      acquire(['e1'], () => debate(0));
    };
  }
  // 라운드 2 · 열어 두고 태워 본다 → "산소는 무게가 없다 / 안에서 생겼다"를 반박
  async function startRound2() {
    S.round = 2;
    setNote('마개 열고 불꽃 대기');
    await say(M.lines.r2Do);
    S.canToggle = true;
    glow($('#stopper'), 'stopper');
    S.onToggle = (mode) => { if (mode === 'open' && S.scope.bonded.open < N_O) glow($('#flameS'), 'flame'); };
    S.onAllBonded = async (mode) => {
      if (mode !== 'open') return;
      S.onAllBonded = null; S.onToggle = null;
      await sleep(500);
      acquire(['e2'], () => debate(1));
    };
  }

  // 교수가 말을 늘어놓는다. 색이 들어간 곳 중 틀린 말에 단서 카드를 끌어다 댄다. 시간 제한은 없다.
  /* 반박 화면: 실험대·현미경·수집함을 걷어 내고, 커진 말풍선과 단서 줄만 남긴다. 라운드가 끝나면 돌아간다. */
  function renderDeck() {
    const box = $('#arenaDeck');
    box.innerHTML = S.tray.map((id) => cardHTML(id, 'deck-card')).join('');
    $$('.card', box).forEach((el) => { bindCard(el); bindPeek(el); });
  }
  function enterArena() {
    if (S.arena) return;
    S.arena = true;
    glow(null);
    renderDeck();
    $('#arena').setAttribute('aria-hidden', 'false');
    document.body.classList.add('arena');
  }
  function exitArena() {
    if (!S.arena) return;
    S.arena = false;
    $('#arenaDeck').classList.remove('call');
    $('#arena').setAttribute('aria-hidden', 'true');
    document.body.classList.remove('arena');
  }

  async function debate(i) {
    const R = M.debates[i];
    enterArena();
    // 라운드 첫 시작에만 한마디(intro)를 하고, 탭하면 교수의 추측이 뜬다
    if (R.intro && !(S.debate && S.debate.i === i)) {
      S.debate = null;
      await say(R.intro);
      $('#bubble').classList.add('has-more');
      await waitTap();
      $('#bubble').classList.remove('has-more');
    }
    const tries = S.debate && S.debate.i === i ? S.debate.tries : 0;
    S.debate = { i, tries };
    setNote('틀린 말에 단서 대기');
    const bubble = $('#bubble');
    sayToken++;
    bubble.classList.add('show', 'debate');
    bubble.classList.remove('has-more');
    bubble.querySelector('.body').innerHTML = R.lines.map((l, li) => {
      const html = esc(l.text).replace(/\{(.+?)\}/, (m, w) => `<span class="weak" data-drop="weak-${li}" tabindex="0" role="button">${w}</span>`);
      return `<p>${html}</p>`;
    }).join('');
    placeReply();
    bubble.classList.remove('pop'); void bubble.offsetWidth; bubble.classList.add('pop');
    S.glowKey = 'debate';
    $('#arenaDeck').classList.add('call');
  }
  async function debateHit(cardId, li) {
    if (!S.debate) return;
    const R = M.debates[S.debate.i]; const line = R.lines[li];
    S.debate.tries++;
    const ok = line.refute && line.refute.includes(cardId);
    logAttempt({ stage: 'rebuttal', questId: 'debate' + (S.debate.i + 1), choice: li + ':' + cardId, pass: ok });
    const weakEl = $(`[data-drop="weak-${li}"]`);
    if (!ok) {
      if (weakEl) { weakEl.classList.remove('shake'); void weakEl.offsetWidth; weakEl.classList.add('shake'); }
      const back = line.trueLine || (R.cardLines && R.cardLines[cardId]) || M.lines.debateMiss;
      await say(back);
      await sleep(reduced ? 200 : 1400);
      if (S.debate) debate(S.debate.i);
      return;
    }
    const i = S.debate.i; const tries = S.debate.tries;
    S.debate = null;
    $('#arenaDeck').classList.remove('call');
    S.glowKey = null;
    $('#bubble').classList.remove('debate');
    if (weakEl) weakEl.classList.add('broken');
    blinkOnce($('#stage'));
    updateSession({ ['debate' + (i + 1) + 'Tries']: tries });
    await sleep(reduced ? 100 : 700);
    await say(line.hit || R.hit);
    whyReply(i);
  }
  // 반박한 뒤 "왜 이 단서가 저 말을 뒤집나?"를 한 줄로. 이 한 줄이 결론 카드가 된다.
  function whyReply(i) {
    const R = M.debates[i];
    openReply({
      line: true, text: true, starter: R.starter || '', send: '말하기',
      onSubmit: async ({ text }) => {
        const qid = R.quest;
        const r = qid === 'Q1' ? J.judgeQ1(text) : qid === 'Q2' ? J.judgeQ2('outside', text) : J.judgeQ3(text);
        logAttempt({ stage: 'rebuttal', questId: qid, input: text, diag: r.diag, pass: r.pass });
        closeReply();
        if (!r.pass) { await react(qid, r.diag); whyReply(i); return; }
        const id = 'c' + (i + 1);
        let sentence = toSentence(text);
        if (i === 0) sentence = toSentence('마개를 막고 태웠을 때 ' + text);
        if (i === 1) sentence = toSentence(text.replace(/^그\s*산소(는|들은)\s*/, '접시에서 강철솜에 붙은 산소는 '));
        S.concl[id] = sentence;
        S.cards[id] = { kind: 'concl', col: 'mean', title: `결론 ${'①②③'[i]}`, text: sentence, sentence };
        await passQuest(id);
        // 2라운드 다음은 곧바로 3라운드라 반박 화면을 유지한다
        if (i === 0) { exitArena(); startRound2(); }
        else if (i === 1) { setNote('다시 반박하기'); debate(2); }
        else { exitArena(); startCombine(); }
      }
    });
  }

  async function react(qid, diag) {
    const L = M.questLines[qid];
    if (diag === 'unclear') { await say(M.lines.unclear); return; }
    const n = questErr(qid, diag);
    let line = L[diag] || L.miss;
    if (n >= 3) line = line.concat([M.lines.stuck[qid]]);
    else if (n >= 2) line = line.concat([M.lines.retry[qid]]);
    await say(line);
  }

  // 반박을 통과하면 콧대가 한 칸 꺾인다. 교수 그림이 바뀌는 단계면 얼굴로 다가가 보여 준다.
  async function passQuest(conclId) {
    const changes = expr(S.nose - 1) !== expr(S.nose);
    if (changes) await zoomProf(1.7);
    setNose(S.nose - 1);
    if (changes) { await sleep(reduced ? 200 : 1100); await zoomOut(); }
    await say(M.lines.pass);
    addCard(conclId, $('#reply'));
    // 인정하는 한마디를 읽을 수 있게 탭할 때까지 둔다
    $('#bubble').classList.add('has-more');
    await waitTap();
    $('#bubble').classList.remove('has-more');
  }

  /* ───────── 결론 합치기 ───────── */
  async function startCombine() {
    S.q = null;
    closeScope();
    $('#stage').classList.remove('spot');
    const b = $('#board');
    b.className = 'board big';
    b.innerHTML = `<div class="chalk q">늘어난 0.5 g 풀어 보기</div>
      <div class="cmb-row"><div class="cmb-slot" data-drop="cmb1" tabindex="0" role="button" aria-label="결론 칸 1"></div><div class="cmb-slot" data-drop="cmb3" tabindex="0" role="button" aria-label="결론 칸 2"></div></div>
      <svg id="bars" viewBox="0 0 700 230" aria-hidden="true"></svg>`;
    S.combine = {};
    setNote('두 결론을 칠판에');
    await say(M.lines.combine);
    ['c1', 'c3'].forEach((id) => { const el = $(`#trayCards [data-card="${id}"]`); if (el) el.classList.add('glow'); });
    S.glowKey = 'tray';
  }
  function dropCombine(id, where) {
    if (!S.combine) return;
    if (id !== 'c1' && id !== 'c3') { say(['그 카드 말고, 결론 카드 ①과 ③일세.']); return; }
    if (Object.values(S.combine).includes(id)) return;
    S.combine[where] = id;
    const slot = $(`[data-drop="${where}"]`);
    slot.innerHTML = `<div class="mini k-concl">${esc(S.cards[id].text)}</div>`;
    slot.classList.add('filled');
    const el = $(`#trayCards [data-card="${id}"]`); if (el) el.classList.remove('glow');
    if (Object.values(S.combine).length === 2) drawBars();
  }
  // 결론 합치기: 막대 대신 두 실험의 작은 장면을 나란히. 산소 분자가 실제로 움직이고 저울 숫자가 함께 바뀐다.
  async function drawBars() {
    S.combine = null;
    glow(null);
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
      const fe = [0, 1, 2, 3, 4].map((i) => [ox + 110 + i * 20, 160 + (i % 2 ? -4 : 4)]);
      svgEl('path', { d: 'M' + fe.map((p) => p.join(' ')).join(' L'), stroke: '#8b9197', 'stroke-width': 3, fill: 'none' }, svg);
      fe.forEach(([x, y]) => svgEl('circle', { cx: x, cy: y, r: 7, fill: '#5b6168' }, svg));
      return { lcd, slots: fe.map(([x, y], i) => [x, y + (i % 2 ? -14 : 14)]) };
    };
    const L = scene(0, true); const R = scene(380, false);
    L.lcd.textContent = '150.0 g'; R.lcd.textContent = '2.0 g';
    // 막힘: 산소는 처음부터 플라스크 안에 있다 / 열림: 산소는 접시 밖 공기에 있다
    const inside = [[120, 90], [170, 78], [150, 118], [190, 112], [112, 130]].map(([x, y]) => pair(x, y));
    const outside = [[420, 40], [650, 30], [470, 90], [680, 110], [400, 140]].map(([x, y]) => pair(x, y));
    await sleep(reduced ? 100 : 500);
    for (let i = 0; i < 5; i++) {
      await Promise.all([move(inside[i], L.slots[i], 420), move(outside[i], R.slots[i], 420)]);
      L.lcd.textContent = '150.0 g';
      R.lcd.textContent = (2.0 + 0.1 * (i + 1)).toFixed(1) + ' g';
    }
    await sleep(reduced ? 100 : 400);
    logAttempt({ stage: 'rebuttal', questId: 'combine', pass: true });
    // 두 장면을 충분히 볼 수 있게 탭할 때까지 칠판을 그대로 둔다
    await say(M.lines.combineDone);
    $('#bubble').classList.add('has-more');
    await waitTap();
    $('#bubble').classList.remove('has-more');
    startSort();
  }

  /* ───────── 4. 변론 ① 카드 나누기 (보완안 3: 분필 칸 이름) ───────── */
  async function startSort() {
    setStage('defense');
    S.phase = 'sort';
    S.sortIds = ['cA', 'cB', 'e1', 'e2', 'c1', 'c2', 'c3', 'claim'];
    if (!S.tray.includes('claim')) S.tray.push('claim');
    S.dimmed = new Set();
    S.placedOut = new Set();
    renderTray();
    const b = $('#board');
    b.className = 'board big sort';
    b.innerHTML = `<div class="cols">${M.sortCols.map((c) => `<div class="col" data-drop="col-${c.id}" tabindex="0" role="button" aria-label="${esc(c.label)}"><div class="col-h chalk">${esc(c.label)}</div><div class="col-body"></div></div>`).join('')}</div>`;
    setNote('카드 정리하기');
    await say(M.lines.sortAsk);
    S.glowKey = 'sort';
  }
  async function dropSort(id, col, el) {
    if (S.phase !== 'sort' || !S.sortIds.includes(id) || S.placedOut.has(id)) return;
    const right = S.cards[id].col;
    const first = !(id in S.sortFirst);
    if (first) S.sortFirst[id] = col;
    logAttempt({ stage: 'sort', questId: id, choice: col, pass: col === right });
    if (col !== right) {
      const back = $(`#trayCards [data-card="${id}"]`);
      if (back) { back.classList.remove('bounce'); void back.offsetWidth; back.classList.add('bounce'); }
      const L = M.lines.sortWrong;
      const line = right === 'event' ? L.event : col === 'event' ? L.toEvent : right === 'scale' ? L.scaleToMean : L.meanToScale;
      say(line);
      return;
    }
    S.placedOut.add(id);
    S.sortPlaced[col] = (S.sortPlaced[col] || []).concat(id);
    const body = $(`[data-drop="col-${col}"] .col-body`);
    body.insertAdjacentHTML('beforeend', `<div class="mini k-${S.cards[id].kind}">${esc(S.cards[id].text)}</div>`);
    blinkOnce($(`[data-drop="col-${col}"] .col-h`));
    renderTray();
    if (S.sortIds.every((x) => S.placedOut.has(x))) {
      const firstRight = S.sortIds.filter((x) => S.sortFirst[x] === S.cards[x].col).length;
      const dw = ['cA', 'cB'].some((x) => S.sortFirst[x] === 'mean');
      updateSession({ sortFirstRight: firstRight, dwConfusion: dw });
      await sleep(400);
      startCompose();
    }
  }

  /* ───────── 4. 변론 ② 답안 짜기 ───────── */
  async function startCompose() {
    S.phase = 'compose';
    S.composeStart = now();
    $('#tray').classList.add('hide-in-compose');
    const b = $('#board');
    b.className = 'board big compose';
    const shelf = M.sortCols.map((c) => `<div class="shelf"><div class="shelf-h chalk">${esc(c.label)}</div>${(S.sortPlaced[c.id] || []).map((id) => cardHTML(id, 'shelf-card' + (S.cards[id].kind === 'model' ? ' locked-card' : ''))).join('')}</div>`).join('');
    // 혼자 힘으로 쓸 때는 카드 대신 단서 그림만 보여 준다(옮겨 적을 글자가 없게)
    const meet = (svg) => svg.replace('xMidYMid slice', 'xMidYMid meet');
    const gallery = [['cA', meet(ART.miniPhoto('A'))], ['cB', meet(ART.miniPhoto('B'))], ['e1', meet(ART.miniSlide('closed'))], ['e2', meet(ART.miniSlide('open'))]]
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
          <button type="button" class="hint-book locked" id="hintBook" aria-label="교수의 강의 노트"><span>강의 노트</span></button>
        </div>
        <div class="answer-wrap">
          <textarea id="answer" data-drop="answer" rows="9" maxlength="1500" aria-label="최종 답안"></textarea>
          <div class="hint-note" id="hintNote" hidden></div>
        </div>
        <button type="button" class="chalk-btn" id="finalSubmit" disabled>교수님께 제출</button>
      </div>`;
    $$('#shelves .card').forEach(bindCard);
    const ta = $('#answer');
    ta.addEventListener('input', () => { S.lastInput = now(); $('#finalSubmit').disabled = ta.value.trim().length < 5; });
    ta.addEventListener('blur', () => { S.caret = ta.selectionStart; });
    // 혼자 힘으로 쓸 때는 붙여넣기와 끌어다 놓기를 막는다
    const noPaste = (e) => { if (!S.ownMode) return; e.preventDefault(); say(M.lines.ownNoPaste); };
    ta.addEventListener('paste', noPaste);
    ta.addEventListener('drop', noPaste);
    $('#ownGallery').addEventListener('copy', (e) => e.preventDefault());
    $('#ownMode').addEventListener('change', (e) => setOwnMode(e.target.checked));
    $('#hintBook').addEventListener('click', onHintBook);
    $('#finalSubmit').addEventListener('click', submitFinal);
    setNote('처음부터 끝까지 설명하기');
    await say(M.lines.composeAsk);
    S.glowKey = 'compose';
    ta.focus();
    S.hintTimer = setInterval(checkHintUnlock, 3000);
  }
  function setOwnMode(on) {
    S.ownMode = on;
    if (on) S.ownEver = true;
    $('#board').classList.toggle('own-on', on);
    updateSession({ ownMode: on });
  }
  function insertCard(id) {
    if (S.phase !== 'compose' || S.ownMode) return;
    const c = S.cards[id];
    if (!c) return;
    if (c.kind === 'model') { say(M.lines.modelCardBlocked); return; } // 보완안 4
    const ta = $('#answer');
    const sentence = c.sentence || c.text;
    const pos = S.caret ?? ta.value.length;
    const before = ta.value.slice(0, pos); const after = ta.value.slice(pos);
    const sep = before && !/\s$/.test(before) ? ' ' : '';
    ta.value = before + sep + sentence + (after && !/^\s/.test(after) ? ' ' : '') + after;
    S.caret = (before + sep + sentence).length;
    S.inserted.push(sentence);
    ta.dispatchEvent(new Event('input'));
    blinkOnce(ta);
  }
  function remainingCardSentences(text) { return S.inserted.filter((s) => text.includes(s)); }
  function typedPart(text) { let t = text; remainingCardSentences(text).forEach((s) => { t = t.split(s).join(''); }); return t; }

  function checkHintUnlock() {
    if (S.phase !== 'compose' || S.hint > 0) return;
    const len = $('#answer').value.trim().length;
    if (now() - S.composeStart > 90000 && len < 20) unlockHint('90초·20자 미만');
    else if (now() - S.lastInput > 60000) unlockHint('60초 무입력');
  }
  async function unlockHint(reason, thenLine, lead = []) {
    if (S.hint > 0) return;
    S.hint = 1; S.hintReason = reason; S.hintAt = new Date().toISOString();
    updateSession({ hintLevel: 1, hintReason: reason, hintAt: S.hintAt });
    const hb = $('#hintBook'); hb.classList.remove('locked');
    glow(hb, 'compose');
    await say(lead.concat(M.lines.hintOpen, thenLine || []));
  }
  function onHintBook() {
    const hb = $('#hintBook');
    if (hb.classList.contains('locked')) { hb.classList.remove('shake'); void hb.offsetWidth; hb.classList.add('shake'); return; }
    glow(null);
    renderHintNote();
  }
  function renderHintNote() {
    const n = $('#hintNote');
    const lines = S.hint >= 2 ? M.hintNote.level1.map((l, i) => l + (i === 2 ? '  ' + M.hintNote.level2[0] : i === 3 ? '  ' + M.hintNote.level2[1] : i === 4 ? '  ' + M.hintNote.level2[2] : '')) : M.hintNote.level1;
    n.innerHTML = `<div class="hn-h">강의 노트</div>${lines.map((l) => `<div>${esc(l)}</div>`).join('')}`;
    n.hidden = false;
    logAttempt({ stage: 'compose', questId: 'hintView', choice: String(S.hint) });
  }

  async function submitFinal() {
    if (S.submitting) return;
    S.submitting = true;
    const btn = $('#finalSubmit'); btn.disabled = true;
    try { await submitFinalInner(); } finally {
      S.submitting = false;
      if (document.body.contains(btn)) btn.disabled = $('#answer').value.trim().length < 5;
    }
  }
  async function submitFinalInner() {
    const ta = $('#answer');
    const text = ta.value.trim();
    if (text.length < 5) return;
    // 카드만 늘어놓은 답: 한 번만 묻는다
    if (!S.ownMode && typedPart(text).replace(/[\s.,·]/g, '').length < 2 && !S.cardsOnlyWarned) {
      S.cardsOnlyWarned = true;
      await say(M.lines.cardsOnly);
      return;
    }
    const r = J.judgeFinal(text);
    // 보완안 5: 첫 제출이 부족하면 교수가 "부족하다"고 먼저 말하고, 학생이 꼬투리 잡힐 곳을 고른다
    let lead = [];
    if (!S.predicted && !r.pass && r.ask !== 'unclear') {
      S.predicted = true;
      await say(M.lines.predictAsk);
      const choice = await new Promise((res) => openReply({ choices: M.predictOptions.map((o) => ({ id: o.id, text: o.text })), instant: true, onSubmit: ({ choice: c }) => res(c) }));
      closeReply();
      const opt = M.predictOptions.find((o) => o.id === choice);
      const match = opt.els.includes(r.ask);
      logAttempt({ stage: 'compose', questId: 'predict', choice, input: r.ask, pass: match });
      updateSession({ selfPredict: choice, selfPredictMatch: match });
      if (match) { await say(M.lines.predictMatch); ta.focus(); return; }
      lead = M.lines.predictMiss;
    }
    S.submits++;
    const remain = remainingCardSentences(text);
    if (S.submits === 1 || !S.firstSubmitText) { S.firstSubmitText = text; updateSession({ firstSubmitBeforeHint: S.hint === 0 ? text : '', firstSubmitDiag: r.diag }); }
    logAttempt({ stage: 'compose', questId: 'final', input: text, diag: r.diag, pass: r.pass, elements: r.elements, hint: S.hint, own: S.ownMode, cardSentences: remain.length });
    if (r.pass) { finish('full', text, r); return; }
    if (S.submits >= 3) { finish('partial', text, r); return; }
    const line = M.finalLines[r.ask] || M.lines.unclear;
    // 반박을 받으면 강의 노트가 열린다(1단계). 1단계를 열고도 다시 반박받으면 2단계.
    // 노트 이야기를 먼저 하고, 교수의 질문이 말풍선에 남게 한다.
    if (S.hint === 0) { await unlockHint('첫 제출 반박', line, lead); return; }
    if (S.hint === 1) { S.hint = 2; updateSession({ hintLevel: 2 }); if (!$('#hintNote').hidden) renderHintNote(); }
    await say(lead.concat(line));
    setNose(S.nose);
  }

  /* ───────── 클리어 ───────── */
  function finish(type, text, r) {
    clearInterval(S.hintTimer);
    const remain = remainingCardSentences(text);
    const own = S.ownMode && remain.length === 0 && type === 'full';
    updateSession({ clearType: type, finalAnswer: text, finalJudgment: r.elements, path: r.path || '', ownReward: own, endedAt: new Date().toISOString() }, true);
    API.flush();
    const roles = J.sentenceRoles(text);
    // 처음 생각에 이미 있던 연결은 빼고, 새로 생긴 연결만 형광펜으로 칠한다
    const firstRoles = new Set(J.sentenceRoles(S.firstAnswer || '').flatMap((x) => x.roles));
    const isCard = (s) => remain.some((c) => c.includes(s) || s.includes(c.replace(/\.$/, '')));
    const finalHTML = roles.map((x) => {
      const isNew = x.roles.some((role) => !firstRoles.has(role));
      const cls = [isNew ? 'w' : '', isCard(x.text) ? 'from-card' : 'typed'].join(' ');
      return `<span class="${cls}">${esc(x.text)}.</span>`;
    }).join(' ');
    const quote = (role) => { const s = roles.find((x) => x.roles.includes(role) && !isCard(x.text)); return s ? s.text : null; };
    const praise = [];
    const q2a = quote('W2a'); const q2b = quote('W2b');
    if (q2a) praise.push(`“${q2a}” — 막아 둔 플라스크의 150.0 g을 뜻으로 옮겼어요. 같은 숫자를 옮겨 적기만 한 답과 갈리는 한 줄이 바로 이거예요.`);
    if (q2b) praise.push(`“${q2b}” — 늘어난 0.5 g이 무엇의 질량인지 밝혔어요.`);
    // 숫자의 뜻(W2)을 직접 쓴 문장이 없으면, 직접 쓴 원리(W1) 문장이라도 인용한다
    if (!praise.length) {
      const q1b = quote('W1b'); const q1a = quote('W1a');
      if (q1b) praise.push(`“${q1b}” — 늘어난 것이 왜 산소인지 실험 상황으로 짚었어요.`);
      else if (q1a) praise.push(`“${q1a}” — 강철솜이 스스로 무거워질 수 없는 까닭을 원리로 짚었어요.`);
    }
    const missLine = type === 'partial' ? ({ W2a: '다음엔 150.0 g이 \'그대로\'라는 게 무슨 뜻인지도 써 보자.', W2b: '다음엔 늘어난 0.5 g이 무엇의 질량인지도 써 보자.', W1b: '다음엔 그게 왜 산소인지도 써 보자.', W1a: '다음엔 강철솜이 스스로 무거워질 수 없는 까닭도 써 보자.', 'D-B': '다음엔 막아 둔 플라스크 결과도 써 보자.', 'D-A': '다음엔 접시에서 잰 숫자도 써 보자.', C: '다음엔 결국 무슨 일이 일어났는지도 써 보자.' }[r.ask] || '다음엔 숫자가 무슨 뜻인지까지 써 보자.') : '';
    const first = S.firstAnswer || '(없음)';
    $('#clearScreen .wrap').innerHTML = `
      <div class="top"><div class="professor-art" data-expression="${type === 'full' ? 'acknowledging' : 'skeptical'}"></div>
        <div class="say">${type === 'full' ? '…크흠, 콧대가 납작해졌군. 이번엔 내가 졌네.' : '흠, 여기까지는 인정하지.'}</div></div>
      <div class="compare">
        <div class="col"><h3>처음</h3><p>${esc(first)}</p></div>
        <div class="col"><h3>지금</h3><p class="final">${finalHTML}</p></div>
      </div>
      ${praise.length ? `<ul class="praise">${praise.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}
      ${missLine ? `<p class="next-line">${esc(missLine)}</p>` : ''}
      ${own ? `<div class="gift"><img src="assets/steel-wool-keyring.jpg" alt="안경과 나비넥타이를 단 강철솜 키링"><p>“카드 없이 해낸 건 인정하지. 이건… 자네가 가지게.”</p></div>` : (S.ownEver && type !== 'full' ? '<p class="next-line">“다음엔 이걸 줄 수도 있겠군.”</p>' : '')}
      <div class="btns"><button type="button" id="againBtn">처음부터 다시</button></div>`;
    $('#againBtn').addEventListener('click', () => location.reload());
    // 완전 클리어면 마지막 콧대가 꺾이는 것을 보여 준 뒤 결과를 띄운다
    if (type === 'full') {
      (async () => {
        await zoomProf(2);
        setNose(0);
        await sleep(reduced ? 200 : 1400);
        $('#clearScreen').hidden = false;
        zoomOut();
      })();
    }
    else $('#clearScreen').hidden = false;
  }

  /* ───────── 시작 ───────── */
  function setupStart() {
    $('#missionTitle').textContent = `${M.label} · ${M.title}`;
    $('#startTag').textContent = M.label;
    $('#startTitle').textContent = M.title;
    const cc = $('#classCode'); const sn = $('#studentNo');
    const check = () => { $('#goBtn').disabled = !(cc.value.trim() && sn.value.trim()); };
    cc.addEventListener('input', check); sn.addEventListener('input', check);
    $('#startForm').addEventListener('submit', (e) => { e.preventDefault(); start(cc.value.trim(), sn.value.trim()); });
  }
  async function start(classCode, studentNo) {
    S.classCode = classCode; S.studentNo = studentNo;
    S.sessionId = API.uid('s');
    API.startSession({ sessionId: S.sessionId, missionId: M.id, classCode, studentNo, startedAt: new Date().toISOString(), stage: 'explore' });
    $('#who').textContent = `${classCode} · ${studentNo}번`;
    $('#startScreen').hidden = true;
    S.started = true;
    buildBench();
    renderSmallBoard();
    renderTray();
    setNose(2);
    fit();
    setStage('explore');
    setNote('두 강철솜 태우기');
    await tareScene();
    await say(M.lines.intro);
    glow($('#flameA'), 'deviceA');
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

  setupStart();
  setupTrayScroll();
  fit();
  window.__m02 = { S, say, fit, renderTray }; // 디버그용
})();
