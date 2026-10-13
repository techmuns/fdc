/**
 * Plastemart polymer price news (free scrape) → latest ₹/kg per grade,
 * labelled "producer list price". Best-effort: the page is news prose, so if no
 * clean absolute price levels can be parsed we skip cleanly (Comtrade resin
 * lines remain the robust polymer signal).
 */
import { httpText, round, todayISO } from '../lib/http.mjs';

const GRADES = [
  { g: 'PET', material: 'packaging' },
  { g: 'HDPE', material: 'packaging' },
  { g: 'PP', material: 'packaging' },
  { g: 'LLDPE', material: 'packaging' },
  { g: 'LDPE', material: 'packaging' },
  { g: 'PVC', material: 'packaging' },
];

export async function run() {
  let html;
  try {
    html = await httpText('https://www.plastemart.com/polymer-price-movement', { label: 'Plastemart', timeout: 30 });
  } catch (e) {
    return { feed: 'plastemart', status: 'skipped', series: [], reason: `fetch failed: ${e.message.slice(0, 60)}` };
  }
  const text = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/\s+/g, ' ');

  const series = [];
  for (const { g, material } of GRADES) {
    // look for an absolute level like "PP ... INR 95,000/MT" or "PP prices at Rs 1,05,000 per MT"
    const re = new RegExp(`\\b${g}\\b[^.]{0,80}?(?:INR|Rs\\.?)\\s*([\\d,]{4,})\\s*/?\\s*(?:MT|ton|tonne|per\\s*MT)`, 'i');
    const m = text.match(re);
    if (!m) continue;
    const perMt = parseFloat(m[1].replace(/,/g, ''));
    if (!isFinite(perMt) || perMt < 20000 || perMt > 400000) continue; // sanity: polymer ₹20k–400k/MT
    series.push({
      material,
      key: `producer-${g.toLowerCase()}`,
      kind: 'producer',
      label: `${g} — producer list price`,
      grade: `${g} polymer, domestic producer list price`,
      unit: '₹/kg',
      currency: 'INR',
      points: [{ date: todayISO(), value: round(perMt / 1000, 2) }],
      latest: { value: round(perMt / 1000, 2), date: todayISO() },
      sourceName: 'Plastemart',
      sourceUrl: 'https://www.plastemart.com/polymer-price-movement',
    });
  }
  return series.length
    ? { feed: 'plastemart', status: 'ok', series, meta: { grades: series.map((s) => s.key) } }
    : { feed: 'plastemart', status: 'skipped', series: [], reason: 'no clean absolute price levels in current news text' };
}
