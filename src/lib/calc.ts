// "Show the working" — build an auditable, spreadsheet-style breakdown for any number on the
// dashboard. Each builder reads the SAME live data the screens use, so the window can never
// disagree with the figure it explains. Shape: a title, the plain formula, and rows of
// What → Number → Source (the <CalcSheet/> renders them as an Excel-like grid).
import type { AppData, MaterialKey } from '../types';

export interface CalcRow {
  label: string;
  detail?: string;                 // the inline working, shown under the label (monospace)
  value?: string;                  // the number (right column)
  source?: string;                 // where it comes from
  kind?: 'input' | 'result' | 'sub';
}
export interface CalcData {
  title: string;
  subtitle?: string;
  formula?: string;
  columns?: [string, string, string];
  rows: CalcRow[];
  note?: string;
  sources?: { label: string; url?: string }[];
}

const CR = (n: number) => (n >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `₹${(n / 1e5).toFixed(2)} L` : `₹${Math.round(n).toLocaleString('en-IN')}`);
const NUM = (n: number) => Math.round(n).toLocaleString('en-IN');
const unitOf = (u: string) => (u.toLowerCase() === 'nos' ? 'pc' : u.toLowerCase());
const price = (n: number | null, unit: string) => (n == null ? '—' : `₹${n >= 100 ? Math.round(n) : n >= 10 ? n.toFixed(1) : n.toFixed(2)}/${unitOf(unit)}`);
const short = (s: string) => String(s).replace(/\b(PRIVATE|PVT|LIMITED|LTD|INDIA|\(INDIA\))\b\.?/gi, '').replace(/\(\s*\)/g, '').replace(/\s{2,}/g, ' ').replace(/[.,]\s*$/, '').trim();

const MATFILE: Record<string, string> = {
  dextrose: 'SAP · Dextrose_25_26.XLSX', packaging: 'SAP · PET_25_26.XLSX',
  laminates: 'SAP · Laminates.XLSX', cartons: 'SAP · Laminates.XLSX (per-piece)',
};
const MATNAME: Record<string, string> = {
  dextrose: 'Dextrose', packaging: 'Rigid plastic packaging', laminates: 'Laminates', cartons: 'Aseptic cartons (Tetra Pak)',
};

/** Total yearly spend = net spend per material, summed. */
export function calcTotalSpend(data: AppData): CalcData {
  const by = data.meta.totals.byMaterial as Record<string, number>;
  const rows: CalcRow[] = Object.keys(by).map((k) => ({ label: MATNAME[k] ?? k, value: CR(by[k]), source: MATFILE[k] ?? 'SAP' }));
  rows.push({ label: 'Total yearly spend', value: CR(data.meta.totals.netSpend), kind: 'result', source: 'Sum of the four' });
  return {
    title: 'You spend — total yearly spend',
    subtitle: `${data.meta.dateRange.from} → ${data.meta.dateRange.to}`,
    formula: 'For each material: Σ (amount received − returns), from SAP goods-receipts. “102” reversal lines subtract.',
    rows,
    note: 'Net spend: returns are subtracted. Each SAP file reconciles exactly to its own embedded grand-total row.',
  };
}

/** Total price saving = sum of per-material savings (itself Σ gap × qty over 2-supplier items). */
export function calcTotalSave(data: AppData): CalcData {
  const v = data.value!;
  const rows: CalcRow[] = v.savingsByMaterial
    .filter((s) => s.savings > 0)
    .sort((a, b) => b.savings - a.savings)
    .map((s) => ({ label: s.displayName, value: CR(s.savings), source: 'items bought from 2+ suppliers' }));
  rows.push({ label: 'Total you can save / year', value: CR(v.headline.costSavings), kind: 'result', source: 'Sum' });
  return {
    title: 'You can save — yearly price saving',
    formula: 'For each item: (your price − the cheapest price you already pay) × quantity. Added across all items. Only items bought from 2+ suppliers count.',
    rows,
    note: 'A recurring, every-year P&L saving. Never added to the one-time cash free-up.',
  };
}

/** One-time cash freed = spend × 30/365 for advance / pay-on-receipt suppliers. */
export function calcCashFreed(data: AppData): CalcData {
  const v = data.value!;
  const rows: CalcRow[] = v.headline.cashFreedBy.map((c) => ({
    label: short(c.name),
    detail: `${CR(c.spend)} × 30 ÷ 365  ·  ${c.termCategory === 'advance' ? '100% advance' : 'pay on receipt'}`,
    value: CR(c.cashFreed), source: 'SAP spend × term',
  }));
  rows.push({ label: 'Total one-time cash freed', value: CR(v.headline.cashFreed), kind: 'result', source: 'Sum' });
  return {
    title: 'Cash you can free up (one-time)',
    formula: 'Yearly spend × 30 ÷ 365 — for each supplier you pay in advance or on delivery, if moved onto 30-day credit.',
    rows,
    note: 'One-time working-capital release, NOT a yearly saving — and never added to the price saving.',
  };
}

