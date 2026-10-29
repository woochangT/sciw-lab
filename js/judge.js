/*
 * 판정 엔진 (키워드 규칙)
 * - 고르기 문항은 설정 파일의 선택지 진단을 그대로 쓴다.
 * - 서술 문항은 문장을 절 단위로 나누고, 각 절이 어느 설탕물 농도(예: 5% / 10%) 이야기인지 붙인 뒤
 *   물의 출입·안쪽 농도 비교·이동 방향 같은 특징을 뽑아 체크 항목과 오류 유형을 정한다.
 * - 질량 변화도 %로 쓰므로, '질량'·부호 뒤에 오거나 '늘·줄' 앞에 오는 %는 농도 언급으로 세지 않는다.
 * - LLM 판정 결과가 오면 game.js에서 이 결과와 합친다.
 */
(function () {
  const DOT = '·';

  function makeRe(src) { return new RegExp(src); }

  function normalize(text, lex) {
    let t = String(text || '').normalize('NFC').toLowerCase();
    t = t.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
    t = t.replace(/(\d)\s*\.\s*(\d)/g, '$1.$2');
    t = t.replace(/(^|[^\d.])\.(\d)/g, '$10.$2'); // .2 → 0.2
    t = t.replace(/물론/g, '당연');
    // '진하기'는 농도를 가리키는 명사다. '진하'만 잡아 '진하다'라는 주장으로 읽지 않는다.
    // 농도로 바꾸면 '진하기가 높다/낮다'도 기존 농도 비교 규칙을 그대로 쓸 수 있다.
    t = t.replace(/진하기|짙기/g, '농도');
    (lex.replace || []).forEach(([a, b]) => { t = t.split(a).join(b); });
    return t;
  }

  const compact = (s) => s.replace(/\s+/g, '');

  // 문장 속 설탕물 농도 언급(예: "10% 설탕물")을 찾는다. "질량이 5% 줄었다"의 5%는 질량 변화라서 뺀다.
  function concMentions(sent, lex) {
    const out = [];
    const re = new RegExp('(?<![\\d.])(\\d+(?:\\.\\d+)?)\\s*' + lex.concUnit, 'g');
    const massBefore = new RegExp(lex.massBefore + '(이|은|가|도|의|변화가|변화는|변화)?(약)?$');
    const massAfter = new RegExp('^(정도|쯤|가량)?(만큼)?' + lex.massAfter);
    let m;
    while ((m = re.exec(sent))) {
      const before = compact(sent.slice(Math.max(0, m.index - 10), m.index));
      const after = compact(sent.slice(m.index + m[0].length, m.index + m[0].length + 8));
      if (massBefore.test(before) || massAfter.test(after)) continue;
      out.push({ idx: m.index, val: Number(m[1]) });
    }
    return out;
  }

  // 원문을 문장 → 절(농도 언급이 바뀌는 지점) 단위로 나눈다.
  function splitClauses(text, lex) {
    const guarded = text.replace(/(\d)\.(\d)/g, '$1' + DOT + '$2');
    // 문장 끝과 쉼표에서 끊는다(쉼표 뒤 절은 앞 절의 농도를 이어받는다).
    const sentences = guarded.match(/[^.!?。\n,，]+[.!?。,，]*\s*/g) || [];
    const clauses = [];
    sentences.forEach((s) => {
      const sent = s.split(DOT).join('.');
      const mentions = concMentions(sent, lex);
      if (!mentions.length) { clauses.push({ raw: sent, ref: null }); return; }
      let start = 0;
      let cur = mentions[0].val;
      for (let i = 1; i < mentions.length; i++) {
        if (mentions[i].val !== cur) {
          clauses.push({ raw: sent.slice(start, mentions[i].idx), ref: cur });
          start = mentions[i].idx;
          cur = mentions[i].val;
        }
      }
      clauses.push({ raw: sent.slice(start), ref: cur });
    });
    // 농도 언급이 없는 절은 앞 절의 농도를 이어받는다.
    let last = null;
    clauses.forEach((c) => {
      if (c.ref === null) c.ref = last; else last = c.ref;
    });
    return clauses.filter((c) => c.raw.trim());
  }

  function featuresOf(raw, lex) {
    const R = (k) => makeRe(lex[k]);
    let c = compact(raw);
    const f = {};

    // 이동 방향 (묽은 쪽 → 진한 쪽)
    const DL = '(묽|연한|옅|저농도|농도가낮|낮은농도|농도낮|낮은(쪽|곳|데))';
    const DH = '(진|짙|고농도|농도가높|높은농도|농도높|높은(쪽|곳|데))';
    const fwd1 = new RegExp(DL + '[^.]{0,15}?(에서|부터|→|->)[^.]{0,15}?' + DH);
    const rev1 = new RegExp(DH + '[^.]{0,15}?(에서|부터|→|->)[^.]{0,15}?' + DL);
    const fwd2 = /(진한|짙은|고농도|농도가높은|높은농도|농도가더높은)(쪽|곳|용액|데|부분)?(으로|로|에)(이동|가|간|갈|움직|들어|향|흘|빨려)/;
    const rev2 = /(묽은|연한|옅은|저농도|농도가낮은|낮은농도|농도가더낮은)(쪽|곳|용액|데|부분)?(으로|로|에)(이동|가|간|갈|움직|들어|향|흘|빨려)/;
    f.dirForward = fwd1.test(c) || (fwd2.test(c) && !rev1.test(c));
    f.dirReverse = !f.dirForward && (rev1.test(c) || rev2.test(c));
    // 방향 문구는 안쪽 농도 주장과 헷갈리지 않게 지운다.
    c = c.replace(new RegExp(fwd1.source, 'g'), '').replace(new RegExp(rev1.source, 'g'), '')
      .replace(new RegExp(fwd2.source, 'g'), '').replace(new RegExp(rev2.source, 'g'), '');

    // 물의 출입: 물 다음에 처음 나오는 동사로 방향을 정한다.
    const water = R('water');
    const wm = c.match(water);
    f.waterIn = false; f.waterOut = false;
    if (wm) {
      const after = c.slice(wm.index);
      const iIn = after.search(R('into'));
      const iOut = after.search(R('out'));
      if (iIn >= 0 && (iOut < 0 || iIn < iOut)) f.waterIn = true;
      else if (iOut >= 0) f.waterOut = true;
      else {
        const before = c.slice(0, wm.index);
        if (R('into').test(before)) f.waterIn = true;
        else if (R('out').test(before)) f.waterOut = true;
      }
    }

    // 용질 이동 (E1): 설탕 뒤에 이동 동사가 있고 부정어가 없을 때
    const sm = c.match(R('solute'));
    f.soluteMoves = false;
    if (sm) {
      const after = c.slice(sm.index, sm.index + 16);
      const moves = makeRe('(' + lex.into.slice(1, -1) + '|' + lex.out.slice(1, -1) + '|이동|통과|지나|드나)').test(after);
      f.soluteMoves = moves && !R('negate').test(after);
    }

    // 안쪽 농도 주장
    f.insideHigh = false; f.insideLow = false;
    const concentrationBefore = new RegExp('농도(가|는|이|은)?((\\d+(\\.\\d+)?' + lex.concUnit + ')?(바깥용액|용액|밖|바깥)?보다(는|도)?)?(더|훨씬|조금|약간)?$');
    const scan = (re, isHigh, needsConcentration = false) => {
      const g = new RegExp(re.source, 'g');
      let m;
      while ((m = g.exec(c))) {
        const prefix = c.slice(0, m.index);
        if (needsConcentration && !concentrationBefore.test(prefix)) continue;
        let subject = 'inside';
        const k = prefix.lastIndexOf('보다');
        const hasIn = (s) => R('inside').test(s);
        const hasOut = (s) => R('outside').test(s);
        if (k >= 0) {
          const afterB = prefix.slice(k + 2);
          // '보다' 바로 앞의 비교 대상만 본다(앞쪽 주어의 조사에서 자른다).
          const comp = prefix.slice(Math.max(0, k - 8), k).split(/[이가은는]/).pop();
          if (hasOut(afterB) && !hasIn(afterB)) subject = 'outside';
          else if (hasIn(afterB)) subject = 'inside';
          else if (hasIn(comp) && !hasOut(comp) && !/\d/.test(comp)) subject = 'outside';
        } else {
          const seg = prefix.slice(-10);
          if (hasOut(seg) && !hasIn(seg)) subject = 'outside';
        }
        const insideHigh = (subject === 'inside') === isHigh;
        if (insideHigh) f.insideHigh = true; else f.insideLow = true;
      }
    };
    scan(R('high'), true);
    scan(R('low'), false);
    // '농도가 10%보다 낮다'처럼 비교 대상이 명사와 서술어 사이에 들어갈 수 있다.
    // 높다/낮다는 농도에 붙은 경우에만 읽어 질량·크기 표현과 구분한다.
    scan(/높/, true, true);
    scan(/낮/, false, true);
    f.comparator = new RegExp('보다|더|\\d' + lex.concUnit + '|밖|바깥|외부|용액').test(c);

    f.label = R('label').test(c);
    f.data = R('data').test(c);
    f.increase = /(늘|증가|커졌|커지|무거|\+\d|불어|부풀)/.test(c);
    f.decrease = /(줄|감소|작아|가벼|[−-]\d)/.test(c);
    f.equal = R('equal').test(c);
    f.signChange = R('signChange').test(c);
    f.conclude = R('conclude').test(c);
    return f;
  }

  // 절의 raw는 학생 원문 그대로 둔다(클리어 화면 형광펜용). 특징은 정규화한 문자열에서 뽑는다.
  function analyze(text, lex) {
    const orig = String(text || '').normalize('NFC');
    const norm = normalize(orig, lex);
    const clauses = splitClauses(orig, lex).map((cl) => Object.assign(cl, { f: featuresOf(normalize(cl.raw, lex), lex) }));
    const any = (k, ref) => clauses.some((cl) => cl.f[k] && (ref === undefined || cl.ref === ref));
    const find = (pred) => clauses.find(pred);
    return { orig, norm, compact: compact(norm), clauses, any, find, hangul: (norm.match(/[가-힣]/g) || []).length };
  }

  // ───── 서술 퀘스트 판정 ─────
  // 반환: { diagnosis: 'PASS'|'N1'|'N2'|'E1'|'E2'|'E3'|'UNCLEAR', checks: {...} }
  function judgeQuestText(quest, text, choice, lex) {
    const spec = quest.judge || {};
    const ref = spec.ref;
    const a = analyze(text, lex);
    // 이 퀘스트의 맥락은 ref 농도: 농도 언급이 없는 절은 ref 이야기로 본다.
    a.clauses.forEach((cl) => { if (cl.ref === null) cl.ref = ref; });
    const onRef = (k) => a.any(k, ref);
    const checks = {};

    if (quest.id === 'Q2' || spec.need?.includes('direction')) {
      checks.choice = choice === spec.choiceCorrect;
      checks.direction = a.any('dirForward');
      checks.reverse = a.any('dirReverse');
      if (!choice && a.hangul < 2) return { diagnosis: 'UNCLEAR', checks };
      if (a.any('soluteMoves')) return { diagnosis: 'E1', checks };
      if ((choice && !checks.choice) || checks.reverse) return { diagnosis: 'E2', checks };
      if (checks.choice && checks.direction) return { diagnosis: 'PASS', checks };
      if (a.any('label')) return { diagnosis: 'N2', checks };
      if (a.hangul < 2) return { diagnosis: 'UNCLEAR', checks };
      return { diagnosis: 'N1', checks };
    }

    // Q3: 물이 빠져나감 + 안이 ref보다 묽음
    checks.water_out = onRef('waterOut');
    checks.inside_low = onRef('insideLow');
    checks.comparator = a.clauses.some((cl) => cl.ref === ref && cl.f.insideLow && cl.f.comparator);
    const userHangul = analyze(String(text).replace(quest.answer.starter || '', ''), lex).hangul;
    if (userHangul < 3) return { diagnosis: 'UNCLEAR', checks };
    if (a.any('soluteMoves')) return { diagnosis: 'E1', checks };
    if (a.any('dirReverse') || onRef('insideHigh') || (onRef('waterIn') && !checks.water_out)) return { diagnosis: 'E2', checks };
    if (checks.water_out && checks.inside_low && checks.comparator) return { diagnosis: 'PASS', checks };
    if (checks.water_out || (checks.inside_low && !checks.comparator)) return { diagnosis: 'E3', checks };
    if (a.any('label')) return { diagnosis: 'N2', checks };
    if (checks.inside_low) return { diagnosis: 'N1', checks };
    return { diagnosis: a.any('data') || a.any('waterIn') ? 'N1' : 'UNCLEAR', checks };
  }

  // ───── 최종 변론 판정 ─────
  // ans: { low, high } — 정답 범위의 두 경계 농도(설정 파일의 answer)
  function judgeDefense(text, lex, ans) {
    const a = analyze(text, lex);
    const ev = {};
    const pick = (key, pred) => { const cl = a.find(pred); if (cl) ev[key] = cl.raw.trim(); return !!cl; };
    const lo = ans.low;
    const hi = ans.high;
    const numRe = (v) => '(?<![\\d.])' + String(v).replace('.', '\\.') + '(?![\\d.])\\s*' + lex.concUnit + '?';

    // C: "5%와 10% 사이", "5~10%", "5%보다 진하고 10%보다 묽다" 같은 결론
    // 앞쪽의 "5%"가 질량 변화일 수도 있으니, low가 나오는 자리마다 살펴본다.
    const pair = new RegExp('^' + numRe(lo) + '[^。!?\\n]{0,30}?' + numRe(hi) + '[^。!?\\n]{0,10}');
    const rangeWord = /(사이|~|–|부터|까지|미만|이하|보다작|보다묽|보다낮|보다연|크고|진하고|높고|초과|이상)/;
    const lowAt = new RegExp(numRe(lo), 'g');
    let C = false;
    let lm;
    while (!C && (lm = lowAt.exec(a.compact))) {
      const p = a.compact.slice(lm.index).match(pair);
      if (p && rangeWord.test(p[0])) C = true;
    }
    if (new RegExp(numRe(lo) + '\\s*[~\\-–]\\s*' + numRe(hi)).test(a.compact)) C = true;
    if (C) {
      const both = new RegExp(numRe(lo) + '[\\s\\S]*' + numRe(hi));
      const sent = a.orig.split(/(?<!\d)\.(?!\d)|[!?\n]/).find((s) => both.test(s));
      if (sent) ev.C = sent.trim();
    }
    const D = pick('D', (cl) => cl.ref === lo && cl.f.increase) && a.clauses.some((cl) => cl.ref === hi && cl.f.decrease);
    const W1 = pick('W1', (cl) => cl.f.waterIn || cl.f.waterOut);
    const fwd = a.any('dirForward');
    const W2a = a.clauses.some((cl) => cl.ref === lo && cl.f.insideHigh) &&
      (a.any('waterIn', lo) || fwd) && pick('W2a', (cl) => cl.ref === lo && cl.f.insideHigh);
    const W2b = a.clauses.some((cl) => cl.ref === hi && cl.f.insideLow) &&
      (a.any('waterOut', hi) || fwd) && pick('W2b', (cl) => cl.ref === hi && cl.f.insideLow);
    // 원리 문장(방향)이나 물 출입 절도 형광펜 후보로 둔다.
    if (W2a && !ev.W2a_water) { const w = a.find((cl) => cl.ref === lo && cl.f.waterIn); if (w) ev.W2a_water = w.raw.trim(); }
    if (W2b) { const w = a.find((cl) => cl.ref === hi && cl.f.waterOut); if (w) ev.W2b_water = w.raw.trim(); }
    if (fwd) { const w = a.find((cl) => cl.f.dirForward); if (w) ev.principle = w.raw.trim(); }
    const W3 = C && W2a && W2b;
    if (W3) ev.W3 = ev.C;
    const WB = a.any('equal') && (a.any('signChange') || C) && pick('WB', (cl) => cl.f.equal);

    const errors = [];
    if (a.any('soluteMoves')) errors.push('E1');
    if (a.any('dirReverse') || a.any('insideLow', lo) || a.any('insideHigh', hi)) errors.push('E2');
    if (a.any('label') && !W1) errors.push('N2');
    if (a.clauses.some((cl) => (cl.f.insideHigh || cl.f.insideLow) && !cl.f.comparator && cl.ref === null)) errors.push('E3');
    if (!W1 && !W2a && !W2b && !WB && a.any('data')) errors.push('N1');

    const elements = { C, D, W1, W2a: W2a || WB, W2b: W2b || WB, W3: W3 || WB, WB };
    return {
      elements,
      viaWB: WB && !(W2a && W2b && W3),
      errors,
      evidence: ev,
      unclear: a.hangul < 4
    };
  }

  window.SCIW_JUDGE = { normalize, analyze, judgeQuestText, judgeDefense };
})();
