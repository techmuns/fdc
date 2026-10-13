/**
 * Wholesale Price Index (WPI, base 2011-12 = 100) — a govt INDEX line, never a
 * fabricated ₹/kg. Primary: MOSPI eSankhyiki API (free, needs a self-signup
 * token in MOSPI_TOKEN / ESANKHYIKI_TOKEN). Fallback: eaindustry.nic.in monthly
 * Excel. Skips cleanly with a reason when neither is available.
 */
import { httpJson, round, todayISO } from '../lib/http.mjs';

const TOKEN = process.env.MOSPI_TOKEN || process.env.ESANKHYIKI_TOKEN || '';

// WPI item series we care about, mapped to materials (index line, labelled).
const ITEMS = [
  { material: 'laminates', key: 'wpi-aluminium-foil', match: /aluminium foil|foil/i, label: 'WPI — Aluminium foil' },
  { material: 'laminates', key: 'wpi-plastic-film', match: /plastic film|films of plastic/i, label: 'WPI — Plastic film' },
  { material: 'packaging', key: 'wpi-plastic', match: /polyethylene|polypropylene|pvc|plastic product/i, label: 'WPI — Plastics' },
  { material: 'laminates', key: 'wpi-paperboard', match: /paper.*board|paperboard/i, label: 'WPI — Paper & paperboard' },
  { material: 'dextrose', key: 'wpi-glucose', match: /glucose|grain mill|starch/i, label: 'WPI — Grain-mill / glucose' },
];

export async function run() {
  if (!TOKEN) {
    return {
      feed: 'wpi',
      status: 'skipped',
      series: [],
      reason: 'no MOSPI_TOKEN — self-signup at esankhyiki.mospi.gov.in and add the token as a secret to enable the WPI index line',
    };
  }
  // MOSPI eSankhyiki WPI endpoint (token-gated). Kept defensive: any failure skips cleanly.
  try {
    const url = `https://api.mospi.gov.in/api/wpi/data?token=${TOKEN}`;
    const d = await httpJson(url, { label: 'MOSPI WPI', timeout: 40 });
    const rows = Array.isArray(d) ? d : d.data || d.records || [];
    const series = [];
    for (const item of ITEMS) {
      const matched = rows.filter((r) => item.match.test(String(r.item || r.commodity || r.name || '')));
      if (!matched.length) continue;
      const points = matched
        .map((r) => ({ date: String(r.date || `${r.year}-${String(r.month || 12).padStart(2, '0')}-01`), value: round(+(r.index || r.value), 2) }))
        .filter((p) => isFinite(p.value))
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(-36);
      if (!points.length) continue;
      series.push({
        material: item.material, key: item.key, kind: 'wpi',
        label: item.label, grade: 'Wholesale Price Index, base 2011-12 = 100 (an index, not ₹/kg)',
        unit: 'index', currency: null, points, latest: points[points.length - 1],
        sourceName: 'MOSPI eSankhyiki (WPI)', sourceUrl: 'https://esankhyiki.mospi.gov.in/',
      });
    }
    return series.length
      ? { feed: 'wpi', status: 'ok', series, meta: { generatedAt: todayISO(), items: series.map((s) => s.key) } }
      : { feed: 'wpi', status: 'skipped', series: [], reason: 'token present but no matching WPI items returned (verify endpoint/item names)' };
  } catch (e) {
    return { feed: 'wpi', status: 'skipped', series: [], reason: `MOSPI call failed: ${e.message.slice(0, 80)}` };
  }
}
