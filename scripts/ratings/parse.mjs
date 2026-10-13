/**
 * Parse a rating-rationale text → real financials.
 * Values in rationales are in ₹ crore → converted to absolute INR (×1e7) to match
 * the Munshot listed-vendor scale. Gearing ("times") → ×100 to match the D/E %
 * convention used elsewhere. Nothing is inferred: a field that can't be read
 * cleanly stays null. The RATING itself is the primary, always-reliable signal.
 */
const CR = 1e7;
const GRADE = '(A{1,3}[+-]?|BBB[+-]?|BB[+-]?|B[+-]?|C{1,3}[+-]?|D)';
const OUTLOOK = '(Stable|Positive|Negative|Rating\\s*Watch[^.,;)\\n]{0,45})';

const num = (s) => {
  if (s == null) return null;
  const x = parseFloat(String(s).replace(/[, ]/g, ''));
  return isFinite(x) ? x : null;
};
const agencyTag = (a) => ({ CRISIL: 'CRISIL', CARE: 'CARE', ICRA: '[ICRA]', Infomerics: 'IVR', 'Acuité': 'ACUITÉ', Acuite: 'ACUITÉ' }[a] || a);
const prefixRe = (a) => ({ CRISIL: 'CRISIL', CARE: 'CARE', ICRA: '\\[ICRA\\]', Infomerics: 'IVR', 'Acuité': 'ACUIT[EÉ]', Acuite: 'ACUIT[EÉ]' }[a] || a);

function cleanOutlook(o) {
  if (!o) return null;
  if (/watch/i.test(o)) return 'Rating Watch';
  return o.charAt(0).toUpperCase() + o.slice(1).toLowerCase();
}

export function parseRating(text, agency) {
  const p = prefixRe(agency);
  // long-term rating = grade immediately followed by an outlook word
  let m = text.match(new RegExp(`${p}\\s*${GRADE}\\s*[;/(\\s]+\\s*${OUTLOOK}`, 'i'));
  let grade = null, outlook = null;
  if (m) { grade = m[1].toUpperCase().replace(/\s/g, ''); outlook = cleanOutlook(m[2]); }
  else {
    const m2 = text.match(new RegExp(`${p}\\s*${GRADE}\\b`, 'i'));
    if (m2) grade = m2[1].toUpperCase().replace(/\s/g, '');
  }
  // INC only when "Issuer Not Cooperating" sits right next to a rating grade
  // (CRISIL/CARE suffix it to the rating) — not when it's boilerplate elsewhere.
  const inc = new RegExp(`${p}\\s*${GRADE}[^\\n]{0,70}issuer\\s+not\\s+co-?operating`, 'i').test(text);
  return {
    grade, outlook, inc,
    ratingLabel: grade ? `${agencyTag(agency)} ${grade}${outlook ? ` / ${outlook}` : ''}` : null,
  };
}

const splitCols = (line) => line.trim().split(/\s{2,}/).filter(Boolean);
const yearOf = (s) => { const m = String(s).match(/\b(20\d{2})\b/); return m ? +m[1] : null; };
const fyLabel = (y) => (y ? `FY${String(y).slice(2)}` : null);

