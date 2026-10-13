/**
 * Listed-vendor financials — FREE via the Munshot market-data API (keyless).
 * POST /stock-data {type:'detailquote', ticker_symbol, country:'india'} returns a
 * "key=value,key=value" string with real financials. We parse the fields we need
 * and keep a source stamp on every record. No fabrication: missing fields → null.
 */
import { httpText, round, todayISO } from '../lib/http.mjs';

const API = 'https://fastapi.muns.io/stock-data';

// Phase-1 vendor key → listed ticker candidates + the expected company name.
export const LISTED_VENDORS = {
  'gujarat-ambuja-exports': { tickers: ['GAEL'], expect: /ambuja/i },
  'sayaji-industries': { tickers: ['SAYAJIIND', '540728', '507692', 'SAYAJIND'], expect: /sayaji/i },
  'sukhjit-corn-products': { tickers: ['SUKHJITS'], expect: /sukhjit/i, note: 'Listed group entity: Sukhjit Starch & Chemicals Ltd' },
  'universal-starch-chem-allied': { tickers: ['524408', 'UNIVSTAR'], expect: /universal/i, note: 'Thinly traded' },
  'uflex': { tickers: ['UFLEX', '500148'], expect: /uflex/i },
  'huhtamaki-india': { tickers: ['HUHTAMAKI', '509820'], expect: /huhtamaki/i },
  'empire-industries-virum-glass': { tickers: ['509525', 'EMPIREIND'], expect: /empire/i },
};

function parseKv(str) {
  const o = {};
  for (const pair of String(str).split(',')) {
    const i = pair.indexOf('=');
    if (i > 0) o[pair.slice(0, i).trim()] = pair.slice(i + 1).trim();
  }
  return o;
}
const n = (v) => {
  if (v == null || v === 'N/A' || v === '') return null;
  const x = parseFloat(String(v).replace(/[, ]/g, ''));
  return isFinite(x) ? x : null;
};

async function fetchDetail(ticker) {
  try {
    const txt = await httpText(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { ticker_symbol: ticker, type: 'detailquote', country: 'india' },
      label: `Munshot ${ticker}`,
      timeout: 40,
      retries: 3,
    });
    // response is a JSON string (quoted) or raw kv string
    let s = txt.trim();
    if (s.startsWith('"') && s.endsWith('"')) s = JSON.parse(s);
    if (s.startsWith('{') || s.startsWith('[')) return null; // validation error payload
    const kv = parseKv(s);
    return kv['Company Name'] ? kv : null;
  } catch {
    return null;
  }
}

/** Reusable: resolve the first matching ticker and return a normalized record. */
export async function fetchMetrics(tickers, expect, note = null) {
  let kv = null;
  let used = null;
  for (const t of tickers) {
    const r = await fetchDetail(t);
    if (r && (!expect || new RegExp(expect, 'i').test(r['Company Name'] || ''))) { kv = r; used = t; break; }
  }
  if (!kv) return null;
  return {
    companyName: kv['Company Name'],
    symbol: kv['Symbol'] || used,
    exchange: kv['Exchange'] || null,
    note,
    source: { sourceName: 'Munshot market-data API', sourceUrl: 'https://fastapi.muns.io', date: todayISO() },
    metrics: {
      revenue: n(kv['Total Revenue']),
      ebitda: n(kv['EBITDA']),
      marketCap: n(kv['Market Cap']),
      totalDebt: n(kv['Total Debt']),
      ebitdaMargin: n(kv['EBITDA Margins (%)']),
      netMargin: n(kv['Profit Margins (%)']),
      grossMargin: n(kv['Gross Margins (%)']),
      operatingMargin: n(kv['Operating Margins (%)']),
      debtToEquity: n(kv['Debt-to-Equity Ratio']),
      revenueGrowth: n(kv['Revenue Growth (%)']),
      earningsGrowth: n(kv['Earnings Growth (%)']),
      pe: n(kv['P/E Ratio (Trailing)']),
      evEbitda: n(kv['EV/EBITDA']),
      dividendYield: n(kv['Dividend Yield (%)']),
      currentPrice: n(kv['Current Price']),
      yearlyChange: n(kv['Yearly Change (%)']),
      employees: n(kv['Full-Time Employees']),
      roce: null,
      roe: null,
    },
    website: kv['Website'] && kv['Website'] !== 'N/A' ? kv['Website'] : null,
  };
}

export async function fetchListed() {
  const out = {};
  const log = [];
  for (const [key, cfg] of Object.entries(LISTED_VENDORS)) {
    const rec = await fetchMetrics(cfg.tickers, cfg.expect?.source, cfg.note || null);
    if (!rec) { log.push(`${key}: no ticker resolved (${cfg.tickers.join('/')})`); out[key] = null; continue; }
    out[key] = { vendorKey: key, ...rec };
    log.push(`${key}: ${rec.companyName} (${rec.symbol}) rev=₹${rec.metrics.revenue ? (rec.metrics.revenue / 1e7).toFixed(0) : '?'}Cr`);
  }
  return { data: out, log };
}
