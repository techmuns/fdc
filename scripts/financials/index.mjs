/**
 * Vendor-financials + alternatives orchestrator.  `npm run financials`
 * - Listed vendors  → real financials now, FREE via Munshot (keyless).
 * - Private vendors → Probe42 CACHE only (never spends a credit here); uncached
 *   show status 'pending' until `scripts/probe/enrich.mjs --live` is run.
 * - Negotiation levers from real financials + Phase-1 procurement facts.
 * - Alternatives benchmarked the same way (listed now, private gated).
 * Writes public/data/vendor-financials.json and public/data/alternatives.json.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchListed, fetchMetrics, LISTED_VENDORS } from './munshot.mjs';
import { readAllCached } from '../probe/enrich.mjs';
import { PRIVATE_CINS } from '../probe/cins.mjs';
import { buildLevers } from '../levers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DATA = path.join(ROOT, 'public', 'data');
const read = (f) => JSON.parse(readFileSync(path.join(DATA, f), 'utf8'));
const clamp = (x, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, x));
const r2 = (n) => (n == null ? null : Math.round(n * 100) / 100);

// Credit-rating grade → 0-100 (a strong, independent health signal).
const RATING_SCORE = {
  AAA: 97, 'AA+': 93, AA: 90, 'AA-': 87, 'A+': 82, A: 78, 'A-': 74,
  'BBB+': 68, BBB: 63, 'BBB-': 58, 'BB+': 50, BB: 45, 'BB-': 40,
  'B+': 33, B: 28, 'B-': 23, C: 12, D: 3,
};

/** Transparent, computed financial-health score from the real metrics + credit rating shown. */
function computeHealth(m, ratingGrade) {
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
  }
  if (!comps.length) return null;
  const wsum = comps.reduce((s, c) => s + c.weight, 0);
  const value = Math.round(comps.reduce((s, c) => s + c.score * c.weight, 0) / wsum);
  const grade = value >= 75 ? 'A' : value >= 60 ? 'B' : value >= 45 ? 'C' : 'D';
  return { value, grade, components: comps, note: 'Computed by FDC from the real metrics + credit rating shown — an analytical score, not a reported figure.' };
}

/** Convert a rating-financials.json entry → the vendor-record shape used here. */
function fromRatingDoc(rf) {
  if (!rf?.financialsAvailable) return null;
  const m = rf.metrics || {};
  return {
    type: 'private', status: 'ok',
    companyName: rf.cin ? null : null,
    source: { sourceName: rf.source.sourceName, sourceUrl: rf.source.sourceUrl, date: rf.source.date },
    ratingGrade: rf.ratingGrade, ratingLabel: rf.ratingLabel, ratingOutlook: rf.ratingOutlook,
    asOfFy: rf.asOfFy, ratingDate: rf.ratingDate, issuerNotCooperating: !!rf.flags?.issuerNotCooperating,
    note: rf.flags?.note || null,
    metrics: {
      revenue: m.revenue ?? null, ebitda: m.ebitda ?? null, marketCap: null, totalDebt: m.totalDebt ?? null,
      ebitdaMargin: m.ebitdaMargin ?? null, netMargin: m.netMargin ?? null, grossMargin: null, operatingMargin: null,
      debtToEquity: m.debtToEquity ?? null, revenueGrowth: m.revenueGrowth ?? null, earningsGrowth: null,
      pe: null, evEbitda: null, dividendYield: null, currentPrice: null, yearlyChange: null, employees: null,
      roce: m.roce ?? null, roe: null, pat: m.pat ?? null, netWorth: m.netWorth ?? null, interestCoverage: m.interestCoverage ?? null,
      creditRating: rf.ratingLabel,
    },
  };
}