/** Column-aligned table extractor (for -layout PDFs: CARE / ICRA / Infomerics). */
function parseTable(text, labels) {
  const lines = text.split('\n');
  // find the financial-summary header: a line with >=2 distinct year columns
  let hdr = null, years = null, hdrIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const cols = splitCols(lines[i]);
    const ys = cols.map(yearOf);
    const distinct = new Set(ys.filter(Boolean));
    if (distinct.size >= 2 && /financ|march 31|year ended|FY\d/i.test(lines[i])) { hdr = cols; years = ys; hdrIdx = i; break; }
  }
  const out = {};
  let asOfYear = null;
  // the latest FULL year = the max year that is not an interim/partial column
  if (years) {
    const full = years.map((y, idx) => ({ y, idx })).filter((o) => o.y);
    const maxY = Math.max(...full.map((o) => o.y));
    // pick FIRST column of maxY (standalone entity comes first)
    asOfYear = maxY;
    const colIdx = full.find((o) => o.y === maxY)?.idx;
    const search = lines.slice(hdrIdx, hdrIdx + 40);
    for (const [key, labelRe] of Object.entries(labels)) {
      for (const ln of search) {
        if (!new RegExp(labelRe, 'i').test(ln)) continue;
        const cols = splitCols(ln);
        // align: value columns share the header's column positions
        const v = num(cols[colIdx]);
        if (v != null) { out[key] = v; break; }
        // fallback: last numeric before an NA/interim
        const nums = cols.map(num).map((x, i) => ({ x, i })).filter((o) => o.x != null && o.i > 0);
        if (nums.length) { out[key] = nums[Math.min(1, nums.length - 1)].x; break; }
      }
    }
  }
  return { metrics: out, asOfYear };
}

/** CRISIL: "Key Financial Indicators" block, newest value FIRST. HTML (tag-stripped). */
function parseCrisil(text) {
  const i = text.search(/Key Financial Indicators/i);
  let block = i >= 0 ? text.slice(i, i + 1400) : text;
  block = block.replace(/(\d)\.\s*\|\s*(\d)/g, '$1.$2'); // repair split decimals e.g. "4. | 11" → "4.11"
  const yrs = [...block.matchAll(/\b(20\d{2})\s*\*?/g)].map((m) => +m[1]).filter((y) => y >= 2015 && y <= 2027);
  const asOfYear = yrs.length ? yrs[0] : null; // first = newest
  const first = (labelRe) => { const m = block.match(new RegExp(`(?:${labelRe})[^0-9+-]*?(-?[\\d.]+)`, 'i')); return m ? num(m[1]) : null; };
  return {
    revenue: first('Operating income'), pat: first('(?:Reported )?profit after tax'),
    netMargin: first('PAT margins?'),
    gearing: first('(?:Adjusted\\s+)?(?:Total\\s+)?Debt[^0-9]{0,30}Net ?worth|Overall gearing|\\bgearing'),
    interestCoverage: first('Interest coverage'), asOfYear,
  };
}

/** CARE "Brief Financials": table is oldest→newest, often standalone THEN combined.
 * The latest full standalone FY is the 2nd numeric column. Search only AFTER the
 * header so prose mentions (e.g. "PBILDT margin above 9%") are never picked up. */
function parseCare(text, labels) {
  const lines = text.split('\n');
  const hdrIdx = lines.findIndex((l) => /Brief\s+Financials|Financial\s+Summary|Financial\s+Performance/i.test(l));
  if (hdrIdx < 0) return { metrics: {}, asOfYear: null };
  const hdrYears = [...lines[hdrIdx].matchAll(/\b(20\d{2})\b/g)].map((m) => +m[1]).filter((y) => y >= 2015 && y <= 2027);
  const asOfYear = hdrYears.length ? Math.max(...hdrYears) : null;
  const block = lines.slice(hdrIdx, hdrIdx + 30);
  const out = {};
  for (const [key, labelRe] of Object.entries(labels)) {
    for (const ln of block) {
      if (!new RegExp(`^\\s*(?:${labelRe})`, 'i').test(ln)) continue;
      const nums = (ln.match(/-?\d[\d,]*\.?\d*/g) || []).map(num).filter((x) => x != null);
      if (nums.length) { out[key] = nums[Math.min(1, nums.length - 1)]; break; }
    }
  }
  return { metrics: out, asOfYear };
}

/** Pull "X.Xx as on FY24 / as of March 31, 2024" style values from prose (CARE/Infomerics). */
function prose(text, labelRe) {
  const m = text.match(new RegExp(`${labelRe}[^.\\n]{0,40}?of\\s+(-?[\\d.]+)\\s*(?:x|times|%)?`, 'i'));
  return m ? num(m[1]) : null;
}

