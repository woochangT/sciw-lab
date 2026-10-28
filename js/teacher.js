/* 교사 히트맵: 행 = 출석번호, 열 = 요소 코드 + 처음 오류 유형 */
(function () {
  const CFG = window.SCIW_CONFIG;
  const M = window.SCIW_MISSIONS[CFG.MISSION_ID || 'm01'];
  const API = window.SCIW_API;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const ELEMENTS = [
    { key: 'C', label: 'C', desc: '감자 세포 안 농도는 0.2 M보다 크고 0.4 M보다 작다', quest: 'CLAIM' },
    { key: 'D', label: 'D', desc: '0.2 M에서 질량 증가, 0.4 M에서 감소', quest: 'CLAIM' },
    { key: 'W1', label: 'W1', desc: '세포막은 물만 통과시키므로 질량 변화는 물의 출입이다', quest: 'Q1' },
    { key: 'W2a', label: 'W2a', desc: '0.2 M에서 늘었다면 안이 0.2 M보다 진하다', quest: 'Q2' },
    { key: 'W2b', label: 'W2b', desc: '0.4 M에서 줄었다면 안이 0.4 M보다 묽다', quest: 'Q3' },
    { key: 'W3', label: 'W3/WB', desc: '두 결론을 합쳐 범위를 좁힌다 (또는 경로 ② WB)', quest: 'W3' }
  ];
  const ERRORS = [
    { key: 'N1', desc: '자료 나열' }, { key: 'N2', desc: '개념 이름표' }, { key: 'E1', desc: '용질 이동' },
    { key: 'E2', desc: '방향 역전' }, { key: 'E3', desc: '비교 대상 누락' }
  ];

  let data = null;
  let classCode = '';
  let timer = null;
  let selected = null;

  const bool = (v) => v === true || v === 'TRUE' || v === 'true';
  const obj = (v) => (v && typeof v === 'object') ? v : (() => { try { return JSON.parse(v || '{}'); } catch (e) { return {}; } })();

  function pickSessions(sessions) {
    const byStudent = {};
    sessions.forEach((s) => {
      const k = String(s.studentNo);
      const cur = byStudent[k];
      const score = (x) => (x.clearType ? 1e15 : 0) + Date.parse(x.startedAt || 0);
      if (!cur || score(s) > score(cur)) byStudent[k] = s;
    });
    return Object.values(byStudent).sort((a, b) => Number(a.studentNo) - Number(b.studentNo));
  }

  function cellState(s, key) {
    const fj = obj(s.finalJudgment);
    const qp = obj(s.questPassed);
    const fin = key === 'W3' ? (bool(fj.W3) || bool(fj.WB)) : bool(fj[key]);
    if (fin) return 'dark';
    if (bool(qp[key])) return 'light';
    return 'empty';
  }

  function render() {
    const rows = pickSessions(data.sessions);
    if (!rows.length) {
      $('#tableWrap').innerHTML = `<p class="empty-msg">${esc(classCode)} 반의 기록이 아직 없습니다.</p>`;
      $('#summary').hidden = true; $('#legend').hidden = true;
      return;
    }
    // 맨 위 한 줄 요약
    const finished = rows.filter((s) => s.clearType);
    let worst = null;
    if (finished.length) {
      ['W1', 'W2a', 'W2b', 'W3'].forEach((k) => {
        const miss = finished.filter((s) => cellState(s, k) !== 'dark').length / finished.length;
        if (!worst || miss > worst.p) worst = { k: k === 'W3' ? 'W3' : k, p: miss };
      });
    }
    const errCount = {};
    rows.forEach((s) => { if (s.firstError) errCount[s.firstError] = (errCount[s.firstError] || 0) + 1; });
    const topErr = Object.entries(errCount).sort((a, b) => b[1] - a[1])[0];
    const parts = [];
    if (worst && worst.p > 0) parts.push(`가장 많이 빠진 워런트: ${worst.k} (${Math.round(worst.p * 100)}%)`);
    else if (worst) parts.push('모든 학생이 워런트를 최종 변론에 썼어요');
    if (topErr) parts.push(`가장 많은 처음 오류: ${topErr[0]} (${Math.round(topErr[1] / rows.length * 100)}%)`);
    $('#summary').innerHTML = `${parts.join(' · ') || '아직 최종 변론을 제출한 학생이 없습니다'}
      <div class="sub">${rows.length}명 · 최종 변론 제출 ${finished.length}명 (완전 ${finished.filter((s) => s.clearType === 'full').length} · 부분 ${finished.filter((s) => s.clearType === 'partial').length})</div>`;
    $('#summary').hidden = false;
    $('#legend').hidden = false;

    const head = `<thead>
      <tr><th></th><th class="grp" colspan="${ELEMENTS.length}">요소</th><th class="grp" colspan="${ERRORS.length}">처음 오류</th><th class="grp" colspan="2">진행</th></tr>
      <tr><th>번호</th>${ELEMENTS.map((e) => `<th title="${esc(e.desc)}">${e.label}</th>`).join('')}
      ${ERRORS.map((e) => `<th>${e.key}<small>${e.desc}</small></th>`).join('')}<th>힌트</th><th>클리어</th></tr></thead>`;
    const body = rows.map((s) => {
      const ec = obj(s.errorCounts);
      const cells = ELEMENTS.map((e) => {
        const st = cellState(s, e.key);
        return `<td class="${st} click" data-sid="${esc(s.sessionId)}" data-col="${e.key}" title="${esc(e.desc)}"></td>`;
      }).join('');
      const errs = ERRORS.map((e) => {
        const n = Number(ec[e.key] || 0);
        const first = s.firstError === e.key;
        const cls = first ? 'err first click' : n ? 'err click' : 'none';
        return `<td class="${cls}" data-sid="${esc(s.sessionId)}" data-col="${e.key}">${n || ''}</td>`;
      }).join('');
      const clear = s.clearType === 'full' ? '완전' : s.clearType === 'partial' ? '부분' : '진행 중';
      return `<tr class="${s.clearType ? '' : 'ongoing'}"><td class="no">${esc(s.studentNo)}</td>${cells}${errs}
        <td class="meta">${Number(s.hintTotal || 0)}</td><td class="meta">${clear}</td></tr>`;
    }).join('');
    $('#tableWrap').innerHTML = `<table>${head}<tbody>${body}</tbody></table>`;
    if (selected) showDetail(selected.sid, selected.col, true);
  }

  function attemptsFor(sid) {
    return data.attempts.filter((a) => a.sessionId === sid)
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  }

  function attHTML(a, extra) {
    const j = obj(a.judgment);
    const tag = a.diagnosis === 'PASS' ? '<span class="tag PASS">통과</span>'
      : a.errorType ? `<span class="tag err">${esc(a.errorType)}</span>` : a.diagnosis ? `<span class="tag">${esc(a.diagnosis)}</span>` : '';
    let chips = '';
    if (a.questId === 'FINAL') {
      chips = `<div class="chips">${['C', 'D', 'W1', 'W2a', 'W2b', 'W3', 'WB'].map((k) => `<span class="${bool(j[k]) ? 'on' : ''}">${k}</span>`).join('')}</div>`;
    }
    const t = a.createdAt ? new Date(a.createdAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '';
    return `<div class="att"><div class="head"><b>${esc(a.questId)}</b> ${a.attemptNo}번째 ${tag}
      <span>힌트 ${esc(a.hintLevel || 0)}단계</span><span>${esc(a.judgedBy || '')}</span><span>${t}</span>${extra || ''}</div>
      <div class="text">${esc(a.input)}</div>${chips}</div>`;
  }

  function showDetail(sid, col, keep) {
    const s = data.sessions.find((x) => x.sessionId === sid);
    if (!s) return;
    selected = { sid, col };
    document.querySelectorAll('td.sel').forEach((td) => td.classList.remove('sel'));
    const td = document.querySelector(`td[data-sid="${CSS.escape(sid)}"][data-col="${col}"]`);
    if (td) td.classList.add('sel');
    const atts = attemptsFor(sid);
    const el = ELEMENTS.find((e) => e.key === col);
    let title; let desc; let list;
    if (el) {
      title = `${s.studentNo}번 · ${el.label}`;
      const st = cellState(s, col);
      desc = `${el.desc}<br>${st === 'dark' ? '최종 변론에서 맨손으로 씀' : st === 'light' ? '퀘스트에선 했지만 최종 변론에서 빠뜨림' : '아직 못 함'}`;
      list = atts.filter((a) => a.questId === el.quest || a.questId === 'FINAL');
    } else {
      const er = ERRORS.find((e) => e.key === col);
      title = `${s.studentNo}번 · ${col} ${er ? er.desc : ''}`;
      desc = s.firstError === col ? '이 학생의 처음 오류' : '이 오류가 나온 입력';
      list = atts.filter((a) => a.errorType === col);
    }
    const d = $('#detail');
    d.innerHTML = `<button class="close" aria-label="닫기">✕</button><h3>${esc(title)}</h3><div class="desc">${desc}</div>
      ${s.firstAnswer ? `<div class="att"><div class="head"><b>처음 답 (칠판)</b></div><div class="text">${esc(s.firstAnswer)}</div></div>` : ''}
      ${list.map((a) => attHTML(a)).join('') || '<p class="desc">해당 입력이 없습니다.</p>'}`;
    d.hidden = false;
    $('.layout').classList.add('with-detail');
    d.querySelector('.close').onclick = () => {
      d.hidden = true; selected = null; $('.layout').classList.remove('with-detail');
      document.querySelectorAll('td.sel').forEach((x) => x.classList.remove('sel'));
    };
    if (!keep) d.scrollTop = 0;
  }

  async function load() {
    if (!classCode) return;
    $('#status').textContent = '불러오는 중…';
    try {
      data = await API.classData(classCode);
      render();
      $('#status').textContent = `${API.isLocal ? '로컬 모드 · ' : ''}${new Date().toLocaleTimeString('ko-KR')} 갱신 · ${Math.round(CFG.HEATMAP_REFRESH_MS / 1000)}초마다 자동`;
    } catch (e) {
      $('#status').textContent = '불러오기 실패: ' + e.message;
    }
  }

  $('#tableWrap').addEventListener('click', (e) => {
    const td = e.target.closest('td.click');
    if (td) showDetail(td.dataset.sid, td.dataset.col);
  });

  $('#classForm').addEventListener('submit', (e) => {
    e.preventDefault();
    classCode = $('#classCode').value.trim();
    selected = null;
    $('#detail').hidden = true;
    $('.layout').classList.remove('with-detail');
    history.replaceState(null, '', '?class=' + encodeURIComponent(classCode));
    load();
    clearInterval(timer);
    timer = setInterval(load, CFG.HEATMAP_REFRESH_MS);
  });

  const qs = new URLSearchParams(location.search).get('class');
  if (qs) { $('#classCode').value = qs; $('#classForm').requestSubmit(); }
  document.title = `${M.label} 히트맵 · 서술 실험실`;
})();
