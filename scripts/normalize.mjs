/**
 * FDC Procurement Intelligence Cockpit — Phase 1 normalizer
 * ---------------------------------------------------------------------------
 * Reads the real FDC SAP exports in data/raw/, applies the audited cleaning
 * rules, and writes traceable clean JSON into public/data/.
 *
 *   node scripts/normalize.mjs        (or: npm run normalize)
 *
 * GOLDEN RULE: every number written here is computed from the raw files.
 * Nothing is estimated, sampled or fabricated.
 * ---------------------------------------------------------------------------
 */
import * as XLSX from 'xlsx';
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const RAW_DIR = path.join(ROOT, 'data', 'raw');
const OUT_DIR = path.join(ROOT, 'public', 'data');

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
const round = (n, d = 2) => {
  if (n == null || !isFinite(n)) return 0;
  const f = 10 ** d;
  return Math.round(n * f) / f;
};
const num = (v) => {
  if (v == null || v === '') return 0;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''));
  return isFinite(n) ? n : 0;
};
const slug = (s) =>
  String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

function toMonthKey(d) {
  if (!(d instanceof Date) || isNaN(d)) return null;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
function fmtDate(d) {
  if (!(d instanceof Date) || isNaN(d)) return null;
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Workbook loading — pick the sheet whose header row has the columns we need
// (handles the Laminates file whose data lives on a sheet named "Sheet2").
// ---------------------------------------------------------------------------
function readWorkbook(file) {
  return XLSX.read(readFileSync(path.join(RAW_DIR, file)), { cellDates: true });
}
function sheetRows(ws) {
  return XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: null });
}
function headerMap(headerRow) {
  // first occurrence of each header name wins (SAP export repeats a few names)
  const map = {};
  (headerRow || []).forEach((h, i) => {
    const key = String(h ?? '').trim();
    if (key && !(key in map)) map[key] = i;
  });
  return map;
}
function pickSheet(wb, mustHave) {
  for (const sn of wb.SheetNames) {
    const rows = sheetRows(wb.Sheets[sn]);
    const hdr = (rows[0] || []).map((x) => String(x ?? '').trim().toLowerCase());
    if (mustHave.every((m) => hdr.includes(m.toLowerCase()))) return { sheetName: sn, rows };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Classify the files in data/raw/ by CONTENT (never a hardcoded filename)
// ---------------------------------------------------------------------------
function classifyFiles() {
  const files = readdirSync(RAW_DIR).filter((f) => /\.xlsx$/i.test(f));
  let vendorMaster = null;
  const txns = [];

  for (const file of files) {
    const wb = readWorkbook(file);
    const asVendor = pickSheet(wb, ['Vendor name1', 'Payment Terms']);
    const asTxn = pickSheet(wb, ['Material Description', 'Amount in LC']);
    if (asVendor && !asTxn) {
      vendorMaster = { file, ...asVendor };
    } else if (asTxn) {
      txns.push({ file, ...asTxn, material: labelMaterial(file, asTxn.rows) });
    }
  }
  return { vendorMaster, txns, allFiles: files };
}

// Material label from filename keyword, with a content fallback.
function labelMaterial(file, rows) {
  const name = file.toLowerCase();
  if (name.includes('dextrose')) return 'dextrose';
  if (name.includes('pet')) return 'packaging';
  if (name.includes('lamin')) return 'laminates';
  // content fallback
  const hdr = headerMap(rows[0]);
  const di = hdr['Material Description'];
  const descs = rows.slice(1).map((r) => String(r?.[di] ?? '').toUpperCase());
  if (descs.some((d) => d.includes('DEXTROSE'))) return 'dextrose';
  if (descs.some((d) => /^(LM |LAM|T-LAM)/.test(d) || d.includes('LAMINATE'))) return 'laminates';
  return 'packaging';
}

// ---------------------------------------------------------------------------
// Material presentation metadata
// ---------------------------------------------------------------------------
const MATERIAL_META = {
  dextrose: {
    key: 'dextrose',
    displayName: 'Dextrose',
    plainName: 'Dextrose (corn-based sugar, a raw material)',
    category: 'Raw material',
    color: '#00973D',
    singleCommodity: true, // one product → vendor prices are directly comparable
  },
  packaging: {
    key: 'packaging',
    displayName: 'Rigid plastic packaging',
    plainName: 'Bottles, caps, preforms & measuring cups',
    category: 'Packaging',
    color: '#2E7CE4',
    singleCommodity: false, // many different items → compare only like-for-like SKUs
  },
  laminates: {
    key: 'laminates',
    displayName: 'Laminates',
    plainName: 'Sachet film (by weight) & ready-to-drink pouches (by piece)',
    category: 'Packaging',
    color: '#EFAE0E',
    singleCommodity: false,
  },
};

// Unify Dextrose description variants into one product (cleaning rule 7).
function normalizeDesc(material, desc) {
  const d = String(desc ?? '').trim();
  if (material === 'dextrose') {
    // "ANHYDROUS DEXTROSE IP (EXMPT)" & "DEXTROSE ANHYDROUS IP (FO)" are one product
    if (/dextrose/i.test(d)) return 'Dextrose Anhydrous IP';
  }
  return d;
}

// ---------------------------------------------------------------------------
// Vendor master → canonical vendors (cleaning rule 5)
// ---------------------------------------------------------------------------
function normVendorName(name) {
  return String(name ?? '')
    .toUpperCase()
    .replace(/[.,]/g, ' ')
    .replace(/\b(PVT|PRIVATE|LTD|LIMITED)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Public listing status — a PUBLIC classification (NOT from the FDC files),
// kept only as a hook for the upcoming vendor-financials phase. No figures.
const LISTED = {
  'gujarat-ambuja-exports': { exchange: 'NSE/BSE', ticker: 'GAEL' },
  'sayaji-industries': { exchange: 'BSE', ticker: '507692' },
  uflex: { exchange: 'NSE/BSE', ticker: 'UFLEX' },
  'huhtamaki-india': { exchange: 'NSE/BSE', ticker: 'HUHTAMAKI' },
  'empire-industries': { exchange: 'BSE', ticker: '509525' },
  'berry-global-india': { exchange: 'NYSE (parent)', ticker: 'BERY' },
};

function parsePaymentTerms(pmtCode, payText) {
  const code = String(pmtCode ?? '').trim().toUpperCase();
  const text = String(payText ?? '').trim();
  if (code === 'P001' || /advance/i.test(text))
    return { category: 'advance', days: null, rank: -1, text: text || 'Advance 100%' };
  if (code === '0001' || /immediate/i.test(text))
    return { category: 'immediate', days: 0, rank: 0, text: text || 'Immediate' };
  if (code === 'P042') return { category: 'net', days: 30, rank: 30, text: text || '30 Days After Receipt' };
  if (code === 'P043') return { category: 'net', days: 45, rank: 45, text: text || '45 Days After Receipt' };
  if (code === 'P044') return { category: 'net', days: 60, rank: 60, text: text || '60 Days After Receipt' };
  const m = text.match(/(\d+)\s*day/i);
  if (m) return { category: 'net', days: +m[1], rank: +m[1], text };
  return { category: 'unknown', days: null, rank: 999, text: text || '—' };
}

function buildVendorIndex(vendorMaster) {
  const H = headerMap(vendorMaster.rows[0]);
  const col = {
    accGrp: H['Acc. Grp'], code: H['Vendor code'], name: H['Vendor name1'],
    country: H['Country'], pmtTerm: H['Pmt. Term'], payTerms: H['Payment Terms'],
  };
  const byCode = {};        // vendorCode -> master record
  const canonical = {};     // canonicalKey -> canonical vendor

  for (let i = 1; i < vendorMaster.rows.length; i++) {
    const r = vendorMaster.rows[i];
    if (!r || r[col.code] == null || r[col.code] === '') continue;
    const code = String(r[col.code]).trim();
    const name = String(r[col.name] ?? '').trim();
    const normName = normVendorName(name);
    const key = slug(normName);
    const terms = parsePaymentTerms(r[col.pmtTerm], r[col.payTerms]);

    const rec = {
      code,
      name,
      normName,
      key,
      accGrp: String(r[col.accGrp] ?? '').trim(),
      country: String(r[col.country] ?? '').trim(),
      pmtTermCode: String(r[col.pmtTerm] ?? '').trim(),
      terms,
    };
    byCode[code] = rec;

    if (!canonical[key]) {
      canonical[key] = {
        key,
        name,
        normName,
        underlyingCodes: [],
        accGrp: rec.accGrp,
        country: rec.country,
        pmtTermCode: rec.pmtTermCode,
        terms,
      };
    }
    const c = canonical[key];
    c.underlyingCodes.push(code);
    // prefer the longest original name as the canonical display label
    if (name.length > c.name.length) c.name = name;
  }
  return { byCode, canonical, col };
}

// ---------------------------------------------------------------------------
// Parse one transaction file into clean records
// ---------------------------------------------------------------------------
function parseTxn(txn) {
  const H = headerMap(txn.rows[0]);
  const col = {
    posting: H['Posting Date'], docDate: H['Document Date'], entry: H['Entry Date'],
    matCode: H['Material'], desc: H['Material Description'], vendor: H['Vendor'],
    po: H['Purchase Order'], matDoc: H['Material Document'],
    qty: H['Qty in Un. of Entry'], unit: H['Unit of Entry'], amt: H['Amount in LC'],
    mvt: H['Movement Type'], mvtText: H['Movement Type Text'], dc: H['Debit/Credit Ind.'],
    plant: H['Plant'], name1: H['Name 1'], valType: H['Valuation Type'],
  };
  const records = [];
  let droppedTotalRows = 0;
  let totalRowValue = null;

  for (let i = 1; i < txn.rows.length; i++) {
    const r = txn.rows[i];
    if (!r || r.every((x) => x == null || x === '')) continue;
    const pd = r[col.posting];
    // Cleaning rule 2: drop the embedded grand-total row (blank Posting Date)
    if (pd == null || pd === '') {
      droppedTotalRows++;
      totalRowValue = num(r[col.amt]);
      continue;
    }
    const posting = pd instanceof Date ? pd : new Date(pd);
    records.push({
      material: txn.material,
      posting,
      month: toMonthKey(posting),
      matCode: String(r[col.matCode] ?? '').trim(),
      desc: normalizeDesc(txn.material, r[col.desc]),
      rawDesc: String(r[col.desc] ?? '').trim(),
      vendorCode: String(r[col.vendor] ?? '').trim(),
      po: String(r[col.po] ?? '').trim(),
      qty: num(r[col.qty]),
      unit: String(r[col.unit] ?? '').trim(),
      amt: num(r[col.amt]),
      mvt: String(r[col.mvt] ?? '').trim(),
      mvtText: String(r[col.mvtText] ?? '').trim(),
      dc: String(r[col.dc] ?? '').trim(),
      plant: String(r[col.plant] ?? '').trim(),
      plantName: String(r[col.name1] ?? '').trim(),
    });
  }
  return {
    material: txn.material, file: txn.file, sheetName: txn.sheetName,
    records, droppedTotalRows, totalRowValue,
  };
}

// ---------------------------------------------------------------------------
// Generic grouped accumulator for signed net + 101-receipt price basis
// ---------------------------------------------------------------------------
function makeAgg() {
  return { netSpend: 0, netQty: 0, recSpend: 0, recQty: 0, receiptCount: 0, reversalCount: 0, prices: [] };
}
function addToAgg(a, rec) {
  a.netSpend += rec.amt;      // signed → reversals subtract (rule 3)
  a.netQty += rec.qty;        // signed
  if (rec.mvt === '101') {
    a.receiptCount++;
    if (rec.qty > 0) {
      a.recSpend += rec.amt;  // price basis = 101 receipts, qty>0 only (rule 4)
      a.recQty += rec.qty;
      a.prices.push(rec.amt / rec.qty);
    }
  } else if (rec.mvt === '102') {
    a.reversalCount++;
  }
}
const vwap = (a) => (a.recQty > 0 ? a.recSpend / a.recQty : null);
const minPrice = (a) => (a.prices.length ? Math.min(...a.prices) : null);
const maxPrice = (a) => (a.prices.length ? Math.max(...a.prices) : null);
// return rate = reversed goods-receipt lines as a % of 101 receipt lines (rule 3)
const returnRate = (a) => (a.receiptCount > 0 ? (a.reversalCount / a.receiptCount) * 100 : 0);

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------
function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const { vendorMaster, txns, allFiles } = classifyFiles();

  // Guard: must have exactly the pieces we need
  if (!vendorMaster) throw new Error('Vendor master file (Vendor name1 + Payment Terms) not found in data/raw/');
  const haveMaterials = new Set(txns.map((t) => t.material));
  const missing = ['dextrose', 'packaging', 'laminates'].filter((m) => !haveMaterials.has(m));
  if (txns.length < 3 || missing.length) {
    throw new Error(
      `Expected 3 transaction files (dextrose, packaging, laminates). ` +
      `Found ${txns.length}. Missing material(s): ${missing.join(', ') || 'none'}. ` +
      `Files seen: ${allFiles.join(', ')}`
    );
  }

  const vIdx = buildVendorIndex(vendorMaster);
  const parsed = txns.map(parseTxn);

  // map a vendorCode → canonical vendor (fall back to the raw code if unseen)
  const canonicalOf = (code) => {
    const m = vIdx.byCode[code];
    if (m) return vIdx.canonical[m.key];
    const key = slug(`vendor-${code}`);
    if (!vIdx.canonical[key]) {
      vIdx.canonical[key] = {
        key, name: `Vendor ${code}`, normName: `VENDOR ${code}`, underlyingCodes: [code],
        accGrp: '', country: '', pmtTermCode: '',
        terms: { category: 'unknown', days: null, rank: 999, text: '—' },
      };
    }
    return vIdx.canonical[key];
  };

  // ---- Accumulators ------------------------------------------------------
  const matAgg = {};                 // material -> { total, byUnit, byMonthUnit, bySkuUnit, byVendorUnit, byPlantUnit }
  const vendorAgg = {};              // vendorKey -> { total, byUnit, byMaterialUnit }
  const allDates = [];

  for (const m of Object.keys(MATERIAL_META)) {
    matAgg[m] = {
      total: makeAgg(),
      byUnit: {},            // unit -> agg
      byMonthUnit: {},       // `${unit}|${month}` -> agg
      bySkuUnit: {},         // `${unit}|${desc}` -> { agg, vendors:Set, desc, unit }
      byVendorUnit: {},      // `${vendorKey}|${unit}` -> { agg, vendorKey, unit }
      byPlantUnit: {},       // `${plant}|${unit}` -> { agg, plant, plantName, unit }
      bySkuVendor: {},       // `${unit}|${desc}||${vendorKey}` -> { agg, desc, unit, vendorKey }
      bySkuMonth: {},        // `${unit}|${desc}|${month}` -> agg  (for per-SKU price trend)
    };
  }

  for (const p of parsed) {
    const M = matAgg[p.material];
    for (const rec of p.records) {
      const cv = canonicalOf(rec.vendorCode);
      const vKey = cv.key;
      const unit = rec.unit || '—';
      allDates.push(rec.posting);

      // ---- material totals / per-unit / per-month / per-sku / per-vendor / per-plant
      addToAgg(M.total, rec);
      (M.byUnit[unit] ||= makeAgg()); addToAgg(M.byUnit[unit], rec);

      const muk = `${unit}|${rec.month}`;
      (M.byMonthUnit[muk] ||= makeAgg()); addToAgg(M.byMonthUnit[muk], rec);

      const sk = `${unit}|${rec.desc}`;
      (M.bySkuUnit[sk] ||= { agg: makeAgg(), vendors: new Set(), desc: rec.desc, unit });
      addToAgg(M.bySkuUnit[sk].agg, rec); M.bySkuUnit[sk].vendors.add(vKey);

      const vk = `${vKey}|${unit}`;
      (M.byVendorUnit[vk] ||= { agg: makeAgg(), vendorKey: vKey, unit });
      addToAgg(M.byVendorUnit[vk].agg, rec);

      const pk = `${rec.plant}|${unit}`;
      (M.byPlantUnit[pk] ||= { agg: makeAgg(), plant: rec.plant, plantName: rec.plantName, unit });
      addToAgg(M.byPlantUnit[pk].agg, rec);

      const svk = `${unit}|${rec.desc}||${vKey}`;
      (M.bySkuVendor[svk] ||= { agg: makeAgg(), desc: rec.desc, unit, vendorKey: vKey });
      addToAgg(M.bySkuVendor[svk].agg, rec);

      const smk = `${unit}|${rec.desc}|${rec.month}`;
      (M.bySkuMonth[smk] ||= makeAgg());
      addToAgg(M.bySkuMonth[smk], rec);

      // ---- vendor-centric
      (vendorAgg[vKey] ||= { total: makeAgg(), byUnit: {}, byMaterialUnit: {}, byMonth: {}, materials: new Set() });
      const VA = vendorAgg[vKey];
      addToAgg(VA.total, rec);
      (VA.byUnit[unit] ||= makeAgg()); addToAgg(VA.byUnit[unit], rec);
      VA.materials.add(p.material);
      const vmk = `${p.material}|${unit}`;
      (VA.byMaterialUnit[vmk] ||= { agg: makeAgg(), material: p.material, unit });
      addToAgg(VA.byMaterialUnit[vmk].agg, rec);
      (VA.byMonth[rec.month] ||= makeAgg()); addToAgg(VA.byMonth[rec.month], rec);
    }
  }

  allDates.sort((a, b) => a - b);
  const dateRange = { from: fmtDate(allDates[0]), to: fmtDate(allDates[allDates.length - 1]) };
  const months = [...new Set(allDates.map((d) => toMonthKey(d)))].sort();

  // choose the primary (dominant-by-spend) unit for a per-unit map
  const primaryUnit = (byUnit) =>
    Object.entries(byUnit).sort((a, b) => b[1].netSpend - a[1].netSpend)[0]?.[0] ?? '—';

  const vendorName = (k) => vIdx.canonical[k]?.name ?? k;
  const vendorColor = {}; // assigned after we know spend ranking

  // =========================================================================
  // vendors.json
  // =========================================================================
  const vendorList = Object.entries(vendorAgg).map(([key, VA]) => {
    const cv = vIdx.canonical[key];
    const pUnit = primaryUnit(VA.byUnit);
    const unitTotals = Object.entries(VA.byUnit).map(([unit, a]) => ({
      unit,
      netSpend: round(a.netSpend),
      netQty: round(a.netQty, 3),
      vwap: vwap(a) == null ? null : round(vwap(a), 3),
      receiptCount: a.receiptCount,
      reversalCount: a.reversalCount,
    })).sort((x, y) => y.netSpend - x.netSpend);

    const perMaterial = Object.values(VA.byMaterialUnit).map((o) => ({
      materialKey: o.material,
      material: MATERIAL_META[o.material].displayName,
      unit: o.unit,
      netSpend: round(o.agg.netSpend),
      netQty: round(o.agg.netQty, 3),
      avgPrice: vwap(o.agg) == null ? null : round(vwap(o.agg), 3),
      receiptCount: o.agg.receiptCount,
      reversalCount: o.agg.reversalCount,
    })).sort((x, y) => y.netSpend - x.netSpend);

    const monthly = months.map((mo) => {
      const a = VA.byMonth[mo];
      return { month: mo, spend: a ? round(a.netSpend) : 0, qty: a ? round(a.netQty, 3) : 0 };
    });

    const listed = LISTED[key];
    return {
      key,
      name: cv.name,
      monthly,
      underlyingCodes: cv.underlyingCodes,
      accGrp: cv.accGrp,
      accGrpLabel: cv.accGrp === 'ZDOM' ? 'Domestic' : cv.accGrp === 'ZLLM' ? 'Loan-license' : cv.accGrp,
      country: cv.country,
      pmtTermCode: cv.pmtTermCode,
      termCategory: cv.terms.category,
      termDays: cv.terms.days,
      termRank: cv.terms.rank,
      termText: cv.terms.text,
      worstTerms: cv.terms.category === 'advance' || cv.terms.category === 'immediate',
      materialsSupplied: [...VA.materials].map((m) => MATERIAL_META[m].displayName),
      materialKeys: [...VA.materials],
      primaryUnit: pUnit,
      totalNetSpend: round(VA.total.netSpend),
      totalNetQty: round(VA.byUnit[pUnit]?.netQty ?? 0, 3),
      blendedAvgPrice: vwap(VA.byUnit[pUnit]) == null ? null : round(vwap(VA.byUnit[pUnit]), 3),
      multiUnit: Object.keys(VA.byUnit).length > 1,
      unitTotals,
      receiptCount: VA.total.receiptCount,
      reversalCount: VA.total.reversalCount,
      reversalRatePct: round(returnRate(VA.total), 2),
      isListed: !!listed,
      listing: listed ? { exchange: listed.exchange, ticker: listed.ticker } : null,
      perMaterial,
    };
  }).sort((a, b) => b.totalNetSpend - a.totalNetSpend);

  // Stable vendor colour by overall spend rank (reused everywhere). Pure alert
  // red (#D91701) and orange (#F36D06) are deliberately excluded — the brand
  // kit reserves those for warnings, so categorical vendor colours never clash
  // with risk signals.
  const VENDOR_PALETTE = [
    '#00973D', '#2E7CE4', '#EFAE0E', '#8E44AD', '#1ABC9C', '#00612D',
    '#2471A3', '#B8860B', '#6C3483', '#148F77', '#27AE60', '#2C82C9',
    '#9B59B6', '#117A65', '#7D6608', '#1E8449', '#3498DB', '#5B8C2A',
    '#935116', '#0E7C7B', '#A04000', '#16A085', '#1A5276', '#7D3C98',
    '#C9A227', '#6E2C00', '#145A32', '#5499C7',
  ];
  vendorList.forEach((v, i) => {
    v.color = VENDOR_PALETTE[i % VENDOR_PALETTE.length];
    vendorColor[v.key] = v.color;
  });

  // =========================================================================
  // materials.json
  // =========================================================================
  const materialsOut = Object.keys(MATERIAL_META).map((mKey) => {
    const META = MATERIAL_META[mKey];
    const M = matAgg[mKey];
    const pUnit = primaryUnit(M.byUnit);

    const unitTotals = Object.entries(M.byUnit).map(([unit, a]) => ({
      unit,
      netSpend: round(a.netSpend),
      netQty: round(a.netQty, 3),
      vwap: vwap(a) == null ? null : round(vwap(a), 3),
      receiptCount: a.receiptCount,
      reversalCount: a.reversalCount,
    })).sort((x, y) => y.netSpend - x.netSpend);

    // monthly series (primary unit → qty, spend & price are all consistent)
    const monthly = months.map((mo) => {
      const a = M.byMonthUnit[`${pUnit}|${mo}`];
      return {
        month: mo,
        qty: a ? round(a.netQty, 3) : 0,
        spend: a ? round(a.netSpend) : 0,
        avgPrice: a && vwap(a) != null ? round(vwap(a), 3) : null,
      };
    });
    // all-unit monthly spend (money is comparable across units)
    const monthlySpendAll = months.map((mo) => {
      let s = 0;
      for (const u of Object.keys(M.byUnit)) {
        const a = M.byMonthUnit[`${u}|${mo}`];
        if (a) s += a.netSpend;
      }
      return { month: mo, spend: round(s) };
    });

    const skus = Object.values(M.bySkuUnit).map((o) => ({
      desc: o.desc,
      unit: o.unit,
      qty: round(o.agg.netQty, 3),
      spend: round(o.agg.netSpend),
      recQty: round(o.agg.recQty, 3),
      avgPrice: vwap(o.agg) == null ? null : round(vwap(o.agg), 3),
      minPrice: minPrice(o.agg) == null ? null : round(minPrice(o.agg), 3),
      maxPrice: maxPrice(o.agg) == null ? null : round(maxPrice(o.agg), 3),
      vendorCount: o.vendors.size,
    })).sort((a, b) => b.spend - a.spend);

    // per-SKU monthly PRICE trend for the top SKUs (honest, like-for-like —
    // a material-level blended price mixes different products, so we never
    // chart that; we chart one real product at a time instead).
    const topSkuMonthly = skus.slice(0, 12).map((s) => ({
      desc: s.desc,
      unit: s.unit,
      spend: s.spend,
      avgPrice: s.avgPrice,
      minPrice: s.minPrice,
      maxPrice: s.maxPrice,
      vendorCount: s.vendorCount,
      monthly: months.map((mo) => {
        const a = M.bySkuMonth[`${s.unit}|${s.desc}|${mo}`];
        return {
          month: mo,
          qty: a ? round(a.netQty, 3) : 0,
          spend: a ? round(a.netSpend) : 0,
          avgPrice: a && vwap(a) != null ? round(vwap(a), 3) : null,
        };
      }),
    }));

    // one row per vendor for this material (spend across units; price in the
    // vendor's dominant unit within the material so we never blend units)
    const vendorByKey = {};
    for (const o of Object.values(M.byVendorUnit)) {
      (vendorByKey[o.vendorKey] ||= { vendorKey: o.vendorKey, units: {} });
      vendorByKey[o.vendorKey].units[o.unit] = o.agg;
    }
    const vendors = Object.values(vendorByKey).map((v) => {
      const unitEntries = Object.entries(v.units);
      const dom = unitEntries.sort((a, b) => b[1].netSpend - a[1].netSpend)[0];
      const totalSpend = unitEntries.reduce((s, [, a]) => s + a.netSpend, 0);
      return {
        vendorKey: v.vendorKey,
        vendor: vendorName(v.vendorKey),
        color: vendorColor[v.vendorKey],
        unit: dom[0],
        qty: round(dom[1].netQty, 3),
        spend: round(totalSpend),
        avgPrice: vwap(dom[1]) == null ? null : round(vwap(dom[1]), 3),
        multiUnit: unitEntries.length > 1,
      };
    }).sort((a, b) => b.spend - a.spend);

    // inter-plant (primary unit only → like-for-like for a single commodity)
    const plants = Object.values(M.byPlantUnit)
      .filter((o) => o.unit === pUnit)
      .map((o) => ({
        plant: o.plant,
        plantName: o.plantName,
        unit: o.unit,
        qty: round(o.agg.netQty, 3),
        spend: round(o.agg.netSpend),
        avgPrice: vwap(o.agg) == null ? null : round(vwap(o.agg), 3),
      }))
      .sort((a, b) => b.spend - a.spend);

    return {
      ...Object.fromEntries(Object.entries(META)),
      units: Object.keys(M.byUnit),
      primaryUnit: pUnit,
      totalNetSpend: round(M.total.netSpend),
      totalNetQty: round(M.byUnit[pUnit]?.netQty ?? 0, 3),
      vwap: vwap(M.byUnit[pUnit]) == null ? null : round(vwap(M.byUnit[pUnit]), 3),
      receiptCount: M.total.receiptCount,
      reversalCount: M.total.reversalCount,
      reversalRatePct: round(returnRate(M.total), 2),
      skuCount: skus.length,
      vendorCount: vendors.length,
      plantCount: plants.length,
      unitTotals,
      monthly,
      monthlySpendAll,
      skus,
      topSkuMonthly,
      vendors,
      plants,
    };
  });

  // =========================================================================
  // price-gaps.json  (potential saving = arithmetic on real paid prices)
  // =========================================================================
  // helper: build vendor price rows for a set of {vendorKey, agg}
  const buildGap = (vendorAggs) => {
    const rows = vendorAggs
      .filter((o) => vwap(o.agg) != null && o.agg.recQty > 0)
      .map((o) => ({
        vendorKey: o.vendorKey,
        vendor: vendorName(o.vendorKey),
        color: vendorColor[o.vendorKey],
        avgPrice: round(vwap(o.agg), 3),
        recQty: round(o.agg.recQty, 3),
        spend: round(o.agg.recSpend),
      }));
    if (!rows.length) return null;
    const best = Math.min(...rows.map((r) => r.avgPrice));
    const bestRow = rows.find((r) => r.avgPrice === best);
    let potentialSaving = 0;
    for (const r of rows) {
      r.gapVsBest = round(r.avgPrice - best, 3);
      r.gapPct = round(((r.avgPrice - best) / best) * 100, 2);
      r.excessSpend = round((r.avgPrice - best) * r.recQty);
      potentialSaving += (r.avgPrice - best) * r.recQty;
    }
    rows.sort((a, b) => a.avgPrice - b.avgPrice);
    return {
      bestPrice: round(best, 3),
      bestVendorKey: bestRow.vendorKey,
      bestVendor: bestRow.vendor,
      worstPrice: round(Math.max(...rows.map((r) => r.avgPrice)), 3),
      vendorCount: rows.length,
      vendors: rows,
      potentialSaving: round(potentialSaving),
    };
  };

  const priceGaps = { byMaterial: {} };
  for (const mKey of Object.keys(MATERIAL_META)) {
    const META = MATERIAL_META[mKey];
    const M = matAgg[mKey];
    const pUnit = primaryUnit(M.byUnit);

    // per-SKU gaps (always valid — a SKU is one product in one unit)
    const skuGroups = {};
    for (const o of Object.values(M.bySkuVendor)) {
      const sk = `${o.unit}|${o.desc}`;
      (skuGroups[sk] ||= { desc: o.desc, unit: o.unit, vendorAggs: [] });
      skuGroups[sk].vendorAggs.push({ vendorKey: o.vendorKey, agg: o.agg });
    }
    const skus = [];
    let skuSaving = 0;
    let comparable = 0;
    for (const g of Object.values(skuGroups)) {
      const gap = buildGap(g.vendorAggs);
      if (!gap) continue;
      const entry = { desc: g.desc, unit: g.unit, ...gap };
      skus.push(entry);
      if (gap.vendorCount >= 2) { comparable++; skuSaving += gap.potentialSaving; }
    }
    skus.sort((a, b) => b.potentialSaving - a.potentialSaving || b.vendorCount - a.vendorCount);

    if (META.singleCommodity) {
      // Dextrose: one product → compare all vendors at the material level
      const vendorAggs = Object.values(M.byVendorUnit)
        .filter((o) => o.unit === pUnit)
        .map((o) => ({ vendorKey: o.vendorKey, agg: o.agg }));
      const gap = buildGap(vendorAggs);
      priceGaps.byMaterial[mKey] = {
        materialKey: mKey, displayName: META.displayName, level: 'material',
        unit: pUnit, singleCommodity: true,
        ...gap,
        headlineSaving: gap ? gap.potentialSaving : 0,
        skuComparable: comparable, skuTotal: skus.length,
        skus,
      };
    } else {
      // Packaging / Laminates: only like-for-like SKU gaps are meaningful
      priceGaps.byMaterial[mKey] = {
        materialKey: mKey, displayName: META.displayName, level: 'sku',
        unit: pUnit, singleCommodity: false,
        headlineSaving: round(skuSaving),
        skuComparable: comparable, skuTotal: skus.length,
        skus,
      };
    }
  }

  // =========================================================================
  // plants.json  (inter-plant price differences for the same material)
  // =========================================================================
  const plantsOut = { byMaterial: {} };
  for (const mKey of Object.keys(MATERIAL_META)) {
    const META = MATERIAL_META[mKey];
    const M = matAgg[mKey];
    const pUnit = primaryUnit(M.byUnit);
    const rows = Object.values(M.byPlantUnit)
      .filter((o) => o.unit === pUnit)
      .map((o) => ({
        plant: o.plant, plantName: o.plantName, unit: o.unit,
        qty: round(o.agg.netQty, 3), spend: round(o.agg.netSpend),
        avgPrice: vwap(o.agg) == null ? null : round(vwap(o.agg), 3),
        receiptCount: o.agg.receiptCount,
      }))
      .filter((r) => r.avgPrice != null)
      .sort((a, b) => a.avgPrice - b.avgPrice);
    const prices = rows.map((r) => r.avgPrice);
    const min = prices.length ? Math.min(...prices) : null;
    const max = prices.length ? Math.max(...prices) : null;
    plantsOut.byMaterial[mKey] = {
      materialKey: mKey, displayName: META.displayName, unit: pUnit,
      // like-for-like ONLY for a single commodity; otherwise plant SKU mix differs
      likeForLike: META.singleCommodity,
      plantCount: rows.length,
      cheapestPlant: rows[0] ?? null,
      dearestPlant: rows[rows.length - 1] ?? null,
      spread: min != null ? { min: round(min, 3), max: round(max, 3), diff: round(max - min, 3), diffPct: round(((max - min) / min) * 100, 2) } : null,
      plants: rows,
    };
  }

  // =========================================================================
  // payment-terms.json
  // =========================================================================
  const ptVendors = vendorList.map((v) => ({
    vendorKey: v.key,
    vendor: v.name,
    color: v.color,
    termCategory: v.termCategory,
    termDays: v.termDays,
    termRank: v.termRank,
    termText: v.termText,
    worstTerms: v.worstTerms,
    totalSpend: v.totalNetSpend,
    materials: v.materialsSupplied,
    cashFreed15: round(v.totalNetSpend * 15 / 365),
    cashFreed30: round(v.totalNetSpend * 30 / 365),
  })).sort((a, b) => b.totalSpend - a.totalSpend);

  const totalSpendAll = ptVendors.reduce((s, v) => s + v.totalSpend, 0);
  const catAgg = {};
  let weightedDaysNum = 0, weightedDaysDen = 0;
  for (const v of ptVendors) {
    const cat = v.termCategory;
    (catAgg[cat] ||= { category: cat, count: 0, spend: 0 });
    catAgg[cat].count++; catAgg[cat].spend = round(catAgg[cat].spend + v.totalSpend);
    if (v.termDays != null) { weightedDaysNum += v.termDays * v.totalSpend; weightedDaysDen += v.totalSpend; }
  }
  const paymentTerms = {
    totalSpend: round(totalSpendAll),
    weightedAvgTermDays: weightedDaysDen ? round(weightedDaysNum / weightedDaysDen, 1) : null,
    cashFreed15Total: round(totalSpendAll * 15 / 365),
    cashFreed30Total: round(totalSpendAll * 30 / 365),
    worstBySpend: ptVendors.filter((v) => v.worstTerms).sort((a, b) => b.totalSpend - a.totalSpend),
    byCategory: Object.values(catAgg).sort((a, b) => b.spend - a.spend),
    vendors: ptVendors,
  };

  // =========================================================================
  // meta.json
  // =========================================================================
  const sources = parsed.map((p) => {
    const M = matAgg[p.material];
    const ds = p.records.map((r) => r.posting).sort((a, b) => a - b);
    return {
      file: p.file,
      sheet: p.sheetName,
      material: p.material,
      materialName: MATERIAL_META[p.material].displayName,
      rows: p.records.length,
      droppedTotalRows: p.droppedTotalRows,
      embeddedTotalValue: round(p.totalRowValue ?? 0),
      netSpend: round(M.total.netSpend),
      // integrity check: does our signed net reproduce the file's own total row?
      matchesEmbeddedTotal: Math.abs((M.total.netSpend) - (p.totalRowValue ?? 0)) < 1,
      dateRange: { from: fmtDate(ds[0]), to: fmtDate(ds[ds.length - 1]) },
    };
  });

  const meta = {
    app: 'FDC Procurement Intelligence Cockpit',
    phase: 'Phase 1 — Foundation',
    generatedAt: new Date().toISOString(),
    currency: 'INR',
    dateRange,
    vendorMasterFile: vendorMaster.file,
    vendorMasterRows: Object.keys(vIdx.byCode).length,
    canonicalVendorCount: vendorList.length,
    sources,
    totals: {
      netSpend: round(Object.values(matAgg).reduce((s, M) => s + M.total.netSpend, 0)),
      byMaterial: Object.fromEntries(Object.keys(MATERIAL_META).map((k) => [k, round(matAgg[k].total.netSpend)])),
    },
    materialMeta: Object.values(MATERIAL_META).map((m) => ({
      key: m.key, displayName: m.displayName, plainName: m.plainName,
      category: m.category, color: m.color,
    })),
    notes: [
      'Only real data: every figure is computed from the four SAP exports in data/raw/.',
      'Grand-total rows (blank Posting Date) were dropped from each transaction file.',
      'Spend & quantity totals sum SIGNED values, so 102 reversals subtract (returns).',
      'Unit prices use only 101 goods receipts with qty > 0; units are never mixed.',
      'Laminates mixes KG (film) and NOS (ready-to-drink pouches) — kept strictly separate.',
      'Vendor codes merged to one canonical vendor by normalized name (e.g. Gujarat Ambuja 1002002+1003710, PIK Plastics 1003376+1003248).',
      'Dextrose description variants unified to one product (ANHYDROUS DEXTROSE IP (EXMPT) = DEXTROSE ANHYDROUS IP (FO)).',
      'Listed-company flags are PUBLIC classifications (not from FDC files), kept only as a hook for the upcoming vendor-financials phase; no financials are shown.',
    ],
  };

  // ---- write everything --------------------------------------------------
  const write = (name, obj) => {
    writeFileSync(path.join(OUT_DIR, name), JSON.stringify(obj, null, 2));
    return `${name} (${(JSON.stringify(obj).length / 1024).toFixed(1)} KB)`;
  };
  const written = [
    write('meta.json', meta),
    write('materials.json', materialsOut),
    write('vendors.json', vendorList),
    write('price-gaps.json', priceGaps),
    write('plants.json', plantsOut),
    write('payment-terms.json', paymentTerms),
  ];

  // ---- console summary ---------------------------------------------------
  console.log('\n✓ FDC data normalized → public/data/');
  written.forEach((w) => console.log('   ·', w));
  console.log('\nNet spend by material:');
  for (const [k, v] of Object.entries(meta.totals.byMaterial)) {
    console.log(`   ${MATERIAL_META[k].displayName.padEnd(26)} ₹${(v / 1e7).toFixed(2)} Cr`);
  }
  console.log(`   ${'TOTAL'.padEnd(26)} ₹${(meta.totals.netSpend / 1e7).toFixed(2)} Cr`);
  console.log('\nFile integrity (signed net vs embedded total row):');
  sources.forEach((s) => console.log(`   ${s.material.padEnd(12)} ${s.matchesEmbeddedTotal ? 'MATCH ✓' : 'MISMATCH ✗'}  (${s.rows} rows, ${s.droppedTotalRows} total-row dropped)`));
  console.log('');
}

main();