export function parseFinancials(text, agency) {
  let metrics = { revenue: null, ebitda: null, pat: null, netMargin: null, ebitdaMargin: null, debtToEquity: null, interestCoverage: null, netWorth: null, totalDebt: null, roce: null, revenueGrowth: null };
  let asOfYear = null;

  if (agency === 'CRISIL') {
    const c = parseCrisil(text);
    asOfYear = c.asOfYear;
    metrics.revenue = c.revenue != null ? c.revenue * CR : null;
    metrics.pat = c.pat != null ? c.pat * CR : null;
    metrics.netMargin = c.netMargin;
    metrics.debtToEquity = c.gearing != null ? c.gearing * 100 : null;
    metrics.interestCoverage = c.interestCoverage;
  } else {
    const labels = {
      revenue: 'Total\\s+operating\\s+income|Operating\\s+income|Total\\s+income|Revenue from operations',
      ebitda: 'PBILDT|PBDIT|OPBDITA|EBITDA|Operating profit',
      pat: 'PAT(?!\\s*/|\\s*margin)|Profit after tax|Net profit',
      netWorth: 'Tangible\\s+net\\s*worth|Net\\s*worth|Adjusted net worth',
      totalDebt: 'Total\\s+debt',
      interestCoverage: 'Interest\\s+coverage|PBILDT\\s*/\\s*Interest',
      debtToEquity: 'Overall\\s+gearing|^\\s*Gearing|Debt[-\\s]*equity|TOL\\s*/\\s*TNW',
      roce: '\\bRoCE\\b|Return on capital',
    };
    const t = agency === 'CARE' ? parseCare(text, labels) : parseTable(text, labels);
    asOfYear = t.asOfYear;
    const m = t.metrics;
    metrics.revenue = m.revenue != null ? m.revenue * CR : null;
    metrics.ebitda = m.ebitda != null ? m.ebitda * CR : null;
    metrics.pat = m.pat != null ? m.pat * CR : null;
    metrics.netWorth = m.netWorth != null ? m.netWorth * CR : null;
    metrics.totalDebt = m.totalDebt != null ? m.totalDebt * CR : null;
    metrics.interestCoverage = m.interestCoverage ?? null;
    metrics.roce = m.roce ?? null;
    // gearing: table value, else prose
    let gearing = m.debtToEquity ?? prose(text, 'overall\\s+gearing');
    metrics.debtToEquity = gearing != null ? gearing * 100 : null;
    if (metrics.interestCoverage == null) metrics.interestCoverage = prose(text, 'interest\\s+coverage');
  }

  // derived (only from real extracted fields)
  if (metrics.pat != null && metrics.revenue) metrics.netMargin = metrics.netMargin ?? round((metrics.pat / metrics.revenue) * 100, 2);
  if (metrics.ebitda != null && metrics.revenue) metrics.ebitdaMargin = round((metrics.ebitda / metrics.revenue) * 100, 2);

  // sanity: drop implausible values rather than show a wrong number
  if (metrics.revenue != null && (metrics.revenue < 1e6 || metrics.revenue > 1e13)) metrics.revenue = null;
  if (metrics.debtToEquity != null && (metrics.debtToEquity <= 0 || metrics.debtToEquity > 3000)) metrics.debtToEquity = null;
  if (metrics.interestCoverage != null && (metrics.interestCoverage < 0 || metrics.interestCoverage > 100)) metrics.interestCoverage = null;
  if (metrics.netMargin != null && Math.abs(metrics.netMargin) > 100) metrics.netMargin = null;

  return { metrics, asOfFy: fyLabel(asOfYear) };
}

function round(n, d = 2) { return n == null || !isFinite(n) ? null : Math.round(n * 10 ** d) / 10 ** d; }
