// Indian-style number & currency formatting. Plain language, no jargon.

const CR = 1e7; // crore
const L = 1e5; // lakh

/** Full rupee amount with Indian digit grouping, e.g. ₹21,21,23,478 */
export function inr(n: number | null | undefined, decimals = 0): string {
  if (n == null || !isFinite(n)) return '—';
  return (
    '₹' +
    n.toLocaleString('en-IN', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
  );
}

/** Compact money: ₹Cr above a crore, ₹L above a lakh, else plain rupees. */
export function money(n: number | null | undefined, opts?: { crDecimals?: number }): string {
  if (n == null || !isFinite(n)) return '—';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= CR) return `${sign}₹${(abs / CR).toFixed(opts?.crDecimals ?? 2)} Cr`;
  if (abs >= L) return `${sign}₹${(abs / L).toFixed(2)} L`;
  if (abs >= 1000) return `${sign}₹${(abs / 1000).toFixed(1)}K`;
  return `${sign}₹${abs.toFixed(0)}`;
}

/** Always crore (for consistent axis scales). */
export function crore(n: number | null | undefined, decimals = 2): string {
  if (n == null || !isFinite(n)) return '—';
  return `₹${(n / CR).toFixed(decimals)} Cr`;
}

export const toCr = (n: number) => n / CR;
export const toLakh = (n: number) => n / L;

/** A unit price like ₹68.45/kg or ₹1.89/pc */
export function price(n: number | null | undefined, unit?: string): string {
  if (n == null || !isFinite(n)) return '—';
  const u = unit ? `/${unitShort(unit)}` : '';
  const dp = Math.abs(n) >= 100 ? 1 : 2;
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp })}${u}`;
}

export function unitShort(unit: string): string {
  const u = (unit || '').toUpperCase();
  if (u === 'KG') return 'kg';
  if (u === 'NOS') return 'pc';
  return unit.toLowerCase();
}

export function unitLong(unit: string): string {
  const u = (unit || '').toUpperCase();
  if (u === 'KG') return 'per kilogram';
  if (u === 'NOS') return 'per piece';
  return `per ${unit.toLowerCase()}`;
}

/** Quantity with unit, Indian grouping. */
export function qty(n: number | null | undefined, unit?: string): string {
  if (n == null || !isFinite(n)) return '—';
  const u = (unit || '').toUpperCase();
  let val: string;
  if (u === 'NOS') {
    // pieces: compact in lakh/crore for readability
    const abs = Math.abs(n);
    if (abs >= CR) val = `${(n / CR).toFixed(2)} Cr`;
    else if (abs >= L) val = `${(n / L).toFixed(2)} L`;
    else val = n.toLocaleString('en-IN');
    return `${val} pcs`;
  }
  val = Math.round(n).toLocaleString('en-IN');
  return `${val} ${unitShort(unit || '')}`.trim();
}

export function pct(n: number | null | undefined, decimals = 1): string {
  if (n == null || !isFinite(n)) return '—';
  return `${n.toFixed(decimals)}%`;
}

export function num(n: number | null | undefined, decimals = 0): string {
  if (n == null || !isFinite(n)) return '—';
  return n.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "2025-04" → "Apr '25" */
export function monthLabel(m: string): string {
  const [y, mm] = m.split('-');
  const idx = parseInt(mm, 10) - 1;
  return `${MONTHS[idx] ?? mm} '${y.slice(2)}`;
}

/** "2025-04-01" → "1 Apr 2025" */
export function dateLabel(d: string): string {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return `${dt.getUTCDate()} ${MONTHS[dt.getUTCMonth()]} ${dt.getUTCFullYear()}`;
}

/** Shorten long plant names: "FDC Limited,SINNAR" → "Sinnar", keeping short acronyms upper. */
export function plantShort(name: string, code?: string): string {
  if (!name) return code ?? '';
  let s = name.replace(/FDC\s*Limited[,\s-]*/i, '').trim();
  s = s.replace(/^\(|\)$/g, '').trim();
  const caseToken = (part: string) => {
    if (!part) return part;
    // keep short all-caps/number tokens as acronyms (SPPL, NVP, II), title-case the rest
    if (part.length <= 4 && /^[A-Za-z0-9]+$/.test(part)) return part.toUpperCase();
    return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
  };
  s = s
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((w) => w.split('-').map(caseToken).join('-'))
    .join(' ');
  return s || code || name;
}

/** Clean a vendor's legal name for display: drop Pvt/Ltd/India, empty/lone-letter parens. */
export function vendorShort(name: string): string {
  const s = String(name ?? '')
    .replace(/\([A-Za-z]\)/g, ' ') // (P), (I)
    .replace(/\b(PRIVATE|PVT|LIMITED|LTD|INDIA)\b\.?/gi, ' ')
    .replace(/\(\s*\)/g, ' ') // empty parens
    .replace(/[.,]/g, ' ')
    .replace(/\s+[A-Za-z]\s*$/, '') // trailing lone letter (e.g. "…P")
    .replace(/\s+/g, ' ')
    .trim();
  return titleCaseShout(s);
}

/** Title-case words that are SHOUTING in all-caps, keeping short acronyms (GLS, PGP, TPAC, RTD). */
export function titleCaseShout(s: string): string {
  return String(s ?? '')
    .split(' ')
    .map((w) => (w.length > 3 && w === w.toUpperCase() && /[A-Z]/.test(w) && !/\d/.test(w) ? w[0] + w.slice(1).toLowerCase() : w))
    .join(' ');
}
