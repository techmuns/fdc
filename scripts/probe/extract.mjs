/**
 * Map a Probe42 comprehensive-details payload → the metrics the dashboard needs.
 * Defensive: Probe42's shape varies, so we deep-search by key patterns and leave
 * anything not confidently found as null (never fabricated). The raw payload is
 * cached so the mapping can be refined against real responses later.
 */
const num = (v) => {
  if (v == null) return null;
  const x = typeof v === 'number' ? v : parseFloat(String(v).replace(/[₹,%\s]/g, ''));
  return isFinite(x) ? x : null;
};

/** Recursively find the first numeric value whose key matches any regex. */
function deepFind(obj, patterns, depth = 0) {
  if (obj == null || depth > 6) return null;
  if (Array.isArray(obj)) {
    for (const el of obj) {
      const r = deepFind(el, patterns, depth + 1);
      if (r != null) return r;
    }
    return null;
  }
  if (typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      if ((typeof v === 'number' || typeof v === 'string') && patterns.some((p) => p.test(k))) {
        const n = num(v);
        if (n != null) return n;
      }
    }
    for (const v of Object.values(obj)) {
      const r = deepFind(v, patterns, depth + 1);
      if (r != null) return r;
    }
  }
  return null;
}

function deepFindStr(obj, patterns, depth = 0) {
  if (obj == null || depth > 6) return null;
  if (Array.isArray(obj)) {
    for (const el of obj) { const r = deepFindStr(el, patterns, depth + 1); if (r) return r; }
    return null;
  }
  if (typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === 'string' && patterns.some((p) => p.test(k)) && v.trim()) return v.trim();
    }
    for (const v of Object.values(obj)) { const r = deepFindStr(v, patterns, depth + 1); if (r) return r; }
  }
  return null;
}

export function extractMetrics(payload) {
  const d = payload?.data || payload || {};
  const revenue = deepFind(d, [/revenue.*operation/i, /total.*income/i, /^revenue$/i, /turnover/i]);
  const pat = deepFind(d, [/profit.*after.*tax/i, /net.*profit/i, /\bpat\b/i]);
  const ebitda = deepFind(d, [/\bebitda\b/i, /operating.*profit/i]);
  const roce = deepFind(d, [/\broce\b/i, /return.*capital.*employ/i]);
  const roe = deepFind(d, [/\broe\b/i, /return.*equity/i]);
  const de = deepFind(d, [/debt.*equity/i, /\bd\/?e\b/i]);
  const recvDays = deepFind(d, [/receivable.*day/i, /debtor.*day/i, /days.*receivable/i]);
  const payDays = deepFind(d, [/payable.*day/i, /creditor.*day/i, /days.*payable/i]);
  const ccc = deepFind(d, [/cash.*conversion/i, /\bccc\b/i, /operating.*cycle/i]);
  const rating = deepFindStr(d, [/credit.*rating/i, /\brating\b/i]);

  const netMargin = pat != null && revenue ? (pat / revenue) * 100 : null;
  const ebitdaMargin = ebitda != null && revenue ? (ebitda / revenue) * 100 : null;

  return {
    revenue, pat, ebitda,
    netMargin: netMargin != null ? Math.round(netMargin * 100) / 100 : null,
    ebitdaMargin: ebitdaMargin != null ? Math.round(ebitdaMargin * 100) / 100 : null,
    roce, roe, debtToEquity: de,
    receivableDays: recvDays, payableDays: payDays, cashConversionCycle: ccc,
    creditRating: rating,
    flags: {
      legalCases: deepFind(d, [/legal.*case/i, /litigation.*count/i]),
      gstDelays: deepFind(d, [/gst.*delay/i, /gst.*default/i]),
      epfDelays: deepFind(d, [/epf.*delay/i, /pf.*default/i]),
      charges: deepFind(d, [/open.*charge/i, /charges.*count/i]),
    },
  };
}
