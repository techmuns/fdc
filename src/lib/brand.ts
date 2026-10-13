// FDC brand kit + fixed material/term colours reused across every chart & table.
import type { MaterialKey } from '../types';

export const FDC = {
  green: '#00973D',
  greenLight: '#009846',
  greenLighter: '#00A65B',
  greenDark: '#00612D',
  gold: '#FFBF00',
  goldLight: '#FFDB26',
  goldDark: '#EFAE0E',
  orange: '#F36D06',
  red: '#D91701',
  blue: '#2E7CE4',
  ink: '#161616',
  slate: '#343434',
  grey: '#707070',
  light: '#CECECE',
  offwhite: '#F6F6F6',
  rowOdd: '#E7EEEA',
  rowEven: '#F5F5F5',
} as const;

// Each material has one fixed colour everywhere.
export const MATERIAL_COLOR: Record<MaterialKey, string> = {
  dextrose: '#00973D', // FDC green
  packaging: '#2E7CE4', // blue
  laminates: '#EFAE0E', // gold
};

export const MATERIAL_ACCENT: Record<MaterialKey, { soft: string; ring: string }> = {
  dextrose: { soft: '#E6F3EC', ring: '#00973D' },
  packaging: { soft: '#E6EFFC', ring: '#2E7CE4' },
  laminates: { soft: '#FBF2D9', ring: '#EFAE0E' },
};

// Payment-term category colours (traffic-light semantics).
export const TERM_COLOR: Record<string, string> = {
  advance: '#D91701', // worst — pay before you receive
  immediate: '#F36D06', // pay on delivery
  net: '#00973D', // credit terms (good)
  unknown: '#707070',
};

export function termLabel(category: string, days: number | null): string {
  if (category === 'advance') return '100% advance';
  if (category === 'immediate') return 'Pay immediately';
  if (category === 'net' && days != null) return `${days} days credit`;
  return '—';
}

// Lighten/darken a hex colour by a factor (−1..1).
export function shade(hex: string, amt: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const mix = (c: number) =>
    amt >= 0 ? Math.round(c + (255 - c) * amt) : Math.round(c * (1 + amt));
  const to2 = (c: number) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, '0');
  return `#${to2(mix(r))}${to2(mix(g))}${to2(mix(b))}`;
}

/** Green (good) → gold → red (bad) solid colour for an intensity 0..1. */
export function rampGYR(t: number): string {
  const c = Math.max(0, Math.min(1, t));
  const stops: [number, [number, number, number]][] = [
    [0, [0, 151, 61]],
    [0.5, [239, 174, 14]],
    [1, [217, 23, 1]],
  ];
  let a = stops[0];
  let b = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (c >= stops[i][0] && c <= stops[i + 1][0]) {
      a = stops[i];
      b = stops[i + 1];
      break;
    }
  }
  const span = b[0] - a[0] || 1;
  const f = (c - a[0]) / span;
  const to2 = (n: number) => Math.round(n).toString(16).padStart(2, '0');
  const ch = [0, 1, 2].map((k) => to2(a[1][k] + (b[1][k] - a[1][k]) * f));
  return `#${ch.join('')}`;
}

export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
