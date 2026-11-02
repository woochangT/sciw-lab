/* 미션 02 장면 그림 (인라인 SVG). 저울 창·버튼·글은 HTML로 따로 붙인다. */
(function () {
  let serial = 0;

  // 강철솜: 고리 모양 실이 엉킨 뭉치. 같은 모양이 나오도록 시드 난수를 쓴다.
  // k: 고리와 실의 굵기 배율. 플라스크처럼 좁은 곳에 넣을 때는 줄여서 유리 밖으로 삐져나오지 않게 한다.
  function wool(cx, cy, w, h, burned, seed, k = 1) {
    let s = seed || 7;
    const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    let d = '';
    for (let i = 0; i < 26; i++) {
      const x = cx + (rnd() - 0.5) * w; const y = cy + (rnd() - 0.5) * h;
      const r = (4 + rnd() * 9) * k;
      d += `M${(x - r).toFixed(2)} ${y.toFixed(2)} a${r.toFixed(2)} ${(r * 0.7).toFixed(2)} ${(rnd() * 60).toFixed(0)} 1 1 ${(r * 2).toFixed(2)} 0 a${r.toFixed(2)} ${(r * 0.7).toFixed(2)} 0 1 1 ${(-r * 1.6).toFixed(2)} ${(r * 0.4).toFixed(2)} `;
    }
    const col = burned ? '#4a3a33' : '#a9aeb3';
    const hi = burned ? '#7a5446' : '#e3e7ea';
    return `<g class="wool"><path d="${d}" fill="none" stroke="${col}" stroke-width="${(2.2 * k).toFixed(2)}" stroke-linecap="round"/><path d="${d}" fill="none" stroke="${hi}" stroke-width="${(0.8 * k).toFixed(2)}" opacity=".7" transform="translate(${-k} ${-k})"/></g>`;
  }

  function sparks(cx, cy) {
    let g = '<g class="sparks">';
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2; const r1 = 10 + (i % 3) * 4; const r2 = r1 + 12 + (i % 4) * 4;
      g += `<path d="M${(cx + Math.cos(a) * r1).toFixed(1)} ${(cy + Math.sin(a) * r1 * 0.7).toFixed(1)} L${(cx + Math.cos(a) * r2).toFixed(1)} ${(cy + Math.sin(a) * r2 * 0.7).toFixed(1)}" stroke="${i % 2 ? '#ffd36b' : '#ff8a3d'}" stroke-width="2.4" stroke-linecap="round" style="animation-delay:${(i % 4) * 0.08}s"/>`;
    }
    return g + '</g>';
  }

  // 불꽃 혀 하나: 아래(x, y)에서 위로 h만큼 솟는 물방울 모양, 바깥은 주황, 안은 노랑
  function flame(x, y, h, delay) {
    const w = h * 0.42;
    const tongue = (k) => `M${x} ${y} C${x - w * k} ${y - h * k * 0.32} ${x - w * k * 0.35} ${y - h * k * 0.62} ${x} ${y - h * k} C${x + w * k * 0.35} ${y - h * k * 0.62} ${x + w * k} ${y - h * k * 0.32} ${x} ${y} Z`;
    return `<g class="fx-flame" style="animation-delay:${delay}s"><path d="${tongue(1)}" fill="#ff7a2e" opacity=".9"/><path d="${tongue(0.6)}" fill="#ffd36b"/></g>`;
  }
  function flames(cx, cy, rx, h) {
    let g = '';
    for (let i = 0; i < 5; i++) g += flame(cx - rx * 0.6 + i * rx * 0.3, cy + (i % 2 ? 2 : -2), h * (i % 2 ? 0.75 : 1), ((i * 0.17) % 0.5).toFixed(2));
    return g;
  }
  // 타는 동안의 모습: 강철솜 위로 일렁이는 불꽃, 깜빡이는 불씨, 피어오르는 연기.
  // arc가 있으면 전극 끝 사이에 튀는 전기 불꽃도 그린다. .burning이 붙었을 때만 보인다.
  function burnTop(cx, cy, rx, arc) {
    let g = '<g class="burn-fx">' + flames(cx, cy - 2, rx, 26);
    for (let i = 0; i < 14; i++) {
      const x = cx + Math.cos(i * 2.39) * rx * (0.25 + (i % 5) * 0.15); const y = cy + Math.sin(i * 2.39) * rx * 0.28;
      g += `<circle class="fx-ember" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(2.2 + (i % 3) * 1.1).toFixed(1)}" fill="${i % 2 ? '#ffe28a' : '#ff7a2e'}" style="animation-delay:${((i * 0.13) % 0.9).toFixed(2)}s"/>`;
    }
    for (let i = 0; i < 3; i++) g += `<circle class="fx-smoke" cx="${cx - 14 + i * 14}" cy="${cy - 10}" r="${7 + i * 2}" fill="#9aa0a3" style="animation-delay:${i * 0.5}s"/>`;
    if (arc) g += `<path class="fx-arc" d="M${arc[0]} ${arc[1]} l4 -5 l3 7 l4 -6 l3 6 l2 -2" stroke="#fffbe0" stroke-width="2" fill="none" stroke-linejoin="round"/>`;
    return g + '</g>';
  }

  // 실험실 전자저울: 회백색 몸체, 스테인리스 접시, 앞면 패널(액정 창은 HTML로 겹친다), 버튼 두 개
  function balance() {
    const id = `bal-${++serial}`;
    return `<defs>
        <linearGradient id="${id}-body" x2="0" y2="1"><stop stop-color="#eef0ec"/><stop offset="1" stop-color="#c6cac4"/></linearGradient>
        <linearGradient id="${id}-pan" x2="1" y2="0"><stop stop-color="#9aa3a8"/><stop offset=".35" stop-color="#f4f7f8"/><stop offset=".7" stop-color="#c3cacd"/><stop offset="1" stop-color="#8d969b"/></linearGradient>
      </defs>
      <ellipse cx="130" cy="232" rx="118" ry="6" fill="#20160e" opacity=".35"/>
      <rect x="20" y="226" width="16" height="6" rx="2" fill="#6d716c"/><rect x="224" y="226" width="16" height="6" rx="2" fill="#6d716c"/>
      <path d="M26 166 L234 166 Q246 166 246 178 L246 220 Q246 228 238 228 L22 228 Q14 228 14 220 L14 178 Q14 166 26 166 Z" fill="url(#${id}-body)" stroke="#9a9e98" stroke-width="1.5"/>
      <rect x="28" y="180" width="204" height="40" rx="6" fill="#414b50" stroke="#2c3337" stroke-width="1.5"/>
      <circle class="btn-on" cx="184" cy="200" r="7" fill="#d6d9d4" stroke="#8e928c"/><circle class="btn-tare" cx="210" cy="200" r="7" fill="#d6d9d4" stroke="#8e928c"/>
      <text x="184" y="216" font-size="5.5" fill="#c9cfcf" text-anchor="middle" font-family="sans-serif">ON</text>
      <text x="210" y="216" font-size="5.5" fill="#c9cfcf" text-anchor="middle" font-family="sans-serif">TARE</text>
      <rect x="120" y="152" width="20" height="14" fill="#a8b0b3"/>
      <ellipse cx="130" cy="152" rx="80" ry="11" fill="url(#${id}-pan)" stroke="#7f878b" stroke-width="1.2"/>
      <ellipse cx="130" cy="150" rx="72" ry="7" fill="none" stroke="#fff" stroke-opacity=".6"/>`;
  }

  // 장치 A: 전자저울 + 증발 접시 + 강철솜. 탄 정도는 .wool-dark의 불투명도로, 불티는 .burning 클래스로 보인다.
  function deviceA() {
    return `<svg viewBox="0 0 260 240" aria-hidden="true">${balance()}
      <path d="M78 136 Q130 160 182 136 L176 146 Q130 162 84 146 Z" fill="#f6f4ef" stroke="#c9c4b8" stroke-width="1.5"/>
      <ellipse cx="130" cy="136" rx="52" ry="7" fill="#ebe8e1" stroke="#c9c4b8" stroke-width="1.2"/>
      <g class="wool-all">${wool(130, 124, 66, 22, false, 11)}
      <g class="wool-dark" style="opacity:0">${wool(130, 124, 66, 22, true, 11)}</g></g>
      ${burnTop(130, 124, 60)}
      ${sparks(130, 122)}
    </svg>`;
  }

  // 장치 B: 전자저울 + 마개 막은 플라스크 + 강철솜. 마개에서 전극 두 가닥이 나와 오른쪽으로 빠진다(이어지는 전선은 장면에서 그린다).
  function deviceB() {
    return `<svg viewBox="0 0 260 240" aria-hidden="true">${balance()}
      <path d="M113 22 L113 64 Q66 84 70 116 Q76 146 130 146 Q184 146 190 116 Q194 84 147 64 L147 22 Z" fill="rgba(214,240,246,.42)" stroke="#d7eef2" stroke-width="2.4"/>
      <path d="M84 100 Q82 124 102 134" stroke="#fff" stroke-width="3" opacity=".55" fill="none" stroke-linecap="round"/>
      <rect x="105" y="10" width="50" height="18" rx="4" fill="#5b3b28" stroke="#2f1d12" stroke-width="1.5"/>
      ${wool(125, 120, 58, 16, false, 23, 0.9)}
      <g class="wool-dark" style="opacity:0">${wool(125, 120, 58, 16, true, 23, 0.9)}</g>
      <path d="M122 14 L122 112 M138 14 L138 112" stroke="#b9872f" stroke-width="1.6"/>
      ${burnTop(130, 120, 54, [120, 112])}
      <path d="M122 14 Q122 2 150 2 Q210 2 260 40" stroke="#c0392b" stroke-width="2.2" fill="none"/>
      <path d="M138 14 Q140 6 160 8 Q215 12 260 60" stroke="#2b2b2b" stroke-width="2.2" fill="none"/>
      ${sparks(130, 120)}
    </svg>`;
  }

  // 전원 장치: 빨간 단자(+)는 비어 있고, 검은 단자(-)에는 이미 전선이 물려 있다. 켜지면 램프가 들어온다.
  function power() {
    return `<svg viewBox="0 0 110 80" aria-hidden="true">
      <rect x="2" y="18" width="106" height="58" rx="8" fill="#5a6066" stroke="#2f3438" stroke-width="2"/>
      <rect x="8" y="24" width="94" height="10" rx="3" fill="#454b50"/>
      <circle class="lamp" cx="55" cy="54" r="7" fill="#5b2a22" stroke="#2a1410" stroke-width="1.5"/>
      <rect x="20" y="4" width="16" height="18" rx="3" fill="#c0392b" stroke="#6e1f17"/><circle cx="28" cy="8" r="4" fill="#8a2a20"/>
      <rect x="74" y="4" width="16" height="18" rx="3" fill="#2b2b2b" stroke="#111"/><circle cx="82" cy="8" r="4" fill="#555"/>
      <text x="28" y="72" font-size="9" fill="#e9d9b0" text-anchor="middle" font-family="sans-serif">+</text>
      <text x="82" y="72" font-size="9" fill="#e9d9b0" text-anchor="middle" font-family="sans-serif">−</text>
    </svg>`;
  }

  // 불꽃 막대(토치). 불꽃 끝이 위쪽 가운데(30, 4)에 온다.
  function torch() {
    return `<svg viewBox="0 0 60 120" aria-hidden="true">
      <path class="flame" d="M30 4 Q44 26 40 40 Q38 52 30 54 Q22 52 20 40 Q16 26 30 4 Z" fill="#ff8a3d"/>
      <path class="flame-in" d="M30 20 Q37 34 35 42 Q33 50 30 50 Q27 50 25 42 Q23 34 30 20 Z" fill="#ffe08a"/>
      <rect x="24" y="54" width="12" height="12" rx="2" fill="#7b7f84"/>
      <rect x="20" y="64" width="20" height="52" rx="6" fill="#b8473a" stroke="#6e241c" stroke-width="2"/>
      <rect x="23" y="70" width="5" height="40" rx="2" fill="#fff" opacity=".25"/>
    </svg>`;
  }

  // 악어 집게
  function clip() {
    return `<svg viewBox="0 0 44 26" aria-hidden="true">
      <path d="M2 13 L14 5 L40 9 Q43 10 40 12 L14 13 Z" fill="#c0392b" stroke="#6e1f17" stroke-width="1.2"/>
      <path d="M2 13 L14 21 L40 17 Q43 16 40 14 L14 13 Z" fill="#a83226" stroke="#6e1f17" stroke-width="1.2"/>
      <path d="M30 10 L30 16 M34 10 L34 16" stroke="#e8e0d0" stroke-width="1.2"/>
    </svg>`;
  }

  // ───── 튜토리얼: 실 전화기 ─────
  // 손 그림(실험용 장갑). 집게손가락 끝이 위쪽 가운데(30, 4)에 온다.
  function hand() {
    const skin = 'fill="#d3e9ef" stroke="#4f7f8c" stroke-width="2"';
    return `<svg viewBox="0 0 60 120" aria-hidden="true">
      <rect x="16" y="86" width="30" height="32" rx="5" fill="#1f4a40" stroke="#0f2a24" stroke-width="2"/>
      <path d="M13 66 Q2 62 5 52 Q8 45 15 52" ${skin}/>
      <rect x="12" y="44" width="38" height="46" rx="13" ${skin}/>
      <rect x="23" y="4" width="13" height="52" rx="6.5" ${skin}/>
      <rect x="25" y="42" width="9" height="14" fill="#d3e9ef"/>
      <path d="M37 54 V68 M44 56 V68" stroke="#4f7f8c" stroke-width="2" stroke-linecap="round"/>
    </svg>`;
  }
  function soundArcs(id, x, dir) {
    const arc = (dx, h) => `<path d="M${x + dir * dx} ${120 - h} Q${x + dir * (dx + 7)} 120 ${x + dir * dx} ${120 + h}"/>`;
    return `<g class="t-arcs" id="${id}">${arc(0, 12)}${arc(9, 18)}${arc(18, 24)}</g>`;
  }
  // 실험대의 실 전화기: 스피커 → 컵 → 실 → 컵 → 소리 측정기. 액정 숫자는 HTML로 겹친다. 떨림은 일부러 보이지 않는다.
  function stringPhone() {
    const paper = 'fill="#f4efe2" stroke="#b3a88e" stroke-width="1.5"';
    const stand = (x, y0) => `<rect x="${x - 3}" y="${y0}" width="6" height="${232 - y0}" fill="#6f7377"/><ellipse cx="${x}" cy="233" rx="26" ry="5" fill="#4d5155"/>`;
    return `<svg viewBox="0 0 720 250" aria-hidden="true">
      ${stand(28, 150)}${stand(108, 140)}${stand(544, 140)}${stand(670, 180)}
      <rect x="4" y="82" width="50" height="76" rx="6" fill="#33383d" stroke="#1d2024" stroke-width="2"/><circle cx="29" cy="120" r="22" fill="#565b60"/><circle cx="29" cy="120" r="9" fill="#23262a"/>
      ${soundArcs('tInArcs', 56, 1)}
      <path d="M78 88 L146 100 L146 140 L78 152 Z" ${paper}/><ellipse cx="78" cy="120" rx="7" ry="32" fill="#e3dcc8" stroke="#b3a88e" stroke-width="1.5"/>
      <path d="M506 100 L574 88 L574 152 L506 140 Z" ${paper}/><ellipse cx="574" cy="120" rx="7" ry="32" fill="#e3dcc8" stroke="#b3a88e" stroke-width="1.5"/>
      <line x1="146" y1="120" x2="506" y2="120" stroke="#3a2a1a" stroke-width="5"/>
      <line id="tString" x1="146" y1="120" x2="506" y2="120" stroke="#fbf7ea" stroke-width="2.6"/>
      ${soundArcs('tOutArcs', 584, 1)}
      <rect x="626" y="70" width="90" height="120" rx="8" fill="#2f3a3e" stroke="#171d20" stroke-width="2"/><circle cx="622" cy="120" r="9" fill="#5a6066" stroke="#171d20"/>
      <circle cx="652" cy="150" r="6" fill="#c9cdc7"/><circle cx="676" cy="150" r="6" fill="#c9cdc7"/>
    </svg>`;
  }
  // 현미경 속 모형의 바탕: 왼쪽 컵으로 소리를 내는 스피커, 컵 두 개, 건너편 컵에서 나오는 소리 표시. 떨리는 구슬은 tutorial02.js가 그린다.
  function phoneModel(x0, x1, y) {
    const paper = 'fill="#f4efe2" stroke="#b3a88e" stroke-width="2"';
    const arc = (x, h) => `<path d="M${x} ${y - h} Q${x + 10} ${y} ${x} ${y + h}"/>`;
    const sx = x0 - 172; // 스피커 왼쪽 끝
    return `<rect x="${sx}" y="${y - 42}" width="46" height="84" rx="7" fill="#3f474d" stroke="#9fb0b5" stroke-width="2"/><circle cx="${sx + 23}" cy="${y}" r="17" fill="#6a7278"/><circle cx="${sx + 23}" cy="${y}" r="7" fill="#23262a"/>
      <g class="t-arcs">${arc(x0 - 122, 14)}${arc(x0 - 113, 20)}${arc(x0 - 104, 26)}</g>
      <path d="M${x0 - 90} ${y - 50} L${x0} ${y - 30} L${x0} ${y + 30} L${x0 - 90} ${y + 50} Z" ${paper}/><ellipse cx="${x0 - 90}" cy="${y}" rx="9" ry="50" fill="#e3dcc8" stroke="#b3a88e" stroke-width="2"/>
      <path d="M${x1} ${y - 30} L${x1 + 90} ${y - 50} L${x1 + 90} ${y + 50} L${x1} ${y + 30} Z" ${paper}/><ellipse cx="${x1 + 90}" cy="${y}" rx="9" ry="50" fill="#e3dcc8" stroke="#b3a88e" stroke-width="2"/>
      <g class="t-arcs" id="tModelArcs">${arc(x1 + 100, 16)}${arc(x1 + 112, 24)}${arc(x1 + 124, 32)}</g>`;
  }

  function microscope() {
    const id = `scope-${++serial}`;
    return `<svg viewBox="0 0 120 180" aria-hidden="true">
      <defs><linearGradient id="${id}"><stop stop-color="#8b5b20"/><stop offset=".35" stop-color="#e1ba64"/><stop offset=".6" stop-color="#b88a38"/><stop offset="1" stop-color="#694718"/></linearGradient><linearGradient id="${id}-c" x2="1" y2="1"><stop stop-color="#edffff"/><stop offset=".4" stop-color="#8cf3ef"/><stop offset="1" stop-color="#997cec"/></linearGradient></defs>
      <ellipse cx="61" cy="172" rx="52" ry="6" fill="#241b11" opacity=".4"/>
      <path d="M15 159Q57 147 105 159L108 170H12Z" fill="#173d35" stroke="#b4914f" stroke-width="2"/>
      <path d="M76 157V128Q101 108 91 72Q87 60 70 55" fill="none" stroke="#795325" stroke-width="15" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M76 157V128Q101 108 91 72Q87 60 70 55" fill="none" stroke="url(#${id})" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>
      <rect x="18" y="112" width="72" height="8" rx="3" fill="#173a33" stroke="#ac8a49" stroke-width="2"/>
      <circle cx="93" cy="100" r="11" fill="url(#${id})" stroke="#695029" stroke-width="2"/><circle cx="93" cy="100" r="4.5" fill="#274b3f"/>
      <g transform="translate(0 -7) rotate(19 52 64)"><rect x="38" y="19" width="28" height="72" rx="5" fill="#214d43" stroke="#b38b43" stroke-width="3"/><rect x="33" y="10" width="38" height="13" rx="3" fill="url(#${id})"/><rect x="43" y="91" width="18" height="14" fill="url(#${id})"/><ellipse cx="52" cy="105" rx="7" ry="3" fill="#8fe2e3"/></g>
      <path d="M41 99L48 105.5L41 112L34 105.5Z" fill="url(#${id}-c)" stroke="#e6ffff" stroke-width="1.2"/>
    </svg>`;
  }


  // ───── 단서 카드 속 작은 그림 ─────
  // 사진: 실험 장치를 찍은 모습. 액정 숫자가 결과를 보여 준다.
  function miniPhoto(which) {
    if (which === 'phone') {
      return `<svg viewBox="0 0 120 76" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <rect width="120" height="76" fill="#3b2c22"/><rect y="52" width="120" height="24" fill="#7a5233"/>
        <path d="M8 24 L22 27 L22 37 L8 40 Z" fill="#f4efe2" stroke="#b3a88e"/><path d="M76 27 L90 24 L90 40 L76 37 Z" fill="#f4efe2" stroke="#b3a88e"/>
        <line x1="22" y1="32" x2="76" y2="32" stroke="#fbf7ea" stroke-width="1.2"/>
        <rect x="46" y="31" width="6" height="26" rx="3" fill="#d3e9ef" stroke="#4f7f8c"/>
        <rect x="92" y="20" width="26" height="30" rx="3" fill="#2f3a3e"/><rect x="94" y="24" width="22" height="11" rx="1.5" fill="#b9c7a5" stroke="#171d20"/>
        <text x="115" y="32.5" font-size="8" text-anchor="end" font-family="'Share Tech Mono', monospace" fill="#1b261c">20 dB</text>
      </svg>`;
    }
    const lcd = which === 'A' ? '2.5' : '150.0';
    const top = which === 'A'
      ? `<path d="M34 40 Q60 50 86 40 L83 45 Q60 53 37 45 Z" fill="#f6f4ef" stroke="#c9c4b8"/>${wool(60, 36, 34, 10, true, 11)}`
      : `<path d="M54 6 L54 18 Q38 24 39 34 Q41 44 60 44 Q79 44 81 34 Q82 24 66 18 L66 6 Z" fill="rgba(214,240,246,.5)" stroke="#9fc6cf"/><rect x="51" y="2" width="18" height="6" rx="2" fill="#5b3b28"/>${wool(58, 32, 20, 6, true, 23, 0.42)}`;
    return `<svg viewBox="0 0 120 76" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="120" height="76" fill="#3b2c22"/><rect y="52" width="120" height="24" fill="#7a5233"/>
      ${top}
      <ellipse cx="60" cy="47" rx="30" ry="4" fill="#cfd6d9" stroke="#8d969b"/>
      <rect x="22" y="50" width="76" height="20" rx="4" fill="#dfe2dd" stroke="#9a9e98"/>
      <rect x="30" y="54" width="44" height="12" rx="2" fill="#b9c7a5" stroke="#2f3a3e"/>
      <text x="71" y="63.5" font-size="9" text-anchor="end" font-family="'Share Tech Mono', monospace" fill="#1b261c">${lcd} g</text>
      <circle cx="84" cy="60" r="2.6" fill="#c9cdc7"/><circle cx="91" cy="60" r="2.6" fill="#c9cdc7"/>
    </svg>`;
  }
  // 현미경 슬라이드: 동그란 관찰창 안에 개념 모형. closed=밀폐 용기, open=용기 없음, ledger=공기 중의 기체 수.
  function miniSlide(mode) {
    const frame = (inner) => `<svg viewBox="0 0 120 76" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect x="2" y="6" width="116" height="64" rx="4" fill="rgba(210,236,240,.55)" stroke="#9cc3c9"/>
      <circle cx="60" cy="38" r="31" fill="#123536" stroke="#c79a4a" stroke-width="2.5"/>${inner}</svg>`;
    const pair = (x, y, col) => `<circle cx="${x - 2.2}" cy="${y}" r="2.4" fill="${col}"/><circle cx="${x + 2.2}" cy="${y}" r="2.4" fill="${col}"/>`;
    if (mode === 'phone') {
      return frame('<path d="M34 34 q4 -8 8 0 t8 0 t8 0 L86 34" fill="none" stroke="#e6c77a" stroke-width="2.2"/><rect x="55" y="36" width="7" height="22" rx="3.5" fill="#d3e9ef" stroke="#4f7f8c"/>');
    }
    if (mode === 'ledger') {
      const row = (y, col, n) => { let g = ''; for (let i = 0; i < n; i++) g += pair(44 + i * 10, y, col); return g; };
      return frame(`${row(24, '#3f7fd6', 4)}${row(36, '#e2553a', 2)}<path d="M66 36 h8" stroke="#ffe39a" stroke-width="1.6"/><path d="M78 33 l5 3 l-5 3" fill="none" stroke="#ffe39a" stroke-width="1.6"/>${pair(90, 36, '#e2553a')}<circle cx="46" cy="48" r="2.6" fill="#d9b23f"/><circle cx="58" cy="48" r="2.2" fill="#34383c"/><circle cx="54" cy="48" r="1.8" fill="#e2553a"/><circle cx="62" cy="48" r="1.8" fill="#e2553a"/>`);
    }
    const fe = [[44, 50], [52, 46], [60, 51], [68, 46], [76, 50]];
    const o = fe.map(([x, y]) => pair(x, y - 6, '#e2553a')).join('');
    const iron = fe.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.6" fill="#5b6168"/>`).join('');
    const body = mode === 'closed'
      ? `<path d="M50 16 L50 20 Q36 22 36 30 L36 54 Q36 58 41 58 L79 58 Q84 58 84 54 L84 30 Q84 22 70 20 L70 16 Z" fill="rgba(214,240,246,.25)" stroke="#d7eef2" stroke-width="1.2"/><rect x="47" y="11" width="26" height="6" rx="2" fill="#6b4630"/>`
      : `<ellipse cx="60" cy="55" rx="20" ry="2.6" fill="#e9eef0" opacity=".8"/>${pair(32, 24, '#3f7fd6')}${pair(86, 22, '#3f7fd6')}${pair(44, 18, '#e2553a')}`;
    return frame(body + iron + o);
  }

  // 돋보기 작은 그림: 현미경 슬라이드의 동그란 관찰창만 잘라 보여 준다.
  function lensMini(mode) { return miniSlide(mode).replace('viewBox="0 0 120 76"', 'viewBox="29 7 62 62"'); }
  // 돋보기를 카드에 댔을 때: 방금 본 일이 작게 되풀이된다. 산소가 철로 옮겨 붙고, 숫자가 함께 바뀐다. 움직임을 끄면 붙은 모습으로 멈춘다.
  function lensScene(mode) {
    const pair = (x, y, col) => `<circle cx="${x - 3.6}" cy="${y}" r="4" fill="${col}"/><circle cx="${x + 3.6}" cy="${y}" r="4" fill="${col}"/>`;
    const fe = [[36, 76], [48, 70], [60, 76], [72, 70], [84, 76]];
    const iron = `<path d="M${fe.map((p) => p.join(' ')).join(' L')}" stroke="#8b9197" stroke-width="2.5" fill="none"/>${fe.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="5.5" fill="#5b6168"/>`).join('')}`;
    const bond = (from) => fe.map(([x, y], i) => `<g class="ls-o" style="--dx:${from[i][0] - x}px;--dy:${from[i][1] - (y - 9)}px;--t:${(i * 0.45).toFixed(2)}s">${pair(x, y - 9, '#e2553a')}</g>`).join('');
    const still = (list, col) => list.map(([x, y]) => pair(x, y, col)).join('');
    const lcd = (t, cls = '') => `<text class="${cls}" x="82" y="107" font-size="10" text-anchor="end" font-family="'Share Tech Mono', monospace" fill="#1b261c">${t}</text>`;
    const scale = (txt) => `<rect x="26" y="94" width="68" height="20" rx="3" fill="#d9dcd7"/><rect x="34" y="97" width="52" height="13" rx="2" fill="#b9c7a5" stroke="#2f3a3e" stroke-width=".8"/>${txt}`;
    const wrap = (inner) => `<svg viewBox="0 0 120 120" aria-hidden="true"><rect width="120" height="120" fill="#123536"/>${inner}</svg>`;
    if (mode === 'phone') {
      const cups = '<path d="M6 32 L22 36 L22 52 L6 56 Z" fill="#f4efe2" stroke="#b3a88e"/><path d="M98 36 L114 32 L114 56 L98 52 Z" fill="#f4efe2" stroke="#b3a88e"/>';
      const free = '<path class="ls-a" d="M22 44 q6 -12 12 0 t12 0 t12 0 t12 0 t12 0 t16 0" fill="none" stroke="#e6c77a" stroke-width="2.6"/>';
      const stopped = '<g class="ls-b"><path d="M22 44 q6 -12 12 0 t12 0 t12 0 L98 44" fill="none" stroke="#e6c77a" stroke-width="2.6"/><rect x="54" y="46" width="11" height="42" rx="5.5" fill="#d3e9ef" stroke="#4f7f8c" stroke-width="1.5"/></g>';
      return wrap(`${cups}${free}${stopped}${scale(lcd('60 dB', 'ls-a') + lcd('20 dB', 'ls-b'))}`);
    }
    if (mode === 'closed') {
      return wrap(`${still([[11, 58], [109, 46]], '#e2553a')}${still([[14, 36], [106, 70]], '#3f7fd6')}<path d="M46 12 L46 20 Q24 24 24 38 L24 84 Q24 90 30 90 L90 90 Q96 90 96 84 L96 38 Q96 24 74 20 L74 12 Z" fill="rgba(214,240,246,.18)" stroke="#d7eef2" stroke-width="2"/><rect x="42" y="6" width="36" height="8" rx="2" fill="#6b4630"/>${iron}${bond([[40, 36], [60, 30], [80, 38], [46, 52], [74, 54]])}${scale(lcd('150.0 g'))}`);
    }
    if (mode === 'open') {
      return wrap(`${still([[38, 26], [84, 22], [14, 62]], '#3f7fd6')}<ellipse cx="60" cy="86" rx="36" ry="5" fill="#f6f4ef"/>${iron}${bond([[20, 36], [60, 12], [102, 34], [28, 54], [96, 56]])}${scale(lcd('2.0 g', 'ls-a') + lcd('2.5 g', 'ls-b'))}`);
    }
    const count = (t, cls) => `<text class="${cls}" x="60" y="106" font-size="11" font-weight="700" text-anchor="middle" fill="#b2401f">${t}</text>`;
    return wrap(`${still([[38, 26], [84, 22], [14, 62], [106, 62]], '#3f7fd6')}<g class="ls-x">${pair(60, 44, '#3f7fd6')}</g>${iron}${bond([[20, 36], [60, 12], [102, 34], [28, 54], [96, 50]])}<rect x="34" y="94" width="52" height="17" rx="3" fill="#fffdf6"/>${count('산소 8', 'ls-a')}${count('산소 3', 'ls-b')}`);
  }

  window.SCIW_ART02 = { flames, wool, deviceA, deviceB, torch, power, clip, microscope, miniPhoto, miniSlide, lensMini, lensScene, hand, stringPhone, phoneModel };
})();
