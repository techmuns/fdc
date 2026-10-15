/**
 * Screener.in enrichment for LISTED companies — vendors AND alternatives.  `npm run screener`
 *
 * The keyless Munshot quote API gives price/market data but NOT working-capital days
 * or ROCE/ROE. Screener.in publishes both (computed from the audited annual filings).
 * This step fetches them and PATCHES the existing listed records:
 *   - public/data/vendor-financials.json  (listed vendors)
 *   - public/data/alternatives.json       (listed alternatives, e.g. Tirupati Starch)
 * then RE-computes each health score now that ROCE/ROE are available (fairer than a
 * Munshot-only score that had neither). Private vendors already carry all of this from
 * Probe42 (MCA) — untouched here.
 *
 * NEVER fabricates: a figure Screener doesn't publish stays null and is logged. Every
 * number carries a source stamp (the exact Screener URL + the "as of" period).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { httpText, todayISO } from '../lib/http.mjs';
import { computeHealth } from './health.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DATA = path.join(ROOT, 'public', 'data');
const VENDOR_FILE = path.join(DATA, 'vendor-financials.json');
const ALT_FILE = path.join(DATA, 'alternatives.json');

// Phase-1 vendor key → Screener.in company slug candidates (NSE symbol / BSE code).
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

const stripTags = (s) => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const toNum = (s) => {
  if (s == null) return null;
  const x = parseFloat(String(s).replace(/,/g, '').replace(/%/g, ''));
  return isFinite(x) ? x : null;
};

/** Parse the Screener ratios time-series → { headers:[year…], rows:{field:[num…]} }. */
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
    rows[field] = cells.slice(1).map(toNum);
  }
  return { headers, rows };
}

/** Parse the top-ratios panel → latest ROCE / ROE (%), as Screener displays them. */
function topRatios(html) {
  const sec = (html.match(/id="top-ratios"[\s\S]*?<\/ul>/) || [''])[0];
  const out = {};
  for (const li of sec.match(/<li[^>]*>[\s\S]*?<\/li>/g) || []) {
    const t = stripTags(li);
    const m = t.match(/^([A-Za-z][A-Za-z /().]*?)\s+(-?[\d,]+\.?\d*)/);
    if (m) out[m[1].trim().toLowerCase()] = toNum(m[2]);
  }
  return { roce: out['roce'] ?? null, roe: out['roe'] ?? null };
}

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
function periodKey(asOf) {
  const m = String(asOf || '').match(/([A-Za-z]{3})\s*(\d{4})/);
  return m ? parseInt(m[2], 10) * 100 + (MON[m[1].toLowerCase()] || 0) : 0;
}

/** Try every slug/variant, parse each, and keep the FRESHEST page with a ratios table. */
async function fetchScreener(slugs) {
  let best = null;
  for (const slug of slugs.filter(Boolean)) {
    for (const variant of ['consolidated/', '']) {
      const url = `https://www.screener.in/company/${slug}/${variant}`;
      let html;
      try { html = await httpText(url, { headers: { 'User-Agent': 'Mozilla/5.0 (FDC procurement cockpit data refresh)' }, timeout: 30, retries: 2, label: `Screener ${slug}` }); }
      catch { continue; }
      const { headers, rows } = parseRatios(html);
      const got = latestOf(rows.receivableDays, headers);
      if (got.value == null) continue; // no ratios table on this page
      const tr = topRatios(html);
      const cand = {
        url, basis: variant ? 'consolidated' : 'standalone', asOf: got.asOf, key: periodKey(got.asOf),
        receivableDays: got.value,
        inventoryDays: latestOf(rows.inventoryDays, headers).value,
        payableDays: latestOf(rows.payableDays, headers).value,
        cashConversionCycle: latestOf(rows.cashConversionCycle, headers).value,
        roce: tr.roce, roe: tr.roe,
      };
      if (!best || cand.key > best.key) best = cand;
    }
  }
  return best;
}

/** Patch metrics in place with the Screener figures (only where Screener has a value). */
function applyMetrics(metrics, s) {
  metrics.receivableDays = s.receivableDays;
  metrics.inventoryDays = s.inventoryDays;
  metrics.payableDays = s.payableDays;
  metrics.cashConversionCycle = s.cashConversionCycle;
  if (s.roce != null) metrics.roce = s.roce;
  if (s.roe != null) metrics.roe = s.roe;
}
const srcStamp = (s) => ({ sourceName: 'Screener.in (from audited annual filings)', sourceUrl: s.url, asOf: s.asOf, basis: s.basis, date: todayISO() });
const fmt = (s) => `debtor ${s.receivableDays ?? '—'}d · payable ${s.payableDays ?? '—'}d · ROCE ${s.roce ?? '—'}% · ROE ${s.roe ?? '—'}% (${s.basis}, ${s.asOf || '—'})`;

async function enrichVendors(log) {
  const doc = JSON.parse(readFileSync(VENDOR_FILE, 'utf8'));
  for (const [key, slugs] of Object.entries(SCREENER_SLUGS)) {
    const rec = doc.vendors[key];
    if (!rec || rec.type !== 'listed' || rec.status !== 'ok' || !rec.metrics) { log.push(`  • vendor ${key} — not a resolved listed vendor (skipped)`); continue; }
    const s = await fetchScreener(slugs);
    if (!s) { log.push(`  ✗ vendor ${key} — Screener ratios not found (${slugs.join('/')})`); continue; }
    applyMetrics(rec.metrics, s);
    rec.creditDaysSource = srcStamp(s);
    const h = computeHealth(rec.metrics, rec.ratingGrade || null);
    if (h) rec.healthScore = h;
    log.push(`  ✓ vendor ${key} — ${fmt(s)} → health ${h ? `${h.value}/100 (${h.grade})` : '—'}`);
  }
  doc.generatedAt = new Date().toISOString();
  writeFileSync(VENDOR_FILE, JSON.stringify(doc, null, 2));
}

async function enrichAlts(log) {
  const doc = JSON.parse(readFileSync(ALT_FILE, 'utf8'));
  for (const mat of Object.keys(doc.byMaterial || {})) {
    for (const rec of doc.byMaterial[mat]) {
      if (rec.type !== 'listed' || rec.status !== 'ok' || !rec.metrics) continue;
      const slugs = [rec.screener, rec.ticker].filter(Boolean);
      if (!slugs.length) { log.push(`  • alt ${rec.name} — no screener slug (skipped)`); continue; }
      const s = await fetchScreener(slugs);
      if (!s) { log.push(`  ✗ alt ${rec.name} — Screener ratios not found (${slugs.join('/')})`); continue; }
      applyMetrics(rec.metrics, s);
      rec.creditDaysSource = srcStamp(s);
      const h = computeHealth(rec.metrics, rec.ratingGrade || null);
      if (h) rec.healthScore = h;
      log.push(`  ✓ alt ${mat}/${rec.name} — ${fmt(s)} → health ${h ? `${h.value}/100 (${h.grade})` : '—'}`);
    }
  }
  doc.generatedAt = new Date().toISOString();
  writeFileSync(ALT_FILE, JSON.stringify(doc, null, 2));
}

async function main() {
  const log = [];
  console.log('\n▶ Screener enrichment (listed vendors + listed alternatives): days + ROCE/ROE → re-scored health');
  await enrichVendors(log);
  await enrichAlts(log);
  console.log(log.join('\n') + '\n');
}

main().catch((e) => { console.error(e); process.exit(1); });
