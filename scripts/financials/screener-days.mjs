/**
 * Working-capital DAYS for LISTED vendors — Debtor (receivable) days, Days Payable,
 * Inventory days and the Cash-Conversion-Cycle, from Screener.in's public company
 * pages (which compute them from the audited annual filings).  `npm run screener`
 *
 * The keyless Munshot quote API gives market data but NOT working-capital days, so we
 * read them here from a second free, traceable public source and PATCH them onto the
 * existing listed-vendor records in public/data/vendor-financials.json. Private vendors
 * already carry these from Probe42 (MCA) — untouched here.
 *
 * NEVER fabricates: a figure Screener doesn't publish stays null and is logged. Every
 * number carries a source stamp (the exact Screener URL + the "as of" period).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { httpText, todayISO } from '../lib/http.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FILE = path.join(ROOT, 'public', 'data', 'vendor-financials.json');

// Phase-1 vendor key → Screener.in company slug candidates (NSE symbol / BSE code).
// The 6 listed suppliers named in the brief (+ Empire, listed too, if it resolves).
const SCREENER_SLUGS = {
  'gujarat-ambuja-exports': ['GAEL'],
  'sayaji-industries': ['SAYAJIIND', '507692'],
  'sukhjit-corn-products': ['SUKHJITS', '530085'],
  'universal-starch-chem-allied': ['524408', 'UNIVSTAR'],
  'uflex': ['UFLEX', '500148'],
  'huhtamaki-india': ['HUHTAMAKI', '509820'],
  'empire-industries-virum-glass': ['EMPIREIND', '509525'],
};

const ROWS = {
  receivableDays: 'Debtor Days',
  inventoryDays: 'Inventory Days',
  payableDays: 'Days Payable',
  cashConversionCycle: 'Cash Conversion Cycle',
};

const stripTags = (s) => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim();
const toNum = (s) => {
  const x = parseFloat(String(s).replace(/,/g, '').replace(/%/g, ''));
  return isFinite(x) ? x : null;
};

/** Parse one Screener ratios section → { headers:[year…], rows:{label:[num…]} }. */
function parseRatios(html) {
  const sec = (html.match(/id="ratios"[\s\S]*?<\/section>/) || [html])[0];
  const headers = (sec.match(/<th[^>]*>[\s\S]*?<\/th>/g) || [])
    .map((th) => stripTags(th))
    .filter((t) => /\b(19|20)\d{2}\b/.test(t));
  const rows = {};
  for (const [field, label] of Object.entries(ROWS)) {
    const re = new RegExp(`<tr[^>]*>\\s*<td[^>]*>\\s*${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?<\\/tr>`);
    const m = sec.match(re);
    if (!m) { rows[field] = []; continue; }
    const cells = (m[0].match(/<td[^>]*>[\s\S]*?<\/td>/g) || []).map(stripTags);
    rows[field] = cells.slice(1).map(toNum); // drop the label cell
  }
  return { headers, rows };
}

/** Latest (last aligned, non-null) value for a row + its period header. */
function latestOf(values, headers) {
  for (let i = values.length - 1; i >= 0; i--) {
    if (values[i] != null) {
      const asOf = headers[headers.length - (values.length - i)] || headers[headers.length - 1] || null;
      return { value: values[i], asOf: asOf || null };
    }
  }
  return { value: null, asOf: null };
}

const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
/** Sortable recency key from a Screener period label like "Mar 2026" → 202603. */
function periodKey(asOf) {
  const m = String(asOf || '').match(/([A-Za-z]{3})\s*(\d{4})/);
  if (!m) return 0;
  return parseInt(m[2], 10) * 100 + (MON[m[1].toLowerCase()] || 0);
}

/** Try every slug/variant, parse each, and KEEP THE FRESHEST (some firms report a
 *  stale consolidated series but a current standalone one, or vice-versa). */
async function fetchDays(slugs) {
  let best = null;
  for (const slug of slugs) {
    for (const variant of ['consolidated/', '']) {
      const url = `https://www.screener.in/company/${slug}/${variant}`;
      let html;
      try { html = await httpText(url, { headers: { 'User-Agent': 'Mozilla/5.0 (FDC procurement cockpit data refresh)' }, timeout: 30, retries: 2, label: `Screener ${slug}` }); }
      catch { continue; }
      const { headers, rows } = parseRatios(html);
      const got = latestOf(rows.receivableDays, headers);
      if (got.value == null) continue; // no ratios table on this page
      const cand = {
        url, basis: variant ? 'consolidated' : 'standalone', asOf: got.asOf, key: periodKey(got.asOf),
        receivableDays: got.value,
        inventoryDays: latestOf(rows.inventoryDays, headers).value,
        payableDays: latestOf(rows.payableDays, headers).value,
        cashConversionCycle: latestOf(rows.cashConversionCycle, headers).value,
      };
      if (!best || cand.key > best.key) best = cand;
    }
  }
  return best;
}

async function main() {
  const doc = JSON.parse(readFileSync(FILE, 'utf8'));
  const log = [];
  for (const [key, slugs] of Object.entries(SCREENER_SLUGS)) {
    const rec = doc.vendors[key];
    if (!rec) { log.push(`  • ${key} — not in vendor-financials (skipped)`); continue; }
    if (rec.type !== 'listed' || rec.status !== 'ok' || !rec.metrics) { log.push(`  • ${key} — not a resolved listed vendor (skipped)`); continue; }
    const d = await fetchDays(slugs);
    if (!d) { log.push(`  ✗ ${key} — Screener ratios not found (${slugs.join('/')})`); continue; }
    rec.metrics.receivableDays = d.receivableDays;
    rec.metrics.inventoryDays = d.inventoryDays;
    rec.metrics.payableDays = d.payableDays;
    rec.metrics.cashConversionCycle = d.cashConversionCycle;
    rec.creditDaysSource = { sourceName: 'Screener.in (from audited annual filings)', sourceUrl: d.url, asOf: d.asOf, basis: d.basis, date: todayISO() };
    log.push(`  ✓ ${key} — debtor ${d.receivableDays}d · payable ${d.payableDays}d · CCC ${d.cashConversionCycle}d (${d.basis}, ${d.asOf || '—'})`);
  }
  doc.generatedAt = new Date().toISOString();
  writeFileSync(FILE, JSON.stringify(doc, null, 2));
  console.log('\n▶ Screener working-capital days (listed vendors)\n' + log.join('\n') + '\n');
}

main().catch((e) => { console.error(e); process.exit(1); });
