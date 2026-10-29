/* Student-facing concept labels, writing provenance, rewards and feedback. */
(function () {
  const escape = value => String(value || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const modelLabel = id => String(id).replace(/^M(\d+)$/, '개념 $1');

  // Identical scientific wording alone is not evidence that a student used a card.
  function cardsInText(cards, text, insertedIds) {
    const inserted = new Set(insertedIds || []);
    return cards.filter(card => inserted.has(card.id) && text.includes(card.sentence));
  }

  function giftEligible(result, text) {
    const own = result.own || result.elements || {};
    const meaningful = ['C','D','W1','W2a','W2b','W3','WB'].some(key => own[key]);
    return result.mode === 'own' && String(text || '').trim().length > 0 && !result.unclear &&
      meaningful && !(result.usedCards || []).length && !(result.cardSentences || []).length;
  }

  function feedback(result, copy) {
    const own = result.own || result.elements || {};
    const evidence = result.ownEvidence || result.evidence || {};
    const output = [];
    const add = (kind, quotes) => {
      const unique = [...new Set(quotes.filter(Boolean).map(q => q.trim()))];
      if (copy[kind] && unique.length) output.push({kind, ...copy[kind], quotes: unique.slice(0, 2)});
    };
    if (own.W1) add('W1', [evidence.W1 || evidence.W2a_water || evidence.W2b_water]);
    if (result.ownViaWB && own.WB) add('WB', [evidence.WB]);
    else if (own.W2a || own.W2b) add('W2', [own.W2a && evidence.W2a, own.W2b && evidence.W2b]);
    return output.slice(0, 2);
  }

  function highlightQuote(text, kind) {
    const value = String(text || '');
    const water = /(?<![가-힣])(?:물|수분)(?:이|은|가)?\s*[^.!?。\n,]{0,28}?(?:들어[가-힣]*|빠져[가-힣]*|빠지[가-힣]*|나갔[가-힣]*|유입[가-힣]*|흡수[가-힣]*)/g;
    const compare = /\d+(?:\.\d+)?\s*(?:%|퍼센트|프로)(?:\s*(?:설탕물|용액))?\s*보다(?:는|도)?\s*(?:더\s*)?(?:진하[가-힣]*|진한[가-힣]*|묽[가-힣]*|높[가-힣]*|낮[가-힣]*)/g;
    const direction = /묽[가-힣]*\s*(?:쪽|곳|용액)?\s*에서\s*진[가-힣]*\s*(?:쪽|곳|용액)?\s*(?:으로|로)/g;
    const equal = /농도[^.!?。\n]{0,15}같[^.!?。\n]{0,35}(?:질량[^.!?。\n]{0,15}(?:없[가-힣]*|0)|변화[^.!?。\n]{0,10}없[가-힣]*)/g;
    const patterns = kind === 'W1' ? [water] : kind === 'WB' ? [equal] : [compare, direction];
    const ranges = [];
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(value))) ranges.push([match.index, match.index + match[0].length]);
    }
    ranges.sort((a,b) => a[0]-b[0]);
    const merged = [];
    for (const range of ranges) {
      const previous = merged[merged.length-1];
      if (previous && range[0] <= previous[1]) previous[1] = Math.max(previous[1],range[1]);
      else merged.push(range.slice());
    }
    let html = ''; let offset = 0;
    for (const [start,end] of merged) {
      html += escape(value.slice(offset,start)) + '<mark>' + escape(value.slice(start,end)) + '</mark>';
      offset = end;
    }
    return html + escape(value.slice(offset));
  }

  window.SCIW_LEARNING = {modelLabel, cardsInText, giftEligible, feedback, highlightQuote};
})();
