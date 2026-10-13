/**
 * Vendor-financials + alternatives orchestrator.  `npm run financials`
 * - Listed vendors  → real financials now, FREE via Munshot (keyless).
 * - Private vendors → Probe42 CACHE only (never spends a credit here); uncached
 *   show status 'pending' until `scripts/probe/enrich.mjs --live` is run.
 * - Negotiation levers from real financials + Phase-1 procurement facts.
 * - Alternatives benchmarked the same way (listed now, private gated).
 * Writes public/data/vendor-financials.json and public/data/alternatives.json.
 */
import { readFileSync, writeFileSync } from 'node:fs';
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

/** Transparent, computed financial-health score from the real metrics shown. */
function computeHealth(m) {
  if (!m) return null;
  const comps = [];
  const push = (label, raw, score, weight) => { if (raw != null && isFinite(score)) comps.push({ label, raw: r2(raw), score: Math.round(clamp(score)), weight }); };
  push('Net margin', m.netMargin, (m.netMargin / 15) * 100, 0.3);
  push('EBITDA margin', m.ebitdaMargin, (m.ebitdaMargin / 20) * 100, 0.15);
  push('Revenue growth', m.revenueGrowth, ((m.revenueGrowth + 10) / 35) * 100, 0.2);
  push('Low leverage', m.debtToEquity, 100 - m.debtToEquity / 2, 0.2); // D/E is % here
  push('Return on capital', m.roce, (m.roce / 25) * 100, 0.15); // Probe42 only
  if (!comps.length) return null;
  const wsum = comps.reduce((s, c) => s + c.weight, 0);
  const value = Math.round(comps.reduce((s, c) => s + c.score * c.weight, 0) / wsum);
  const grade = value >= 75 ? 'A' : value >= 60 ? 'B' : value >= 45 ? 'C' : 'D';
  return { value, grade, components: comps, note: 'Computed by FDC from the real metrics shown — an analytical score, not a reported figure.' };
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
  const privateCache = readAllCached(PRIVATE_CINS);

  // assemble per-vendor records
  const out = {};
  for (const v of vendors) {
    const isListed = !!LISTED_VENDORS[v.key];
    const fin = isListed ? (listed.data[v.key] ? { ...listed.data[v.key], type: 'listed', status: 'ok' } : { type: 'listed', status: 'pending', metrics: null, note: 'ticker unresolved' })
      : privateCache[v.key]
        ? { ...privateCache[v.key], type: 'private' }
        : { type: 'private', status: 'pending', metrics: null, source: { sourceName: 'Probe42', sourceUrl: 'https://probe42.in' }, note: 'Add Probe42 key + VPN, run enrich --live.' };

    const health = computeHealth(fin.metrics);
    const levers = buildLevers({
      vendor: v,
      financials: fin.status === 'ok' ? fin : null,
      singleSourceShare: singleSource[v.key],
      priceExcess: excess[v.key],
      bestGapNote: null,
    });
    out[v.key] = {
      vendorKey: v.key,
      name: v.name,
      type: fin.type,
      status: fin.status,
      companyName: fin.companyName || null,
      symbol: fin.symbol || null,
      exchange: fin.exchange || null,
      cin: fin.cin || PRIVATE_CINS[v.key]?.cin || null,
      materialsSupplied: v.materialsSupplied,
      fdcSpend: v.totalNetSpend,
      metrics: fin.metrics || null,
      healthScore: health,
      source: fin.source || null,
      note: fin.note || null,
      levers,
    };
  }

  const listedCount = Object.values(out).filter((o) => o.status === 'ok' && o.type === 'listed').length;
  const privateOk = Object.values(out).filter((o) => o.status === 'ok' && o.type === 'private').length;
  const privatePending = Object.values(out).filter((o) => o.status === 'pending' && o.type === 'private').length;

  writeFileSync(path.join(DATA, 'vendor-financials.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    sources: { listed: 'Munshot market-data API (free)', private: 'Probe42 (gated on key + VPN)' },
    manifest: { listedResolved: listedCount, privateCached: privateOk, privatePending, total: vendors.length },
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
