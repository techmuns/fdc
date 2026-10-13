/**
 * Probe42 report extractor — Phase 2.2 + Phase 4.  `npm run probe`
 *
 * Reads the committed Probe42 comprehensive-details reports in data/probe-cache/
 * ({CIN}.json, MCA-filing data pulled once per company) and extracts a clean,
 * multi-year financial + risk + governance profile per vendor into
 * public/data/probe-financials.json.
 *
 * This is the PRIMARY private-vendor financial source (credit-rating docs stay as
 * a fallback/cross-check in scripts/financials). It reads only the local cache —
 * ZERO API calls, ZERO credits here; a credit was spent once when the report was
 * fetched. NEVER fabricates: a field absent from a filing stays null and the UI
 * shows an honest "not available" with the reason.
 *
 * Phase 4 adds, on top of the core financials: borrowing cost (effective rate +
 * MCA-charge rates + lenders), revenue mix (manufactured/traded/services/export),
 * analyst metrics computed from the statements (DuPont RoE, Piotroski F-score,
 * Altman Z' distress, approx. FCF, Sloan accruals earnings-quality, operating
 * leverage), credit-ratings history (+ outlook + INC), itemised legal & disputes,
 * group structure, related-party activity, fundraising (securities allotment),
 * EPFO headcount, director overboarding and ownership.
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
// Probe42 occasionally returns {} (or an error object) where a list is expected.
const toArr = (x) => (Array.isArray(x) ? x : []);

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
const INC_RE = /issuer not[\s-]?cooperating/i;

const isLongTerm = (r) => r.rating_details?.[0]?.outlook || /long term|cash credit|term loan|fund[\s-]?based|working capital|non[\s-]?convertible|debenture/i.test(r.type_of_loan || '');
function ratingOutlook(r) {
  const o = r.rating_details?.[0]?.outlook || (/(stable|positive|negative)/i.exec(r.rating)?.[1] ?? null);
  return o ? o[0].toUpperCase() + o.slice(1).toLowerCase() : null;
}
function ratingRec(r) {
  return {
    agency: agencyLabel(r.rating_agency),
    grade: /withdrawn/i.test(r.rating) && !isLongTerm(r) ? null : parseGrade(r.rating),
    ratingRaw: r.rating, outlook: ratingOutlook(r), date: r.rating_date || null,
    loanType: r.type_of_loan || null, withdrawn: /withdrawn/i.test(r.rating || ''),
  };
}

/** Pick the headline long-term credit rating (outlook-bearing, not withdrawn, parseable grade). */
function headlineRating(creditRatings) {
  const arr = (creditRatings || []).filter((r) => r && r.rating);
  if (!arr.length) return null;
  const sorted = [...arr].sort((a, b) => String(b.rating_date || '').localeCompare(String(a.rating_date || '')));
  const latest = sorted[0].rating_date;
  const sameDate = sorted.filter((r) => r.rating_date === latest);
  const pick =
    sameDate.find((r) => isLongTerm(r) && !/withdrawn/i.test(r.rating) && parseGrade(r.rating)) ||
    sameDate.find((r) => parseGrade(r.rating) && !/withdrawn/i.test(r.rating)) ||
    sorted[0];
  return ratingRec(pick);
}

