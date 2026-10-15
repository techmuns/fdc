/**
 * Transparent, computed financial-health scores — shared by the financials
 * orchestrator (index.mjs) and the Screener enrichment (screener.mjs) so a score
 * can be RE-computed once Screener adds ROCE / ROE / working-capital days that the
 * keyless Munshot quote API does not provide for listed companies.
 *
 * Analytical scores, never reported figures: each is a weighted average of real,
 * source-stamped inputs, and the component list is kept on the record for proof.
 */
const clamp = (x, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, x));
const r2 = (n) => (n == null || !isFinite(n) ? null : Math.round(n * 100) / 100);

// Credit-rating grade → 0-100 (a strong, independent health signal).
export const RATING_SCORE = {
  AAA: 97, 'AA+': 93, AA: 90, 'AA-': 87, 'A+': 82, A: 78, 'A-': 74,
  'BBB+': 68, BBB: 63, 'BBB-': 58, 'BB+': 50, BB: 45, 'BB-': 40,
  'B+': 33, B: 28, 'B-': 23, C: 12, D: 3,
};

const gradeOf = (value) => (value >= 75 ? 'A' : value >= 60 ? 'B' : value >= 45 ? 'C' : 'D');

/** Health from the real metrics (listed = Munshot + Screener ROCE/ROE/days) + any credit rating. */
export function computeHealth(m, ratingGrade) {
  const comps = [];
  const push = (label, raw, score, weight) => { if (raw != null && isFinite(score)) comps.push({ label, raw: r2(raw), score: Math.round(clamp(score)), weight }); };
  if (ratingGrade && RATING_SCORE[ratingGrade] != null) comps.push({ label: `Credit rating (${ratingGrade})`, raw: ratingGrade, score: RATING_SCORE[ratingGrade], weight: 0.45 });
  if (m) {
    push('Net margin', m.netMargin, (m.netMargin / 15) * 100, 0.3);
    push('EBITDA margin', m.ebitdaMargin, (m.ebitdaMargin / 20) * 100, 0.15);
    push('Revenue growth', m.revenueGrowth, ((m.revenueGrowth + 10) / 35) * 100, 0.2);
    push('Low leverage', m.debtToEquity, 100 - m.debtToEquity / 2, 0.2);
    push('Interest cover', m.interestCoverage, (m.interestCoverage / 5) * 100, 0.15);
    push('Return on capital', m.roce, (m.roce / 25) * 100, 0.15);
    push('Return on equity', m.roe, (m.roe / 20) * 100, 0.15);
  }
  if (!comps.length) return null;
  const wsum = comps.reduce((s, c) => s + c.weight, 0);
  const value = Math.round(comps.reduce((s, c) => s + c.score * c.weight, 0) / wsum);
  return { value, grade: gradeOf(value), components: comps, note: 'Computed by FDC from the real metrics + credit rating shown — an analytical score, not a reported figure.' };
}

/** Richer health for Probe42-covered private vendors — folds the credit rating,
 *  profitability (incl. vs-peer-median), returns, leverage, interest cover and the
 *  working-capital cycle. Loss-making tanks it via the margins. */
export function computeHealthProbe(pp, ratingGrade) {
  const m = pp.metrics; const peer = pp.peer;
  const comps = [];
  const push = (label, raw, score, weight) => { if (raw != null && isFinite(score)) comps.push({ label, raw: r2(raw), score: Math.round(clamp(score)), weight }); };
  if (ratingGrade && RATING_SCORE[ratingGrade] != null) comps.push({ label: `Credit rating (${ratingGrade})`, raw: ratingGrade, score: RATING_SCORE[ratingGrade], weight: 0.26 });
  push('Net margin', m.netMargin, (m.netMargin / 12) * 100, 0.18);
  if (peer?.netMargin != null && m.netMargin != null) push('Margin vs peers', m.netMargin - peer.netMargin, 50 + (m.netMargin - peer.netMargin) * 6, 0.12);
  push('Return on capital', m.roce, (m.roce / 20) * 100, 0.16);
  push('Low leverage', m.debtToEquity, 100 - m.debtToEquity / 2, 0.14);
  push('Interest cover', m.interestCoverage, (m.interestCoverage / 5) * 100, 0.14);
  if (peer?.ccc != null && m.ccc != null) push('Cash cycle vs peers', m.ccc, 50 + (peer.ccc - m.ccc) * 0.6, 0.10);
  if (!comps.length) return null;
  const wsum = comps.reduce((s, c) => s + c.weight, 0);
  const value = Math.round(comps.reduce((s, c) => s + c.score * c.weight, 0) / wsum);
  return { value, grade: gradeOf(value), components: comps, note: 'Computed by FDC from Probe42 (MCA-filed) financials vs peer medians + the credit rating — an analytical score, not a reported figure.' };
}
