/**
 * Market-feed orchestrator.  `npm run market`
 * Fetches the USD→INR rate once, runs every feed (free ones produce data now,
 * credentialed ones skip cleanly without their secret), and writes:
 *   public/data/market/<feed>.json   (per-feed, for provenance)
 *   public/data/market/market.json   (consolidated, what the app reads)
 *   public/data/market/manifest.json (what ran vs skipped, and why)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { todayISO } from '../lib/http.mjs';
import { GRADING, MATERIALS } from './config.mjs';
import { getFx, run as runInputs } from './fred-inputs.mjs';
import { run as runComtrade } from './comtrade.mjs';
import { run as runPlastemart } from './plastemart.mjs';
import { run as runWpi } from './wpi.mjs';
import { run as runMarketplace } from './marketplace.mjs';

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public/data/market');

async function main() {
  mkdirSync(OUT, { recursive: true });
  console.log('\n▶ FDC market feeds\n');

  // 1) FX first — Comtrade conversions need it.
  let fx;
  try {
    fx = await getFx();
    console.log(`  FX  USD→INR = ₹${fx.value} (${fx.date}, ${fx.sourceName})`);
  } catch (e) {
    console.error('  FX FAILED — cannot convert customs values:', e.message);
    fx = { value: null, date: null, annual: {}, sourceName: 'unavailable', sourceUrl: '' };
  }
  const shared = { fxAnnual: fx.annual, fxLatest: { value: fx.value, date: fx.date } };

  // 2) run every feed, isolating failures.
  const feeds = [];
  for (const [name, fn, arg] of [
    ['comtrade', runComtrade, shared],
    ['inputs', runInputs, undefined],
    ['plastemart', runPlastemart, undefined],
    ['wpi', runWpi, undefined],
    ['marketplace', runMarketplace, undefined],
  ]) {
    try {
      const r = await fn(arg);
      feeds.push(r);
      writeFileSync(path.join(OUT, `${r.feed}.json`), JSON.stringify({ generatedAt: todayISO(), ...r }, null, 2));
      const tag = r.status === 'ok' ? `✓ ${r.series.length} series` : r.status === 'skipped' ? `· skipped (${r.reason})` : `✗ ${r.reason}`;
      console.log(`  ${name.padEnd(12)} ${tag}`);
    } catch (e) {
      feeds.push({ feed: name, status: 'error', series: [], reason: e.message.slice(0, 120) });
      console.log(`  ${name.padEnd(12)} ✗ ${e.message.slice(0, 80)}`);
    }
  }

  // 3) consolidate by material.
  const allSeries = feeds.flatMap((f) => f.series || []);
  const materials = {};
  for (const m of MATERIALS) {
    const lines = allSeries.filter((s) => s.material === m);
    materials[m] = { grading: GRADING[m], lines };
  }

  const manifest = feeds.map((f) => ({
    feed: f.feed,
    status: f.status,
    seriesCount: (f.series || []).length,
    reason: f.reason || null,
    gated: ['wpi', 'marketplace'].includes(f.feed) || (f.feed === 'comtrade' && f.meta?.authenticated === false ? false : false),
  }));

  const market = {
    generatedAt: new Date().toISOString(),
    fx,
    materials,
    manifest,
    notes: [
      'Customs lines are UN Comtrade unit values (trade value ÷ net weight), converted at that year\'s average USD→INR (FRED).',
      'INPUT lines (maize, crude, aluminium) are raw-material prices shown as context — never the finished material\'s own price.',
      'WPI is a government index (2011-12 = 100), shown as an index line, not a ₹/kg.',
      'Every series carries its own sourceName + sourceUrl + dates.',
    ],
  };
  writeFileSync(path.join(OUT, 'market.json'), JSON.stringify(market, null, 2));
  writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ generatedAt: market.generatedAt, fx: { value: fx.value, date: fx.date }, manifest }, null, 2));

  console.log('\n  Lines by material:');
  for (const m of MATERIALS) {
    const ls = materials[m].lines;
    console.log(`   ${m.padEnd(10)} ${ls.length} lines: ${ls.map((l) => `${l.key}${l.latest ? `=${l.latest.value}${l.unit.includes('₹') ? '₹' : ''}` : ''}`).join(', ') || '(none)'}`);
  }
  console.log(`\n✓ wrote public/data/market/market.json (+ per-feed + manifest)\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