/** A compact long-term ratings TIMELINE: distinct (date, grade) points, newest first. */
function ratingHistory(creditRatings) {
  const lt = (creditRatings || []).filter((r) => r && r.rating && isLongTerm(r) && parseGrade(r.rating));
  lt.sort((a, b) => String(b.rating_date || '').localeCompare(String(a.rating_date || '')));
  const out = [];
  const seen = new Set();
  for (const r of lt) {
    const rec = ratingRec(r);
    const k = `${rec.date}|${rec.grade}|${rec.outlook}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(rec);
    if (out.length >= 12) break;
  }
  return out;
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
  const st = bs.subTotals || {};
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
    netWorth: num(st.total_equity) ?? (num(deep(bs, 'share_capital')) != null && num(deep(bs, 'reserves_and_surplus')) != null ? deep(bs, 'share_capital') + deep(bs, 'reserves_and_surplus') : null),
    totalDebt: num(st.total_debt) ?? ((num(deep(bs, 'long_term_borrowings')) || 0) + (num(deep(bs, 'short_term_borrowings')) || 0) || null),
    // cash flow (usually absent from AOC-4 filings → null, handled honestly downstream)
    cfOperating: num(deep(cf, 'cash_flows_from_used_in_operating_activities')),
    cfInvesting: num(deep(cf, 'cash_flows_from_used_in_investing_activities')),
    cfFinancing: num(deep(cf, 'cash_flows_from_used_in_financing_activities')),
    // Phase 4 — extra line items for analytics + composition
    ebit: num(deep(pnl, 'profit_before_interest_and_tax')),
    incomeTax: num(deep(pnl, 'income_tax')),
    otherIncome: num(deep(pnl, 'other_income')),
    currentAssets: num(st.total_current_assets),
    currentLiabilities: num(st.total_current_liabilities),
    netFixedAssets: num(st.net_fixed_assets),
    grossFixedAssets: num(bs.notes?.gross_fixed_assets),
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

/** Parse a numeric annual % from a messy rate_of_interest string ("8.50%", "18% p.a."). */
function parseRatePct(s) {
  if (s == null) return null;
  const m = String(s).match(/(\d+(?:\.\d+)?)\s*%/);
  return m ? parseFloat(m[1]) : null;
}

/** Borrowing cost: effective rate (interest ÷ debt) + MCA charge rates + lenders. */
function borrowing(d, latest) {
  const events = (d.open_charges_latest_event || d.open_charges || []);
  const lenders = events
    .map((e) => ({
      name: e.holder_name || null, amount: num(e.amount), ratePct: parseRatePct(e.rate_of_interest),
      date: e.date || e.filing_date || null, type: e.type || null,
    }))
    .filter((x) => x.name || x.amount != null);
  // dominant lenders by amount, keep rate info
  lenders.sort((a, b) => (b.amount || 0) - (a.amount || 0));
  const rates = lenders.map((l) => l.ratePct).filter((r) => r != null).sort((a, b) => a - b);
  const chargeRate = rates.length
    ? { minPct: r2(rates[0]), maxPct: r2(rates[rates.length - 1]), medianPct: r2(rates[Math.floor(rates.length / 2)]), count: rates.length }
    : null;
  const eff = latest && latest.interest != null && latest.totalDebt ? r2((latest.interest / latest.totalDebt) * 100) : null;
  if (!lenders.length && eff == null) return null;
  return {
    effectiveRatePct: eff,
    chargeRate,
    lenders: lenders.slice(0, 8),
    note: eff != null ? 'Effective rate = interest expense ÷ total debt (from the filed P&L + balance sheet).' : null,
  };
}

/** Revenue mix: latest filed year with a populated revenue_breakup; + forex export proxy. */
function revenueMix(years, d, latest) {
  let hit = null;
  for (const f of years) { // newest first
    const rb = f.pnl?.revenue_breakup;
    if (!rb) continue;
    const mfg = (rb.sale_of_goods_manufactured_domestic || 0) + (rb.sale_of_goods_manufactured_export || 0);
    const trd = (rb.sale_of_goods_traded_domestic || 0) + (rb.sale_of_goods_traded_export || 0);
    const svc = (rb.sale_or_supply_of_services_domestic || 0) + (rb.sale_or_supply_of_services_export || 0);
    const exp = (rb.sale_of_goods_manufactured_export || 0) + (rb.sale_of_goods_traded_export || 0) + (rb.sale_or_supply_of_services_export || 0);
    const tot = mfg + trd + svc;
    if (tot > 0) { hit = { f, mfg, trd, svc, exp, tot }; break; }
  }
  const act = (d.principal_business_activities || [])[0]?.business_activity_description
    || (d.industry_segments || [])[0]?.segments?.join(', ') || null;
  // forex earnings ÷ revenue as an export proxy (financial_parameters)
  const fp = (d.financial_parameters || []).find((x) => x.nature === 'STANDALONE') || (d.financial_parameters || [])[0];
  const forexPct = fp && fp.earning_fc != null && latest && latest.revenue ? r2((fp.earning_fc / latest.revenue) * 100) : null;
  if (!hit) {
    return { available: false, fy: null, manufacturedPct: null, tradedPct: null, servicesPct: null, exportPct: null, domesticPct: null, forexEarningsPct: forexPct, activity: act, note: 'Revenue split (manufactured vs traded) not itemised in the MCA filings.' };
  }
  const { f, mfg, trd, svc, exp, tot } = hit;
  return {
    available: true, fy: fyLabel(f.year),
    manufacturedPct: r2((mfg / tot) * 100), tradedPct: r2((trd / tot) * 100), servicesPct: r2((svc / tot) * 100),
    exportPct: r2((exp / tot) * 100), domesticPct: r2(((tot - exp) / tot) * 100), forexEarningsPct: forexPct,
    activity: act, note: null,
  };
}

/** Analyst metrics computed from the filed statements (no new data). */
function analyticsOf(series, fpByYear) {
  if (!series.length) return null;
  const cur = series[series.length - 1];
  const prev = series.length >= 2 ? series[series.length - 2] : null;
  const gfa = (rec) => (rec == null ? null : (rec.grossFixedAssets ?? (fpByYear[rec.year]?.gross_fixed_assets ?? null)));

  // DuPont RoE = net margin × asset turnover × equity multiplier
  let dupont = null;
  if (cur.revenue && cur.totalAssets && cur.netWorth) {
    const nm = cur.pat != null ? cur.pat / cur.revenue : null;
    const at = cur.revenue / cur.totalAssets;
    const em = cur.totalAssets / cur.netWorth;
    dupont = { netMarginPct: nm != null ? r2(nm * 100) : null, assetTurnover: r2(at), equityMultiplier: r2(em), roePct: nm != null ? r2(nm * at * em * 100) : null };
  }

  // Altman Z' (private firms): 0.717 X1 + 0.847 X2 + 3.107 X3 + 0.420 X4 + 0.998 X5
  let altman = null;
  if (cur.totalAssets && cur.netWorth != null) {
    const TA = cur.totalAssets;
    const wc = cur.currentAssets != null && cur.currentLiabilities != null ? cur.currentAssets - cur.currentLiabilities : null;
    const re = cur.reservesAndSurplus, ebit = cur.ebit, totalLiab = TA - cur.netWorth;
    const x1 = wc != null ? wc / TA : null, x2 = re != null ? re / TA : null, x3 = ebit != null ? ebit / TA : null,
      x4 = totalLiab ? cur.netWorth / totalLiab : null, x5 = cur.revenue != null ? cur.revenue / TA : null;
    if ([x1, x2, x3, x4, x5].every((v) => v != null && isFinite(v))) {
      const z = r2(0.717 * x1 + 0.847 * x2 + 3.107 * x3 + 0.420 * x4 + 0.998 * x5);
      const zone = z > 2.9 ? 'safe' : z >= 1.23 ? 'grey' : 'distress';
      altman = { z, zone, model: "Altman Z' (private manufacturers)", components: { x1: r2(x1), x2: r2(x2), x3: r2(x3), x4: r2(x4), x5: r2(x5) } };
    }
  }

  // Piotroski F-score (CFO-based signals untestable when no cash-flow statement is filed)
  let piotroski = null;
  if (prev) {
    const roa = (r) => (r.pat != null && r.totalAssets ? r.pat / r.totalAssets : null);
    const at = (r) => (r.revenue != null && r.totalAssets ? r.revenue / r.totalAssets : null);
    const ltLev = (r) => (r.longTermBorrowings != null && r.totalAssets ? r.longTermBorrowings / r.totalAssets : null);
    const sig = [
      { label: 'Positive return on assets', pass: roa(cur) != null ? roa(cur) > 0 : null },
      { label: 'Rising return on assets', pass: roa(cur) != null && roa(prev) != null ? roa(cur) > roa(prev) : null },
      { label: 'Lower long-term leverage', pass: ltLev(cur) != null && ltLev(prev) != null ? ltLev(cur) < ltLev(prev) : null },
      { label: 'Improving current ratio', pass: cur.currentRatio != null && prev.currentRatio != null ? cur.currentRatio > prev.currentRatio : null },
      { label: 'No equity dilution', pass: cur.shareCapital != null && prev.shareCapital != null ? cur.shareCapital <= prev.shareCapital : null },
      { label: 'Rising gross margin', pass: cur.grossMargin != null && prev.grossMargin != null ? cur.grossMargin > prev.grossMargin : null },
      { label: 'Rising asset turnover', pass: at(cur) != null && at(prev) != null ? at(cur) > at(prev) : null },
    ];
    const testable = sig.filter((s) => s.pass !== null);
    piotroski = { score: testable.filter((s) => s.pass).length, outOf: testable.length, signals: sig, note: 'Piotroski F — 7 of 9 signals testable; the 2 cash-flow signals need a cash-flow statement, not filed in AOC-4.' };
  }

  // Free cash flow — approximation from P&L + balance sheet (no cash-flow statement filed)
  let fcf = null;
  if (prev) {
    const capex = gfa(cur) != null && gfa(prev) != null ? Math.max(0, gfa(cur) - gfa(prev)) : null;
    const wc = (r) => (r.currentAssets != null && r.currentLiabilities != null ? r.currentAssets - r.currentLiabilities : null);
    const dWC = wc(cur) != null && wc(prev) != null ? wc(cur) - wc(prev) : null;
    if (cur.ebitda != null && capex != null && dWC != null) {
      const tax = cur.incomeTax || 0;
      fcf = { value: r2(cur.ebitda - tax - capex - dWC), capex: r2(capex), deltaWC: r2(dWC), fy: cur.fy, method: 'Approx: EBITDA − tax − capex (ΔGross fixed assets) − ΔWorking capital. No cash-flow statement is filed in AOC-4.' };
    }
  }

  // Earnings quality — balance-sheet (Sloan) accruals ÷ average total assets
  let accruals = null;
  if (prev && cur.totalAssets && prev.totalAssets) {
    const d2 = (a, b) => (a != null && b != null ? a - b : null);
    const dCA = d2(cur.currentAssets, prev.currentAssets), dCash = d2(cur.cash, prev.cash);
    const dCL = d2(cur.currentLiabilities, prev.currentLiabilities), dSTD = d2(cur.shortTermBorrowings, prev.shortTermBorrowings);
    if (dCA != null && dCash != null && dCL != null && cur.depreciation != null) {
      const acc = (dCA - dCash) - (dCL - (dSTD || 0)) - cur.depreciation;
      const avgTA = (cur.totalAssets + prev.totalAssets) / 2;
      const ratio = r2((acc / avgTA) * 100);
      const quality = ratio == null ? null : ratio <= 5 ? 'high' : ratio <= 10 ? 'moderate' : 'low';
      accruals = { ratioPct: ratio, quality, note: 'Sloan balance-sheet accruals ÷ avg assets — lower is higher earnings quality (profits backed by cash, not accruals).' };
    }
  }

  // Operating leverage — DOL = %ΔEBIT ÷ %ΔRevenue (year on year)
  let operatingLeverage = null;
  if (prev && prev.revenue && prev.ebit && cur.revenue != null && cur.ebit != null) {
    const revG = (cur.revenue - prev.revenue) / Math.abs(prev.revenue);
    const ebitG = (cur.ebit - prev.ebit) / Math.abs(prev.ebit);
    if (revG !== 0 && isFinite(ebitG / revG)) {
      operatingLeverage = { dol: r2(ebitG / revG), fy: cur.fy, note: 'Degree of operating leverage = %ΔEBIT ÷ %ΔRevenue (YoY). High |DOL| = profit swings hard with volume.' };
    }
  }

  return { dupont, piotroski, altman, fcf, accruals, operatingLeverage };
}

const SEV_RANK = { high: 3, medium: 2, low: 1 };
function legalItem(x) {
  return {
    category: x.case_category || x.case_type || null,
    court: x.court || null, status: x.case_status || null,
    severity: x.severity || null, date: x.date || null,
    against: /against this corporate/i.test(x.case_type || ''),
  };
}
function legalItems(arr, cap = 15) {
  return (arr || [])
    .map(legalItem)
    .sort((a, b) => (SEV_RANK[(b.severity || '').toLowerCase()] || 0) - (SEV_RANK[(a.severity || '').toLowerCase()] || 0) || String(b.date || '').localeCompare(String(a.date || '')))
    .slice(0, cap);
}

function legal(d) {
  const lh = d.legal_history || [];
  return {
    total: lh.length,
    against: lh.filter((x) => /against this corporate/i.test(x.case_type || '')).length,
    severe: lh.filter((x) => /high/i.test(x.severity || '')).length,
    pending: lh.filter((x) => /pending/i.test(x.case_status || '')).length,
    financialDisputes: (d.legal_cases_of_financial_disputes || []).length,
    msmeDelays: (d.msme_supplier_payment_delays || []).length,
  };
}

function groupEntities(d) {
  const out = [];
  const take = (node, relation) => {
    if (!node) return;
    const cos = Array.isArray(node) ? node : (node.company || []);
    for (const c of cos || []) out.push({ name: c.legal_name || c.name || null, cin: c.cin || null, relation });
  };
  take(d.holding_entities, 'holding');
  take(d.subsidiary_entities, 'subsidiary');
  take(d.associate_entities, 'associate');
  take(d.joint_ventures, 'joint-venture');
  return out.slice(0, 20);
}

function relatedParty(d) {
  const rpt = (d.related_party_transactions || []).filter((x) => x);
  if (!rpt.length) return null;
  rpt.sort((a, b) => String(b.financial_year || '').localeCompare(String(a.financial_year || '')));
  const latest = rpt[0];
  const counterparties = ['company', 'llp', 'individual', 'others'].reduce((s, k) => s + (Array.isArray(latest[k]) ? latest[k].length : 0), 0);
  return { fy: fyLabel(latest.financial_year), counterparties, note: counterparties ? null : 'No related-party transactions itemised in the latest filing.' };
}

function fundraising(d) {
  return (d.securities_allotment || [])
    .map((s) => ({ date: s.allotment_date || null, instrument: s.instrument || null, amountRaised: num(s.total_amount_raised), securities: num(s.number_of_securities_allotted), type: s.allotment_type || null }))
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
    .slice(0, 8);
}

function headcount(d) {
  const est = d.establishments_registered_with_epfo || [];
  if (!est.length) return { latest: null, establishments: 0, paymentTimeliness: null, band: d.key_indicators?.employee_count || null };
  const latest = est.reduce((s, e) => s + (num(e.no_of_employees) || 0), 0) || null;
  const timeliness = est.map((e) => e.payment_timeliness).filter(Boolean)[0] || null;
  return { latest, establishments: est.length, paymentTimeliness: timeliness, band: d.key_indicators?.employee_count || null };
}

/** din → count of other board seats (overboarding), from director_network. */
function boardsByDin(d) {
  const map = {};
  for (const dir of d.director_network || []) {
    if (dir?.din) map[dir.din] = (dir.network?.companies || []).length;
  }
  return map;
}

function directors(d) {
  const boards = boardsByDin(d);
  return (d.authorized_signatories || [])
    .filter((s) => s && !s.date_of_cessation && s.name)
    .map((s) => ({ name: s.name, designation: s.designation || null, din: s.din || null, boards: s.din != null && boards[s.din] != null ? boards[s.din] : null }))
    .slice(0, 10);
}

function promoterPct(d) {
  const sh = (d.shareholdings || []).filter((x) => /promoter/i.test(x.shareholders || ''));
  if (sh.length) {
    const latest = sh.sort((a, b) => String(b.financial_year || b.year).localeCompare(String(a.financial_year || a.year)))[0];
    if (latest && latest.total_percentage_of_shares != null) return num(latest.total_percentage_of_shares);
  }
  return null;
}

function ownership(d) {
  const prom = promoterPct(d);
  // directors' combined holding (latest fy in director_shareholdings)
  const dsh = d.director_shareholdings || [];
  let directorsHoldingPct = null, fy = null;
  if (dsh.length) {
    const latestFy = dsh.map((x) => x.financial_year).filter(Boolean).sort().slice(-1)[0];
    fy = latestFy ? fyLabel(latestFy) : null;
    const sum = dsh.filter((x) => x.financial_year === latestFy).reduce((s, x) => s + (num(x.percentage_holding) || 0), 0);
    directorsHoldingPct = sum > 0 ? r2(sum) : null;
  }
  // top >5% holder (percentage + type only — no personal names surfaced)
  let topHolderPct = null, topHolderType = null;
  const g5 = d.shareholdings_more_than_five_percent || [];
  if (g5.length) {
    const latest = g5.sort((a, b) => String(b.financial_year || '').localeCompare(String(a.financial_year || '')))[0];
    const cands = [];
    for (const [type, label] of [['individual', 'individual'], ['company', 'body corporate'], ['others', 'other'], ['llp', 'LLP']]) {
      for (const h of latest[type] || []) if (num(h.shareholding_percentage) != null) cands.push({ pct: h.shareholding_percentage, label });
    }
    cands.sort((a, b) => b.pct - a.pct);
    if (cands[0]) { topHolderPct = r2(cands[0].pct); topHolderType = cands[0].label; }
  }
  if (prom == null && directorsHoldingPct == null && topHolderPct == null) return null;
  return { promoterPct: prom, directorsHoldingPct, topHolderPct, topHolderType, fy };
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

// List-typed sections Probe42 sometimes returns as {} instead of []; coerce once.
const LIST_FIELDS = [
  'financials', 'credit_ratings', 'credit_rating_rationale', 'legal_history', 'legal_cases_of_financial_disputes',
  'msme_supplier_payment_delays', 'open_charges', 'open_charges_latest_event', 'securities_allotment',
  'establishments_registered_with_epfo', 'shareholdings', 'director_shareholdings', 'shareholdings_more_than_five_percent',
  'related_party_transactions', 'director_network', 'authorized_signatories', 'defaulter_list', 'financial_parameters',
  'peer_comparison', 'industry_segments', 'principal_business_activities',
];

function extract(report) {
  const d = report.data || {};
  for (const k of LIST_FIELDS) if (!Array.isArray(d[k])) d[k] = [];
  const co = d.company || {};
  const years = pickYears(d.financials); // newest first
  if (!years.length) return null;
  const fpByYear = {};
  for (const fp of d.financial_parameters || []) { if (fp && fp.year && (fp.nature === 'STANDALONE' || !fpByYear[fp.year])) fpByYear[fp.year] = fp; }
  const series = years.slice(0, 10).reverse().map(yearRecord); // oldest → newest for charts
  // backfill grossFixedAssets from financial_parameters where the BS note is absent
  for (const rec of series) { if (rec.grossFixedAssets == null && fpByYear[rec.year]?.gross_fixed_assets != null) rec.grossFixedAssets = num(fpByYear[rec.year].gross_fixed_assets); }
  const latest = yearRecord(years[0]);
  if (latest.grossFixedAssets == null && fpByYear[years[0].year]?.gross_fixed_assets != null) latest.grossFixedAssets = num(fpByYear[years[0].year].gross_fixed_assets);
  const peer = peerMedians(d.peer_comparison, years[0].year);
  const ki = d.key_indicators || {};
  const history = ratingHistory(d.credit_ratings);
  const inc = (d.credit_ratings || []).some((r) => INC_RE.test(r.rating || '')) || (d.credit_rating_rationale || []).some((r) => INC_RE.test(JSON.stringify(r)));
  const industry = (d.peer_comparison || [])[0]?.bizIndustry || (d.industry_segments || [])[0]?.industry || null;
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
    ratingHistory: history,
    issuerNotCooperating: inc,
    keyIndicators: { revenueBand: ki.revenue || null, profitBand: ki.profit || null, employeeBand: ki.employee_count || null },
    flags: buildFlags(d, latest),
    charges: charges(d.open_charges),
    legal: legal(d),
    legalItems: legalItems(d.legal_history),
    financialDisputeItems: legalItems(d.legal_cases_of_financial_disputes, 10),
    directors: directors(d),
    promoterPct: promoterPct(d),
    ownership: ownership(d),
    borrowing: borrowing(d, latest),
    revenueMix: revenueMix(years, d, latest),
    analytics: analyticsOf(series, fpByYear),
    group: groupEntities(d),
    relatedParty: relatedParty(d),
    fundraising: fundraising(d),
    headcount: headcount(d),
    industry,
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
    const an = profile.analytics || {};
    log.push(`  ✓ ${keys.join(' / ')} — ${profile.latestFy} · rev ₹${L.revenue != null ? (L.revenue / 1e7).toFixed(2) : '?'} Cr · PAT ₹${L.pat != null ? (L.pat / 1e7).toFixed(2) : '?'} Cr${profile.lossMaking ? ' (LOSS)' : ''}${an.altman?.z != null ? ` · Z'=${an.altman.z} (${an.altman.zone})` : ''}${profile.borrowing?.effectiveRatePct != null ? ` · eff.rate ${profile.borrowing.effectiveRatePct}%` : ''}`);
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
