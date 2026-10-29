/* 장면 그림 (인라인 SVG). 상태 전달에 필요한 만큼만 그린다. */
(function () {
  const NOSE = [
    { len: 3, lift: 0 }, { len: 14, lift: 8 }, { len: 25, lift: 16 }, { len: 36, lift: 25 }, { len: 48, lift: 34 }
  ];

  function noseD(level) {
    const n = NOSE[Math.max(0, Math.min(4, level))];
    const tx = 68 - n.len;
    const ty = 88 - n.lift;
    return `M70 68 Q ${tx + 7} ${ty - 6} ${tx} ${ty} Q ${tx + 9} ${ty + 7} 73 93 Z`;
  }

  function professor(level) {
    return `
<svg viewBox="0 0 200 300" aria-label="콧대 교수">
  <g class="chair">
    <rect x="118" y="112" width="62" height="160" rx="10" fill="#7b5233"/>
    <rect x="124" y="118" width="50" height="120" rx="8" fill="#93653f"/>
  </g>
  <path d="M40 300 L48 150 Q52 126 80 122 L132 122 Q160 126 164 150 L172 300 Z" fill="#33415c"/>
  <path d="M90 122 L106 168 L122 122 Z" fill="#f4f1ea"/>
  <path d="M102 132 L110 132 L114 186 L106 196 L98 186 Z" fill="#b8473a"/>
  <path d="M80 122 L104 176 L92 128 Z M132 122 L108 176 L120 128 Z" fill="#2a3650"/>
  <g class="arms-down">
    <path d="M48 154 Q34 200 44 262 L62 262 Q58 210 66 168 Z" fill="#2c3a55"/>
    <path d="M164 154 Q178 200 168 262 L150 262 Q154 210 146 168 Z" fill="#2c3a55"/>
    <circle cx="53" cy="266" r="10" fill="#f0c39c"/><circle cx="159" cy="266" r="10" fill="#f0c39c"/>
  </g>
  <g class="arms-cross">
    <path d="M46 160 Q40 196 70 206 L150 206 Q172 200 166 160 L150 170 Q140 188 108 190 Q76 190 64 172 Z" fill="#26324b"/>
    <path d="M62 196 Q100 176 150 190 L150 206 Q100 196 64 210 Z" fill="#2f3d5a"/>
    <circle cx="150" cy="196" r="10" fill="#f0c39c"/><circle cx="64" cy="202" r="10" fill="#f0c39c"/>
  </g>
  <rect x="94" y="104" width="24" height="22" rx="6" fill="#e6b48b"/>
  <ellipse cx="106" cy="76" rx="40" ry="46" fill="#f1c6a0"/>
  <ellipse cx="94" cy="44" rx="14" ry="7" fill="#fff" opacity=".45" transform="rotate(-20 94 44)"/>
  <ellipse cx="143" cy="80" rx="8" ry="12" fill="#e7b48c"/>
  <path d="M132 58 Q150 52 150 74 Q146 66 136 70 Z M134 92 Q150 98 146 112 Q142 102 132 102 Z" fill="#b9b4ab"/>
  <path class="nose" d="${noseD(level)}" fill="#eab089" stroke="#d99a72" stroke-width="1.2"/>
  <circle cx="88" cy="72" r="11" fill="none" stroke="#3b3b3b" stroke-width="2.4"/>
  <path d="M99 72 L140 76" stroke="#3b3b3b" stroke-width="2.4"/>
  <circle cx="86" cy="73" r="2.6" fill="#2b2a28"/>
  <path d="M74 56 Q86 48 98 55" stroke="#6b665d" stroke-width="3" fill="none" stroke-linecap="round"/>
  <path d="M78 106 Q86 103 94 106" stroke="#9c5d4a" stroke-width="2.4" fill="none" stroke-linecap="round"/>
</svg>`;
  }

  // level: 0(맹물) ~ 1(가장 진한 비커) — 진할수록 설탕물 색을 짙게
  function beaker(level) {
    const a = 0.12 + level * 0.54;
    return `
<svg viewBox="0 0 80 110">
  <path d="M10 8 L70 8 L66 104 Q66 108 62 108 L18 108 Q14 108 14 104 Z" fill="rgba(220,240,255,.55)" stroke="#8fb3c9" stroke-width="2.5"/>
  <path d="M13.5 40 L66.5 40 L66 104 Q66 106 62 106 L18 106 Q14 106 14 104 Z" fill="rgba(242,154,56,${a.toFixed(2)})"/>
  <rect x="28" y="62" width="24" height="22" rx="4" fill="#e9d29a" stroke="#c9ad6c" stroke-width="2" transform="rotate(-8 40 73)"/>
  <path d="M6 8 L74 8" stroke="#8fb3c9" stroke-width="4" stroke-linecap="round"/>
  <path d="M20 50 L20 92" stroke="#fff" stroke-width="3" opacity=".6" stroke-linecap="round"/>
</svg>`;
  }

  function notebook() {
    return `
<svg viewBox="0 0 140 66">
  <path d="M4 10 Q36 2 70 10 Q104 2 136 10 L136 62 Q104 54 70 62 Q36 54 4 62 Z" fill="#fbfaf5" stroke="#b9b1a2" stroke-width="2"/>
  <path d="M70 10 L70 62" stroke="#c9c1b2" stroke-width="2"/>
  <g stroke="#a9c3df" stroke-width="2">
    <path d="M14 24 L60 22 M14 34 L60 32 M14 44 L50 42 M80 22 L126 24 M80 32 L126 34 M80 42 L116 44"/>
  </g>
  <path d="M120 4 L132 4 L132 22 L126 17 L120 22 Z" fill="#e3594a"/>
</svg>`;
  }

  function microscope() {
    return `
<svg viewBox="0 0 112 168">
  <rect x="16" y="146" width="84" height="18" rx="6" fill="#3b4652"/>
  <path d="M64 146 L64 120 Q84 112 84 84 L84 66 L72 66 L72 84 Q72 104 54 110 L54 146 Z" fill="#4a5765"/>
  <rect x="22" y="104" width="62" height="9" rx="3" fill="#2f3943"/>
  <g transform="rotate(-24 50 60)">
    <rect x="38" y="20" width="24" height="70" rx="5" fill="#5b6b7b"/>
    <rect x="34" y="8" width="32" height="16" rx="4" fill="#2f3943"/>
    <rect x="42" y="88" width="16" height="14" rx="3" fill="#2f3943"/>
    <circle cx="50" cy="100" r="5" fill="#7fc3ff"/>
  </g>
  <circle cx="80" cy="96" r="7" fill="#2f3943"/>
</svg>`;
  }

  function potato(change) {
    const s = 26 * (1 + change / 40);
    const before = `<rect x="6" y="${28 - 13}" width="26" height="26" rx="4" fill="#e9d29a" stroke="#c9ad6c" stroke-width="2"/>`;
    const after = `<rect x="${88 - s / 2}" y="${28 - s / 2}" width="${s}" height="${s}" rx="4" fill="#e9d29a" stroke="#c9ad6c" stroke-width="2"/>`;
    return `<svg viewBox="0 0 120 56">${before}<text x="19" y="54" font-size="9" text-anchor="middle" fill="#888">전</text>
      <path d="M40 28 L64 28" stroke="#aaa" stroke-width="2.5" marker-end="url(#ah)"/>
      <defs><marker id="ah" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8 Z" fill="#aaa"/></marker></defs>
      ${after}<text x="88" y="54" font-size="9" text-anchor="middle" fill="#888">30분 뒤</text></svg>`;
  }

  function axis(ticks, lo, hi, unit) {
    const x0 = 16; const x1 = 290;
    const max = ticks[ticks.length - 1];
    const X = (v) => x0 + (x1 - x0) * (v / max);
    let t = '';
    ticks.forEach((v) => { t += `<path d="M${X(v)} 22 L${X(v)} 32" stroke="#f6f3ea" stroke-width="2"/><text x="${X(v)}" y="50" font-size="13" fill="#f6f3ea" text-anchor="middle" font-family="Gaegu, cursive">${v}${unit}</text>`; });
    const band = lo != null ? `<rect class="band" x="${X(lo)}" y="17" width="${X(hi) - X(lo)}" height="20" rx="4" fill="#ffd54a" opacity=".85"/>` : '';
    return `<svg viewBox="0 0 306 56" width="100%" height="100%">${band}<path d="M${x0 - 6} 27 L${x1 + 8} 27" stroke="#f6f3ea" stroke-width="2.5"/>${t}</svg>`;
  }

  window.SCIW_ART = { professor, noseD, beaker, notebook, microscope, potato, axis };
})();