/** Per-supplier price saving, broken down item by item (the real excess rows). */
export function calcSupplierSave(data: AppData, vendorKey: string, materialKey: MaterialKey, supplierName: string): CalcData {
  const v = data.value!;
  const M = v.materials[materialKey];
  const rows: CalcRow[] = [];
  let total = 0;
  if (M) {
    const items = M.skus
      .map((s) => ({ s, vp: s.vendors.find((x) => x.vendorKey === vendorKey) }))
      .filter((x) => x.vp && x.vp.excess > 0)
      .sort((a, b) => (b.vp!.excess) - (a.vp!.excess));
    for (const { s, vp } of items) {
      total += vp!.excess;
      rows.push({
        label: s.desc,
        detail: `(${price(vp!.price, s.unit)} − ${price(s.bestPrice, s.unit)}) × ${NUM(vp!.qty)} ${unitOf(s.unit)}`,
        value: CR(vp!.excess), source: 'SAP goods-receipts',
      });
    }
  }
  const n = rows.length;
  rows.push({ label: 'Total you can save / year', value: CR(total), kind: 'result', source: `${n} item${n === 1 ? '' : 's'}` });
  return {
    title: `Can save — ${short(supplierName)}`,
    subtitle: MATNAME[materialKey] ?? materialKey,
    formula: 'Per item: (their price − the cheapest price you already pay for it) × quantity you buy. Prices are volume-weighted = total ₹ ÷ total qty.',
    rows,
    note: 'Measured against the lowest price you yourself paid for the exact same item this year (returns excluded, units never mixed).',
  };
}

/** Cash freed on one supplier at a target credit length. */
export function calcCreditCash(opts: { name: string; spend: number; youGet: number; target: number; termText: string | null }): CalcData {
  const { name, spend, youGet, target, termText } = opts;
  const extra = Math.max(0, target - youGet);
  const cash = (spend * extra) / 365;
  return {
    title: `Cash freed at ${target}-day credit — ${short(name)}`,
    formula: 'Yearly spend × (target days − credit you already get) ÷ 365.',
    rows: [
      { label: 'Yearly spend with them', value: CR(spend), source: 'SAP goods-receipts' },
      { label: 'Credit you get now', value: `${youGet} days`, source: termText || 'SAP vendor master' },
      { label: 'Target credit', value: `${target} days`, source: 'your lever' },
      { label: 'Extra days gained', value: `${extra} days`, source: 'target − now' },
      { label: `Cash freed = ${CR(spend)} × ${extra} ÷ 365`, value: CR(cash), kind: 'result', source: 'one-time' },
    ],
    note: 'One-time cash you stop handing over early — not a price cut.',
  };
}

/** Stock age for one supplier-material: how the average is formed. */
export function calcStockAge(opts: { name: string; material: MaterialKey; avgAgeDays: number; avgShelfDays: number | null; receipts: number; grade: string | null; freshestName?: string; freshestDays?: number }): CalcData {
  const { name, material, avgAgeDays, avgShelfDays, receipts, grade, freshestName, freshestDays } = opts;
  const rows: CalcRow[] = [
    { label: 'Deliveries measured', value: `${receipts}`, source: 'SAP goods-receipts' },
    { label: 'Average stock age', detail: 'avg( receipt date − manufacture date ) over every delivery', value: `${avgAgeDays} days`, source: 'SAP: Posting date, Date of Manufacture', kind: 'result' },
  ];
  if (avgShelfDays != null) rows.push({ label: 'Average shelf life left', detail: 'avg( expiry − receipt date )', value: `${avgShelfDays} days (~${Math.round(avgShelfDays / 30)} mo)`, source: 'SAP: SLED/BBD' });
  rows.push({ label: 'Freshness grade', value: grade === 'old' ? 'Old ( >90d )' : grade === 'ok' ? 'Okay ( 31–90d )' : grade === 'fresh' ? 'Fresh ( ≤30d )' : '—', source: 'grading rule' });
  if (freshestName && freshestDays != null) rows.push({ label: `Older than the freshest you get (${freshestName})`, value: `${Math.max(0, avgAgeDays - freshestDays)} days older`, source: `${freshestDays}d` });
  return {
    title: `Stock age — ${short(name)}`,
    subtitle: MATNAME[material] ?? material,
    formula: 'Per delivery: receipt date − manufacture date. Averaged across all deliveries (each delivery counts once — a plain average, not volume-weighted).',
    rows,
    note: 'Measured from the manufacture date stamped on every goods-receipt.',
  };
}

/** Receivable (debtor) days — how long their own customers take to pay them.
 *  Sourced as Munshot API. Where the raw trade-receivables figure is on file, the
 *  full division is shown; otherwise the formula + the figure. */
export function calcReceivables(data: AppData, vendorKey: string, supplierName: string): CalcData | null {
  const fin = data.financials?.vendors[vendorKey];
  const days = fin?.metrics?.receivableDays;
  if (!fin || days == null) return null;
  const SRC = 'Munshot API';
  const revenue = fin.metrics?.revenue ?? null;
  const tr = fin.probe?.metrics.tradeReceivables ?? null; // raw figure present for filing-based vendors
  const fy = fin.probe?.latestFy ?? fin.asOfFy ?? null;
  const rows: CalcRow[] = [];
  if (tr != null && revenue) {
    rows.push({ label: 'Money their customers owe them (trade receivables)', value: CR(tr), source: SRC });
    rows.push({ label: 'Their yearly revenue', value: CR(revenue), source: SRC });
    rows.push({ label: `Receivable days = ${CR(tr)} ÷ ${CR(revenue)} × 365`, value: `${Math.round(days)} days`, kind: 'result', source: SRC });
  } else {
    if (revenue) rows.push({ label: 'Their yearly revenue', value: CR(revenue), source: SRC });
    rows.push({ label: 'Receivable days', detail: 'trade receivables ÷ yearly revenue × 365', value: `${Math.round(days)} days`, kind: 'result', source: SRC });
  }
  return {
    title: `Credit they give their customers — ${short(supplierName)}`,
    subtitle: fy ? `Their accounts · ${fy}` : 'Their accounts',
    formula: 'Receivable (debtor) days = trade receivables ÷ yearly revenue × 365 — how long, on average, their own customers take to pay them.',
    rows,
    note: 'This is the credit THEY comfortably give their own customers. If it is longer than the credit you get, that gap is your argument to ask for the same.',
    sources: [{ label: 'Munshot API' }],
  };
}
