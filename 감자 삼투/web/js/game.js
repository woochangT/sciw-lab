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
  const LEARNING = window.SCIW_LEARNING;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // 화면 표시용: "0.2 M"처럼 숫자와 단위가 갈라지지 않게, "→"는 앞 낱말에 붙인다(학생 입력에는 쓰지 않는다).
  const nb = (s) => String(s ?? '').replace(/(\d)\s+(M|%|g|번)(?![A-Za-z])/g, '$1\u00a0$2').replace(/\s+→/g, '\u00a0→');
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
    insertedCardIds: [],
    defenseTries: 0,
    firstAnswer: '',
    zoom: null,
    busy: false
  };

  // ───────────────────────── 장면 ─────────────────────────
  function buildScene() {
    const maxConc = Math.max(...M.data.map((d) => d.conc)) || 1;
    $('#missionTitle').textContent = `${M.label} · ${M.title}`;
    $('#stage').innerHTML = `
      <div id="board" class="obj" data-obj="board" data-drop="board" role="button" tabindex="0" aria-label="칠판에 내 주장 적기">
        <div class="frame">
          <div class="q">${tx(M.boardQuestion)}</div>
          <div class="board-sketch" aria-hidden="true"><svg viewBox="0 0 180 80"><path d="M28 20Q53 4 76 22Q95 52 69 63Q42 79 23 58Q7 39 28 20Z"/><path d="M33 30h2m20-6h2M26 48h2m32 2h2M48 61h2"/><text x="125" y="58">?</text></svg></div>
          <div class="chalk"></div>
          <div class="placed"></div>
          <div class="axis"></div>
          <div class="paper"></div>
        </div>
      </div>
      <div id="prof" class="obj" data-obj="prof" role="button" tabindex="0" aria-label="콧대 교수에게 답하기">${ART.professor(S.nose)}</div>
      <div id="bench" class="obj"></div>
      ${M.data.map((d, i) => `
        <div class="obj beaker tap" id="obj-${d.id}" data-obj="${d.id}" role="button" tabindex="0" aria-label="${tx(concLabel(d.conc))} 설탕물 관찰" style="left:${60 + i * 114}px">
          ${ART.beaker(d.conc / maxConc)}<div class="tag">${tx(concLabel(d.conc))}</div>
        </div>`).join('')}
      <div id="notebook" class="obj tap" data-obj="notebook" role="button" tabindex="0" aria-label="실험 노트 확인">${ART.notebook()}</div>
      <div id="microscope" class="obj tap locked" data-obj="microscope" data-drop="microscope" role="button" tabindex="0" aria-label="마법 현미경: 분자의 이동을 보여 주는 개념 모형" aria-disabled="true"><span class="scope-aura" aria-hidden="true"></span>${ART.microscope()}<span class="scope-name">마법 현미경</span><span class="scope-lock"><svg viewBox="0 0 24 28" aria-hidden="true"><path d="M6 12V8a6 6 0 0 1 12 0v4M4 12h16v13H4zM12 17v4"/></svg>반박 단계에서<br>열려요</span></div>
      <div id="spot"></div>`;
    $('#stage').addEventListener('click', (e) => {
      const el = e.target.closest('[data-obj]');
      if (el) onObject(el.dataset.obj, el);
    });
    $('#stage').addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const el = e.target.closest('[data-obj]');
      if (el) { e.preventDefault(); onObject(el.dataset.obj, el); }
    });
    $('#prof').addEventListener('transitionend', positionNoseMeter);
    fit();
  }

  function fit() {
    const zone = $('#sceneZone');
    const s = Math.min(zone.clientWidth / 1000, zone.clientHeight / 560);
    $('#stage').style.transform = `scale(${s}) translate(-50%, -50%)`;
    positionNoseMeter();
    scheduleDefenseLayout();
  }

  // Keep the meter beside the NPC and above the answer-sheet dimmer.
  function positionNoseMeter() {
    const meter = $('#noseMeter');
    const prof = $('#prof');
    if (!prof || S.zoom) { meter.hidden = true; return; }
    meter.hidden = false;
    const r = prof.getBoundingClientRect();
    const zone = $('#sceneZone').getBoundingClientRect();
    const bubble = $('#bubble');
    let top = r.top + r.height * .22;
    if (bubble.classList.contains('show')) top = Math.max(top, bubble.getBoundingClientRect().bottom + 12);
    meter.style.left = Math.min(innerWidth - meter.offsetWidth - 12, r.right + 7) + 'px';
    meter.style.top = Math.min(top, zone.bottom - meter.offsetHeight - 12) + 'px';
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
    const portrait = $('#prof .professor-art');
    if (portrait) portrait.dataset.expression = ART.expression(level);
    $('#noseMeter').setAttribute('aria-valuenow', level);
    $('#noseMeter').setAttribute('aria-valuetext', `콧대 ${level}단계 남음`);
    $('#noseMeter .nose-value').textContent = `${level} / 4`;
    $$('#noseMeter i').forEach((el, i) => el.classList.toggle('on', 3 - i < level));
    positionNoseMeter();
  }

  function setStage(stage) {
    const t = now();
    if (S.stage && S.session) {
      S.session.stageTimes[S.stage] = (S.session.stageTimes[S.stage] || 0) + (t - S.stageStart);
    }
    S.stage = stage;
    if (S.session && stage) API.updateSession(S.session.sessionId, { stage });
    $('#app').dataset.stage = stage || 'clear';
    document.body.dataset.stage = stage || 'clear';
    $('#questArea').hidden = !stage;
    if (!stage) cancelInstruction();
    scheduleDefenseLayout();
    S.stageStart = t;
    const idx = stage ? STAGES.indexOf(stage) : STAGES.length;
    $$('#track li').forEach((li, i) => {
      li.classList.toggle('on', i === idx);
      li.classList.toggle('done', i < idx);
      if (i === idx) li.setAttribute('aria-current', 'step');
      else li.removeAttribute('aria-current');
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
    scheduleDefenseLayout();
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
    else if (S.pop) t = S.pop.have ? '<b>닫기</b>를 눌러 창을 닫으세요' : '<b>단서 수집</b>을 눌러 카드를 모으세요';
    else if (z && z.found && !z.awarded) t = '<b>단서 수집</b>을 눌러 카드를 모으세요';
    else if (z && z.collect && !z.awarded) {
      t = z.mode === 'membrane'
        ? '<b>물</b>과 <b>설탕</b> 분자를 하나씩 세포막으로 끌어다 놓으세요'
        : '<b>슬라이더</b>를 움직여 세포가 부풀면 <b>이거다!</b>를 누르세요';
    } else if (z) {
      t = '더 실험해 봐도 좋아요. 다 보면 <b>실험대로 돌아가기</b>를 누르세요';
    } else if (S.stage === 'explore') {
      const step = exploreStep();
      const total = M.clues.filter((c) => c.kind === 'result').length;
      if (step === 'beakers') t = `<b>비커</b>를 모두 눌러 결과를 모으세요 (${total - missingClues('result').length}/${total})`;
      else if (step === 'notebook') t = '빛나는 <b>실험 노트</b>를 누르세요';
      else t = '빛나는 <b>칠판</b>을 누르세요';
    } else if (S.sheetOpen === 'answer') {
      t = S.q?.quest.answer.type === 'choice' ? '답을 고르고 <b>교수님께 답하기</b>를 누르세요' : '설명을 쓰고 <b>교수님께 답하기</b>를 누르세요';
    } else if (S.stage === 'claim') {
      t = S.sheetOpen === 'claim' ? '<b>주장 1개와 근거 2장</b>을 골라 교수님께 제출하세요' : '<b>칠판</b>을 눌러 답을 마저 쓰세요';
    } else if (S.stage === 'rebuttal' && S.q && !S.q.done) {
      if (S.q.combine) t = '아래 <b>초록 카드 2장</b>을 눌러 칠판에 올리세요';
      else if (S.q.needModel) t = '빛나는 <b>현미경</b>을 누르세요';
      else if (S.q.microscopeGlow) t = '<b>현미경</b>으로 다시 확인하거나, <b>교수님</b>을 눌러 답하세요';
      else t = '<b>교수님</b>을 눌러 답하세요';
    } else if (S.stage === 'defense') {
      t = S.sheetOpen === 'defense' ? '위 질문과 자료를 보고 <b>내 설명</b>을 완성하세요' : '<b>교수님</b>을 눌러 답안을 쓰세요';
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
    positionNoseMeter();
    scheduleDefenseLayout();
  }
  function hideBubble() { $('#bubble').classList.remove('show'); positionNoseMeter(); scheduleDefenseLayout(); }

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
    closePop();
    const sh = $('#sheet');
    sh.innerHTML = `<div class="grab"><button type="button" aria-label="시트 닫기" data-act="close"></button></div>${html}`;
    sh.classList.toggle('full', !!opts.full);
    sh.dataset.sheet = opts.name || '';
    sh.classList.add('open');
    $('#dim').classList.add('on');
    if (opts.pin) showBubble(opts.pin, { tap: false });
    S.sheetOpen = opts.name || true;
    updateDo();
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
      const step = exploreStep();
      if (step === 'beakers') focus(missingClues('result').map((c) => c.source), { soft: missingClues('result').map((c) => c.source) });
      else focus([step === 'notebook' ? 'notebook' : 'board']);
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
  const hasCard = (id) => S.cards.some((c) => c.id === id);

  function cardHTML(c) {
    const attrs = `data-id="${c.id}" role="button" tabindex="0" aria-label="${tx(c.text)}"`;
    if (c.type === 'model') return `<div class="card model" ${attrs}><span><b>${tx(LEARNING.modelLabel(c.id))}</b> ${tx(c.text)}</span></div>`;
    const cls = c.type === 'concl' ? 'concl' : `clue ${c.kind}`;
    const data = c.kind === 'result' && M.data.find((d) => d.id === c.id);
    const body = data
      ? `<span class="card-eyebrow">실험 결과</span><span class="card-concentration">${tx(concLabel(data.conc))} 설탕물</span><span class="card-mass ${data.change >= 0 ? 'up' : 'down'}">${data.change >= 0 ? '↑ +' : '↓ −'}${Math.abs(data.change)} <small>${tx(M.massUnit)}</small></span>`
      : `${c.kind === 'condition' ? '<span class="card-eyebrow">▤ 실험 조건</span>' : ''}${tx(c.text)}`;
    return `<div class="card ${cls}${c.used ? ' used' : ''}" ${attrs}>${body}</div>`;
  }
  function renderTray() {
    const tray = $('#trayCards');
    const previousScroll = tray.scrollLeft;
    const clues = S.cards.filter((c) => c.type === 'clue').length;
    const empty = Math.max(0, M.clues.length - clues);
    $('#trayCards').innerHTML = S.cards.map(cardHTML).join('') + '<div class="empty-card" aria-hidden="true">▤</div>'.repeat(empty);
    $('#clueCount').textContent = `단서 ${clues} / ${M.clues.length}`;
    tray.scrollLeft = previousScroll;
    requestAnimationFrame(updateTrayNav);
  }
  function updateTrayNav() {
    const tray = $('#trayCards');
    const overflow = tray.scrollWidth > tray.clientWidth + 2;
    $('#trayPrev').hidden = !overflow;
    $('#trayNext').hidden = !overflow;
  }
  $('#trayPrev').onclick = () => $('#trayCards').scrollBy({ left: -260, behavior: 'smooth' });
  $('#trayNext').onclick = () => $('#trayCards').scrollBy({ left: 260, behavior: 'smooth' });
  window.addEventListener('resize', updateTrayNav);
  $('#trayCards').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const el = e.target.closest('.card');
    if (el && !S.busy) { e.preventDefault(); onCardTap(el.dataset.id, el); }
  });

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
      if (S.stage === 'explore' || S.stage === 'claim') return inspectNotebook(el);
      return;
    }
    if (id === 'microscope') {
      if (S.stage !== 'rebuttal' || !S.q || S.q.combine) return shake(el);
      const quest = S.q.quest;
      return openZoom(Object.assign({}, quest.microscope, { collect: S.q.needModel, model: quest.model, sliderGlow: S.q.sliderGlow, quest }));
    }
    if (id === 'board') {
      if (S.stage === 'explore') {
        if (exploreStep() === 'board') return startClaim();
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

  // 탐색 순서: 비커 결과를 다 모으면 실험 노트, 실험 노트까지 모으면 칠판
  const missingClues = (kind) => M.clues.filter((c) => c.kind === kind && !hasCard(c.id));
  function exploreStep() {
    if (missingClues('result').length) return 'beakers';
    if (missingClues('condition').length) return 'notebook';
    return 'board';
  }

  // 비커를 누르면 결과 창이 뜨고, [단서 수집]을 눌러야 창이 닫히며 카드가 수집함으로 간다.
  function inspectBeaker(d, el) {
    const ex = M.explore;
    const up = d.change >= 0;
    openCluePop(el, M.clues.filter((c) => c.source === d.id), `
      <div class="pop-title">${tx(ex.popTitle(d))}</div>
      <div class="pop-body">${ART.potato(d.change)}
        <div class="mass"><span>${tx(ex.massLabel)}</span><b class="num ${up ? 'up' : 'down'}">${up ? '+' : '−'}${Math.abs(d.change)}&nbsp;${tx(M.massUnit)}</b><span>${tx(ex.massWord(d.change))}</span></div>
      </div>`);
  }

  function inspectNotebook(el) {
    const notes = M.clues.filter((c) => c.source === 'notebook');
    openCluePop(el, notes, `
      <div class="pop-title">${tx(M.explore.notebookTitle)}</div>
      <ul class="pop-notes">${notes.map((c) => `<li>${tx(c.text)}</li>`).join('')}</ul>`);
  }

  function openCluePop(el, clues, bodyHTML) {
    closePop();
    const ex = M.explore;
    const have = clues.every((c) => hasCard(c.id));
    const pop = document.createElement('div');
    pop.className = 'result-pop';
    pop.innerHTML = `${bodyHTML}
      ${have ? `<div class="pop-note">${tx(ex.collected)}</div>` : ''}
      <button type="button" class="pop-btn${have ? ' quiet' : ''}" data-act="collect">${tx(have ? ex.close : ex.collect)}</button>`;
    $('#sceneZone').appendChild(pop);
    $('[data-act="collect"]', pop).onclick = collectPop;
    S.pop = { el: pop, clues, have };
    updateDo();
    // 비커 바로 위에 띄우되, 왼쪽 위 퀘스트 쪽지·안내와 겹치면 그 아래로 내린다.
    const zr = $('#sceneZone').getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const qa = $('#questArea').getBoundingClientRect();
    const left = Math.max(8, Math.min(zr.width - pop.offsetWidth - 8, r.left - zr.left + r.width / 2 - pop.offsetWidth / 2));
    let top = r.top - zr.top - pop.offsetHeight - 10;
    if (left < qa.right - zr.left + 8) top = Math.max(top, qa.bottom - zr.top + 10);
    pop.style.left = left + 'px';
    pop.style.top = Math.max(8, top) + 'px';
  }

  function closePop() {
    if (!S.pop) return;
    S.pop.el.remove();
    S.pop = null;
    updateDo();
  }

  async function collectPop() {
    const p = S.pop;
    if (!p) return;
    S.pop = null;
    // 창은 숨기기만 하고 카드가 다 날아간 뒤 지운다(카드가 창 자리에서 출발한다).
    p.el.style.visibility = 'hidden';
    updateDo();
    for (const c of p.clues.filter((x) => !hasCard(x.id))) {
      await addCard({ id: c.id, type: 'clue', kind: c.kind, text: c.text }, p.el);
    }
    p.el.remove();
    let nextInstruction = '';
    if (S.stage === 'explore') {
      const step = exploreStep();
      if (step !== S.exploreStep) { S.exploreStep = step; nextInstruction = M.explore.notes[step]; setNote(nextInstruction); }
    }
    refreshFocus();
    if (nextInstruction) await banner(nextInstruction);
  }

  // ───────────────────────── 2. 주장·근거 ─────────────────────────
  async function startClaim() {
    setStage('claim');
    setNote('주장 하나와 근거 두 장을 골라 제출하자');
    if (!await banner('주장 하나와 근거 두 장을 골라 제출하자')) return;
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
      await say([M.claim.lines.wrongRange(concLabel(d.conc))]);
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
    $('#microscope').classList.remove('locked');
    $('#microscope').setAttribute('aria-disabled', 'false');
    S.busy = false;
    startQuest(0, true);
  }

  let instructionRun = 0;
  let instructionCancel = null;
  function cancelInstruction() {
    if (instructionCancel) instructionCancel();
    instructionRun += 1;
  }
  async function banner(text, opts = {}) {
    cancelInstruction();
    const run = instructionRun;
    const b = $('#banner');
    const card = $('.instruction-card', b);
    const target = $(opts.target || '#questNote');
    const previousFocus = document.activeElement;
    const background = [$('#app'), $('#sheet'), $('#bubble')];
    const previousInert = background.map(el => el.inert);
    let timer; let animation; let release;
    const cleanup = () => {
      clearTimeout(timer);
      $('.instruction-shade',b).getAnimations().forEach(a => a.cancel());
      b.hidden = true;
      delete document.body.dataset.cueTarget;
      background.forEach((el,i) => { el.inert = previousInert[i]; });
      const next = S.zoom ? ($('#zoom [data-act="collectModel"]') || $('#inside') || $('#zoom [data-act="tryWater"]')) : null;
      if (next) next.focus({preventScroll:true});
      else if (previousFocus?.isConnected && !previousFocus.closest('[hidden]')) previousFocus.focus({preventScroll:true});
      instructionCancel = null;
    };
    instructionCancel = () => { animation?.cancel(); release?.(false); cleanup(); };
    $('#instructionText').textContent = nb(text);
    const action = $('#doHint span:last-child')?.textContent || '';
    $('.instruction-action', b).textContent = action;
    $('.instruction-action', b).hidden = !action || action === text;
    b.classList.remove('fly');
    b.hidden = false;
    document.body.dataset.cueTarget = opts.target === '#doHint' ? 'action' : 'note';
    background.forEach(el => { el.inert = true; });
    $('#instructionContinue').focus({preventScroll:true});
    const continueNow = () => { clearTimeout(timer); release?.(true); };
    $('#instructionContinue').onclick = continueNow;
    b.onkeydown = e => { if (e.key === 'Escape') { e.preventDefault(); continueNow(); } };
    const proceed = await new Promise(resolve => { release = resolve; timer = setTimeout(() => resolve(true), Math.min(4400, Math.max(2600, (text.length + action.length) * 45))); });
    if (!proceed || run !== instructionRun) return false;
    const from = card.getBoundingClientRect();
    const to = target.getBoundingClientRect();
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dx = to.left + to.width / 2 - from.left - from.width / 2;
    const dy = to.top + to.height / 2 - from.top - from.height / 2;
    const scale = Math.max(.18, Math.min(to.width / from.width, to.height / from.height));
    animation = card.animate(reduced ? [{opacity:1},{opacity:0}] : [{transform:'translate(0,0) scale(1)',opacity:1},{transform:`translate(${dx}px,${dy}px) scale(${scale})`,opacity:.3}], {duration:reduced ? 160 : 650,easing:'cubic-bezier(.4,0,.2,1)'});
    $('.instruction-shade',b).animate([{opacity:1},{opacity:0}],{duration:reduced ? 160 : 650,fill:'forwards'});
    await animation.finished.catch(() => {});
    if (run !== instructionRun) return false;
    cleanup();
    $('.instruction-shade',b).getAnimations().forEach(a => a.cancel());
    target.classList.remove('arrived'); void target.offsetWidth; target.classList.add('arrived');
    noteInput();
    return true;
  }

  let defenseLayoutFrame = 0;
  function scheduleDefenseLayout() {
    if (defenseLayoutFrame) cancelAnimationFrame(defenseLayoutFrame);
    defenseLayoutFrame = requestAnimationFrame(layoutDefenseContext);
  }
  function layoutDefenseContext() {
    const context = $('#defenseContext');
    if (S.stage !== 'defense') { context.hidden = true; return; }
    if (!context.childElementCount) context.innerHTML = `<div class="context-label">칠판의 질문</div><h2>${bySentence(M.defense.problem)}</h2><div class="defense-data">${M.defense.dataLines.map(line => `<span>${tx(line)}</span>`).join('')}</div>`;
    context.hidden = false;
    const note = $('#questArea').getBoundingClientRect();
    const bubble = $('#bubble').getBoundingClientRect();
    context.style.top = $('#track').getBoundingClientRect().bottom + 14 + 'px';
    context.style.left = note.right + 14 + 'px';
    context.style.right = Math.max(20, innerWidth - bubble.left + 14) + 'px';
    const bottom = Math.max(note.bottom, context.getBoundingClientRect().bottom, $('#bubble').classList.contains('show') ? bubble.bottom : 0);
    document.documentElement.style.setProperty('--defense-editor-top', Math.ceil(bottom + 14) + 'px');
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
    if (!await banner(quest.note)) return;
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
    const rg = M.microscopeRange;
    $('#app').dataset.zoom = cfg.mode;
    document.body.dataset.zoom = cfg.mode;
    const massMeter = slider ? `<div class="mass-meter" aria-live="polite"><div class="mm-title">${tx(M.massMeter.title)}</div><div class="mm-track"><span class="mm-fill"></span><span class="mm-zero"></span></div><div class="mm-ends"><span>${tx(M.massMeter.less)}</span><span>${tx(M.massMeter.more)}</span></div><div class="mm-value"></div></div>` : '';
    z.innerHTML = `
      <div class="lens"><svg class="field" viewBox="0 0 640 440" role="img" aria-label="넓은 세포 밖 공간과 밝고 둥근 세포 안을 보여 주는 개념 모형"></svg>${massMeter}<div class="model-caption">실제 관찰 영상이 아닌 개념 모형</div></div>
      <div class="side">
        <div class="zoom-kicker">마법 현미경 · 개념 모형</div>
        <h2>${slider ? '농도를 바꾸면?' : '막 통과 실험'}</h2>
        <p class="how">${slider ? '농도를 바꿔 물의 이동을 보자.' : '물과 설탕을 세포막으로 끌어 보자.'}</p>
        <div class="legend">
          <span><i style="background:var(--water)"></i>물</span>
          <span><i class="sugar-dot" style="background:var(--sugar)"></i>설탕</span>
          <span><i class="membrane-line"></i>세포막</span>
        </div>
        ${!slider ? `
        <div class="molecule-tools" aria-label="분자 실험: 끌어 놓거나 버튼을 누르세요">
          <button type="button" class="molecule-tool" data-act="tryWater"><span class="token" aria-hidden="true"></span>물 실험</button>
          <button type="button" class="molecule-tool" data-act="trySugar"><span class="token sugar" aria-hidden="true"></span>설탕 실험</button>
        </div>
        <div class="experiment-status" aria-live="polite"><span>물 <b data-status="water">관찰 전</b></span><span>설탕 <b data-status="sugar">관찰 전</b></span></div>` : ''}
        ${slider ? `
        <div class="ctrl${cfg.sliderGlow ? ' glow' : ''}">
          <div class="ctrl-heading"><label for="inside">세포 안 농도</label><span class="model-setting">가상 설정</span></div>
          <div class="val"><span id="insideVal"></span>${tx(M.unit)}</div>
          <input type="range" id="inside" min="${rg.min}" max="${rg.max}" step="${rg.step}" value="${cfg.outside}">
          <div class="out">바깥 설탕물: <b>${tx(concLabel(cfg.outside))}</b> (고정)</div>
        </div>
        ${cfg.collect ? '<button type="button" class="pick" data-act="pick">이거다!</button>' : ''}` : ''}
        <div class="found-slot"></div>
        <button type="button" class="back${cfg.collect ? '' : ' glow'}" data-act="back">실험대로 돌아가기</button>
      </div>`;
    z.hidden = false;
    positionNoseMeter();
    focus([]);
    updateDo();
    const svg = $('svg.field', z);
    if (slider) buildSlider(svg); else buildMembrane(svg);
    z.onclick = (e) => {
      if (e.target.closest('[data-act="back"]')) closeZoom();
      if (e.target.closest('[data-act="pick"]')) pickSlider();
      if (e.target.closest('[data-act="collectModel"]')) collectFound();
      if (e.target.closest('[data-act="tryWater"]')) tryMembrane('water');
      if (e.target.closest('[data-act="trySugar"]')) tryMembrane('sugar');
    };
    void banner(slider ? '슬라이더로 세포 안팎의 농도를 비교해 보자' : '물과 설탕을 세포막으로 하나씩 끌어 보자', {target:'#doHint'});
  }

  // 실험대로 돌아올 때, 방금 모형 카드를 모았다면 답하기 시트를 연다.
  function closeZoom() {
    $('#zoom').hidden = true;
    delete $('#app').dataset.zoom;
    delete document.body.dataset.zoom;
    if (S.zoom && S.zoom.renderFrame) cancelAnimationFrame(S.zoom.renderFrame);
    S.zoom = null;
    positionNoseMeter();
    refreshFocus();
    if (S.q && S.q.openOnReturn) {
      S.q.openOnReturn = false;
      void (async () => { if (await banner('관찰한 내용을 교수님께 설명해 보자', {target:'#doHint'})) openAnswerSheet(); })();
    }
  }

  const concLabel = (v) => `${Math.round(v * 10) / 10}${M.unit}`;

  // 실험 조건을 채우면 옆 칸에 모형 카드와 [단서 수집]이 뜬다.
  function showFound() {
    const z = S.zoom;
    if (!z || !z.collect || z.found || hasCard(z.model)) return;
    z.found = true;
    const f = M.found;
    const slot = $('#zoom .found-slot');
    slot.innerHTML = `<div class="found">
      <div class="found-title">${tx(f.title)}</div>
      <div class="card model"><span><b>${tx(LEARNING.modelLabel(z.model))}</b> ${tx(M.models[z.model].text)}</span></div>
      <button type="button" class="pop-btn" data-act="collectModel">${tx(f.collect)}</button>
    </div>`;
    const pick = $('#zoom [data-act="pick"]');
    if (pick) pick.remove();
    updateDo();
    const side = $('#zoom .side');
    side.scrollTop = side.scrollHeight;
    void banner('개념 단서를 찾았어! 수집함에 넣어 보자', {target:'#doHint'});
  }

  // 수집해도 현미경 화면에 머문다. 더 실험해 볼 수 있고, 안내는 '실험대로 돌아가기'를 가리킨다.
  async function collectFound() {
    const z = S.zoom;
    if (!z || z.awarded) return;
    z.awarded = true;
    const box = $('#zoom .found');
    const card = $('.card', box);
    const fly = awardModel(z.model, card);
    box.innerHTML = `<div class="found-done">${tx(M.found.done)}</div>`;
    $('#zoom [data-act="back"]').classList.add('glow');
    if (S.q) S.q.openOnReturn = true;
    updateDo();
    await fly;
  }

  const NS = 'http://www.w3.org/2000/svg';
  const CX = 300; const CY = 220;
  const CELL_RADIUS = 96;
  function svgEl(tag, attrs, parent) {
    const el = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    if (parent) parent.appendChild(el);
    return el;
  }
  function lensBase(svg, R) {
    svg.innerHTML = `
      <defs><clipPath id="lensClip"><rect x="38" y="32" width="524" height="376" rx="28"/></clipPath>
        <linearGradient id="brassRim" x2="1" y2="1"><stop stop-color="#e6cb86"/><stop offset=".3" stop-color="#8c672d"/><stop offset=".6" stop-color="#f8e0a0"/><stop offset="1" stop-color="#92713d"/></linearGradient>
        <radialGradient id="outsideLight"><stop stop-color="#174d50"/><stop offset="1" stop-color="#092b3b"/></radialGradient>
        <radialGradient id="insideLight" cx=".35" cy=".3"><stop stop-color="#c6eadd"/><stop offset="1" stop-color="#78b8af"/></radialGradient>
        <radialGradient id="waterToken" cx=".3" cy=".2"><stop stop-color="#d6f7ff"/><stop offset=".4" stop-color="#42b8ef"/><stop offset="1" stop-color="#1776b4"/></radialGradient>
        <linearGradient id="sugarToken" x2="1" y2="1"><stop stop-color="#ffe1a1"/><stop offset="1" stop-color="#e79d24"/></linearGradient>
        <marker id="wArrow" markerUnits="userSpaceOnUse" markerWidth="13" markerHeight="13" refX="11" refY="6.5" orient="auto-start-reverse"><path d="M0 0 L13 6.5 L0 13 Z" fill="#3bb5e8"/></marker></defs>
      <rect class="model-frame" x="28" y="22" width="544" height="396" rx="36" fill="#584121" stroke="url(#brassRim)" stroke-width="10"/>
      <rect x="35" y="29" width="530" height="382" rx="30" fill="url(#outsideLight)" stroke="#f0dc9c" stroke-width="1.5"/>
      <g clip-path="url(#lensClip)" id="lensG">
        <circle id="cell" cx="${CX}" cy="${CY}" r="${R}" fill="url(#insideLight)" stroke="#d0f7e4" stroke-width="2.5"/>
      </g>`;
    return $('#lensG', svg);
  }

  function molecule(g, type, x, y) {
    const m = svgEl('g', { class: 'mol', 'data-type': type, transform: `translate(${x} ${y})` }, g);
    if (type === 'water') {
      svgEl('circle', { r: 12, fill: 'url(#waterToken)', stroke: '#b3edff', 'stroke-width': 1.3 }, m);
      svgEl('ellipse', { rx: 4, ry: 2.5, cx: -3, cy: -5, fill: '#fff', opacity: .65 }, m);
    } else {
      svgEl('polygon', { points: '0,-15 13,-7 13,8 0,15 -13,8 -13,-7', fill: 'url(#sugarToken)', stroke: '#ffe6ac', 'stroke-width': 1.5 }, m);
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
    const R = 105;
    const g = lensBase(svg, R);
    S.zoom.membraneRadius = R;
    const outside = svgEl('text', { x: CX, y: 66, fill: '#f7e9bd', 'text-anchor': 'middle', 'font-size': 22, 'font-weight': 700 }, g);
    outside.textContent = '세포 밖';
    const inside = svgEl('text', { x: CX, y: CY - 52, fill: '#27554b', 'text-anchor': 'middle', 'font-size': 22, 'font-weight': 800 }, g);
    inside.textContent = '세포 안';
    [[-40, -30, 'water'], [36, 24, 'water'], [-10, 50, 'sugar'], [30, -40, 'sugar']].forEach(([dx, dy, t]) => {
      const m = molecule(g, t, CX + dx, CY + dy); m.style.opacity = 0.55; m.style.pointerEvents = 'none';
    });
    const outer = [[90,240,'water'],[480,85,'sugar'],[110,290,'water'],[500,245,'water'],[155,355,'sugar'],[350,375,'water'],[470,335,'water'],[400,70,'water'],[510,165,'sugar'],[105,350,'water']];
    outer.forEach(([x, y, type]) => molecule(g, type, x, y));
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
      await passMembrane(m, Math.atan2(dy, dx));
    });
    svg.addEventListener('pointercancel', () => { if (dragM) dragM.classList.remove('dragging'); dragM = null; });
  }

  // Tap/keyboard alternative to dragging uses the same experiment and collection rule.
  async function tryMembrane(type) {
    const z = S.zoom;
    if (!z || z.mode !== 'membrane') return;
    const m = $$('#zoom .mol').find((el) => el.dataset.type === type && !el.busy && el.style.pointerEvents !== 'none');
    if (!m) return;
    m.busy = true;
    const angle = type === 'water' ? Math.PI : 0.65 * Math.PI;
    await tween(m, CX + Math.cos(angle) * z.membraneRadius, CY + Math.sin(angle) * z.membraneRadius, 350);
    if (S.zoom === z) await passMembrane(m, angle);
  }

  async function passMembrane(m, angle) {
    const z = S.zoom;
    if (!z) return;
    const R = z.membraneRadius;
    const g = $('#lensG');
    m.busy = true;
    if (m.dataset.type === 'water') {
      await tween(m, CX + Math.cos(angle) * (R - 45), CY + Math.sin(angle) * (R - 45), 450);
      if (S.zoom !== z) return;
      floatText(g, CX + Math.cos(angle) * (R - 5), CY + Math.sin(angle) * (R - 5) - 18, '통과', '#f2fbef');
      z.triedWater = true;
      m.style.pointerEvents = 'none';
    } else {
      await tween(m, CX + Math.cos(angle) * (R + 5), CY + Math.sin(angle) * (R + 5), 180);
      if (S.zoom !== z) return;
      floatText(g, CX + Math.cos(angle) * (R + 25), CY + Math.sin(angle) * (R + 25) - 18, '거의 통과하지 못함', '#ffe5a7');
      await tween(m, CX + Math.cos(angle) * (R + 65), CY + Math.sin(angle) * (R + 65), 420);
      if (S.zoom !== z) return;
      z.triedSugar = true;
      m.busy = false;
    }
    const status = $(`#zoom [data-status="${m.dataset.type}"]`);
    if (status) { status.textContent = '✓ 관찰 완료'; status.classList.add('done'); }
    checkMembraneDone();
  }

  function checkMembraneDone() {
    const z = S.zoom;
    if (z && z.triedWater && z.triedSugar) showFound();
  }

  // 슬라이더로 평형 찾기
  function buildSlider(svg) {
    const z = S.zoom;
    const g = lensBase(svg, CELL_RADIUS);
    const rnd = mulberry(7);
    z.inPts = Array.from({ length: 30 }, () => ({ r: Math.sqrt(rnd()) * 0.86, a: rnd() * Math.PI * 2 }));
    z.outPts = Array.from({ length: 30 }, () => {
      let x; let y;
      do { x = 58 + rnd() * 484; y = 53 + rnd() * 330; }
      while (Math.hypot(x - CX, y - CY) < 150 || (y < 82 && Math.abs(x - CX) < 70) || (y > 365 && Math.abs(x - CX) < 120));
      return { x, y };
    });
    z.dots = svgEl('g', {}, g);
    z.arrows = svgEl('g', {}, g);
    z.labels = svgEl('g', {}, g);
    z.R = CELL_RADIUS;
    const input = $('#inside');
    input.addEventListener('input', () => { z.inside = Number(input.value); renderSlider(); });
    renderSlider(true);
  }

  function renderSlider(instant) {
    const z = S.zoom;
    if (!z) return;
    if (z.renderFrame) cancelAnimationFrame(z.renderFrame);
    const diff = z.inside - z.outside;
    // 농도 차이를 슬라이더 범위에 대한 비율로 바꿔 세포 크기를 정한다(최대 ±28%).
    const target = CELL_RADIUS * (1 + Math.max(-0.28, Math.min(0.28, (diff / M.microscopeRange.max) * 0.54)));
    $('#insideVal').textContent = Math.round(z.inside * 10) / 10;
    updateMassMeter(diff);
    const from = z.R;
    const t0 = performance.now();
    const step = (t) => {
      if (S.zoom !== z) return;
      const k = instant ? 1 : Math.min(1, (t - t0) / 350);
      z.R = from + (target - from) * k;
      $('#cell').setAttribute('r', z.R);
      drawSliderContents();
      if (k < 1) z.renderFrame = requestAnimationFrame(step);
    };
    z.renderFrame = requestAnimationFrame(step);
  }

  // 세포 질량 변화 막대: 가운데(변화 없음)에서 늘면 오른쪽, 줄면 왼쪽으로 자란다.
  function updateMassMeter(diff) {
    const mm = $('#zoom .mass-meter');
    if (!mm) return;
    const ratio = Math.max(-1, Math.min(1, diff / (M.microscopeRange.max / 2)));
    const fill = $('.mm-fill', mm);
    const w = Math.abs(ratio) * 50;
    fill.style.width = w + '%';
    fill.style.left = (ratio >= 0 ? 50 : 50 - w) + '%';
    const state = Math.abs(diff) < 0.001 ? 'same' : diff > 0 ? 'up' : 'down';
    mm.dataset.state = state;
    $('.mm-value', mm).textContent = M.massMeter[state];
  }

  function drawSliderContents() {
    const z = S.zoom;
    const R = z.R;
    z.dots.innerHTML = '';
    const perDot = M.microscopeRange.max / 30;
    const nIn = Math.round(z.inside / perDot);
    const nOut = Math.round(z.outside / perDot);
    const sugar = (x, y) => svgEl('path', { d: 'M0 -7L6 -3.5V3.5L0 7L-6 3.5V-3.5Z', transform: `translate(${x} ${y})`, fill: 'url(#sugarToken)', stroke: '#f9db8e', 'stroke-width': .7 }, z.dots);
    z.inPts.slice(0, nIn).forEach((p) => sugar(CX + Math.cos(p.a) * p.r * R, CY + Math.sin(p.a) * p.r * R));
    z.outPts.slice(0, nOut).forEach((p) => sugar(p.x, p.y));
    z.arrows.innerHTML = '';
    const diff = z.inside - z.outside;
    for (let i = 0; i < 2; i++) {
      const a = i * Math.PI;
      const o = R + 46; const n = R - 26;
      const pt = (r) => [CX + Math.cos(a) * r, CY + Math.sin(a) * r];
      const equal = Math.abs(diff) < 0.001;
      const inward = diff >= 0;
      const [x1, y1] = pt(inward ? o : n); const [x2, y2] = pt(inward ? n : o);
      svgEl('line', { x1, y1: y1 - 12, x2, y2: y2 - 12, stroke: '#3bb5e8', 'stroke-width': equal ? 3 : 6, 'marker-end': 'url(#wArrow)', opacity: .95 }, z.arrows);
      svgEl('line', { x1: x2, y1: y2 + 12, x2: x1, y2: y1 + 12, stroke: '#3bb5e8', 'stroke-width': equal ? 3 : 2, 'marker-end': 'url(#wArrow)', opacity: equal ? .95 : .6 }, z.arrows);
    }
    z.labels.innerHTML = '';
    const labelWidth = Math.min(156, 2 * R - 18);
    svgEl('rect', { x: CX - labelWidth / 2, y: CY - 21, width: labelWidth, height: 34, rx: 8, fill: '#c6e9dc', opacity: .94 }, z.labels);
    svgEl('rect', { x: CX - 150, y: 368, width: 300, height: 32, rx: 8, fill: '#133c40', opacity: .94 }, z.labels);
    const t1 = svgEl('text', { x: CX, y: CY + 4, fill: '#204c43', 'font-size': 22, 'font-weight': 800, 'text-anchor': 'middle' }, z.labels);
    t1.textContent = `세포 안 ${concLabel(z.inside)}`;
    const net = svgEl('text', { x: CX, y: 391, fill: '#d0f1ea', 'font-size': 20, 'font-weight': 700, 'text-anchor': 'middle' }, z.labels);
    net.textContent = Math.abs(diff) < .001 ? '양방향 이동 · 순이동 없음' : `물의 순이동: ${diff > 0 ? '안쪽으로' : '바깥쪽으로'}`;
    const t2 = svgEl('text', { x: CX, y: 66, fill: '#cfe0ea', 'font-size': 22, 'font-weight': 700, 'text-anchor': 'middle' }, z.labels);
    t2.textContent = `바깥 ${concLabel(z.outside)}`;
  }

  function pickSlider() {
    const z = S.zoom;
    if (!z || z.found) return;
    const ok = z.collectWhen === 'swell' ? z.inside > z.outside + 0.001 : true;
    if (!ok) { shake($('#zoom .lens')); return; }
    showFound();
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
      const lead = a.lead ? `<div class="lead"><span class="lead-label">${tx(a.lead.label)}</span><span>${tx(a.lead.text)}</span></div>` : '';
      html = `${lead}<div class="line"><b>${tx(a.prompt)}</b>
          <span class="pair">${a.options.map((o) => `<button type="button" class="opt${q.draft.choice === o.value ? ' on' : ''}" data-choice="${o.value}" style="min-width:110px">${tx(o.label)}</button>`).join('')}</span></div>
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
      input = a.type === 'choice+text'
        ? `${a.lead ? a.lead.text + '. ' : ''}${a.prompt} ${a.options.find((o) => o.value === q.draft.choice).label}. ${a.textPrefix} ${q.draft.text} ${a.textSuffix}`
        : text;
      const kw = JUDGE.judgeQuestText(quest, text, q.draft.choice, M.lexicon);
      showBubble(M.thinkingLine);
      const [llm] = await Promise.all([
        API.judge({ kind: 'quest', missionId: M.id, questId: quest.id, text: input, checks: quest.llmChecks, context: M.llmContext }, CFG.LLM_TIMEOUT_MS),
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
    S.busy = true; updateDo();
    focus(['board'], { dim: true, keep: ['prof'] });
    await say(cb.intro);
    refreshFocus();
    for (const c of cb.cards) {
      await addCard({ id: c.id, type: 'concl', text: c.text }, objEl('prof'));
      await sleep(150);
    }
    $$('#trayCards .card.concl').forEach((el) => el.classList.add('glow'));
    $('#board .axis').innerHTML = ART.axis(cb.axis, null, null, M.unit);
    $('#board .axis').classList.add('show');
    S.busy = false; updateDo();
    await banner(cb.note);
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
    requestAnimationFrame(() => $('#trayCards .card.concl:not(.used)')?.scrollIntoView({ inline: 'center', block: 'nearest' }));
    const span = document.createElement('span');
    span.textContent = card.text;
    $('#board .placed').appendChild(span);
    if (S.placed.length < M.combine.cards.length) return;
    S.busy = true; updateDo();
    const lo = Math.max(...M.combine.cards.filter((k) => k.bound === 'low').map((k) => k.value));
    const hi = Math.min(...M.combine.cards.filter((k) => k.bound === 'high').map((k) => k.value));
    $('#board .axis').innerHTML = ART.axis(M.combine.axis, lo, hi, M.unit);
    $('#board .axis .band').animate([{ opacity: 0, transform: 'scaleX(0)' }, { opacity: 0.85, transform: 'scaleX(1)' }], { duration: 800, fill: 'forwards' });
    // 처음 칠판에 쓴 범위 옆에 "이유 확인" 도장을 찍는다
    $('#board .chalk').insertAdjacentHTML('beforeend', `<span class="stamp">${tx(M.combine.stamp)}</span>`);
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
    setDefenseMode(df.defaultMode || 'cards');
    $('#tray').classList.add('closed');
    focus([], { dim: true, keep: ['prof', 'board'] });
    await sleep(1000);
    await say(df.intro, { keep: true });
    S.defenseQuestion = df.intro[df.intro.length - 1];
    S.busy = false;
    S.attemptClock = now();
    const rewardImage = new Image(); rewardImage.src = 'assets/potato-keyring.png';
    if (!await banner(df.notes[S.defenseMode])) return;
    openDefenseSheet();
  }

  // 지금까지 모은 카드 중 답안에 넣을 문장이 있는 것
  function defenseCards() {
    return S.cards.map((c) => {
      let src = null;
      if (c.type === 'clue') src = M.clues.find((x) => x.id === c.id);
      else if (c.type === 'model') src = M.models[c.id];
      else if (c.type === 'concl') src = M.combine.cards.find((x) => x.id === c.id);
      if (!src || !src.sentence) return null;
      return { id: c.id, group: c.type === 'clue' ? c.kind : c.type, text: `${c.type === 'model' ? LEARNING.modelLabel(c.id) + ' · ' : ''}${c.text}`, sentence: src.sentence };
    }).filter(Boolean);
  }
  const cardsInText = (text) => LEARNING.cardsInText(defenseCards(), text, S.insertedCardIds);

  // cards: 모은 카드 문장을 골라 넣으며 쓰기, own: 카드 없이 자기 말로만
  function setDefenseMode(mode) {
    const df = M.defense;
    S.defenseMode = mode;
    setNote(df.notes[mode]);
    $('#tray .cover').textContent = df.trayCover[mode];
  }

  function openDefenseSheet() {
    const df = M.defense;
    const mode = S.defenseMode;
    const cards = defenseCards();
    const groups = df.cardGroups
      .map((g) => ({ label: g.label, cards: cards.filter((c) => g.types.includes(c.group)) }))
      .filter((g) => g.cards.length);
    const picker = mode === 'cards'
      ? `<div class="pick">${groups.map((g) => `<div class="pick-row"><span class="pick-label">${tx(g.label)}</span><div class="pick-chips">${g.cards.map((c) => `<button type="button" class="chip ${c.group}" data-card="${c.id}">${tx(c.text)}</button>`).join('')}</div></div>`).join('')}</div>`
      : '';
    const sh = openSheet(`
      <div class="modes" role="tablist" aria-label="답안 쓰기 방식">
        ${['cards', 'own'].map((m) => `<button type="button" role="tab" id="mode-${m}" aria-controls="defenseWorkspace" aria-selected="${m === mode}" class="mode${m === mode ? ' on' : ''}" data-mode="${m}"><span class="mode-title">${tx(df.modes[m])}</span>${m === 'own' ? '<span class="gift-teaser">교수님의 선물이?!</span>' : ''}</button>`).join('')}
      </div>
      <div id="defenseWorkspace" class="defense-workspace" data-mode="${mode}" role="tabpanel" aria-labelledby="mode-${mode}">
        ${mode === 'cards' ? `<aside class="defense-support" aria-label="모은 카드 골라 넣기">${picker}</aside>` : ''}
        <div class="defense-writing"><label class="writing-label" for="defText">나의 전체 설명</label><p class="writing-help">${tx(mode === 'cards' ? df.cardsHelp : df.ownHelp)}</p>
          <textarea id="defText" placeholder="${esc(df.placeholders[mode])}">${esc(S.defenseText)}</textarea>
          <div class="actions"><span class="leftover" hidden></span><button type="button" class="submit" data-act="defend">교수님께 제출</button></div>
        </div>
      </div>
    `, { name: 'defense', full: true, pin: S.defenseQuestion, focusSel: mode === 'own' ? '#defText' : null });
    const ta = $('#defText', sh);
    const saveCaret = () => { S.defCaret = [ta.selectionStart, ta.selectionEnd]; };
    ['keyup', 'click', 'select', 'blur'].forEach((ev) => ta.addEventListener(ev, saveCaret));
    const sync = () => {
      S.defenseText = ta.value;
      S.insertedCardIds = cardsInText(S.defenseText).map(c => c.id);
      $('[data-act="defend"]', sh).disabled = !S.defenseText.trim();
      const used = cardsInText(S.defenseText).map((c) => c.id);
      $$('[data-card]', sh).forEach((b) => b.classList.toggle('used', used.includes(b.dataset.card)));
      const lo = $('.leftover', sh);
      lo.hidden = !(mode === 'own' && used.length);
      if (!lo.hidden) lo.textContent = df.leftover(used.length);
    };
    sync();
    sh.oninput = () => { saveCaret(); sync(); };
    sh.onclick = (e) => {
      const m = e.target.closest('button[data-mode]');
      if (m) { if (m.dataset.mode !== mode) { setDefenseMode(m.dataset.mode); openDefenseSheet(); } return; }
      const c = e.target.closest('[data-card]');
      if (c) { insertCard(ta, c.dataset.card); sync(); return; }
      if (e.target.closest('[data-act="defend"]')) submitDefense();
    };
    sh.onkeydown = e => {
      if (!e.target.closest('button[data-mode]') || !['ArrowLeft','ArrowRight'].includes(e.key)) return;
      e.preventDefault();
      const next = mode === 'cards' ? 'own' : 'cards';
      setDefenseMode(next); openDefenseSheet(); $(`#mode-${next}`).focus();
    };
    scheduleDefenseLayout();
  }

  // 카드 문장을 커서 자리(없으면 끝)에 넣는다. 태블릿 키보드가 튀어나오지 않게 포커스는 옮기지 않는다.
  function insertCard(ta, id) {
    const card = defenseCards().find((c) => c.id === id);
    if (!card) return;
    if (!S.insertedCardIds.includes(id)) S.insertedCardIds.push(id);
    const v = ta.value;
    const [a, b] = S.defCaret && S.defCaret[1] <= v.length ? S.defCaret : [v.length, v.length];
    const before = v.slice(0, a);
    const after = v.slice(b);
    const pre = before && !/\s$/.test(before) ? ' ' : '';
    const post = after && !/^\s/.test(after) ? ' ' : '';
    ta.value = before + pre + card.sentence + post + after;
    const pos = (before + pre + card.sentence).length;
    S.defCaret = [pos, pos];
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
    const kw = JUDGE.judgeDefense(text, M.lexicon, M.answer);
    const [llm] = await Promise.all([
      API.judge({ kind: 'defense', missionId: M.id, questId: 'FINAL', text, checks: M.llmDefenseChecks, context: M.llmContext }, CFG.LLM_TIMEOUT_MS),
      sleep(1300)
    ]);
    const r = mergeDefenseLLM(kw, llm);
    const el = r.elements;
    // 카드 문장을 뺀 나머지(학생이 직접 쓴 부분)로 다시 판정해, 어떤 요소를 자기 말로 썼는지 따로 남긴다.
    const used = cardsInText(text);
    const ownText = used.reduce((t, c) => t.split(c.sentence).join(' '), text).replace(/\s+/g, ' ').trim();
    const kwOwn = used.length ? JUDGE.judgeDefense(ownText, M.lexicon, M.answer) : kw;
    const own = {};
    Object.keys(el).forEach((k) => { own[k] = !!el[k] && (!used.length || !!kwOwn.elements[k]); });
    Object.assign(r, {
      mode: S.defenseMode, usedCards: used.map((c) => c.id), cardSentences: used.map((c) => c.sentence),
      own, ownEvidence: kwOwn.evidence, ownViaWB: used.length ? kwOwn.viaWB : r.viaWB
    });
    const full = el.C && el.D && el.W1 && el.W2a && el.W2b && el.W3;
    const unclear = r.unclear && !Object.values(el).some(Boolean);
    const errorType = unclear ? '' : (r.errors[0] || '');
    if (!unclear) S.defenseTries += 1;
    logAttempt({
      stage: 'defense', questId: 'FINAL', element: 'ALL', input: text,
      judgment: Object.assign({}, el, { errors: r.errors, viaWB: r.viaWB, mode: r.mode, usedCards: r.usedCards, own }),
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
    r.reward = LEARNING.giftEligible(r, text) ? 'potato-keyring' : null;
    const finalJudgment = {
      C: el.C, D: el.D, W1: el.W1, W2a: el.W2a, W2b: el.W2b, W3: el.W3, WB: el.WB,
      mode: r.mode, usedCards: r.usedCards, own: r.own, reward: r.reward
    };
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

  // 자기 말로 쓴 설명은 형광펜(mark), 카드에서 가져온 문장은 파란 밑줄로 표시한다.
  function highlight(text, evidence, cardSentences = []) {
    const keys = ['W1', 'W2a_water', 'W2a', 'W2b_water', 'W2b', 'principle', 'WB'];
    const ranges = [];
    cardSentences.forEach((s) => {
      for (let i = text.indexOf(s); i >= 0; i = text.indexOf(s, i + s.length)) ranges.push([i, i + s.length, 'card']);
    });
    keys.forEach((k) => {
      const s = evidence[k];
      if (!s) return;
      const i = text.indexOf(s);
      if (i >= 0) ranges.push([i, i + s.length, 'own']);
    });
    ranges.sort((a, b) => a[0] - b[0]);
    const merged = [];
    ranges.forEach((r) => {
      const last = merged[merged.length - 1];
      if (last && r[0] <= last[1] && last[2] === r[2]) last[1] = Math.max(last[1], r[1]);
      else if (!last || r[0] >= last[1]) merged.push(r.slice());
    });
    let out = ''; let pos = 0;
    merged.forEach(([a, b, kind]) => {
      const open = kind === 'card' ? '<span class="from-card">' : '<mark>';
      const close = kind === 'card' ? '</span>' : '</mark>';
      out += esc(text.slice(pos, a)) + open + esc(text.slice(a, b)) + close;
      pos = b;
    });
    return out + esc(text.slice(pos));
  }

  function showClear(type, text, r) {
    const el = r.elements;
    // 칭찬은 학생이 직접 쓴 부분만 인용한다(카드 문장은 칭찬하지 않는다).
    const own = r.own || el;
    const ev = r.ownEvidence || r.evidence || {};
    const cardSentences = r.cardSentences || [];
    const praise = LEARNING.feedback(r, M.clear.feedback || {});
    const next = [];
    if (type === 'partial') {
      const miss = ['W1', 'W2a', 'W2b', 'W3', 'C', 'D'].find((k) => !el[k]);
      if (miss) next.push(M.clear.nextTime[miss]);
    }
    if (['W1', 'W2a', 'W2b', 'W3', 'C', 'D'].some((k) => el[k] && !own[k])) next.push(M.clear.cardsUsed);
    const legend = cardSentences.length
      ? `<div class="hl-legend"><span><mark>${tx(M.clear.legend.own)}</mark></span><span><span class="from-card">${tx(M.clear.legend.card)}</span></span></div>`
      : '';
    const wrap = $('#clearScreen .wrap');
    wrap.innerHTML = `
      <div class="clear-heading${r.reward ? ' with-gift' : ''}"><div class="top">
        ${ART.professor(0)}
        <div>
          <h2>${tx(type === 'full' ? M.clear.title : M.defense.partialLine[0])}</h2>
          ${type === 'partial' ? '<div class="partial">부분 클리어</div>' : ''}
        </div>
      </div>${r.reward === 'potato-keyring' ? `<section class="keyring-reward" aria-label="자기 말로 완성한 연구원에게 주는 감자 키링"><img src="assets/potato-keyring.png" width="160" height="180" alt="콧대 교수가 선물한 안경 쓴 귀여운 감자 키링"><div><div class="reward-label">교수님의 깜짝 선물</div><h3>“크흠… 이건 자네 몫이네.”</h3><p>카드 문장에 기대지 않고<br>자네 말로 끝까지 설명했군!</p><strong>나만의 감자 키링 획득</strong></div></section>` : ''}</div>
      <div class="cmp">
        <div class="col first"><h3>처음 답 (칠판)</h3><p>${tx(S.firstAnswer)}</p></div>
        <div class="col"><h3>지금 답 (최종 변론)</h3><p>${highlight(text, ev, cardSentences)}</p>${legend}</div>
      </div>
      <ul class="praise">
        ${praise.map(p => `<li class="praise-card" data-concept="${p.kind}"><h3>${tx(p.title)}</h3>${p.quotes.map(q => `<blockquote>“${LEARNING.highlightQuote(q,p.kind)}”</blockquote>`).join('')}<p>${tx(p.before)}<mark>${tx(p.focus)}</mark>${tx(p.after)}</p></li>`).join('')}
      </ul>
      ${next.length ? `<div class="next-notes">${next.map(n => `<p>${tx(n)}</p>`).join('')}</div>` : ''}
      <div class="foot"><button type="button" id="nextMission">다음 미션</button></div>`;
    $('#clearScreen').hidden = false;
    $('#clearScreen .top .professor-art')?.classList.add('flat');
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
      ? '연구 기록은 이 기기에 저장돼요.'
      : '기록은 선생님 화면으로 전송됩니다.';
    const cc = $('#classCode'); const sn = $('#studentNo'); const lesson = $('#lessonId'); const go = $('#goBtn');
    try { cc.value = localStorage.getItem('sciw_class') || ''; } catch (e) { /* noop */ }
    const sync = () => { go.disabled = !(cc.value.trim() && /^[A-Za-z0-9_-]{1,64}$/.test(lesson.value.trim()) && /^\d{1,3}$/.test(sn.value.trim())); };
    cc.oninput = sync; sn.oninput = sync; lesson.oninput = sync; sync();
    $('#startForm').onsubmit = (e) => {
      e.preventDefault();
      if (go.disabled) return;
      try { localStorage.setItem('sciw_class', cc.value.trim()); } catch (err) { /* noop */ }
      start(cc.value.trim(), String(Number(sn.value.trim())), lesson.value.trim());
    };
  }

  function start(classCode, studentNo, lessonId) {
    $('#startScreen').hidden = true;
    $('#who').textContent = `${classCode} · ${studentNo}번`;
    S.session = {
      sessionId: API.uid('s'),
      classCode, studentNo, lessonId, missionId: M.id,
      startedAt: new Date().toISOString(), endedAt: '',
      stageTimes: {}, clueCards: [], modelCards: [], clearType: '',
      firstAnswer: '', finalAnswer: '', finalJudgment: {}, questPassed: {},
      firstError: '', errorCounts: {}, hintTotal: 0, hintMax: {}, defenseTries: 0, judgedBy: ''
    };
    API.startSession(S.session);
    buildScene();
    setNose(2);
    setStage('explore');
    S.exploreStep = 'beakers';
    setNote(M.explore.notes.beakers);
    renderTray();
    refreshFocus();
    void banner(M.explore.notes.beakers);
  }

  window.addEventListener('resize', fit);
  const contextObserver = new ResizeObserver(scheduleDefenseLayout);
  ['#questArea','#bubble','#defenseContext'].forEach(selector => contextObserver.observe($(selector)));
  document.fonts.ready.then(scheduleDefenseLayout);
  setupStart();
})();
