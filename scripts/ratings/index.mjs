/**
 * Rating-doc pipeline → public/data/rating-financials.json   (`npm run ratings`)
 * FREE: plain fetch of stored credit-rating-rationale URLs (no API key, no
 * Firecrawl), parsed to real financials. Resilient: if a (flaky) fetch fails,
 * the previously-committed entry is kept rather than dropped.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchDocText } from './fetch.mjs';
import { parseRating, parseFinancials } from './parse.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SEED = path.join(ROOT, 'data/raw/masters/rating-docs.json');
const OUT = path.join(ROOT, 'public/data/rating-financials.json');

async function main() {
  const seed = JSON.parse(readFileSync(SEED, 'utf8'));
  const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')).vendors || {} : {};
  const vendors = {};
  const log = [];

  for (const d of seed.docs) {
    try {
      const text = await fetchDocText(d.docUrl, d.docType);
      const r = parseRating(text, d.agency);
      const f = parseFinancials(text, d.agency);
      if (!r.grade) throw new Error('no rating grade parsed');
      const hasNumbers = Object.values(f.metrics).some((v) => v != null);
      vendors[d.vendorKey] = {
        vendorKey: d.vendorKey, cin: d.cin, financialsAvailable: true,
        source: { sourceName: `${d.agency} rating rationale`, sourceUrl: d.docUrl, agency: d.agency, date: d.ratingDate },
        ratingGrade: r.grade, ratingOutlook: r.outlook, ratingLabel: r.ratingLabel,
        asOfFy: f.asOfFy, ratingDate: d.ratingDate,
        flags: { issuerNotCooperating: r.inc, note: d.note || null },
        metrics: f.metrics,
      };
      log.push(`  ${d.vendorKey.padEnd(28)} ${r.ratingLabel}  as-of:${f.asOfFy || '?'}  ${hasNumbers ? 'financials✓' : 'rating-only'}${r.inc ? ' [INC]' : ''}`);
    } catch (e) {
      if (prev[d.vendorKey]?.financialsAvailable) {
        vendors[d.vendorKey] = prev[d.vendorKey]; // keep last-good
        log.push(`  ${d.vendorKey.padEnd(28)} fetch failed — kept previous (${prev[d.vendorKey].ratingLabel})`);
      } else {
        vendors[d.vendorKey] = { vendorKey: d.vendorKey, cin: d.cin, financialsAvailable: false, reason: `rating doc fetch/parse failed: ${e.message.slice(0, 60)}`, source: { sourceName: d.agency, sourceUrl: d.docUrl } };
        log.push(`  ${d.vendorKey.padEnd(28)} FAILED: ${e.message.slice(0, 50)}`);
      }
    }
  }

  // unrated vendors → honest state
  for (const vk of seed.unrated?.vendorKeys || []) {
    if (vendors[vk]) continue;
    vendors[vk] = { vendorKey: vk, financialsAvailable: false, reason: 'unrated private company — financials not publicly filed free', source: null };
  }

  const rated = Object.values(vendors).filter((v) => v.financialsAvailable).length;
  writeFileSync(OUT, JSON.stringify({
    generatedAt: new Date().toISOString(),
    source: 'Credit-rating-agency rationale documents (CRISIL / ICRA / CARE / Acuité / Infomerics) — free plain fetch, no API key, no Firecrawl.',
    counts: { rated, unrated: Object.keys(vendors).length - rated, total: Object.keys(vendors).length },
    vendors,
  }, null, 2));

  console.log('\n▶ Rating-doc financials (free, 0 keys, 0 Firecrawl)\n' + log.join('\n'));
  console.log(`\n✓ rating-financials.json — ${rated} rated, ${Object.keys(vendors).length - rated} unrated\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
