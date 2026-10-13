/**
 * Seller "ask" prices from B2B marketplaces (IndiaMART, TradeIndia) via Firecrawl.
 * Gated on FIRECRAWL_API_KEY (IndiaMART blocks datacenter IPs, so Firecrawl's
 * stealth proxy is required). Skips cleanly without the key. Prices are tagged
 * kind:'ask' and labelled "seller ask price (marketplace)".
 */
import { httpJson, round, todayISO } from '../lib/http.mjs';

const KEY = process.env.FIRECRAWL_API_KEY || '';

const QUERIES = [
  { material: 'dextrose', grade: 'Dextrose IP', urls: ['https://dir.indiamart.com/search.mspt?ss=anhydrous+dextrose+ip', 'https://www.tradeindia.com/search.html?keyword=dextrose+anhydrous+ip'], unit: 'kg' },
  { material: 'laminates', grade: 'Aluminium blister foil', urls: ['https://dir.indiamart.com/search.mspt?ss=blister+aluminium+foil+pharma'], unit: 'kg' },
  { material: 'laminates', grade: 'BOPET/BOPP laminate film', urls: ['https://dir.indiamart.com/search.mspt?ss=bopet+laminate+film'], unit: 'kg' },
  { material: 'packaging', grade: 'Pharma HDPE/PET bottle', urls: ['https://dir.indiamart.com/search.mspt?ss=pharma+hdpe+bottle'], unit: 'piece' },
];

async function scrape(url) {
  const d = await httpJson('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: { url, formats: ['markdown'], proxy: 'stealth', timeout: 60000 },
    label: `Firecrawl ${url}`,
    timeout: 90,
  });
  return d?.data?.markdown || '';
}

// Collect ₹ NNN / kg (or / piece) asks, return a trimmed-mean to avoid outliers.
function extractAsks(md, unit) {
  const re = unit === 'kg'
    ? /(?:₹|Rs\.?|INR)\s*([\d,]{2,7})\s*(?:\/|per)?\s*(?:kg|Kg|Kilogram)/g
    : /(?:₹|Rs\.?|INR)\s*([\d,]{1,6})\s*(?:\/|per)?\s*(?:piece|pc|unit|no)/gi;
  const vals = [];
  let m;
  while ((m = re.exec(md))) {
    const v = parseFloat(m[1].replace(/,/g, ''));
    if (isFinite(v) && v > 0) vals.push(v);
  }
  if (vals.length < 3) return null;
  vals.sort((a, b) => a - b);
  const trim = vals.slice(Math.floor(vals.length * 0.1), Math.ceil(vals.length * 0.9));
  const med = trim[Math.floor(trim.length / 2)];
  return { median: med, min: vals[0], max: vals[vals.length - 1], n: vals.length };
}

export async function run() {
  if (!KEY) {
    return { feed: 'marketplace', status: 'skipped', series: [], reason: 'no FIRECRAWL_API_KEY — add it as a secret to enable IndiaMART/TradeIndia seller-ask prices' };
  }
  const series = [];
  const notes = [];
  for (const q of QUERIES) {
    let asks = null;
    for (const url of q.urls) {
      try {
        const md = await scrape(url);
        asks = extractAsks(md, q.unit);
        if (asks) break;
      } catch (e) {
        notes.push(`${q.grade}: ${e.message.slice(0, 40)}`);
      }
    }
    if (!asks) continue;
    series.push({
      material: q.material, key: `ask-${q.grade.toLowerCase().replace(/[^a-z]+/g, '-')}`, kind: 'ask',
      label: `${q.grade} — seller ask (marketplace)`, grade: `${q.grade}, B2B marketplace seller ask price`,
      unit: q.unit === 'kg' ? '₹/kg' : '₹/piece', currency: 'INR',
      points: [{ date: todayISO(), value: round(asks.median, 2) }],
      latest: { value: round(asks.median, 2), date: todayISO(), min: round(asks.min, 2), max: round(asks.max, 2), listings: asks.n },
      sourceName: 'IndiaMART / TradeIndia (via Firecrawl)', sourceUrl: q.urls[0],
    });
  }
  return series.length
    ? { feed: 'marketplace', status: 'ok', series, meta: { notes } }
    : { feed: 'marketplace', status: 'skipped', series: [], reason: 'Firecrawl returned no parseable asks', meta: { notes } };
}
