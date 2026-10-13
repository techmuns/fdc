/**
 * Probe42 report extractor — Phase 2.2.  `npm run probe`
 *
 * Reads the committed Probe42 comprehensive-details reports in data/probe-cache/
 * ({CIN}.json, MCA-filing data pulled once per company) and extracts a clean,
 * multi-year financial + risk profile per vendor into public/data/probe-financials.json.
 *
 * This is the PRIMARY private-vendor financial source (credit-rating docs stay as
 * a fallback/cross-check in scripts/financials). It reads only the local cache —
 * ZERO API calls, ZERO credits here; a credit was spent once when the report was
 * fetched. NEVER fabricates: a field absent from a filing stays null.
 *
 * Extraction walks each report by EXACT key name (deep key-search), scoped to the
 * right sub-object so same-named keys don't collide; yearly data takes the latest
 * filed year, preferring STANDALONE over CONSOLIDATED, and builds a multi-year
 * series from the `financials` array.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRIVATE_CINS } from './probe/cins.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, 'data', 'probe-cache');
const OUT = path.join(ROOT, 'public', 'data', 'probe-financials.json');

const r2 = (n) => (n == null || !isFinite(n) ? null : Math.round(n * 100) / 100);
const num = (n) => (typeof n === 'number' && isFinite(n) ? n : null);

/** Deep key-search: first scalar value whose key === `key`, walking `obj`. Scope
 *  the call to a sub-object (f.pnl, f.bs, …) so same-named keys don't collide. */
function deep(obj, key) {
  if (obj == null || typeof obj !== 'object') return undefined;
  if (!Array.isArray(obj) && Object.prototype.hasOwnProperty.call(obj, key)) {
    const v = obj[key];
    if (v === null || typeof v !== 'object') return v;
  }
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (v && typeof v === 'object') { const r = deep(v, key); if (r !== undefined) return r; }
  }
  return undefined;
}

