/*
 * 판정 엔진 — 미션 02 (키워드 규칙)
 * - 띄어쓰기가 제각각이라 공백을 지운 문장에서 특징을 찾는다.
 * - 오개념(E1~E4)은 바로 뒤에 '않/아니/없/못'이 오면 부정한 말로 보고 세지 않는다.
 *   ("열이 더해진 게 아니라…", "스스로 늘 수는 없다")
 * - 요소 코드: C, D-A, D-B, W1a, W1b, W2a, W2b (PRD 9.1)
 */
(function (root) {
  function normalize(text) {
    let t = String(text || '').normalize('NFC').toLowerCase();
    t = t.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
    t = t.replace(/(\d)\s*\.\s*(\d)/g, '$1.$2');
    t = t.replace(/(^|[^\d.])\.(\d)/g, '$10.$2');
    t = t.replace(/그램/g, 'g').replace(/[‘’“”"']/g, '');
    return t;
  }
  const compact = (s) => s.replace(/\s+/g, '');

  // 문장 나누기: 소수점(2.0)은 자르지 않는다.
  function sentences(text) {
    return String(text || '').split(/(?<!\d)\.(?!\d)|[!?。\n]+/).map((s) => s.trim()).filter(Boolean);
  }

  const NEG = /^.{0,8}?(않|아니|없|못)/;
  // re에 맞는 곳 중 바로 뒤에 부정어가 없는 곳이 하나라도 있으면 true
  function positive(re, s) {
    const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
    let m;
    while ((m = g.exec(s))) {
      const after = s.slice(m.index + m[0].length, m.index + m[0].length + 10);
      if (!NEG.test(after)) return true;
      if (m[0].length === 0) g.lastIndex++;
    }
    return false;
  }

  const R = {
    oxygen: /산소/,
    bound: /(결합|붙|달라붙|합쳐|만나|반응)/,
    inflow: /(바깥|밖에서|밖의|외부|공기(중|속)?(에서|로부터)|들어|유입|흡수|더해|추가)/,
    air: /공기/,
    airContact: /공기(뿐|밖에|만|중|속|와|에|가|랑|하고)|(닿|접촉|둘러|노출)[^.]{0,10}공기|공기[^.]{0,10}(닿|접촉|둘러|노출)/,
    burnWord: /(타|탈|연소|불)/,
    needWord: /(필요|있어야|없으면|소모|필수|써야|사용|쓰인|쓰여|이용)/,
    notCreated: /(원자|질량|물질)[^.]{0,14}(새로생기|생기거나|생겨나지|생기지|없어지지|사라지지|없어지거나|사라지거나|생기지도)|보존|(늘수|무거워질수)(는|가)?없/,
    outsideIf: /(늘었다면|늘었으니|늘어났다면|늘어났으니|무거워졌다면|무거워졌으니|늘었다는것은|늘어났다는것은|늘었으므로)[^.]{0,30}(바깥|밖|외부|들어)/,
    closedCtx: /(막|밀폐|마개|닫|실험b|플라스크)/,
    same: /(그대로|변하지않|변함없|같았|같다|같은|일정|변화가없|변화없|변화가없)/,
    moved: /(옮겨|이동|자리만|배열|붙기만|결합만|바뀌기만|바뀌었을뿐|옮겨갔)/,
    vanish: /(사라|없어지|없어졌|없어진|소멸|증발|날아가|날아갔|빠져나가|빠져나갔)/,
    massWord: /(질량|무게|0\.5|\dg|만큼)/,
    gainWord: /(0\.5|늘어난|증가한|늘어난질량|무거워진|증가량|늘어난만큼|늘어난것|증가한것|늘어난무게)/,
    gainLoose: /(늘|증가|무거워)/,
    gainLink: /(결합|붙|들어|더해|합쳐|옮겨)/,
    label: /(산화철|질량보존법칙|산화반응|산화되|산화했|산화된|연소반응)/,
    heat: /(열에너지|열이|열의|열은|열때문|열로|불꽃|불의열|뜨거)[^.]{0,12}(더해|추가|무게|무거워|늘|증가|커지|커졌|질량이생|질량을)/,
    gasless: /(기체|산소|공기)[^.]{0,8}(무게|질량)(이|가|은|는|도)?(없다|없어서|없기|없으|없음|없는|0)/,
    broken: /보존[^.]{0,10}(어긋|깨|성립하지|성립안|안되|맞지않|위반|틀렸)/,
    selfHeavy: /(스스로|저절로|혼자)[^.]{0,10}(무거워|늘|생기|생겼|바뀌)/,
    created: /(산소|원자|질량|물질)(이|가)?(새로)?(생겼|생긴다|생긴것|생겨서|생겨났|만들어졌|만들어진)/,
    model: /(빨간공|파란공|빨강공|회색공|점선|현미경|구슬|동그라미)/,
    situation: /(공기|접시|플라스크|마개|실험|저울)/,
    noBurn: /(안탔|타지않|안타|모자라|부족|못탔|못타)/,
    nums: /(2\.0|2\.5|0\.5|150)/,
    dA: /(2\.0|2g)[^.]{0,24}2\.5|0\.5g?(이|가|만큼)?(늘|증가|무거)|(실험a|접시|공기중에서태)[^.]{0,24}(늘|증가|무거워|2\.5)/,
    dB: /150|(실험b|플라스크|막고|막은|밀폐|마개)[^.]{0,30}(그대로|변하지않|같|일정|변화가?없)/
  };

  function features(text) {
    const c = compact(normalize(text));
    const f = { c };
    f.meaningful = (c.match(/[가-힣0-9a-z]/g) || []).length >= 3;
    f.oxygen = R.oxygen.test(c);
    // '결합하지 않았다', '들어오지 않았다'처럼 부정한 말은 세지 않는다
    f.bound = positive(R.bound, c);
    f.inflow = positive(R.inflow, c);
    f.air = R.air.test(c);
    f.airContact = R.airContact.test(c);
    const sents = sentences(text).map((s) => compact(normalize(s)));
    const some = (fn) => sents.some(fn);
    const burnNeeds = (x) => R.oxygen.test(x) && R.burnWord.test(x) && positive(R.needWord, x);
    f.burnNeedsO = some(burnNeeds);
    f.notCreated = R.notCreated.test(c);
    f.outsideIf = R.outsideIf.test(c);
    f.closedCtx = R.closedCtx.test(c);
    f.same = R.same.test(c);
    f.moved = R.moved.test(c);
    f.massWord = R.massWord.test(c);
    f.label = R.label.test(c);
    f.model = R.model.test(c);
    f.situation = R.situation.test(c);
    f.modelOnly = f.model && !f.situation;
    f.noBurn = positive(/(안탔|타지않|안타|모자라|부족|못탔|못타)/, c) || /(안탔|타지않|안타|못탔|못타)/.test(c);
    f.nums = R.nums.test(c);
    // 오개념: 부정한 말은 세지 않는다
    f.E1 = positive(R.heat, c);
    f.E2 = positive(R.gasless, c);
    f.E3 = positive(R.broken, c);
    f.E4 = positive(R.selfHeavy, c) || positive(R.created, c);
    // 요소
    // 요소는 한 문장 안에서, 부정하지 않은 채로 말했을 때만 인정한다
    // 한 문장에서라도 산소 결합을 부정하면("결합하지 않았다") 앞뒤가 안 맞는 답이라 C를 인정하지 않는다
    const negated = (re, x) => re.test(x) && !positive(re, x);
    f.C = some((x) => R.oxygen.test(x) && positive(R.bound, x)) && !some((x) => R.oxygen.test(x) && negated(R.bound, x));
    f.DA = R.dA.test(c);
    f.DB = R.dB.test(c);
    f.W1a = f.notCreated || f.outsideIf;
    const needDenied = some((x) => R.oxygen.test(x) && R.burnWord.test(x) && negated(R.needWord, x));
    f.W1b = !needDenied && (some((x) => burnNeeds(x) || (R.airContact.test(x) && R.oxygen.test(x))) || /플라스크(안|속)에는[^.]{0,12}(강철솜과산소|산소와강철솜)/.test(c));
    f.W2a = f.closedCtx && f.same && (f.moved || f.notCreated);
    // W2b: 증가량·산소·결합(들어옴)·질량을 한 문장 안에서 이어야 한다
    f.W2b = some((x) => R.oxygen.test(x) && R.gainWord.test(x) && positive(R.gainLink, x) && R.massWord.test(x) && !positive(R.heat, x));
    // 경로 ②의 W2b: 증가와 산소를 한 문장 안에서 이은 경우만 인정한다
    f.W2bLoose = f.W2b || some((x) => R.oxygen.test(x) && R.gainLoose.test(x) && positive(R.gainLink, x));
    return f;
  }

  const result = (pass, diag, extra) => Object.assign({ pass, diag }, extra || {});

  // Q1 답장: "그대로였다는 건 …라는 뜻이다" (보완안 2: 고르기 → 직접 쓰기)
  function judgeQ1(text) {
    const f = features(text);
    if (!f.meaningful) return result(false, 'unclear');
    if (f.E2) return result(false, 'E2');
    if (f.noBurn) return result(false, 'noBurn');
    // "산소는 플라스크 안에서 사라졌다"처럼 없어졌다고 하면(부정 없이) 통과시키지 않는다
    if (positive(R.vanish, f.c)) return result(false, 'vanish');
    if (f.E4) return result(false, 'E4');
    if (f.E1) return result(false, 'E1');
    if (f.moved || f.notCreated) return result(true, 'pass', { el: { W2a: true } });
    // "산소는 점선 안에서 철에 붙었다"처럼 안에 남은 채 자리만 바뀐 것을 말해도 인정한다
    if (f.oxygen && f.bound && /(안|그대로|여전히|남아|빠져나가지|나가지않|밖으로나가지)/.test(f.c)) return result(true, 'pass', { el: { W2a: true } });
    if (f.modelOnly) return result(false, 'modelOnly');
    return result(false, f.same || f.nums ? 'N1' : 'miss');
  }

  // Q2: 한 줄 서술 (choice는 예전 고르기 칸 자리. 지금은 늘 'outside')
  function judgeQ2(choice, text) {
    if (choice !== 'outside') return result(false, 'choiceWrong', { choiceDiag: choice });
    const f = features(text);
    if (!f.meaningful) return result(false, 'unclear');
    // "바깥에서 들어오지 않았다"처럼 들어온 것을 부정하면 통과시키지 않는다
    if (R.inflow.test(f.c) && !f.inflow) return result(false, 'inflowNeg');
    // 한 줄 답: 산소 + 바깥(공기)에서 왔다는 것. "왜 산소인가"는 최종 답안에서 묻는다.
    const fromAir = f.air || f.inflow || f.airContact || /(점선밖|밖에|바깥)/.test(f.c);
    if (f.oxygen && fromAir) return result(true, 'pass', { el: { W1b: true } });
    if (f.modelOnly) return result(false, 'modelOnly');
    if (f.air && !f.oxygen) return result(false, 'N5');
    if (f.oxygen) return result(false, 'needAir');
    return result(false, 'miss');
  }

  // Q3: "늘어난 0.5 g은 …"
  function judgeQ3(text) {
    const f = features(text);
    if (!f.meaningful) return result(false, 'unclear');
    if (f.E4) return result(false, 'E4');
    if (f.E1) return result(false, 'E1');
    if (f.oxygen && (f.inflow || f.bound)) return result(true, 'pass', { el: { W2b: true } });
    if (f.modelOnly) return result(false, 'modelOnly');
    if (!f.oxygen) return result(false, f.label ? 'N2' : 'needOxygen');
    return result(false, 'needWhere');
  }

  // 처음 답(보완안 1): 판정하지 않고 진단 표시만 남긴다
  function tagFirst(text) {
    const f = features(text);
    if (!f.meaningful) return 'unclear';
    const err = ['E1', 'E2', 'E3', 'E4'].find((k) => f[k]);
    if (err) return err;
    const anyW = f.W1a || f.W1b || f.W2a || f.W2b;
    if (anyW) return 'W';
    if (f.label) return 'N2';
    if (f.DB) return 'N3';
    if (f.nums || f.DA) return 'N1';
    if (f.C) return 'C';
    return 'other';
  }

  const PATH1 = ['C', 'D-A', 'W1a', 'W1b', 'W2b'];
  const PATH2 = ['C', 'D-A', 'D-B', 'W2a', 'W1b', 'W2b'];
  const ASK_ORDER = ['W2b', 'W2a', 'W1b', 'W1a', 'D-B', 'D-A', 'C'];

  function judgeFinal(text) {
    const f = features(text);
    const el = { C: f.C, 'D-A': f.DA, 'D-B': f.DB, W1a: f.W1a, W1b: f.W1b, W2a: f.W2a, W2b: f.W2b };
    const errors = ['E1', 'E2', 'E3', 'E4'].filter((k) => f[k]);
    if (!f.meaningful) return { pass: false, diag: 'unclear', elements: el, errors, ask: 'unclear' };
    const has1 = (k) => !!el[k];
    const has2 = (k) => (k === 'W2b' ? f.W2bLoose : !!el[k]);
    const miss1 = PATH1.filter((k) => !has1(k));
    const miss2 = PATH2.filter((k) => !has2(k));
    const full = errors.length === 0 && (miss1.length === 0 || miss2.length === 0);
    const path = miss1.length === 0 ? 1 : miss2.length === 0 ? 2 : null;
    let ask = null;
    if (!full) {
      if (errors.length) ask = errors[0];
      else {
        // 덜 빠진 경로를 따른다. 같으면 숫자의 뜻(W2)을 먼저 묻게 되는 쪽.
        const a1 = ASK_ORDER.find((k) => miss1.includes(k));
        const a2 = ASK_ORDER.find((k) => miss2.includes(k));
        ask = miss1.length !== miss2.length ? (miss2.length < miss1.length ? a2 : a1) : (ASK_ORDER.indexOf(a2) <= ASK_ORDER.indexOf(a1) ? a2 : a1);
      }
    }
    return { pass: full, diag: full ? 'pass' : ask, elements: el, errors, path, ask, missing: miss2.length < miss1.length ? miss2 : miss1 };
  }

  // 클리어 화면용: 문장별로 W 역할이 있는지, 칭찬에 인용할 문장
  function sentenceRoles(text) {
    const list = sentences(text);
    return list.map((s, i) => {
      const f = features(s);
      const prev = i > 0 ? features(list[i - 1]) : null;
      const roles = [];
      // '이것은 …옮겨 갔을 뿐이라는 뜻이다'처럼 앞 문장의 막힌 플라스크 결과를 받는 문장도 W2a로 본다
      if (f.W2a || ((f.moved || f.notCreated) && (f.closedCtx || (prev && prev.closedCtx && prev.same)))) roles.push('W2a');
      if (f.W2b) roles.push('W2b');
      if (f.W1a) roles.push('W1a');
      if (f.burnNeedsO || /(닿|접촉|둘러|노출|공기뿐|공기밖에|공기만)/.test(f.c)) roles.push('W1b');
      return { text: s, roles };
    });
  }

  const API = { normalize, features, sentences, judgeQ1, judgeQ2, judgeQ3, tagFirst, judgeFinal, sentenceRoles };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.SCIW_JUDGE02 = API;
})(typeof window !== 'undefined' ? window : globalThis);
