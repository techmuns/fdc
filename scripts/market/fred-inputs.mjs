/**
 * Raw-material INPUT lines (maize, crude, aluminium) and the USD→INR rate —
 * all real, all free from FRED. Input lines are tagged kind:'input' and carry
 * their own unit; the UI shows them as a clearly-labelled INPUT trend, never as
 * the material's own price.
 */
import { round, todayISO } from '../lib/http.mjs';
import { fredSeries, annualAverages, fredUrl } from '../lib/fred.mjs';
import { FX, INPUT_LINES } from './config.mjs';

export async function getFx() {
  const pts = await fredSeries(FX.fredId);
  const latest = pts[pts.length - 1];
  return {
    value: round(latest.value, 3),
    date: latest.date,
    annual: Object.fromEntries(
      Object.entries(annualAverages(pts))
        .filter(([y]) => +y >= 2010)
        .map(([y, v]) => [y, round(v, 3)])
    ),
    sourceName: FX.sourceName,
    sourceUrl: FX.sourceUrl,
  };
}

export async function run() {
  const series = [];
  const resolved = [];
  const unresolved = [];
  for (const line of INPUT_LINES) {
    try {
      const pts = await fredSeries(line.fredId);
      const monthly = pts.slice(-36).map((p) => ({ date: p.date, value: round(p.value, 2) }));
      const latest = monthly[monthly.length - 1];
      series.push({
        material: line.material,
        key: line.key,
        kind: 'input',
        label: line.label,
        grade: line.note,
        unit: line.unit,
        currency: 'USD',
        points: monthly,
        latest: { value: latest.value, date: latest.date },
        sourceName: `FRED (${line.fredId})`,
        sourceUrl: fredUrl(line.fredId),
      });
      resolved.push(`${line.key}=${line.fredId}`);
    } catch (e) {
      unresolved.push(`${line.key}:${e.message.slice(0, 40)}`);
    }
  }
  return {
    feed: 'inputs',
    status: series.length ? 'ok' : 'error',
    series,
    meta: { generatedAt: todayISO(), resolved, unresolved },
  };
}
