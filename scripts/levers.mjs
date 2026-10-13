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
    if (inc) add('risk', `${ratingLabel} — but not cooperating with the rating agency`,
      `The latest rating is on an "Issuer Not Cooperating" basis, so the numbers are stale/best-available. Treat their financial health as uncertain and keep a second source warm.`,
      [{ label: 'Rating', value: ratingLabel }]);
    else if (weak) add('risk', `Sub-investment-grade rating (${ratingLabel})`,
      `A speculative-grade credit rating is a supply-continuity watch. Don't over-concentrate volume here; qualify an alternate.`,
      [{ label: 'Rating', value: ratingLabel }]);
    else if (strong) add('watch', `Solid credit rating (${ratingLabel})`,
      `An investment-grade rating means low continuity risk — we can push harder on price/terms without worrying they'll wobble.`,
      [{ label: 'Rating', value: ratingLabel }]);
    else add('watch', `Credit rating: ${ratingLabel}`,
      `Mid-tier credit rating — factor into how much volume we route here.`,
      [{ label: 'Rating', value: ratingLabel }]);
  }

  // 0b) Probe42 peer-relative + health signals (MCA filings vs peer medians).
  if (probe) {
    const peer = probe.peer;
    if (probe.lossMaking) add('risk', `Loss-making in ${probe.latestFy}`,
      `They posted a net loss in ${probe.latestFy} (PAT ${money(m?.pat)}). A deep price cut could tip supply continuity — lead with faster payment or committed volume, and keep a second source warm.`,
      [{ label: 'PAT', value: money(m?.pat) }, { label: 'Net margin', value: m?.netMargin != null ? pct(m.netMargin) : '—' }]);
    if (peer?.netMargin != null && m?.netMargin != null) {
      if (m.netMargin >= peer.netMargin + 1.5) add('opportunity', `Out-earns its peers — ${pct(m.netMargin)} net margin vs ${pct(peer.netMargin)} median`,
        `They run a fatter margin than the ${peer.bizSegment || 'peer'} median (${peer.peers || '—'} peers). There's headroom in the price they charge us.`,
        [{ label: 'Their margin', value: pct(m.netMargin) }, { label: 'Peer median', value: pct(peer.netMargin) }]);
      else if (m.netMargin <= peer.netMargin - 1.5) add('watch', `Below-peer margin — ${pct(m.netMargin)} vs ${pct(peer.netMargin)} median`,
        `They earn less than peers, so price cuts bite harder here. Win on payment terms, volume or logistics rather than headline price.`,
        [{ label: 'Their margin', value: pct(m.netMargin) }, { label: 'Peer median', value: pct(peer.netMargin) }]);
    }
    if (peer?.payableDays != null && m?.payableDays != null && m.payableDays >= peer.payableDays + 10) add('opportunity', `They pay suppliers slower than peers — ${Math.round(m.payableDays)}d vs ${Math.round(peer.payableDays)}d`,
      `They already stretch their own payables past the peer median, so asking them to extend our credit is only fair.`,
      [{ label: 'Their payable days', value: `${Math.round(m.payableDays)}d` }, { label: 'Peer median', value: `${Math.round(peer.payableDays)}d` }]);
    if (peer?.ccc != null && m?.cashConversionCycle != null && m.cashConversionCycle >= peer.ccc + 15) add('opportunity', `Cash tied up longer than peers — ${Math.round(m.cashConversionCycle)}d cycle vs ${Math.round(peer.ccc)}d`,
      `Their cash-conversion cycle runs above the peer median, so they value speed. Offer faster payment in exchange for a price cut.`,
      [{ label: 'Cash cycle', value: `${Math.round(m.cashConversionCycle)}d` }, { label: 'Peer median', value: `${Math.round(peer.ccc)}d` }]);
    if (probe.probeScore?.overall != null && probe.probeScore.overall <= 2) add('risk', `Weak Probe42 financial score (${probe.probeScore.overall}/10)`,
      `Probe42's composite financial score is low — a supply-continuity watch. Don't over-concentrate volume here; qualify an alternate.`,
      [{ label: 'Probe score', value: `${probe.probeScore.overall}/10` }]);
  }

  // 1) Our wallet share of their revenue — the core leverage number.
  if (m?.revenue && vendor.totalNetSpend) {
    const share = (vendor.totalNetSpend / m.revenue) * 100;
    if (share >= 1) {
      add('opportunity', `We're a meaningful customer — ${pct(share, 2)} of their revenue`,
        `Our ${money(vendor.totalNetSpend)}/yr is a real slice of their ${money(m.revenue)} revenue. That volume is leverage — ask for a price or terms concession to keep it.`,
        [{ label: 'Our spend', value: money(vendor.totalNetSpend) }, { label: 'Their revenue', value: money(m.revenue) }, { label: 'Share', value: pct(share, 2) }]);
    } else if (share < 0.2) {
      add('watch', `We're a small customer — ${pct(share, 2)} of their revenue`,
        `At ${money(vendor.totalNetSpend)} we're a rounding error against their ${money(m.revenue)}. Low standalone leverage — bundle volume, commit multi-year, or compete them against an alternate.`,
        [{ label: 'Our spend', value: money(vendor.totalNetSpend) }, { label: 'Share', value: pct(share, 2) }]);
    }
  }

  // 2) Margin headroom.
  if (m?.netMargin != null) {
    if (m.netMargin >= 8) add('opportunity', `Healthy ${pct(m.netMargin)} net margin — room on price`,
      `They earn a comfortable ${pct(m.netMargin)} net margin${m.ebitdaMargin != null ? ` (${pct(m.ebitdaMargin)} EBITDA)` : ''}. A price ask won't threaten their viability.`,
      [{ label: 'Net margin', value: pct(m.netMargin) }, { label: 'EBITDA margin', value: m.ebitdaMargin != null ? pct(m.ebitdaMargin) : '—' }]);
    else if (m.netMargin > 0 && m.netMargin < 3) add('watch', `Thin ${pct(m.netMargin)} margin — press terms, not price`,
      `Margins are slim, so deep price cuts risk their stability (and our supply). Win on payment terms, volume or logistics instead.`,
      [{ label: 'Net margin', value: pct(m.netMargin) }]);
  }

  // 3) Growth appetite.
  if (m?.revenueGrowth != null && m.revenueGrowth >= 15) add('opportunity', `Growing ${pct(m.revenueGrowth)}/yr — trade volume for price`,
    `Fast top-line growth means they value new volume. Offer a committed higher volume in return for a lower unit price.`,
    [{ label: 'Revenue growth', value: pct(m.revenueGrowth) }]);

  // 4) Leverage / balance-sheet.
  if (m?.debtToEquity != null && m.debtToEquity >= 100) add('risk', `Carrying debt (D/E ${(m.debtToEquity / 100).toFixed(2)}x) — watch continuity, offer cash`,
    `A geared balance sheet is a supply-continuity watch — but it also means they value cash. Offer faster payment for a discount.`,
    [{ label: 'Debt / equity', value: `${(m.debtToEquity / 100).toFixed(2)}x` }, { label: 'Total debt', value: money(m.totalDebt) }]);

  // 5) Working-capital levers (absolute) — only when we have no peer-relative view.
  if (!probe?.peer && m?.payableDays != null && m.payableDays >= 60) add('opportunity', `They take ${Math.round(m.payableDays)} days to pay their own suppliers`,
    `They stretch their suppliers to ${Math.round(m.payableDays)} days — asking them to give us longer credit is only fair.`,
    [{ label: 'Their payable days', value: `${Math.round(m.payableDays)}d` }]);
  if (!probe?.peer && m?.cashConversionCycle != null && m.cashConversionCycle >= 60) add('opportunity', `Long cash-conversion cycle (${Math.round(m.cashConversionCycle)}d)`,
    `Cash is tied up in their cycle for ${Math.round(m.cashConversionCycle)} days. Offer faster payment in exchange for a price cut — a cheap win for both.`,
    [{ label: 'Cash cycle', value: `${Math.round(m.cashConversionCycle)}d` }]);

  // 6) Single-source risk (procurement fact).
  if (singleSourceShare && singleSourceShare.share >= 0.5) add('risk', `Single-source: ${pct(singleSourceShare.share * 100, 0)} of ${singleSourceShare.material} runs through them`,
    `They're our dominant source for ${singleSourceShare.material} (${money(singleSourceShare.spend)}). Qualify a second supplier — it cuts risk and hands us negotiating leverage.`,
    [{ label: 'Share of material', value: pct(singleSourceShare.share * 100, 0) }, { label: 'Spend', value: money(singleSourceShare.spend) }]);

  // 7) Weak terms we currently give.
  if (vendor.worstTerms) add('opportunity', vendor.termCategory === 'advance' ? 'We pay them 100% in advance' : 'We pay them on delivery',
    `Moving to standard 30-day credit frees working capital (~${money((vendor.totalNetSpend * 30) / 365)}). Our strongest, simplest ask.`,
    [{ label: 'Current terms', value: vendor.termCategory === 'advance' ? '100% advance' : 'Immediate' }, { label: 'Cash if 30-day', value: money((vendor.totalNetSpend * 30) / 365) }]);

  // 8) Overpayment vs best.
  if (priceExcess && priceExcess > 2e5) add('opportunity', `Paying ${money(priceExcess)}/yr above our cheapest supplier`,
    `For comparable items they run above the lowest price we already pay. ${bestGapNote || 'Benchmark them to that price.'}`,
    [{ label: 'Excess vs best', value: money(priceExcess) }]);

  // 9) Returns / quality.
  if (vendor.reversalRatePct >= 10) add('watch', `High goods-receipt reversal rate (${pct(vendor.reversalRatePct, 0)})`,
    `${pct(vendor.reversalRatePct, 0)} of their receipts were later reversed — raise quality/paperwork before it costs more.`,
    [{ label: 'Return rate', value: pct(vendor.reversalRatePct, 0) }]);

  return L;
}