async function main() {
  const vendors = read('vendors.json');
  const materials = read('materials.json');
  const priceGaps = read('price-gaps.json');
  const byKey = Object.fromEntries(vendors.map((v) => [v.key, v]));

  // single-source share per vendor (material where they dominate)
  const singleSource = {};
  for (const mat of materials) {
    for (const v of mat.vendors) {
      const share = v.spend / mat.totalNetSpend;
      if (share >= 0.5 && (!singleSource[v.vendorKey] || share > singleSource[v.vendorKey].share)) {
        singleSource[v.vendorKey] = { material: mat.displayName, share, spend: v.spend };
      }
    }
  }
  // price excess per vendor (real arithmetic from price-gaps)
  const excess = {};
  const addEx = (k, x) => { if (x > 0) excess[k] = (excess[k] || 0) + x; };
  for (const mk of Object.keys(priceGaps.byMaterial)) {
    const g = priceGaps.byMaterial[mk];
    (g.vendors || []).forEach((v) => addEx(v.vendorKey, v.excessSpend));
    (g.skus || []).forEach((s) => (s.vendors || []).forEach((v) => addEx(v.vendorKey, v.excessSpend)));
  }

  console.log('\n▶ Vendor financials\n  Fetching listed vendors (Munshot, free)…');
  const listed = await fetchListed();
  listed.log.forEach((l) => console.log('   ', l));
  // Private financials — ACTIVE source: free credit-rating docs. Probe42 cache is
  // read too but stays dormant (empty without a key); it wins if ever populated.
  const ratingFin = existsSync(path.join(DATA, 'rating-financials.json')) ? JSON.parse(readFileSync(path.join(DATA, 'rating-financials.json'), 'utf8')).vendors || {} : {};
  const probeCache = readAllCached(PRIVATE_CINS);

  // assemble per-vendor records
  const out = {};
  for (const v of vendors) {
    const isListed = !!LISTED_VENDORS[v.key];
    let fin;
    if (isListed) {
      fin = listed.data[v.key] ? { ...listed.data[v.key], type: 'listed', status: 'ok' } : { type: 'listed', status: 'pending', metrics: null, note: 'ticker unresolved' };
    } else if (probeCache[v.key]?.status === 'ok') {
      fin = { ...probeCache[v.key], type: 'private' }; // Probe42 (dormant) wins if populated
    } else {
      const rd = fromRatingDoc(ratingFin[v.key]);
      if (rd) fin = rd;
      else fin = { type: 'private', status: ratingFin[v.key]?.financialsAvailable === false ? 'unrated' : 'pending',
        metrics: null, source: ratingFin[v.key]?.source || null,
        note: ratingFin[v.key]?.reason || 'No public rating found — financials not filed free.' };
    }

    const health = computeHealth(fin.metrics, fin.ratingGrade);
    const levers = buildLevers({
      vendor: v,
      financials: fin.status === 'ok' ? fin : null,
      singleSourceShare: singleSource[v.key],
      priceExcess: excess[v.key],
      ratingGrade: fin.ratingGrade,
      ratingLabel: fin.ratingLabel,
      inc: fin.issuerNotCooperating,
      bestGapNote: null,
    });
    out[v.key] = {
      vendorKey: v.key, name: v.name, type: fin.type, status: fin.status,
      companyName: fin.companyName || null, symbol: fin.symbol || null, exchange: fin.exchange || null,
      cin: fin.cin || PRIVATE_CINS[v.key]?.cin || null,
      materialsSupplied: v.materialsSupplied, fdcSpend: v.totalNetSpend,
      metrics: fin.metrics || null, healthScore: health,
      source: fin.source || null, note: fin.note || null,
      ratingGrade: fin.ratingGrade || null, ratingLabel: fin.ratingLabel || null, ratingOutlook: fin.ratingOutlook || null,
      asOfFy: fin.asOfFy || null, ratingDate: fin.ratingDate || null, issuerNotCooperating: !!fin.issuerNotCooperating,
      levers,
    };
  }

  const listedCount = Object.values(out).filter((o) => o.status === 'ok' && o.type === 'listed').length;
  const privateOk = Object.values(out).filter((o) => o.status === 'ok' && o.type === 'private').length;
  const privatePending = Object.values(out).filter((o) => o.status !== 'ok' && o.type === 'private').length;

  writeFileSync(path.join(DATA, 'vendor-financials.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    sources: { listed: 'Munshot market-data API (free)', private: 'Credit-rating-agency rationale docs (free); Probe42 dormant behind its secret' },
    manifest: { listedResolved: listedCount, privateRated: privateOk, privateUnrated: privatePending, total: vendors.length },
    vendors: out,
  }, null, 2));

  // ---- alternatives ----
  console.log('\n▶ Alternatives (benchmarking listed alternates, free)…');
  const altSeed = JSON.parse(readFileSync(path.join(ROOT, 'data/raw/masters/alt-vendors.json'), 'utf8'));
  const altOut = {};
  for (const mat of Object.keys(altSeed)) {
    if (mat.startsWith('_')) continue;
    altOut[mat] = [];
    for (const alt of altSeed[mat]) {
      let fin = null;
      if (alt.type === 'listed') {
        fin = await fetchMetrics([alt.ticker], alt.expect, null);
      } else if (alt.cin) {
        const cached = readAllCached({ x: { cin: alt.cin, name: alt.name } }).x;
        if (cached?.status === 'ok') fin = cached;
      }
      const metrics = fin?.metrics || null;
      altOut[mat].push({
        name: alt.name,
        type: alt.type,
        role: alt.role,
        ticker: alt.ticker || null,
        cin: alt.cin || null,
        status: metrics ? 'ok' : alt.type === 'listed' ? 'pending' : alt.cin ? 'pending' : 'cin-unresolved',
        fitNote: alt.fitNote,
        secondSourceFor: alt.secondSourceFor || null,
        companyName: fin?.companyName || null,
        symbol: fin?.symbol || null,
        metrics,
        healthScore: computeHealth(metrics),
        source: fin?.source || { sourceName: alt.type === 'listed' ? 'Munshot' : 'Probe42', sourceUrl: alt.type === 'listed' ? 'https://fastapi.muns.io' : 'https://probe42.in' },
        note: alt.type === 'private' && !metrics ? (alt.cin ? 'Financials via Probe42 (gated).' : 'CIN unresolved.') : null,
      });
      if (fin) console.log(`    ${mat.padEnd(10)} ${alt.name} — rev ₹${metrics.revenue ? (metrics.revenue / 1e7).toFixed(0) : '?'}Cr`);
    }
  }
  writeFileSync(path.join(DATA, 'alternatives.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    byMaterial: altOut,
    note: 'Alternate suppliers to de-risk single-source materials and benchmark price. Listed alternates benchmarked live (Munshot); private via Probe42 (gated).',
  }, null, 2));

  console.log(`\n✓ vendor-financials.json — listed ${listedCount} live, private ${privateOk} cached, ${privatePending} pending`);
  console.log(`✓ alternatives.json — ${Object.values(altOut).flat().length} alternates across ${Object.keys(altOut).length} materials\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
