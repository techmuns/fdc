/** FRED series via the keyless fredgraph CSV endpoint (no API key needed). */
import { httpText } from './http.mjs';

export async function fredSeries(id) {
  const csv = await httpText(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`, { label: `FRED ${id}`, timeout: 30 });
  const lines = csv.trim().split(/\r?\n/);
  const points = [];
  for (let i = 1; i < lines.length; i++) {
    const [date, val] = lines[i].split(',');
    if (!date || val == null || val === '.' || val === '') continue;
    const v = parseFloat(val);
    if (!isFinite(v)) continue;
    points.push({ date: date.trim(), value: v });
  }
  if (!points.length) throw new Error(`FRED ${id} returned no numeric points`);
  return points; // chronological
}

/** Annual averages { 2020: 74.1, 2021: 73.9, ... } from a daily/monthly series. */
export function annualAverages(points) {
  const by = {};
  for (const p of points) {
    const y = p.date.slice(0, 4);
    (by[y] ||= []).push(p.value);
  }
  const out = {};
  for (const [y, arr] of Object.entries(by)) out[y] = arr.reduce((a, b) => a + b, 0) / arr.length;
  return out;
}

export const fredUrl = (id) => `https://fred.stlouisfed.org/series/${id}`;
