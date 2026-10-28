/*
 * 서술 실험실 게임 엔진
 * 흐름: 탐색 → 주장·근거 → 교수 반박(Q1·Q2·Q3 + W3 결합) → 최종 변론 → 클리어
 * 미션 내용은 missions/*.js 에서 읽는다. 이 파일은 뼈대(메커닉)만 담는다.
 */
(function () {
  const CFG = window.SCIW_CONFIG;
  const M = window.SCIW_MISSIONS[CFG.MISSION_ID || 'm01'];
  const API = window.SCIW_API;
  const ART = window.SCIW_ART;
  const JUDGE = window.SCIW_JUDGE;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // 화면 표시용: "0.2 M"처럼 숫자와 단위가 갈라지지 않게, "→"는 앞 낱말에 붙인다(학생 입력에는 쓰지 않는다).
  const nb = (s) => String(s ?? '').replace(/(\d)\s+(M|%|번)(?![A-Za-z])/g, '$1\u00a0$2').replace(/\s+→/g, '\u00a0→');
  const tx = (s) => esc(nb(s));
  // 두 문장 이상이면 문장마다 줄을 나눈다.
  const bySentence = (s) => nb(s).split(/(?<=[?!.])\s+/).map(esc).join('<br>');
  const now = () => Date.now();
  const STAGES = ['explore', 'claim', 'rebuttal', 'defense'];

  const S = {
    stage: null,
    stageStart: 0,
    session: null,
    cards: [],          // { id, type: 'clue'|'model'|'concl', text, kind }
    nose: 2,
    q: null,            // 진행 중인 퀘스트 상태
    questIdx: -1,
    lineIdx: {},
    attemptNo: {},
    attemptClock: 0,
    claim: { opt: null, slots: [] },
    placed: [],
    defenseText: '',
    defenseTries: 0,
    firstAnswer: '',
    zoom: null,
    busy: false
  };

  // ───────────────────────── 장면 ─────────────────────────
  function buildScene() {
    $('#missionTitle').textContent = `${M.label} · ${M.title}`;
    $('#stage').innerHTML = `
      <div id="board" class="obj" data-obj="board" data-drop="board">
        <div class="frame">
          <div class="q">${tx(M.boardQuestion)}</div>
          <div class="chalk"></div>
          <div class="placed"></div>
          <div class="axis"></div>
          <div class="paper"></div>
        </div>
      </div>
      <div id="prof" class="obj" data-obj="prof">${ART.professor(S.nose)}</div>
      <div id="noseMeter"><i></i><i></i><i></i><i></i></div>
      <div id="bench" class="obj"></div>
      ${M.data.map((d, i) => `
        <div class="obj beaker tap" id="obj-${d.id}" data-obj="${d.id}" style="left:${40 + i * 96}px">
          ${ART.beaker(d.conc)}<div class="tag">${d.conc} ${M.unit}</div>
        </div>`).join('')}
      <div id="notebook" class="obj tap" data-obj="notebook">${ART.notebook()}</div>
      <div id="microscope" class="obj tap locked" data-obj="microscope" data-drop="microscope">${ART.microscope()}</div>
      <div id="spot"></div>`;
    $('#stage').addEventListener('click', (e) => {
      const el = e.target.closest('[data-obj]');
      if (el) onObject(el.dataset.obj, el);
    });
    fit();
  }

  function fit() {
    const zone = $('#sceneZone');
    const s = Math.min(zone.clientWidth / 1000, zone.clientHeight / 560);
    $('#stage').style.transform = `scale(${s}) translate(-50%, -50%)`;
  }

  const objEl = (id) => $(`#stage [data-obj="${id}"]`);

  // 지금 할 일 하나만 빛나게, 나머지는 흐리게
  function focus(glowIds, opts = {}) {
    const keep = opts.keep || [];
    $$('#stage .obj[data-obj]').forEach((el) => {
      const id = el.dataset.obj;
      const g = glowIds.includes(id);
      el.classList.toggle('glow', g);
      el.classList.toggle('soft', g && (opts.soft || []).includes(id));
      el.classList.toggle('dim', !!opts.dim && !g && !keep.includes(id));
    });
  }

  function setNose(level) {
    S.nose = level;
    const p = $('#prof .nose');
    if (p) { p.setAttribute('d', ART.noseD(level)); p.style.d = `path("${ART.noseD(level)}")`; }
    $$('#noseMeter i').forEach((el, i) => el.classList.toggle('on', 3 - i < level));
  }

  function setStage(stage) {
    const t = now();
    if (S.stage && S.session) {
      S.session.stageTimes[S.stage] = (S.session.stageTimes[S.stage] || 0) + (t - S.stageStart);
    }
    S.stage = stage;
    S.stageStart = t;
    const idx = stage ? STAGES.indexOf(stage) : STAGES.length;
    $$('#track li').forEach((li, i) => {
      li.classList.toggle('on', i === idx);
      li.classList.toggle('done', i < idx);
    });
  }

  function setNote(text, hint) {
    const n = $('#questNote');
    $('.q', n).textContent = nb(text);
    const h = $('.hint', n);
    h.hidden = !hint;
    h.textContent = nb(hint || '');
    n.classList.remove('bump');
    void n.offsetWidth;
    n.classList.add('bump');
  }

  function showHintLine() {
    const quest = S.q && S.q.quest;
    if (!quest || !quest.hint) return;
    const h = $('#questNote .hint');
    h.textContent = nb(quest.hint);
    h.hidden = false;
  }

  // 퀘스트 쪽지 아래 "지금 무엇을 누를지" 안내. 빛나는 물건과 같은 이름을 노란 글씨로 쓴다.
  function updateDo() {
    const el = $('#doHint');
    if (!el) return;
    const z = S.zoom;
    let t = '';
    if (S.busy && !S.saying) t = '';
    else if (S.saying) t = '<b>말풍선</b>을 눌러 다음 대사를 보세요';
    else if (z && z.mode === 'membrane') {
      t = z.collect && !z.awarded
        ? '<b>물</b>과 <b>설탕</b> 분자를 세포막으로 끌어다 놓으세요'
        : '분자를 세포막에 놓아 보고, <b>실험대로 돌아가기</b>를 누르세요';
    } else if (z && z.mode === 'slider') {
      t = z.collect && !z.awarded
        ? '<b>슬라이더</b>를 움직여 세포가 부풀면 <b>이거다!</b>를 누르세요'
        : '<b>슬라이더</b>를 움직여 보고, <b>실험대로 돌아가기</b>를 누르세요';
    } else if (S.stage === 'explore') {
      t = resultCount() >= M.explore.minResultCards ? '빛나는 <b>칠판</b>을 누르세요' : '<b>비커</b>를 눌러 실험 결과를 모으세요';
    } else if (S.stage === 'claim') {
      t = '<b>칠판</b>을 눌러 답을 마저 쓰세요';
    } else if (S.stage === 'rebuttal' && S.q && !S.q.done) {
      if (S.q.combine) t = '아래 <b>초록 카드 2장</b>을 눌러 칠판에 올리세요';
      else if (S.q.needModel) t = '빛나는 <b>현미경</b>을 누르세요';
      else if (S.q.microscopeGlow) t = '<b>현미경</b>으로 다시 확인하거나, <b>교수님</b>을 눌러 답하세요';
      else t = '<b>교수님</b>을 눌러 답하세요';
    } else if (S.stage === 'defense') {
      t = '<b>교수님</b>을 눌러 답안을 쓰세요';
    }
    el.hidden = !t;
    if (t && el.dataset.t !== t) {
      el.dataset.t = t;
      el.innerHTML = `<span class="ic" aria-hidden="true">👆</span><span>${t}</span>`;
      el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
    }
  }

  function shake(el) {
    el.classList.remove('shake');
    void el.offsetWidth;
    el.classList.add('shake');
  }

  // ───────────────────────── 말풍선 ─────────────────────────
  let tapResolve = null;
  function showBubble(lines, opts = {}) {
    const b = $('#bubble');
    $('.who', b).textContent = M.professorName;
    let html = lines.map((l) => `<p>${tx(l)}</p>`).join('');
    if (opts.model) html += `<p class="model">${tx(opts.model)}</p>`;
    $('.body', b).innerHTML = html;
    b.classList.toggle('model', !!opts.model);
    $('.more', b).hidden = !opts.tap;
    b.classList.add('show');
  }
  function hideBubble() { $('#bubble').classList.remove('show'); }

  function waitTap() {
    return new Promise((resolve) => {
      const catcher = $('#catcher');
      catcher.hidden = false;
      const t0 = now();
      tapResolve = () => {
        if (now() - t0 < 350) return;  // 연타로 대사가 건너뛰어지지 않게
        catcher.hidden = true;
        tapResolve = null;
        resolve();
      };
    });
  }

  // bubbles: [[문장, 문장], [문장]] — 말풍선 하나에 2문장 이하, 탭으로 넘김
  async function say(bubbles, opts = {}) {
    S.saying = true;
    updateDo();
    for (let i = 0; i < bubbles.length; i++) {
      const last = i === bubbles.length - 1;
      showBubble(bubbles[i], { tap: true, model: last ? opts.model : null });
      await waitTap();
    }
    if (!opts.keep) hideBubble();
    S.lastLines = bubbles[bubbles.length - 1];
    S.saying = false;
    updateDo();
  }

  function variant(key, list) {
    const i = S.lineIdx[key] || 0;
    S.lineIdx[key] = i + 1;
    return list[i % list.length];
  }
  function lineFor(diag, quest) {
    const list = (quest && quest.lines && quest.lines[diag]) || M.lines[diag];
    return variant((quest ? quest.id : 'x') + diag, list);
  }

  // ───────────────────────── 시트 ─────────────────────────
  function openSheet(html, opts = {}) {
    const sh = $('#sheet');
    sh.innerHTML = `<div class="grab"><button type="button" aria-label="시트 닫기" data-act="close"></button></div>${html}`;
    sh.classList.toggle('full', !!opts.full);
    sh.classList.add('open');
    $('#dim').classList.add('on');
    if (opts.pin) showBubble(opts.pin, { tap: false });
    S.sheetOpen = opts.name || true;
    S.attemptClock = S.attemptClock || now();
    if (opts.focusSel) setTimeout(() => { const el = $(opts.focusSel, sh); if (el) el.focus(); }, 380);
    return sh;
  }
  function closeSheet() {
    $$('#trayCards .card.clue').forEach((c) => c.classList.remove('glow'));
    $('#sheet').classList.remove('open');
    $('#dim').classList.remove('on');
    hideBubble();
    S.sheetOpen = false;
    refreshFocus();
  }

  // 시트를 닫았을 때 무엇이 빛나야 하는지 다시 정한다
  function refreshFocus() {
    updateDo();
    if (S.stage === 'explore') {
      const enough = resultCount() >= M.explore.minResultCards;
      focus(enough ? ['board'] : []);
    } else if (S.stage === 'claim') {
      focus(['board']);
    } else if (S.stage === 'rebuttal' && S.q) {
      if (S.q.combine) { focus(['board'], { dim: true, keep: ['prof'] }); return; }
      const glow = [];
      const soft = [];
      if (S.q.needModel) glow.push('microscope');
      else {
        if (S.q.microscopeGlow) glow.push('microscope');
        glow.push('prof'); soft.push('prof');
      }
      focus(glow, { dim: true, keep: ['prof', 'board'], soft });
    } else if (S.stage === 'defense') {
      focus(['prof'], { dim: true, keep: ['board'], soft: ['prof'] });
    }
  }

  $('#sheet').addEventListener('click', (e) => {
    if (e.target.closest('[data-act="close"]')) closeSheet();
  });
  $('#dim').addEventListener('click', () => { if (S.sheetOpen && S.sheetOpen !== 'defense') closeSheet(); });
  $('#catcher').addEventListener('click', () => tapResolve && tapResolve());
  $('#bubble').addEventListener('click', () => tapResolve && tapResolve());

  // ───────────────────────── 트레이·카드 ─────────────────────────
  const resultCount = () => S.cards.filter((c) => c.type === 'clue' && c.kind === 'result').length;
  const hasCard = (id) => S.cards.some((c) => c.id === id);

  function cardHTML(c) {
    if (c.type === 'model') return `<div class="card model" data-id="${c.id}"><span><b>${c.id}</b> ${tx(c.text)}</span></div>`;
    const cls = c.type === 'concl' ? 'concl' : `clue ${c.kind}`;
    return `<div class="card ${cls}${c.used ? ' used' : ''}" data-id="${c.id}">${tx(c.text)}</div>`;
  }
  function renderTray() {
    $('#trayCards').innerHTML = S.cards.map(cardHTML).join('');
  }

  async function addCard(card, fromEl) {
    if (hasCard(card.id)) return;
    S.cards.push(card);
    renderTray();
    const target = $(`#trayCards [data-id="${card.id}"]`);
    target.scrollIntoView({ inline: 'end', block: 'nearest' });
    if (fromEl) {
      target.style.visibility = 'hidden';
      const a = fromEl.getBoundingClientRect();
      const b = target.getBoundingClientRect();
      const fly = target.cloneNode(true);
      fly.classList.add('flyer');
      fly.style.visibility = 'visible';
      Object.assign(fly.style, { left: b.left + 'px', top: b.top + 'px', width: b.width + 'px', height: b.height + 'px' });
      document.body.appendChild(fly);
      const dx = a.left + a.width / 2 - (b.left + b.width / 2);
      const dy = a.top + a.height / 2 - (b.top + b.height / 2);
      await fly.animate([
        { transform: `translate(${dx}px, ${dy}px) scale(.4)`, opacity: 0.4 },
        { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 60}px) scale(1.1)`, opacity: 1, offset: 0.5 },
        { transform: 'translate(0, 0) scale(1)', opacity: 1 }
      ], { duration: 700, easing: 'ease-in-out' }).finished;
      fly.remove();
      target.style.visibility = '';
    }
    target.classList.add('new');
    if (card.type === 'clue') {
      S.session.clueCards = S.cards.filter((c) => c.type === 'clue').map((c) => c.id);
      API.updateSession(S.session.sessionId, { clueCards: S.session.clueCards });
    } else if (card.type === 'model') {
      S.session.modelCards = S.cards.filter((c) => c.type === 'model').map((c) => c.id);
      API.updateSession(S.session.sessionId, { modelCards: S.session.modelCards });
    }
  }

  // 끌어다 놓기 (터치·마우스 공용). 움직이지 않고 떼면 "탭"으로 처리한다.
  let drag = null;
  $('#trayCards').addEventListener('pointerdown', (e) => {
    const el = e.target.closest('.card');
    if (!el || S.busy) return;
    drag = { el, id: el.dataset.id, x: e.clientX, y: e.clientY, moved: false, ghost: null, over: null };
  });
  document.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 8) return;
    if (!drag.moved) {
      drag.moved = true;
      const r = drag.el.getBoundingClientRect();
      drag.ghost = drag.el.cloneNode(true);
      drag.ghost.classList.add('ghost');
      Object.assign(drag.ghost.style, { width: r.width + 'px', height: r.height + 'px' });
      drag.dx = drag.x - r.left; drag.dy = drag.y - r.top;
      document.body.appendChild(drag.ghost);
    }
    drag.ghost.style.left = e.clientX - drag.dx + 'px';
    drag.ghost.style.top = e.clientY - drag.dy + 'px';
    const t = document.elementFromPoint(e.clientX, e.clientY);
    const over = t && t.closest('[data-drop]');
    if (over !== drag.over) {
      if (drag.over) drag.over.classList.remove('drop-over');
      if (over) over.classList.add('drop-over');
      drag.over = over;
    }
    e.preventDefault();
  }, { passive: false });
  document.addEventListener('pointerup', () => {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (d.ghost) d.ghost.remove();
    if (d.over) d.over.classList.remove('drop-over');
    if (!d.moved) onCardTap(d.id, d.el);
    else if (d.over) onCardDrop(d.id, d.over.dataset.drop, d.over);
  });
  document.addEventListener('pointercancel', () => { if (drag && drag.ghost) drag.ghost.remove(); drag = null; });

  function onCardTap(id) {
    const card = S.cards.find((c) => c.id === id);
    if (!card) return;
    if (S.sheetOpen === 'claim' && card.type === 'clue') return fillClaimSlot(id);
    if (S.q && S.q.combine && card.type === 'concl') return placeOnBoard(id);
  }

  function onCardDrop(id, target, el) {
    const card = S.cards.find((c) => c.id === id);
    if (!card) return;
    if (target.startsWith('slot-') && S.sheetOpen === 'claim') {
      if (card.type !== 'clue') return shake(el);
      return fillClaimSlot(id, Number(target.slice(5)));
    }
    if (target === 'board' && S.q && S.q.combine) {
      if (card.type !== 'concl') return shake(objEl('board'));
      return placeOnBoard(id);
    }
    if (target === 'microscope' && S.stage === 'rebuttal' && S.q && !S.q.combine && card.kind === 'result') {
      const d = M.data.find((x) => x.id === id);
      const quest = S.q.quest;
      const zcfg = Object.assign({}, quest.microscope, { collect: S.q.needModel, model: quest.model, sliderGlow: S.q.sliderGlow, quest });
      if (zcfg.mode === 'slider') zcfg.outside = d.conc;  // 비커 카드를 올리면 바깥 농도가 그 비커 값이 된다
      return openZoom(zcfg);
    }
    shake(el);
  }

  // ───────────────────────── 기록 ─────────────────────────
  function logAttempt(o) {
    const n = (S.attemptNo[o.questId] = (S.attemptNo[o.questId] || 0) + 1);
    const t = now();
    const attempt = {
      attemptId: API.uid('a'),
      sessionId: S.session.sessionId,
      classCode: S.session.classCode,
      studentNo: S.session.studentNo,
      missionId: M.id,
      stage: o.stage,
      questId: o.questId,
      element: o.element || '',
      attemptNo: n,
      input: o.input,
      judgment: o.judgment,
      diagnosis: o.diagnosis,
      errorType: o.errorType || '',
      hintLevel: S.q ? S.q.hintLevel : 0,
      durationMs: S.attemptClock ? t - S.attemptClock : 0,
      judgedBy: o.judgedBy,
      createdAt: new Date(t).toISOString()
    };
    S.attemptClock = t;
    API.logAttempt(attempt);
    const fields = {};
    if (attempt.errorType) {
      S.session.errorCounts[attempt.errorType] = (S.session.errorCounts[attempt.errorType] || 0) + 1;
      fields.errorCounts = S.session.errorCounts;
      if (!S.session.firstError) { S.session.firstError = attempt.errorType; fields.firstError = attempt.errorType; }
    }
    if (Object.keys(fields).length) API.updateSession(S.session.sessionId, fields);
  }

  function markPassed(element) {
    S.session.questPassed[element] = true;
    API.updateSession(S.session.sessionId, { questPassed: S.session.questPassed, stageTimes: currentStageTimes() });
  }

  function currentStageTimes() {
    const t = Object.assign({}, S.session.stageTimes);
    if (S.stage) t[S.stage] = (t[S.stage] || 0) + (now() - S.stageStart);
    return t;
  }

  // ───────────────────────── 1. 탐색 ─────────────────────────
  async function onObject(id, el) {
    if (S.busy || drag) return;
    noteInput();
    const beaker = M.data.find((d) => d.id === id);
    if (beaker) {
      if (S.stage === 'explore' || S.stage === 'claim') return inspectBeaker(beaker, el);
      if (S.stage === 'rebuttal' && S.q && !S.q.combine && !S.q.needModel) return shake(el);
      return;
    }
    if (id === 'notebook') {
      if (S.stage !== 'explore' && S.stage !== 'claim') return;
      const notes = M.clues.filter((c) => c.source === 'notebook');
      for (const c of notes) { await addCard({ id: c.id, type: 'clue', kind: c.kind, text: c.text }, el); await sleep(120); }
      return;
    }
    if (id === 'microscope') {
      if (S.stage !== 'rebuttal' || !S.q || S.q.combine) return shake(el);
      const quest = S.q.quest;
      return openZoom(Object.assign({}, quest.microscope, { collect: S.q.needModel, model: quest.model, sliderGlow: S.q.sliderGlow, quest }));
    }
    if (id === 'board') {
      if (S.stage === 'explore') {
        if (resultCount() >= M.explore.minResultCards) return startClaim();
        return shake(el);
      }
      if (S.stage === 'claim') return openClaimSheet();
      if (S.q && S.q.combine) return shake(el);
      return;
    }
    if (id === 'prof') {
      if (S.stage === 'rebuttal' && S.q && !S.q.combine && !S.q.needModel && !S.q.done) return openAnswerSheet();
      if (S.stage === 'defense' && !S.sheetOpen) return openDefenseSheet();
    }
  }

  async function inspectBeaker(d, el) {
    if (el.dataset.busy) return;
    el.dataset.busy = '1';
    const pop = document.createElement('div');
    pop.className = 'pop';
    const up = d.change >= 0;
    pop.innerHTML = `${ART.potato(d.change)}<div class="num ${up ? 'up' : 'down'}">${up ? '+' : '−'}${Math.abs(d.change)}%</div>`;
    const zr = $('#sceneZone').getBoundingClientRect();
    const r = el.getBoundingClientRect();
    pop.style.left = Math.max(8, Math.min(zr.width - 230, r.left - zr.left + r.width / 2 - 110)) + 'px';
    pop.style.top = Math.max(8, r.top - zr.top - 88) + 'px';
    $('#sceneZone').appendChild(pop);
    await sleep(1100);
    const clue = M.clues.find((c) => c.source === d.id);
    const p = addCard({ id: clue.id, type: 'clue', kind: clue.kind, text: clue.text }, pop);
    await sleep(250);
    pop.remove();
    await p;
    delete el.dataset.busy;
    if (S.stage === 'explore' && resultCount() >= M.explore.minResultCards && !S.boardReady) {
      S.boardReady = true;
      setNote('칠판을 눌러 내 답을 적어 보자');
      refreshFocus();
    }
  }

  // ───────────────────────── 2. 주장·근거 ─────────────────────────
  function startClaim() {
    setStage('claim');
    setNote('주장 하나와 근거 두 장을 골라 제출하자');
    openClaimSheet();
  }

  function openClaimSheet() {
    const opts = M.claim.options.map((o) => `<button type="button" class="opt${S.claim.opt === o.id ? ' on' : ''}" data-opt="${o.id}">${tx(o.label)}</button>`).join('');
    const slots = Array.from({ length: M.claim.slots }, (_, i) => `<div class="slot" data-drop="slot-${i}" data-slot="${i}"></div>`).join('');
    const sh = openSheet(`
      <h4>${tx(M.boardQuestion)}</h4>
      <div class="opts">${opts}</div>
      <div class="sub">근거: 아래 수집함에서 단서 카드를 끌어다 놓거나 눌러 넣자</div>
      <div class="slots">${slots}</div>
      <div class="actions"><button type="button" class="submit" data-act="submitClaim" disabled>교수님께 제출</button></div>
    `, { name: 'claim' });
    renderClaimSlots();
    $$('.card.clue').forEach((c) => c.classList.add('glow'));
    sh.onclick = (e) => {
      const o = e.target.closest('[data-opt]');
      if (o) { S.claim.opt = o.dataset.opt; $$('.opt', sh).forEach((b) => b.classList.toggle('on', b === o)); updateClaimSubmit(); noteInput(); }
      const x = e.target.closest('[data-unslot]');
      if (x) { S.claim.slots[Number(x.dataset.unslot)] = null; renderClaimSlots(); }
      if (e.target.closest('[data-act="submitClaim"]')) submitClaim();
    };
  }

  function fillClaimSlot(id, idx) {
    noteInput();
    if (S.claim.slots.includes(id)) return;
    if (idx === undefined) {
      idx = [...Array(M.claim.slots).keys()].find((i) => !S.claim.slots[i]);
      if (idx === undefined) return;
    }
    S.claim.slots[idx] = id;
    renderClaimSlots();
  }

  function renderClaimSlots() {
    $$('#sheet .slot').forEach((el) => {
      const i = Number(el.dataset.slot);
      const id = S.claim.slots[i];
      const c = id && M.clues.find((x) => x.id === id);
      el.classList.toggle('filled', !!c);
      el.innerHTML = c ? `${tx(c.text)}<button type="button" class="x" data-unslot="${i}" aria-label="빼기">✕</button>` : `근거 ${i + 1}`;
    });
    $$('#trayCards .card.clue').forEach((el) => el.classList.toggle('used', S.claim.slots.includes(el.dataset.id)));
    updateClaimSubmit();
  }
  function updateClaimSubmit() {
    const ready = S.claim.opt && S.claim.slots.filter(Boolean).length === M.claim.slots;
    const btn = $('#sheet [data-act="submitClaim"]');
    if (btn) btn.disabled = !ready;
  }

  async function submitClaim() {
    const opt = M.claim.options.find((o) => o.id === S.claim.opt);
    const ids = S.claim.slots.filter(Boolean);
    const cards = ids.map((id) => M.clues.find((c) => c.id === id));
    const C = !!opt.correct;
    const D = M.claim.dataCards.every((id) => ids.includes(id));
    const onlyCondition = cards.every((c) => c.kind !== 'result');
    const diagnosis = !C ? 'RANGE' : onlyCondition ? 'CONDITION' : 'PASS';
    logAttempt({
      stage: 'claim', questId: 'CLAIM', element: 'C', judgedBy: 'choice', diagnosis,
      input: `${opt.label} | ${cards.map((c) => c.text).join(' / ')}`,
      judgment: { C, D, claim: opt.id, evidence: ids }
    });
    $$('.card.clue').forEach((c) => c.classList.remove('glow', 'used'));
    closeSheet();
    S.busy = true; updateDo();
    if (!C) {
      const d = M.data.find((x) => x.id === opt.contradicts);
      focus([d.id]);
      await say([M.claim.lines.wrongRange(`${d.conc} ${M.unit}`)]);
      S.busy = false;
      S.claim.opt = null;
      openClaimSheet();
      focus([d.id]);
      return;
    }
    if (onlyCondition) {
      await say([M.claim.lines.conditionOnly]);
      S.busy = false;
      S.claim.slots = [];
      openClaimSheet();
      return;
    }
    const chalk = $('#board .chalk');
    chalk.innerHTML = `${tx(opt.label)} 사이!<small>${cards.map((c) => tx(c.text)).join('<br>')}</small>`;
    chalk.classList.add('show');
    S.firstAnswer = `${opt.label} 사이이다. 근거: ${cards.map((c) => c.text).join(', ')}.`;
    S.session.firstAnswer = S.firstAnswer;
    S.session.questPassed.C = true;
    S.session.questPassed.D = D;
    API.updateSession(S.session.sessionId, { firstAnswer: S.firstAnswer, questPassed: S.session.questPassed });
    await sleep(900);
    S.busy = false;
    startRebuttal();
  }

  // ───────────────────────── 3. 교수 반박 ─────────────────────────
  async function startRebuttal() {
    S.busy = true; updateDo();
    setStage('rebuttal');
    focus([], { dim: true, keep: ['prof', 'board'] });
    $('#prof').classList.add('stand');
    $('#spot').classList.add('on');
    $('#noseMeter').classList.add('show');
    await sleep(600);
    setNose(4);
    await sleep(700);
    await say(M.rebuttal.intro.concat(M.quests[0].intro), { keep: true });
    hideBubble();
    await banner(M.rebuttal.banner);
    $('#microscope').classList.remove('locked');
    S.busy = false;
    startQuest(0, true);
  }

  async function banner(text) {
    const b = $('#banner');
    $('.card', b).innerHTML = bySentence(text);
    b.classList.remove('fly');
    b.hidden = false;
    await sleep(1500);
    b.classList.add('fly');
    await sleep(600);
    b.hidden = true;
  }

  async function startQuest(i, skipIntro) {
    const quest = M.quests[i];
    S.questIdx = i;
    S.q = {
      quest, errors: {}, hintLevel: 0, lastInput: now(), done: false,
      needModel: !!quest.model && !hasCard(quest.model),
      microscopeGlow: false, sliderGlow: false, draft: {}
    };
    S.attemptClock = now();
    setNote(quest.note);
    if (!skipIntro) {
      refreshFocus();
      S.busy = true; updateDo();
      await say(quest.intro, { keep: true });
      S.busy = false;
    }
    S.q.question = quest.intro[quest.intro.length - 1];
    hideBubble();
    refreshFocus();
    if (!S.q.needModel) openAnswerSheet();
  }

  function noteInput() { if (S.q) S.q.lastInput = now(); }
  document.addEventListener('pointerdown', noteInput, true);
  document.addEventListener('keydown', noteInput, true);

  // 30초 무입력 → 힌트 줄
  setInterval(() => {
    if (!S.q || S.q.done || S.busy || S.stage !== 'rebuttal') return;
    if (now() - S.q.lastInput > 30000 && S.q.hintLevel < 1) raiseHint(1);
  }, 1000);

  async function raiseHint(level) {
    const q = S.q;
    if (!q || level <= q.hintLevel) return;
    q.hintLevel = level;
    showHintLine();
    if (q.quest.hintTarget === 'microscope') q.microscopeGlow = true;
    if (!S.sheetOpen) refreshFocus();
    S.session.hintTotal += 1;
    S.session.hintMax[q.quest.id] = q.hintLevel;
    API.updateSession(S.session.sessionId, { hintTotal: S.session.hintTotal, hintMax: S.session.hintMax });
  }

  // ── 현미경 줌인 ──
  function openZoom(cfg) {
    closeSheet();
    const z = $('#zoom');
    S.zoom = Object.assign({ triedWater: false, triedSugar: false, inside: cfg.outside }, cfg);
    const slider = cfg.mode === 'slider';
    z.innerHTML = `
      <div class="lens"><svg class="field" viewBox="0 0 640 440"></svg></div>
      <div class="side">
        <div class="legend">
          <span><i style="background:var(--water)"></i>물 분자</span>
          <span><i style="background:var(--sugar)"></i>설탕 분자</span>
          <span><i style="border:3px dashed #9fd3ff"></i>세포막</span>
        </div>
        ${slider ? `
        <div class="ctrl${cfg.sliderGlow ? ' glow' : ''}">
          <label for="inside">세포 안 농도</label>
          <div class="val"><span id="insideVal"></span> M</div>
          <input type="range" id="inside" min="0" max="0.6" step="0.05" value="${cfg.outside}">
          <div class="out">바깥 설탕물: <b>${cfg.outside} M</b> (고정)</div>
        </div>
        ${cfg.collect ? '<button type="button" class="pick" data-act="pick">이거다!</button>' : ''}` : ''}
        <button type="button" class="back" data-act="back">실험대로 돌아가기</button>
      </div>`;
    z.hidden = false;
    focus([]);
    updateDo();
    const svg = $('svg.field', z);
    if (slider) buildSlider(svg); else buildMembrane(svg);
    z.onclick = (e) => {
      if (e.target.closest('[data-act="back"]')) closeZoom();
      if (e.target.closest('[data-act="pick"]')) pickSlider();
    };
  }

  function closeZoom(thenAnswer) {
    $('#zoom').hidden = true;
    S.zoom = null;
    refreshFocus();
    if (thenAnswer) setTimeout(openAnswerSheet, 350);
  }

  const NS = 'http://www.w3.org/2000/svg';
  const CX = 300; const CY = 220;
  function svgEl(tag, attrs, parent) {
    const el = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    if (parent) parent.appendChild(el);
    return el;
  }
  function lensBase(svg, R) {
    svg.innerHTML = `
      <defs><clipPath id="lensClip"><circle cx="${CX}" cy="${CY}" r="214"/></clipPath>
        <marker id="wArrow" markerUnits="userSpaceOnUse" markerWidth="16" markerHeight="16" refX="12" refY="8" orient="auto-start-reverse"><path d="M0 0 L16 8 L0 16 Z" fill="#7cc0ff"/></marker></defs>
      <circle cx="${CX}" cy="${CY}" r="218" fill="#12303d" stroke="#5c7b88" stroke-width="6"/>
      <g clip-path="url(#lensClip)" id="lensG">
        <circle id="cell" cx="${CX}" cy="${CY}" r="${R}" fill="rgba(140,210,170,.16)" stroke="#9fd3ff" stroke-width="5" stroke-dasharray="12 7"/>
        <circle id="cell2" cx="${CX}" cy="${CY}" r="${R - 9}" fill="none" stroke="#9fd3ff" stroke-width="2" stroke-dasharray="12 7" opacity=".6"/>
      </g>`;
    return $('#lensG', svg);
  }

  function molecule(g, type, x, y) {
    const m = svgEl('g', { class: 'mol', 'data-type': type, transform: `translate(${x} ${y})` }, g);
    if (type === 'water') {
      svgEl('circle', { r: 11, fill: '#3d8bfd', stroke: '#9cc8ff', 'stroke-width': 2 }, m);
      svgEl('circle', { r: 4, cx: -8, cy: -7, fill: '#9cc8ff' }, m);
      svgEl('circle', { r: 4, cx: 8, cy: -7, fill: '#9cc8ff' }, m);
    } else {
      svgEl('polygon', { points: '0,-15 13,-7 13,8 0,15 -13,8 -13,-7', fill: '#f29a38', stroke: '#ffd09a', 'stroke-width': 2 }, m);
    }
    m.pos = { x, y };
    return m;
  }

  function setPos(m, x, y) { m.pos = { x, y }; m.setAttribute('transform', `translate(${x} ${y})`); }
  function tween(m, x, y, ms) {
    return new Promise((res) => {
      const x0 = m.pos.x; const y0 = m.pos.y; const t0 = performance.now();
      const step = (t) => {
        const k = Math.min(1, (t - t0) / ms);
        const e = 1 - Math.pow(1 - k, 3);
        setPos(m, x0 + (x - x0) * e, y0 + (y - y0) * e);
        if (k < 1) requestAnimationFrame(step); else res();
      };
      requestAnimationFrame(step);
    });
  }
  function floatText(g, x, y, text, color) {
    const t = svgEl('text', { x, y, fill: color, 'font-size': 20, 'font-weight': 800, 'text-anchor': 'middle' }, g);
    t.textContent = text;
    t.animate([{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(-26px)' }], { duration: 1100, fill: 'forwards' });
    setTimeout(() => t.remove(), 1150);
  }

  // 막 통과 실험: 분자를 세포막에 끌어다 놓기
  function buildMembrane(svg) {
    const R = 112;
    const g = lensBase(svg, R);
    [[-40, -30, 'water'], [36, 24, 'water'], [-10, 50, 'sugar'], [30, -40, 'sugar']].forEach(([dx, dy, t]) => {
      const m = molecule(g, t, CX + dx, CY + dy); m.style.opacity = 0.55; m.style.pointerEvents = 'none';
    });
    const outer = ['water', 'sugar', 'water', 'water', 'sugar', 'water', 'sugar', 'water', 'water', 'sugar'];
    outer.forEach((t, i) => {
      const a = (i / outer.length) * Math.PI * 2 + 0.3;
      const r = 172 + (i % 2) * 18;
      molecule(g, t, CX + Math.cos(a) * r, CY + Math.sin(a) * r);
    });
    let dragM = null;
    const toSvg = (e) => {
      const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY;
      return p.matrixTransform(svg.getScreenCTM().inverse());
    };
    svg.addEventListener('pointerdown', (e) => {
      const m = e.target.closest('.mol');
      if (!m || m.busy) return;
      dragM = m; m.classList.add('dragging'); svg.setPointerCapture(e.pointerId);
      g.appendChild(m);
    });
    svg.addEventListener('pointermove', (e) => {
      if (!dragM) return;
      const p = toSvg(e); setPos(dragM, p.x, p.y);
    });
    svg.addEventListener('pointerup', async () => {
      if (!dragM) return;
      const m = dragM; dragM = null; m.classList.remove('dragging');
      const dx = m.pos.x - CX; const dy = m.pos.y - CY; const d = Math.hypot(dx, dy);
      if (d > R + 28) return;
      const a = Math.atan2(dy, dx);
      m.busy = true;
      if (m.dataset.type === 'water') {
        await tween(m, CX + Math.cos(a) * (R - 40), CY + Math.sin(a) * (R - 40), 450);
        floatText(g, CX + Math.cos(a) * (R + 10), CY + Math.sin(a) * (R + 10) - 10, '통과', '#9cc8ff');
        S.zoom && (S.zoom.triedWater = true);
        m.style.pointerEvents = 'none';
      } else {
        await tween(m, CX + Math.cos(a) * (R + 4), CY + Math.sin(a) * (R + 4), 200);
        floatText(g, CX + Math.cos(a) * (R + 10), CY + Math.sin(a) * (R + 10) - 10, '막힘', '#ffc27a');
        await tween(m, CX + Math.cos(a) * (R + 75), CY + Math.sin(a) * (R + 75), 420);
        S.zoom && (S.zoom.triedSugar = true);
        m.busy = false;
      }
      checkMembraneDone();
    });
  }

  async function checkMembraneDone() {
    const z = S.zoom;
    if (!z || !z.collect || !z.triedWater || !z.triedSugar || z.awarded) return;
    z.awarded = true;
    await sleep(500);
    await awardModel(z.model, $('#zoom svg.field'));
    await sleep(300);
    closeZoom(true);
  }

  // 슬라이더로 평형 찾기
  function buildSlider(svg) {
    const z = S.zoom;
    const g = lensBase(svg, 110);
    const rnd = mulberry(7);
    z.inPts = Array.from({ length: 30 }, () => ({ r: Math.sqrt(rnd()) * 0.86, a: rnd() * Math.PI * 2 }));
    z.outPts = Array.from({ length: 30 }, () => ({ r: 160 + rnd() * 48, a: rnd() * Math.PI * 2 }));
    z.dots = svgEl('g', {}, g);
    z.arrows = svgEl('g', {}, g);
    z.labels = svgEl('g', {}, g);
    z.R = 110;
    const input = $('#inside');
    input.addEventListener('input', () => { z.inside = Number(input.value); renderSlider(); });
    renderSlider(true);
  }

  function renderSlider(instant) {
    const z = S.zoom;
    const diff = z.inside - z.outside;
    const target = 110 * (1 + Math.max(-0.28, Math.min(0.28, diff * 0.9)));
    $('#insideVal').textContent = z.inside.toFixed(2);
    const from = z.R;
    const t0 = performance.now();
    const step = (t) => {
      if (!S.zoom) return;
      const k = instant ? 1 : Math.min(1, (t - t0) / 350);
      z.R = from + (target - from) * k;
      $('#cell').setAttribute('r', z.R);
      $('#cell2').setAttribute('r', z.R - 9);
      drawSliderContents();
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function drawSliderContents() {
    const z = S.zoom;
    const R = z.R;
    z.dots.innerHTML = '';
    const nIn = Math.round(z.inside * 50);
    const nOut = Math.round(z.outside * 50);
    z.inPts.slice(0, nIn).forEach((p) => svgEl('circle', { cx: CX + Math.cos(p.a) * p.r * R, cy: CY + Math.sin(p.a) * p.r * R, r: 6, fill: '#f29a38' }, z.dots));
    z.outPts.slice(0, nOut).forEach((p) => {
      const r = Math.max(p.r, R + 22);
      svgEl('circle', { cx: CX + Math.cos(p.a) * r, cy: CY + Math.sin(p.a) * r, r: 6, fill: '#f29a38' }, z.dots);
    });
    z.arrows.innerHTML = '';
    const diff = z.inside - z.outside;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.5;
      const o = R + 46; const n = R - 26;
      const pt = (r) => [CX + Math.cos(a) * r, CY + Math.sin(a) * r];
      if (Math.abs(diff) < 0.001) {
        const [x1, y1] = pt(o - 6); const [x2, y2] = pt(n + 6);
        svgEl('line', { x1, y1, x2, y2, stroke: '#7cc0ff', 'stroke-width': 4, 'marker-end': 'url(#wArrow)', 'marker-start': 'url(#wArrow)', opacity: 0.45 }, z.arrows);
      } else {
        const [x1, y1] = pt(diff > 0 ? o : n); const [x2, y2] = pt(diff > 0 ? n : o);
        svgEl('line', { x1, y1, x2, y2, stroke: '#7cc0ff', 'stroke-width': 5, 'marker-end': 'url(#wArrow)' }, z.arrows);
      }
    }
    z.labels.innerHTML = '';
    const t1 = svgEl('text', { x: CX, y: CY + 6, fill: '#e8fff2', 'font-size': 22, 'font-weight': 800, 'text-anchor': 'middle' }, z.labels);
    t1.textContent = `안 ${z.inside.toFixed(2)} M`;
    const t2 = svgEl('text', { x: CX, y: 34, fill: '#cfe0ea', 'font-size': 18, 'font-weight': 700, 'text-anchor': 'middle' }, z.labels);
    t2.textContent = `바깥 ${z.outside} M`;
  }

  async function pickSlider() {
    const z = S.zoom;
    if (!z || z.awarded) return;
    const ok = z.collectWhen === 'swell' ? z.inside > z.outside + 0.001 : true;
    if (!ok) { shake($('#zoom .lens')); return; }
    z.awarded = true;
    await awardModel(z.model, $('#zoom svg.field'));
    await sleep(300);
    closeZoom(true);
  }

  function mulberry(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  async function awardModel(id, fromEl) {
    if (!id || hasCard(id)) return;
    await addCard({ id, type: 'model', text: M.models[id].text }, fromEl);
    if (S.q) { S.q.needModel = false; S.q.lastInput = now(); }
  }

  // ── 답하기 시트 ──
  function openAnswerSheet() {
    const q = S.q;
    if (!q || q.done || q.needModel || S.busy) return;
    const a = q.quest.answer;
    const pin = q.question;
    let html = '';
    if (a.type === 'choice') {
      const [pre, post] = a.prompt.split('[ ? ]');
      html = `<h4>${tx(pre)}<u>&nbsp;&nbsp;?&nbsp;&nbsp;</u>${tx(post)}</h4>
        <div class="opts">${a.options.map((o, i) => `<button type="button" class="opt${q.draft.choice === i ? ' on' : ''}" data-choice="${i}">${tx(o.label)}</button>`).join('')}</div>
        <div class="actions"><button type="button" class="submit" data-act="answer" ${q.draft.choice == null ? 'disabled' : ''}>교수님께 답하기</button></div>`;
    } else if (a.type === 'choice+text') {
      html = `<div class="line"><b>${tx(a.prompt)}</b>
          ${a.options.map((o) => `<button type="button" class="opt${q.draft.choice === o.value ? ' on' : ''}" data-choice="${o.value}" style="min-width:110px">${tx(o.label)}</button>`).join('')}</div>
        <div class="line">${tx(a.textPrefix)} <input type="text" id="ansText" maxlength="80" placeholder="${esc(a.placeholder)}" value="${esc(q.draft.text || '')}"> ${tx(a.textSuffix)}</div>
        <div class="actions"><button type="button" class="submit" data-act="answer">교수님께 답하기</button></div>`;
    } else {
      html = `<div class="starter">${tx(a.starter)}</div>
        <textarea id="ansText" maxlength="400" placeholder="${esc(a.placeholder)}">${esc(q.draft.text || '')}</textarea>
        <div class="actions"><button type="button" class="submit" data-act="answer">교수님께 답하기</button></div>`;
    }
    const sh = openSheet(html, { name: 'answer', pin, focusSel: a.type === 'choice' ? null : '#ansText' });
    const syncBtn = () => {
      const btn = $('[data-act="answer"]', sh);
      const txt = $('#ansText', sh);
      if (txt) q.draft.text = txt.value;
      if (a.type === 'choice') btn.disabled = q.draft.choice == null;
      else if (a.type === 'choice+text') btn.disabled = !q.draft.choice || !q.draft.text?.trim();
      else btn.disabled = !q.draft.text?.trim();
    };
    syncBtn();
    sh.oninput = syncBtn;
    sh.onclick = (e) => {
      const c = e.target.closest('[data-choice]');
      if (c) {
        q.draft.choice = a.type === 'choice' ? Number(c.dataset.choice) : c.dataset.choice;
        $$('[data-choice]', sh).forEach((b) => b.classList.toggle('on', b === c));
        syncBtn();
      }
      if (e.target.closest('[data-act="answer"]')) submitAnswer();
    };
  }

  // LLM 결과(체크 항목 참/거짓 + 오류 유형)를 키워드 판정과 합친다.
  function mergeQuestLLM(kw, llm, quest, choice) {
    if (!llm || typeof llm !== 'object' || !llm.checks) return { ...kw, judgedBy: 'keyword' };
    const need = Object.keys(quest.llmChecks || {});
    const allTrue = need.every((k) => llm.checks[k] === true);
    const choiceOk = !quest.judge?.choiceCorrect || choice === quest.judge.choiceCorrect;
    const valid = ['N1', 'N2', 'E1', 'E2', 'E3', 'UNCLEAR'];
    let diagnosis;
    if (!choiceOk) diagnosis = 'E2';
    else if (allTrue) diagnosis = 'PASS';
    else diagnosis = valid.includes(llm.error_type) ? llm.error_type : (kw.diagnosis !== 'PASS' ? kw.diagnosis : 'E3');
    return { diagnosis, checks: Object.assign({}, kw.checks, llm.checks), llmError: llm.error_type || null, judgedBy: 'llm' };
  }

  async function submitAnswer() {
    const q = S.q;
    const quest = q.quest;
    const a = quest.answer;
    closeSheet();
    S.busy = true; updateDo();
    let result;
    let input;
    if (a.type === 'choice') {
      const opt = a.options[q.draft.choice];
      input = opt.label;
      result = { diagnosis: opt.diagnosis, checks: { water_in: opt.diagnosis === 'PASS' }, judgedBy: 'choice', line: opt.line };
    } else {
      const text = a.type === 'text' ? `${a.starter} ${q.draft.text}` : q.draft.text;
      input = a.type === 'choice+text' ? `${a.prompt} ${a.options.find((o) => o.value === q.draft.choice).label}. ${a.textPrefix} ${q.draft.text} ${a.textSuffix}` : text;
      const kw = JUDGE.judgeQuestText(quest, text, q.draft.choice, M.lexicon);
      showBubble(M.thinkingLine);
      const [llm] = await Promise.all([
        API.judge({ kind: 'quest', missionId: M.id, questId: quest.id, text: input, checks: quest.llmChecks }, CFG.LLM_TIMEOUT_MS),
        sleep(1100)
      ]);
      result = mergeQuestLLM(kw, llm, quest, q.draft.choice);
    }
    const d = result.diagnosis;
    const errorType = ['N1', 'N2', 'E1', 'E2', 'E3'].includes(d) ? d : '';
    logAttempt({ stage: 'rebuttal', questId: quest.id, element: quest.element, input, judgment: result.checks, diagnosis: d, errorType, judgedBy: result.judgedBy });

    if (d === 'PASS') {
      q.done = true;
      $('#questNote .hint').hidden = true;
      await say([lineFor('PASS')]);
      setNose(S.nose - 1);
      markPassed(quest.element);
      await sleep(700);
      S.busy = false;
      if (S.questIdx < M.quests.length - 1) startQuest(S.questIdx + 1);
      else startCombine();
      return;
    }

    // 틀림: 교수의 반박 대사로만 전달 (벌점 표시 없음)
    if (errorType) q.errors[d] = (q.errors[d] || 0) + 1;
    const count = q.errors[d] || 0;
    const line = result.line || lineFor(d, quest);
    const modelText = count >= 3 && quest.model ? M.models[quest.model].text
      : count >= 3 ? M.models.M2.text : null;
    await say([line], { model: modelText });
    S.q.question = line;
    if (count >= 3) raiseHint(2);
    else if (count >= 2) raiseHint(1);
    S.busy = false;
    react(d);
  }

  function react(d) {
    const r = M.reactions[d] || 'none';
    if (r === 'microscope' || r === 'slider') {
      S.q.microscopeGlow = true;
      if (r === 'slider') S.q.sliderGlow = true;
      refreshFocus();
      return;
    }
    openAnswerSheet();
    if (r === 'hintDelay') setTimeout(() => { if (S.q && !S.q.done) showHintLine(); }, 3000);
  }

  // ── W3: 두 결론을 칠판에 올려 범위 좁히기 ──
  async function startCombine() {
    const cb = M.combine;
    S.q = { quest: cb, combine: true, errors: {}, hintLevel: 0, lastInput: now(), done: false };
    S.attemptClock = now();
    S.placed = [];
    $('#board').classList.add('combine');
    setNote(cb.note);
    refreshFocus();
    for (const c of cb.cards) {
      await addCard({ id: c.id, type: 'concl', text: c.text }, objEl('prof'));
      await sleep(150);
    }
    $$('#trayCards .card.concl').forEach((el) => el.classList.add('glow'));
    $('#board .axis').innerHTML = ART.axis(cb.axis, null, null);
    $('#board .axis').classList.add('show');
  }

  async function placeOnBoard(id) {
    if (S.placed.includes(id) || S.busy) return;
    noteInput();
    S.placed.push(id);
    const card = M.combine.cards.find((c) => c.id === id);
    const c = S.cards.find((x) => x.id === id);
    c.used = true;
    renderTray();
    $$('#trayCards .card.concl:not(.used)').forEach((el) => el.classList.add('glow'));
    const span = document.createElement('span');
    span.textContent = card.text;
    $('#board .placed').appendChild(span);
    if (S.placed.length < M.combine.cards.length) return;
    S.busy = true; updateDo();
    const lo = Math.max(...M.combine.cards.filter((k) => k.bound === 'low').map((k) => k.value));
    const hi = Math.min(...M.combine.cards.filter((k) => k.bound === 'high').map((k) => k.value));
    $('#board .axis').innerHTML = ART.axis(M.combine.axis, lo, hi);
    $('#board .axis .band').animate([{ opacity: 0, transform: 'scaleX(0)' }, { opacity: 0.85, transform: 'scaleX(1)' }], { duration: 800, fill: 'forwards' });
    logAttempt({ stage: 'rebuttal', questId: 'W3', element: 'W3', input: S.placed.join(','), judgment: { W3: true, range: [lo, hi] }, diagnosis: 'PASS', judgedBy: 'choice' });
    markPassed('W3');
    S.q.done = true;
    $('#questNote .hint').hidden = true;
    await sleep(1000);
    await say([M.combine.passLine]);
    S.busy = false;
    startDefense();
  }

  // ───────────────────────── 4. 최종 변론 ─────────────────────────
  async function startDefense() {
    S.busy = true; updateDo();
    setStage('defense');
    S.q = null;
    const df = M.defense;
    $('#spot').classList.remove('on');
    $('#prof').classList.remove('stand');
    $('#prof').classList.add('atboard');
    const board = $('#board');
    board.classList.add('defense');
    $('.paper', board).innerHTML = `<h3>${bySentence(df.problem)}</h3>${df.dataLines.map((l) => `<div class="row">• ${tx(l)}</div>`).join('')}`;
    $('#tray').classList.add('closed');
    focus([], { dim: true, keep: ['prof', 'board'] });
    await sleep(1000);
    await say(df.intro, { keep: true });
    S.defenseQuestion = df.intro[df.intro.length - 1];
    setNote(df.note);
    S.busy = false;
    S.attemptClock = now();
    openDefenseSheet();
  }

  function openDefenseSheet() {
    const df = M.defense;
    const sh = openSheet(`
      <textarea id="defText" placeholder="${esc(df.placeholder)}">${esc(S.defenseText)}</textarea>
      <div class="actions"><button type="button" class="submit" data-act="defend" ${S.defenseText.trim() ? '' : 'disabled'}>교수님께 제출</button></div>
    `, { name: 'defense', full: true, pin: S.defenseQuestion, focusSel: '#defText' });
    sh.oninput = () => {
      S.defenseText = $('#defText', sh).value;
      $('[data-act="defend"]', sh).disabled = !S.defenseText.trim();
    };
    sh.onclick = (e) => { if (e.target.closest('[data-act="defend"]')) submitDefense(); };
  }

  function mergeDefenseLLM(kw, llm) {
    if (!llm || typeof llm !== 'object' || !llm.elements) return { ...kw, judgedBy: 'keyword' };
    const e = llm.elements;
    const WB = e.WB === true;
    const elements = {
      C: e.C === true, D: e.D === true, W1: e.W1 === true,
      W2a: e.W2a === true || WB, W2b: e.W2b === true || WB, W3: e.W3 === true || WB, WB
    };
    const valid = ['N1', 'N2', 'E1', 'E2', 'E3'];
    const errors = Array.isArray(llm.errors) ? llm.errors.filter((x) => valid.includes(x)) : kw.errors;
    return { elements, errors, evidence: kw.evidence, viaWB: WB && !(e.W2a && e.W2b && e.W3), unclear: kw.unclear, judgedBy: 'llm' };
  }

  async function submitDefense() {
    const text = S.defenseText.trim();
    closeSheet();
    S.busy = true; updateDo();
    showBubble(M.thinkingLine);
    const kw = JUDGE.judgeDefense(text, M.lexicon);
    const [llm] = await Promise.all([
      API.judge({ kind: 'defense', missionId: M.id, questId: 'FINAL', text, checks: M.llmDefenseChecks }, CFG.LLM_TIMEOUT_MS),
      sleep(1300)
    ]);
    const r = mergeDefenseLLM(kw, llm);
    const el = r.elements;
    const full = el.C && el.D && el.W1 && el.W2a && el.W2b && el.W3;
    const unclear = r.unclear && !Object.values(el).some(Boolean);
    const errorType = unclear ? '' : (r.errors[0] || '');
    if (!unclear) S.defenseTries += 1;
    logAttempt({
      stage: 'defense', questId: 'FINAL', element: 'ALL', input: text,
      judgment: Object.assign({}, el, { errors: r.errors, viaWB: r.viaWB }),
      diagnosis: unclear ? 'UNCLEAR' : full ? 'PASS' : 'MISSING', errorType, judgedBy: r.judgedBy
    });
    S.lastDefense = r;

    if (full) { S.busy = false; return finish('full', text, r); }
    if (S.defenseTries >= 1 + M.defense.maxRetries) { S.busy = false; return finish('partial', text, r); }

    let line;
    if (unclear) line = lineFor('UNCLEAR');
    else if (r.errors.includes('E1')) line = lineFor('E1');
    else if (r.errors.includes('E2')) line = lineFor('E2');
    else if (r.errors.includes('N2') && !el.W1) line = lineFor('N2');
    else {
      const miss = M.defense.order.find((k) => !el[k]);
      line = variant('def' + miss, M.defense.missingLines[miss]);
    }
    await say([line], { keep: true });
    S.defenseQuestion = line;
    S.busy = false;
    openDefenseSheet();
  }

  // ───────────────────────── 클리어 ─────────────────────────
  async function finish(type, text, r) {
    S.busy = true; updateDo();
    setNose(0);
    await sleep(700);
    await say([type === 'full' ? M.defense.passLine : M.defense.partialLine]);
    setStage(null);
    const el = r.elements;
    const finalJudgment = { C: el.C, D: el.D, W1: el.W1, W2a: el.W2a, W2b: el.W2b, W3: el.W3, WB: el.WB };
    Object.assign(S.session, {
      endedAt: new Date().toISOString(), clearType: type, finalAnswer: text, finalJudgment,
      defenseTries: S.defenseTries, judgedBy: r.judgedBy
    });
    API.updateSession(S.session.sessionId, {
      endedAt: S.session.endedAt, clearType: type, finalAnswer: text, finalJudgment,
      defenseTries: S.defenseTries, stageTimes: S.session.stageTimes, judgedBy: r.judgedBy
    }, true);
    showClear(type, text, r);
  }

  function highlight(text, evidence) {
    const keys = ['W1', 'W2a_water', 'W2a', 'W2b_water', 'W2b', 'principle', 'WB'];
    const ranges = [];
    keys.forEach((k) => {
      const s = evidence[k];
      if (!s) return;
      const i = text.indexOf(s);
      if (i >= 0) ranges.push([i, i + s.length]);
    });
    ranges.sort((a, b) => a[0] - b[0]);
    const merged = [];
    ranges.forEach((r) => {
      const last = merged[merged.length - 1];
      if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]); else merged.push(r.slice());
    });
    let out = ''; let pos = 0;
    merged.forEach(([a, b]) => { out += esc(text.slice(pos, a)) + '<mark>' + esc(text.slice(a, b)) + '</mark>'; pos = b; });
    return out + esc(text.slice(pos));
  }

  function quoteOf(s) {
    const t = String(s || '').trim().replace(/[\s.。,，]+$/, '');
    return t.length > 46 ? t.slice(0, 44) + '…' : t;
  }

  function showClear(type, text, r) {
    const el = r.elements;
    const ev = r.evidence || {};
    const praise = [];
    const tryPraise = (k, evKey) => {
      if (praise.length >= 2 || !el[k]) return;
      const q = ev[evKey || k];
      if (q) praise.push(M.clear.praise[k](quoteOf(q)));
    };
    if (r.viaWB) tryPraise('WB');
    tryPraise('W2a', ev.W2a_water ? 'W2a_water' : 'W2a');
    tryPraise('W2b', ev.W2b_water ? 'W2b_water' : 'W2b');
    tryPraise('W3');
    tryPraise('W1');
    let next = '';
    if (type === 'partial') {
      const miss = ['W1', 'W2a', 'W2b', 'W3', 'C', 'D'].find((k) => !el[k]);
      if (miss) next = M.clear.nextTime[miss];
    }
    const wrap = $('#clearScreen .wrap');
    wrap.innerHTML = `
      <div class="top">
        ${ART.professor(0)}
        <div>
          <h2>${tx(type === 'full' ? M.clear.title : M.defense.partialLine[0])}</h2>
          ${type === 'partial' ? '<div class="partial">부분 클리어</div>' : ''}
        </div>
      </div>
      <div class="cmp">
        <div class="col first"><h3>처음 답 (칠판)</h3><p>${tx(S.firstAnswer)}</p></div>
        <div class="col"><h3>지금 답 (최종 변론)</h3><p>${highlight(text, ev)}</p></div>
      </div>
      <ul class="praise">
        ${praise.map((p) => `<li>${tx(p)}</li>`).join('')}
        ${next ? `<li class="next">${tx(next)}</li>` : ''}
      </ul>
      <div class="foot"><button type="button" id="nextMission">다음 미션</button></div>`;
    $('#clearScreen').hidden = false;
    $('#clearScreen .top svg').classList.add('flat');
    $('#nextMission').onclick = showMissionList;
  }

  function showMissionList() {
    const wrap = $('#clearScreen .wrap');
    wrap.innerHTML = `
      <div class="start-card" style="margin:auto">
        <div class="tag">서술 실험실</div>
        <h1>미션 목록</h1>
        <div class="missions">
          <div class="m">${tx(M.label)} · ${tx(M.title)} <span>클리어</span></div>
          <div class="m" style="opacity:.55">미션 02 · 준비 중 <span>곧 열려요</span></div>
        </div>
        <button class="go" type="button" id="again">미션 01 다시 하기</button>
      </div>`;
    $('#again').onclick = () => location.reload();
  }

  // ───────────────────────── 시작 ─────────────────────────
  function setupStart() {
    $('#startTag').textContent = `서술 실험실 · ${M.label}`;
    $('#startTitle').textContent = M.title;
    $('#modeNote').textContent = API.isLocal
      ? '로컬 모드: 기록이 이 기기에만 저장됩니다 (config.js에 API_URL을 넣으면 서버에 저장).'
      : '기록은 선생님 화면으로 전송됩니다.';
    const cc = $('#classCode'); const sn = $('#studentNo'); const go = $('#goBtn');
    try { cc.value = localStorage.getItem('sciw_class') || ''; } catch (e) { /* noop */ }
    const sync = () => { go.disabled = !(cc.value.trim() && /^\d{1,3}$/.test(sn.value.trim())); };
    cc.oninput = sync; sn.oninput = sync; sync();
    $('#startForm').onsubmit = (e) => {
      e.preventDefault();
      if (go.disabled) return;
      try { localStorage.setItem('sciw_class', cc.value.trim()); } catch (err) { /* noop */ }
      start(cc.value.trim(), String(Number(sn.value.trim())));
    };
  }

  function start(classCode, studentNo) {
    $('#startScreen').hidden = true;
    $('#who').textContent = `${classCode} · ${studentNo}번`;
    S.session = {
      sessionId: API.uid('s'),
      classCode, studentNo, missionId: M.id,
      startedAt: new Date().toISOString(), endedAt: '',
      stageTimes: {}, clueCards: [], modelCards: [], clearType: '',
      firstAnswer: '', finalAnswer: '', finalJudgment: {}, questPassed: {},
      firstError: '', errorCounts: {}, hintTotal: 0, hintMax: {}, defenseTries: 0, judgedBy: ''
    };
    API.startSession(S.session);
    buildScene();
    setNose(2);
    setStage('explore');
    setNote('비커를 눌러 실험 결과를 모아 보자');
    renderTray();
    refreshFocus();
  }

  window.addEventListener('resize', fit);
  setupStart();
})();
