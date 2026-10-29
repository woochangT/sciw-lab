/* The laboratory's live scene objects. Labels and controls remain HTML/SVG. */
(function () {
  let serial = 0;
  const expression = (level) => level >= 3 ? 'proud' : level === 2 ? 'skeptical' : level === 1 ? 'surprised' : 'acknowledging';
  function professor(level) {
    return `<div class="professor-art" data-expression="${expression(level)}" role="img" aria-label="콧대 교수"></div>`;
  }

  // Sugar solutions stay clear; concentration is conveyed by the live label.
  function beaker() {
    const id = `glass-${++serial}`;
    return `<svg viewBox="0 0 100 140" aria-hidden="true">
      <defs>
        <linearGradient id="${id}"><stop stop-color="#b5dce1" stop-opacity=".32"/><stop offset=".24" stop-color="#fff" stop-opacity=".08"/><stop offset=".75" stop-color="#fff" stop-opacity=".18"/><stop offset="1" stop-color="#d8f7fc" stop-opacity=".45"/></linearGradient>
        <linearGradient id="${id}-water" x2="0" y2="1"><stop stop-color="#d8f1eb" stop-opacity=".26"/><stop offset="1" stop-color="#c4e7e7" stop-opacity=".5"/></linearGradient>
        <radialGradient id="${id}-potato"><stop stop-color="#f7e3ad"/><stop offset="1" stop-color="#d4ae6c"/></radialGradient>
      </defs>
      <ellipse cx="50" cy="132" rx="41" ry="6" fill="#25190f" opacity=".3"/>
      <path d="M10 17L14 120Q50 136 86 120L90 17Z" fill="url(#${id})" stroke="#dae6df" stroke-width="1.7"/>
      <path d="M12 57Q50 67 88 57L86 119Q50 134 14 119Z" fill="url(#${id}-water)"/>
      <ellipse cx="50" cy="57" rx="38" ry="6" fill="#e4ffff" fill-opacity=".12" stroke="#dcf5ee" stroke-opacity=".7"/>
      <path d="M30 88Q33 78 47 79L66 83Q72 87 69 101L65 111Q46 116 30 106Z" fill="url(#${id}-potato)" stroke="#c69b59" stroke-width="1.2"/>
      <path d="M31 88Q49 94 68 84M45 82L40 109M56 83L52 112" stroke="#e0c28b" stroke-width=".8" fill="none"/>
      <ellipse cx="50" cy="17" rx="40" ry="7" fill="none" stroke="#fff5dc" stroke-width="2.5"/>
      <path d="M20 27L23 111M25 28L26 65" stroke="#fff" stroke-opacity=".65" stroke-width="2.7" stroke-linecap="round"/>
      <g stroke="#fff6df" stroke-opacity=".85" stroke-width="1.2"><path d="M74 36h12M78 48h8M74 70h12M78 82h8M74 104h12"/></g>
      <g fill="#fff9e9" font-size="6" font-family="sans-serif"><text x="61" y="38">150</text><text x="61" y="72">100</text><text x="65" y="106">50</text></g>
    </svg>`;
  }

  function notebook() {
    return `<svg viewBox="0 0 170 90" aria-hidden="true">
      <path d="M3 15Q43 3 85 13Q127 3 167 15L166 80Q125 71 85 85Q44 71 4 80Z" fill="#69422b" stroke="#34251b" stroke-width="3"/>
      <path d="M9 12Q47 2 85 13Q123 2 161 12L160 74Q121 66 85 79Q49 66 10 74Z" fill="#f7edce" stroke="#d3be8f" stroke-width="1.5"/>
      <path d="M85 13V79" stroke="#b5a077" stroke-width="2"/>
      <g stroke="#a9a58a" stroke-width="1.2" opacity=".7"><path d="M21 27L70 24M21 35L69 32M21 43L62 40M22 51L69 48M99 26L147 29M99 34L147 37M100 42L142 45M101 51L148 54M102 59L137 62"/></g>
      <path d="M132 4h12v24l-6-5-6 5Z" fill="#a95236"/><path d="M55 62L147 79" stroke="#264b43" stroke-width="5" stroke-linecap="round"/><path d="M147 79l10 2-7-7Z" fill="#d9ba7a"/>
    </svg>`;
  }

  function microscope() {
    const id = `scope-${++serial}`;
    return `<svg viewBox="0 0 120 180" aria-hidden="true">
      <defs><linearGradient id="${id}"><stop stop-color="#8b5b20"/><stop offset=".35" stop-color="#e1ba64"/><stop offset=".6" stop-color="#b88a38"/><stop offset="1" stop-color="#694718"/></linearGradient><linearGradient id="${id}-crystal" x2="1" y2="1"><stop stop-color="#edffff"/><stop offset=".4" stop-color="#8cf3ef"/><stop offset="1" stop-color="#997cec"/></linearGradient><linearGradient id="${id}-beam" x2="0" y2="1"><stop stop-color="#9bf7ff" stop-opacity=".8"/><stop offset="1" stop-color="#9bf7ff" stop-opacity="0"/></linearGradient></defs>
      <ellipse cx="61" cy="172" rx="52" ry="6" fill="#241b11" opacity=".4"/>
      <path d="M15 159Q57 147 105 159L108 170H12Z" fill="#173d35" stroke="#b4914f" stroke-width="2"/>
      <path d="M68 158V128Q99 109 94 69L79 62Q87 111 53 124V158Z" fill="url(#${id})" stroke="#795325" stroke-width="1.7"/>
      <rect x="19" y="112" width="66" height="8" rx="3" fill="#173a33" stroke="#ac8a49" stroke-width="2"/>
      <g transform="rotate(19 52 64)"><rect x="38" y="19" width="28" height="72" rx="5" fill="#214d43" stroke="#b38b43" stroke-width="3"/><rect x="33" y="10" width="38" height="13" rx="3" fill="url(#${id})"/><rect x="42" y="91" width="20" height="16" fill="url(#${id})"/><ellipse cx="52" cy="107" rx="9" ry="4" fill="#8fe2e3"/></g>
      <circle cx="88" cy="99" r="12" fill="url(#${id})" stroke="#695029" stroke-width="2"/><circle cx="88" cy="99" r="5" fill="#274b3f"/>
      <ellipse cx="53" cy="148" rx="15" ry="6" fill="url(#${id})"/><path d="M46 27v48" stroke="#79a295" stroke-width="2" opacity=".7"/>
      <g class="scope-spell">
        <path d="M47 102L27 137Q53 146 78 137L58 102Z" fill="url(#${id}-beam)"/>
        <path d="M53 83L64 97L53 113L42 97Z" fill="url(#${id}-crystal)" stroke="#e6ffff" stroke-width="1.4"/>
        <path d="M53 85V110M44 97H62" stroke="#fff" stroke-opacity=".7"/>
        <ellipse cx="52" cy="65" rx="26" ry="10" fill="none" stroke="#b6e9ff" stroke-width="1.8" transform="rotate(-24 52 65)"/>
        <path class="scope-spark" d="M19 39L22 46L29 49L22 52L19 59L16 52L9 49L16 46Z" fill="#cefbff"/>
        <path class="scope-spark" d="M103 29L105 35L111 37L105 39L103 45L101 39L95 37L101 35Z" fill="#d8c5ff"/>
        <circle class="scope-spark" cx="88" cy="62" r="3" fill="#b6ffff"/>
      </g>
    </svg>`;
  }

  window.SCIW_ART = { ...window.SCIW_ART, professor, expression, beaker, notebook, microscope };
})();