/** Indian FY label from a period-end date: "2025-03-31" → "FY2024-25". */
function fyLabel(yearStr) {
  const d = String(yearStr || '');
  const y = parseInt(d.slice(0, 4), 10);
  const mo = parseInt(d.slice(5, 7), 10) || 3;
  if (!y) return null;
  const startYear = mo <= 3 ? y - 1 : y; // close in Jan–Mar belongs to the FY that started the prior April
  return `FY${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
}

const AGENCY = { crisil: 'CRISIL', care: 'CARE', icra: 'ICRA', infomerics: 'Infomerics', acuite: 'Acuité', acuité: 'Acuité', india_ratings: 'India Ratings', brickwork: 'Brickwork', fitch: 'Fitch' };
const agencyLabel = (a) => AGENCY[String(a || '').toLowerCase()] || (a ? String(a).toUpperCase() : null);
// Longest grade first; optional +/- suffix; reject if followed by an alnum so
// short-term ratings (A1, A4+) and words ("Assigned") never match a long-term grade.
const GRADE_RE = /\b(AAA|AA|BBB|BB|CCC|CC|A|B|C|D)([+-]?)(?![A-Za-z0-9])/;
const parseGrade = (s) => { const m = String(s || '').replace(/withdrawn/i, '').match(GRADE_RE); return m ? m[1] + m[2] : null; };

/** Pick the headline long-term credit rating (outlook-bearing, not withdrawn, parseable grade). */
function headlineRating(creditRatings) {
  const arr = (creditRatings || []).filter((r) => r && r.rating);
  if (!arr.length) return null;
  const sorted = [...arr].sort((a, b) => String(b.rating_date || '').localeCompare(String(a.rating_date || '')));
  const latest = sorted[0].rating_date;
  const sameDate = sorted.filter((r) => r.rating_date === latest);
  const isLT = (r) => r.rating_details?.[0]?.outlook || /long term|cash credit|term loan|fund[\s-]?based|working capital/i.test(r.type_of_loan || '');
  const pick =
    sameDate.find((r) => isLT(r) && !/withdrawn/i.test(r.rating) && parseGrade(r.rating)) ||
    sameDate.find((r) => parseGrade(r.rating) && !/withdrawn/i.test(r.rating)) ||
    sorted[0];
  const outlook = pick.rating_details?.[0]?.outlook || (/(stable|positive|negative)/i.exec(pick.rating)?.[1] ?? null);
  return {
    agency: agencyLabel(pick.rating_agency),
    grade: /withdrawn/i.test(pick.rating) && !isLT(pick) ? null : parseGrade(pick.rating),
    ratingRaw: pick.rating,
    outlook: outlook ? outlook[0].toUpperCase() + outlook.slice(1).toLowerCase() : null,
    date: pick.rating_date || null,
    loanType: pick.type_of_loan || null,
    withdrawn: /withdrawn/i.test(pick.rating),
  };
}

/** Latest-preferred, STANDALONE-preferred yearly filings, newest first. */
function pickYears(financials) {
  const byYear = {};
  for (const f of financials || []) {
    if (!f || !f.year) continue;
    const prev = byYear[f.year];
    if (!prev || (f.nature === 'STANDALONE' && prev.nature !== 'STANDALONE')) byYear[f.year] = f;
  }
  return Object.values(byYear).sort((a, b) => String(b.year).localeCompare(String(a.year)));
}

/** One year → tidy record (absolute INR for money; % / x / days for ratios). */
function yearRecord(f) {
  const pnl = f.pnl || {};
  const bs = f.bs || {};
  const cf = f.cash_flow || {};
  const ra = f.ratios || {};
  const revenue = num(deep(pnl, 'net_revenue'));
  const ebitda = num(deep(pnl, 'operating_profit'));
  const pat = num(deep(pnl, 'profit_after_tax'));
  const de = num(ra.debt_by_equity);
  return {
    fy: fyLabel(f.year), year: f.year, nature: f.nature,
    revenue, ebitda, pat,
    interest: num(deep(pnl, 'interest')),
    depreciation: num(deep(pnl, 'depreciation')),
    // ratios (as filed)
    netMargin: num(ra.net_margin), ebitdaMargin: num(ra.ebitda_margin),
    grossMargin: num(ra.gross_profit_margin),
    roe: num(ra.return_on_equity), roce: num(ra.return_on_capital_employed),
    debtToEquity: de == null ? null : r2(de * 100), // store ×100 (so /100 = "x times"), matches listed convention
    interestCoverage: num(ra.interest_coverage_ratio), currentRatio: num(ra.current_ratio),
    receivableDays: num(ra.debtors_by_sales_days), payableDays: num(ra.payables_by_sales_days),
    inventoryDays: num(ra.inventory_by_sales_days), ccc: num(ra.cash_conversion_cycle),
    revenueGrowth: num(ra.revenue_growth),
    // balance sheet
    tradeReceivables: num(deep(bs, 'trade_receivables')), tradePayables: num(deep(bs, 'trade_payables')),
    inventories: num(deep(bs, 'inventories')), cash: num(deep(bs, 'cash_and_bank_balances')),
    shareCapital: num(deep(bs, 'share_capital')), reservesAndSurplus: num(deep(bs, 'reserves_and_surplus')),
    longTermBorrowings: num(deep(bs, 'long_term_borrowings')), shortTermBorrowings: num(deep(bs, 'short_term_borrowings')),
    totalAssets: num(deep(bs, 'given_assets_total')),
    netWorth: num(bs.subTotals?.total_equity) ?? (num(deep(bs, 'share_capital')) != null && num(deep(bs, 'reserves_and_surplus')) != null ? deep(bs, 'share_capital') + deep(bs, 'reserves_and_surplus') : null),
    totalDebt: num(bs.subTotals?.total_debt) ?? ((num(deep(bs, 'long_term_borrowings')) || 0) + (num(deep(bs, 'short_term_borrowings')) || 0) || null),
    // cash flow
    cfOperating: num(deep(cf, 'cash_flows_from_used_in_operating_activities')),
    cfInvesting: num(deep(cf, 'cash_flows_from_used_in_investing_activities')),
    cfFinancing: num(deep(cf, 'cash_flows_from_used_in_financing_activities')),
  };
}

/** Peer medians for the given year from peer_comparison → benchMarks. */
function peerMedians(peerComparison, year) {
  const pc = (peerComparison || [])[0];
  if (!pc || !Array.isArray(pc.benchMarks) || !pc.benchMarks.length) return null;
  const yy = String(year || '').slice(0, 4);
  const b = pc.benchMarks.find((x) => String(x.year) === yy) || pc.benchMarks[0];
  return {
    year: b.year, peers: num(b.no_of_peers_in_sample), bizIndustry: pc.bizIndustry || null, bizSegment: pc.bizSegment || null,
    netMargin: num(b.median_net_margin), ebitdaMargin: num(b.median_ebitda_margin),
    roce: num(b.median_return_on_capital_employed), roe: num(b.median_return_on_equity),
    receivableDays: num(b.median_debtor_days_outstanding), payableDays: num(b.median_trade_payable_days),
    ccc: num(b.median_cash_conversion_cycle), debtToEquity: num(b.median_debt_by_equity) == null ? null : r2(b.median_debt_by_equity * 100),
    interestCoverage: num(b.median_interest_coverage_ratio), currentRatio: num(b.median_current_ratio),
  };
}

function probeScore(ps) {
  if (!ps || Array.isArray(ps) || typeof ps !== 'object' || ps.overall_financial_score == null) return null;
  return {
    overall: num(ps.overall_financial_score), growth: num(ps.growth_score), profitability: num(ps.profitability_score),
    liquidity: num(ps.liquidity_score), solvency: num(ps.solvency_score), efficiency: num(ps.efficiency_score),
  };
}

function charges(open) {
  const arr = (open || []).filter((c) => c && typeof c.amount === 'number');
  const sumAmount = arr.reduce((s, c) => s + c.amount, 0);
  const byHolder = {};
  for (const c of arr) byHolder[c.holder_name || '—'] = (byHolder[c.holder_name || '—'] || 0) + c.amount;
  const topLenders = Object.entries(byHolder).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name, amount]) => ({ name, amount }));
  return { count: (open || []).length, sumAmount: sumAmount || null, topLenders };
}

function legal(d) {
  const lh = d.legal_history || [];
  return {
    total: lh.length,
    against: lh.filter((x) => /against this corporate/i.test(x.case_type || '')).length,
    severe: lh.filter((x) => /severe/i.test(x.severity || '')).length,
    pending: lh.filter((x) => /pending/i.test(x.case_status || '')).length,
    financialDisputes: (d.legal_cases_of_financial_disputes || []).length,
    msmeDelays: (d.msme_supplier_payment_delays || []).length,
  };
}

function promoterPct(d) {
  const sh = (d.shareholdings || []).filter((x) => /promoter/i.test(x.shareholders || ''));
  if (sh.length) {
    const latest = sh.sort((a, b) => String(b.financial_year || b.year).localeCompare(String(a.financial_year || a.year)))[0];
    if (latest && latest.total_percentage_of_shares != null) return num(latest.total_percentage_of_shares);
  }
  return null;
}

function directors(d) {
  return (d.authorized_signatories || [])
    .filter((s) => s && !s.date_of_cessation && s.name)
    .map((s) => ({ name: s.name, designation: s.designation || null, din: s.din || null }))
    .slice(0, 8);
}

/** Honest risk/quality chips. tone: risk | watch | ok. */
function buildFlags(d, latest) {
  const ki = d.key_indicators || {};
  const out = [];
  if (latest && latest.pat != null && latest.pat < 0) out.push({ label: `Loss-making (${latest.fy})`, tone: 'risk' });
  if (ki.bureau_defaults === true) out.push({ label: 'Credit-bureau default', tone: 'risk' });
  if ((d.defaulter_list || []).length) out.push({ label: 'On defaulter list', tone: 'risk' });
  if (ki.severe_pending_cases_filed_against_this_corporate === true) out.push({ label: 'Severe legal case(s)', tone: 'risk' });
  if (ki.gst_filing_delay === true) out.push({ label: 'GST filing delays', tone: 'watch' });
  if (ki.epf_payment_delay === true) out.push({ label: 'EPF payment delays', tone: 'watch' });
  if ((d.msme_supplier_payment_delays || []).length) out.push({ label: 'MSME payment delays', tone: 'watch' });
  if (latest && latest.debtToEquity != null && latest.debtToEquity >= 200) out.push({ label: `High leverage (${(latest.debtToEquity / 100).toFixed(1)}x)`, tone: 'watch' });
  const so = d.struckoff248_details?.struck_off_status || '';
  if (/struck.?off/i.test(so) && !/never removed/i.test(so)) out.push({ label: 'Struck-off history', tone: 'risk' });
  if (latest && latest.revenue != null && latest.revenue < 1e8) out.push({ label: 'Small entity (<₹10 Cr) — verify', tone: 'watch' });
  if (ki.pending_cases_filed_against_this_corporate === true && ki.severe_pending_cases_filed_against_this_corporate !== true) out.push({ label: 'Pending legal case(s)', tone: 'watch' });
  return out;
}

function addressLine(a) {
  if (!a || typeof a !== 'object') return null;
  const parts = [a.address_line1, a.address_line2, a.city || a.district, a.state, a.pincode].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

function extract(report) {
  const d = report.data || {};
  const co = d.company || {};
  const years = pickYears(d.financials);
  if (!years.length) return null;
  const series = years.slice(0, 6).reverse().map(yearRecord); // oldest → newest for sparklines
  const latest = yearRecord(years[0]);
  const peer = peerMedians(d.peer_comparison, years[0].year);
  const ki = d.key_indicators || {};
  return {
    cin: co.cin || null, legalName: co.legal_name || null, status: co.efiling_status || co.status || null,
    incorporationDate: co.incorporation_date || null, registeredAddress: addressLine(co.registered_address) || null,
    website: co.website || null, lastFilingDate: co.last_filing_date || null,
    latestFy: latest.fy, latestYear: latest.year, nature: latest.nature,
    lossMaking: latest.pat != null && latest.pat < 0,
    metrics: latest,
    series,
    peer,
    probeScore: probeScore(d.probe_financial_score),
    creditRatingProbe: headlineRating(d.credit_ratings),
    keyIndicators: { revenueBand: ki.revenue || null, profitBand: ki.profit || null, employeeBand: ki.employee_count || null },
    flags: buildFlags(d, latest),
    charges: charges(d.open_charges),
    legal: legal(d),
    directors: directors(d),
    promoterPct: promoterPct(d),
    source: { sourceName: 'Probe42 (MCA filings)', sourceUrl: 'https://probe42.in', date: report.metadata?.last_updated || null },
  };
}

function main() {
  if (!existsSync(CACHE)) { console.error('No data/probe-cache/ — nothing to extract.'); writeEmpty(); return; }
  const files = readdirSync(CACHE).filter((f) => f.endsWith('.json'));
  // CIN → [vendorKeys] (an alias can share a CIN, e.g. bprex ↔ berry)
  const cinToKeys = {};
  for (const [key, v] of Object.entries(PRIVATE_CINS)) {
    if (!v.cin) continue;
    (cinToKeys[v.cin] ||= []).push(key);
  }

  const vendors = {};
  const log = [];
  for (const file of files) {
    const cin = file.replace(/\.json$/i, '');
    const keys = cinToKeys[cin];
    let report;
    try { report = JSON.parse(readFileSync(path.join(CACHE, file), 'utf8')); }
    catch (e) { log.push(`  ✗ ${file} — unreadable (${e.message})`); continue; }
    if (!keys) { log.push(`  • ${cin} — not mapped to a vendor key (skipped)`); continue; }
    const profile = extract(report);
    if (!profile) { log.push(`  ✗ ${cin} — no financial years found`); continue; }
    for (const key of keys) vendors[key] = { vendorKey: key, ...profile };
    const L = profile.metrics;
    log.push(`  ✓ ${keys.join(' / ')} — ${profile.latestFy} · rev ₹${L.revenue != null ? (L.revenue / 1e7).toFixed(2) : '?'} Cr · PAT ₹${L.pat != null ? (L.pat / 1e7).toFixed(2) : '?'} Cr${profile.lossMaking ? ' (LOSS)' : ''}`);
  }

  writeFileSync(OUT, JSON.stringify({
    generatedAt: new Date().toISOString(),
    source: 'Probe42 comprehensive-details reports (MCA filings), read from the committed local cache — 0 API calls, 0 credits spent here.',
    counts: { reports: files.length, vendorsCovered: Object.keys(vendors).length },
    vendors,
  }, null, 2));
  console.log('\n▶ Probe42 extraction (local cache, 0 credits)\n' + log.join('\n'));
  console.log(`\n✓ probe-financials.json — ${Object.keys(vendors).length} vendor keys from ${files.length} reports\n`);
}

function writeEmpty() {
  writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), source: 'Probe42 (none cached)', counts: { reports: 0, vendorsCovered: 0 }, vendors: {} }, null, 2));
}

main();
