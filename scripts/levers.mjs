/**
 * Negotiation-lever engine. Turns each vendor's REAL financials (Munshot/Probe42)
 * and REAL procurement facts (Phase-1 spend, terms, returns, single-source share,
 * price gap) into plain-English levers tagged opportunity / risk / watch, each
 * carrying the numbers behind it. No advice without evidence.
 */
const money = (n) => (n == null ? '—' : Math.abs(n) >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : Math.abs(n) >= 1e5 ? `₹${(n / 1e5).toFixed(2)} L` : `₹${Math.round(n)}`);
const pct = (n, d = 1) => (n == null ? '—' : `${n.toFixed(d)}%`);

export function buildLevers({ vendor, financials, singleSourceShare, priceExcess, bestGapNote, ratingGrade, ratingLabel, inc, probe }) {
  const L = [];
  const m = financials?.metrics || null;
  const add = (type, title, detail, evidence) => L.push({ type, title, detail, evidence: evidence.filter((e) => e.value !== '—') });

  // 0) Credit rating — a strong independent signal of supply-continuity risk.
  if (ratingGrade) {
    const strong = /^(AAA|AA|A)/.test(ratingGrade);
    const weak = /^(B|C|D)/.test(ratingGrade) && !/^BB?B/.test(ratingGrade);
    if (inc) add('risk', `${ratingLabel} — but they stopped sharing info with the rating agency`,
      `The latest rating was done without the company's help, so the numbers may be out of date. Treat their financial health as uncertain and keep a backup supplier ready.`,
      [{ label: 'Rating', value: ratingLabel }]);
    else if (weak) add('risk', `Weak credit rating (${ratingLabel})`,
      `A low credit rating is a warning sign for steady supply. Don't put too much through them; line up a backup.`,
      [{ label: 'Rating', value: ratingLabel }]);
    else if (strong) add('watch', `Strong credit rating (${ratingLabel})`,
      `A high credit rating means little risk they'll run into trouble — so you can push harder on price and terms.`,
      [{ label: 'Rating', value: ratingLabel }]);
    else add('watch', `Credit rating: ${ratingLabel}`,
      `A middling credit rating — bear it in mind when deciding how much to buy from them.`,
      [{ label: 'Rating', value: ratingLabel }]);
  }

  // 0b) Probe42 peer-relative + health signals (MCA filings vs peer medians).
  if (probe) {
    const peer = probe.peer;
    if (probe.lossMaking) add('risk', `Lost money in ${probe.latestFy}`,
      `They made a loss in ${probe.latestFy} (${money(m?.pat)}). Pushing hard on price could put your supply at risk — lead with faster payment or a volume commitment, and keep a backup supplier ready.`,
      [{ label: 'Final profit', value: money(m?.pat) }, { label: 'Profit kept', value: m?.netMargin != null ? pct(m.netMargin) : '—' }]);
    if (peer?.netMargin != null && m?.netMargin != null) {
      if (m.netMargin >= peer.netMargin + 1.5) add('opportunity', `Makes more profit than similar firms — keeps ${pct(m.netMargin)} vs ${pct(peer.netMargin)}`,
        `They keep more profit than other ${peer.bizSegment || 'similar'} firms (${peer.peers || '—'} compared). That means there's room in the price they charge you.`,
        [{ label: 'They keep', value: pct(m.netMargin) }, { label: 'Similar firms', value: pct(peer.netMargin) }]);
      else if (m.netMargin <= peer.netMargin - 1.5) add('watch', `Keeps less profit than similar firms — ${pct(m.netMargin)} vs ${pct(peer.netMargin)}`,
        `They keep less profit than their rivals, so price cuts hurt them more. Win on payment terms, volume or delivery instead of headline price.`,
        [{ label: 'They keep', value: pct(m.netMargin) }, { label: 'Similar firms', value: pct(peer.netMargin) }]);
    }
    if (peer?.payableDays != null && m?.payableDays != null && m.payableDays >= peer.payableDays + 10) add('opportunity', `They pay their own suppliers slower than most — ${Math.round(m.payableDays)}d vs ${Math.round(peer.payableDays)}d`,
      `They already take longer than similar firms to pay their own suppliers, so asking them to give you more time to pay is only fair.`,
      [{ label: 'They take', value: `${Math.round(m.payableDays)}d` }, { label: 'Similar firms', value: `${Math.round(peer.payableDays)}d` }]);
    if (peer?.ccc != null && m?.cashConversionCycle != null && m.cashConversionCycle >= peer.ccc + 15) add('opportunity', `Their cash is stuck longer than most — ${Math.round(m.cashConversionCycle)}d vs ${Math.round(peer.ccc)}d`,
      `Their cash is tied up longer than similar firms, so they'll value being paid faster. Offer quicker payment in exchange for a price cut.`,
      [{ label: 'Cash stuck for', value: `${Math.round(m.cashConversionCycle)}d` }, { label: 'Similar firms', value: `${Math.round(peer.ccc)}d` }]);
    if (probe.probeScore?.overall != null && probe.probeScore.overall <= 2) add('risk', `Weak money-health score (${probe.probeScore.overall}/10)`,
      `Their overall money-health score is low — a risk to steady supply. Don't put too much through them; line up a backup.`,
      [{ label: 'Money-health', value: `${probe.probeScore.overall}/10` }]);
  }

  // 1) Our wallet share of their revenue — the core leverage number.
  if (m?.revenue && vendor.totalNetSpend) {
    const share = (vendor.totalNetSpend / m.revenue) * 100;
    if (share >= 1) {
      add('opportunity', `You're a big customer — ${pct(share, 2)} of everything they sell`,
        `Your ${money(vendor.totalNetSpend)}/yr is a real chunk of their ${money(m.revenue)} in sales. That buying power is your lever — ask for a better price or terms to keep it.`,
        [{ label: 'You spend', value: money(vendor.totalNetSpend) }, { label: 'Their sales', value: money(m.revenue) }, { label: 'Your share', value: pct(share, 2) }]);
    } else if (share < 0.2) {
      add('watch', `You're a small customer — ${pct(share, 2)} of everything they sell`,
        `At ${money(vendor.totalNetSpend)} you're tiny next to their ${money(m.revenue)} in sales. On your own you have little pull — bundle more volume, commit for several years, or play them off against another supplier.`,
        [{ label: 'You spend', value: money(vendor.totalNetSpend) }, { label: 'Your share', value: pct(share, 2) }]);
    }
  }

  // 2) Margin headroom.
  if (m?.netMargin != null) {
    if (m.netMargin >= 8) add('opportunity', `They keep a healthy ${pct(m.netMargin)} as profit — room on price`,
      `They keep a comfortable ${pct(m.netMargin)} of sales as profit. Asking for a better price won't put them in trouble.`,
      [{ label: 'Profit kept', value: pct(m.netMargin) }, { label: 'Operating profit', value: m.ebitdaMargin != null ? pct(m.ebitdaMargin) : '—' }]);
    else if (m.netMargin > 0 && m.netMargin < 3) add('watch', `They keep only ${pct(m.netMargin)} as profit — push terms, not price`,
      `There's very little profit to spare, so a big price cut could hurt them (and your supply). Win on payment terms, volume or delivery instead.`,
      [{ label: 'Profit kept', value: pct(m.netMargin) }]);
  }

  // 3) Growth appetite.
  if (m?.revenueGrowth != null && m.revenueGrowth >= 15) add('opportunity', `Growing fast (${pct(m.revenueGrowth)}/yr) — swap volume for a better price`,
    `Their sales are growing fast, so they want new orders. Offer to commit more volume in return for a lower price.`,
    [{ label: 'Sales growth', value: pct(m.revenueGrowth) }]);

  // 4) Leverage / balance-sheet.
  if (m?.debtToEquity != null && m.debtToEquity >= 100) add('risk', `They owe a lot (${(m.debtToEquity / 100).toFixed(2)}× their own cash) — watch supply, offer to pay fast`,
    `They carry a lot of debt — a small risk to steady supply, but it also means they value cash. Offer to pay faster for a discount.`,
    [{ label: 'Owed vs own cash', value: `${(m.debtToEquity / 100).toFixed(2)}x` }, { label: 'Total owed', value: money(m.totalDebt) }]);

  // 5) Working-capital levers (absolute) — only when we have no peer-relative view.
  if (!probe?.peer && m?.payableDays != null && m.payableDays >= 60) add('opportunity', `They take ${Math.round(m.payableDays)} days to pay their own suppliers`,
    `They make their own suppliers wait ${Math.round(m.payableDays)} days to be paid — so asking them to give you more time is only fair.`,
    [{ label: 'They take', value: `${Math.round(m.payableDays)}d` }]);
  if (!probe?.peer && m?.cashConversionCycle != null && m.cashConversionCycle >= 60) add('opportunity', `Their cash is stuck for ${Math.round(m.cashConversionCycle)} days`,
    `Their money is tied up for ${Math.round(m.cashConversionCycle)} days before it comes back. Offer to pay faster in exchange for a price cut — a cheap win for both.`,
    [{ label: 'Cash stuck for', value: `${Math.round(m.cashConversionCycle)}d` }]);

  // 6) Single-source risk (procurement fact).
  if (singleSourceShare && singleSourceShare.share >= 0.5) add('risk', `Only supplier: ${pct(singleSourceShare.share * 100, 0)} of ${singleSourceShare.material} comes from them`,
    `They're your main source for ${singleSourceShare.material} (${money(singleSourceShare.spend)}). Find and approve a second supplier — it lowers your risk and gives you a stronger hand in talks.`,
    [{ label: 'Share of material', value: pct(singleSourceShare.share * 100, 0) }, { label: 'Spend', value: money(singleSourceShare.spend) }]);

  // 7) Weak terms we currently give.
  if (vendor.worstTerms) add('opportunity', vendor.termCategory === 'advance' ? 'You pay them 100% in advance' : 'You pay them on delivery',
    `Moving them to normal 30-day credit frees up about ${money((vendor.totalNetSpend * 30) / 365)} of your cash. Your strongest, simplest ask.`,
    [{ label: 'Right now', value: vendor.termCategory === 'advance' ? '100% advance' : 'Pay on delivery' }, { label: 'Cash freed at 30 days', value: money((vendor.totalNetSpend * 30) / 365) }]);

  // 8) Overpayment vs best.
  if (priceExcess && priceExcess > 2e5) add('opportunity', `Paying ${money(priceExcess)}/yr more than your cheapest supplier`,
    `For the same sort of items they charge more than the lowest price you already pay. ${bestGapNote || 'Hold them to that price.'}`,
    [{ label: 'Extra vs cheapest', value: money(priceExcess) }]);

  // 9) Returns / quality.
  if (vendor.reversalRatePct >= 10) add('watch', `A lot of their deliveries get sent back (${pct(vendor.reversalRatePct, 0)})`,
    `${pct(vendor.reversalRatePct, 0)} of what they deliver ends up reversed or returned — sort out quality and paperwork before it costs more.`,
    [{ label: 'Return rate', value: pct(vendor.reversalRatePct, 0) }]);

  return L;
}
