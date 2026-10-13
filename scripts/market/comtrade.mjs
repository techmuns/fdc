/**
 * UN Comtrade customs unit values → ₹/kg market lines.
 * Keyless preview endpoint (reporter 699 = India). A COMTRADE_KEY, when present,
 * is used for the authenticated endpoint (higher limits) but is NOT required.
 *
 * US$/kg = tradeValue(primaryValue) ÷ netWeight(kg); converted to ₹ with that
 * year's average USD→INR (real, from FRED). Every point stores its sources.
 */
import { httpJson, round } from '../lib/http.mjs';
import { COMTRADE_REPORTER, COMTRADE_YEARS, COMTRADE_LINES, COMTRADE_SOURCE } from './config.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const KEY = process.env.COMTRADE_KEY || '';

function previewUrl(code, flow, year) {
  const base = KEY
    ? 'https://comtradeapi.un.org/data/v1/get/C/A/HS'
    : 'https://comtradeapi.un.org/public/v1/preview/C/A/HS';
  const q = `reporterCode=${COMTRADE_REPORTER}&period=${year}&cmdCode=${code}&flowCode=${flow}&partnerCode=0&partner2Code=0&customsCode=C00&motCode=0`;
  return `${base}?${q}${KEY ? `&subscription-key=${KEY}` : ''}`;
}

async function fetchPoint(code, flow, year) {
  try {
    const d = await httpJson(previewUrl(code, flow, year), { label: `Comtrade ${code}/${year}`, timeout: 30, retries: 3 });
    const row = (d.data || []).find((r) => r.partnerCode === 0 && r.netWgt > 0 && r.primaryValue > 0);
    if (!row) return null;
    return { year, usdPerKg: row.primaryValue / row.netWgt, tradeValue: row.primaryValue, netWgt: row.netWgt };
  } catch {
    return null;
  }
}

export async function run(shared) {
  const { fxAnnual, fxLatest } = shared;
  const series = [];
  const resolved = [];
  const unresolved = [];

  for (const line of COMTRADE_LINES) {
    // lock the first HS code that returns data for a recent year
    let code = null;
    for (const c of line.codes) {
      for (const y of COMTRADE_YEARS.slice(0, 3)) {
        const p = await fetchPoint(c, line.flow, y);
        await sleep(150);
        if (p) { code = c; break; }
      }
      if (code) break;
    }
    if (!code) { unresolved.push(line.key); continue; }

    const points = [];
    for (const y of [...COMTRADE_YEARS].sort()) {
      const p = await fetchPoint(code, line.flow, y);
      await sleep(150);
      if (!p) continue;
      const fx = fxAnnual[String(y)] ?? fxLatest.value;
      points.push({
        date: `${y}-12-31`,
        value: round(p.usdPerKg * fx, 2), // ₹/kg
        usdPerKg: round(p.usdPerKg, 3),
        usdInr: round(fx, 3),
        fxYear: String(y),
      });
    }
    if (!points.length) { unresolved.push(line.key); continue; }

    const latest = points[points.length - 1];
    series.push({
      material: line.material,
      key: line.key,
      kind: 'customs',
      label: line.label,
      grade: line.grade,
      hsCode: code,
      flow: line.flow,
      unit: '₹/kg',
      currency: 'INR',
      points,
      latest: { value: latest.value, date: latest.date, usdPerKg: latest.usdPerKg },
      sourceName: KEY ? 'UN Comtrade (API)' : 'UN Comtrade (public preview)',
      sourceUrl: COMTRADE_SOURCE.url(code, line.flow),
      fxNote: `Converted at that year's average USD→INR (FRED DEXINUS).`,
    });
    resolved.push(`${line.key}=HS${code}(${points.length}y)`);
  }

  return {
    feed: 'comtrade',
    status: series.length ? 'ok' : 'error',
    series,
    meta: { reporter: COMTRADE_REPORTER, authenticated: !!KEY, resolved, unresolved },
    reason: series.length ? undefined : 'no Comtrade lines resolved',
  };
}
