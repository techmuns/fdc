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
    // Phase 5 — three fields never used before
    dom: H['Date of Manufacture'], sled: H['SLED/BBD'],
  };
  const asDate = (v) => (v instanceof Date && !isNaN(v) ? v : v ? (isNaN(new Date(v)) ? null : new Date(v)) : null);
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
      dom: asDate(r[col.dom]),   // Date of Manufacture
      sled: asDate(r[col.sled]), // Shelf-Life Expiry / Best-Before
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
// Phase 5 — VALUE layer: turn the clean data into money + the three unused
// fields (Date of Manufacture, SLED/BBD, Purchase Order). Emits value.json.
// ---------------------------------------------------------------------------
const ACTIVE_DAYS = 120; // a vendor not bought from in the last 120 days of the data is "stale"

function readJsonOpt(p) {
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}

// latest ₹/kg market input line per material (never FDC's price — a context benchmark)
function marketRefs() {
  const mk = readJsonOpt(path.join(OUT_DIR, 'market', 'market.json'));
  const out = {};
  if (!mk?.materials) return out;
  for (const [mkey, m] of Object.entries(mk.materials)) {
    // prefer the primary input line in ₹/kg (resin / film / customs)
    const line = (m.lines || []).find((l) => /kg/i.test(l.unit || '')) || (m.lines || [])[0];
    if (!line || !line.points?.length) continue;
    const pts = [...line.points].filter((p) => p.value != null).sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const last = pts[pts.length - 1];
    if (!last) continue;
    out[mkey] = { price: round(last.value, 2), unit: line.unit, label: line.label, grade: m.grading?.note || null, source: line.label, date: last.date, strong: m.grading?.tier === 'strong' };
  }
  return out;
}

function buildValue(parsed, ctx) {
  const { canonicalOf, vendorColor, vendorName, matShareOf } = ctx;
  const all = parsed.flatMap((p) => p.records);
  const maxDate = new Date(Math.max(...all.map((r) => +r.posting)));
  const cutoff = new Date(+maxDate - ACTIVE_DAYS * 86400000);
  const dayDiff = (a, b) => (a instanceof Date && b instanceof Date ? Math.round((a - b) / 86400000) : null);
  const fin = readJsonOpt(path.join(OUT_DIR, 'vendor-financials.json'))?.vendors || {};
  const refs = marketRefs();

  // accumulators
  const skuMap = {};                 // material|matCode|unit -> {desc, v:{vkey:{recSpend,recQty,last}}}
  const vFresh = {}, vOrders = {}, vLast = {}; // keyed `${vkey}|${material}`
  const ledger = [];

  for (const r of all) {
    const cv = canonicalOf(r.vendorCode);
    const vkey = cv.key;
    const rk = `${vkey}|${r.material}`;
    const price = r.mvt === '101' && r.qty > 0 ? round(r.amt / r.qty, 3) : null;
    ledger.push({
      date: fmtDate(r.posting), material: r.material, matCode: r.matCode, desc: r.desc,
      vendorKey: vkey, vendor: cv.name, plant: r.plant, plantName: r.plantName,
      qty: round(r.qty, 3), unit: r.unit, price, amt: round(r.amt), po: r.po || null,
      mvt: r.mvt, isReturn: r.mvt === '102',
    });
    if (!vLast[rk] || r.posting > vLast[rk]) vLast[rk] = r.posting;
    if (r.mvt === '101' && r.qty > 0) {
      const sk = `${r.material}|${r.matCode}|${r.unit}`;
      (skuMap[sk] ||= { material: r.material, matCode: r.matCode, unit: r.unit, desc: r.desc, rawDesc: r.rawDesc, v: {} });
      const vv = (skuMap[sk].v[vkey] ||= { vendorKey: vkey, vendor: cv.name, recSpend: 0, recQty: 0, last: null });
      vv.recSpend += r.amt; vv.recQty += r.qty; if (!vv.last || r.posting > vv.last) vv.last = r.posting;
      const age = dayDiff(r.posting, r.dom), shelf = dayDiff(r.sled, r.posting);
      (vFresh[rk] ||= { ageSum: 0, ageN: 0, shelfSum: 0, shelfN: 0 });
      if (age != null && age >= 0) { vFresh[rk].ageSum += age; vFresh[rk].ageN++; }
      if (shelf != null && shelf >= 0) { vFresh[rk].shelfSum += shelf; vFresh[rk].shelfN++; }
      (vOrders[rk] ||= { pos: new Set(), lines: 0, qty: 0 });
      if (r.po) vOrders[rk].pos.add(r.po);
      vOrders[rk].lines++; vOrders[rk].qty += r.qty;
    }
  }
  ledger.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)); // latest first

  // ---- per-SKU savings (benchmark = cheapest; recommend cheapest ACTIVE) ----
  const materials = {}; const savingsByMaterial = {}; let totalSavings = 0;
  for (const mkey of Object.keys(MATERIAL_META)) {
    materials[mkey] = {
      key: mkey, displayName: MATERIAL_META[mkey].displayName, plainName: MATERIAL_META[mkey].plainName,
      color: MATERIAL_META[mkey].color, singleCommodity: MATERIAL_META[mkey].singleCommodity,
      marketRef: refs[mkey] || null, skus: [], freshness: [], savings: 0, spend: 0, unit: null,
    };
    savingsByMaterial[mkey] = 0;
  }
  const ageGrade = (age) => (age == null ? null : age <= 30 ? 'fresh' : age <= 90 ? 'ok' : 'old');

  for (const sk of Object.values(skuMap)) {
    const vendors = Object.values(sk.v).map((v) => ({
      vendorKey: v.vendorKey, vendor: v.vendor, color: vendorColor[v.vendorKey] || '#707070',
      price: round(v.recSpend / v.recQty, 3), qty: round(v.recQty, 3), spend: round(v.recSpend),
      lastPurchase: fmtDate(v.last), active: v.last >= cutoff,
    }));
    const best = Math.min(...vendors.map((v) => v.price));
    const bestRow = vendors.find((v) => v.price === best);
    const activeV = vendors.filter((v) => v.active);
    const bestActive = activeV.length ? Math.min(...activeV.map((v) => v.price)) : null;
    const bestActiveRow = bestActive != null ? activeV.find((v) => v.price === bestActive) : null;
    let savings = 0;
    for (const v of vendors) { v.gapVsBest = round(v.price - best, 3); v.excess = round((v.price - best) * v.qty); if (v.price > best) savings += (v.price - best) * v.qty; }
    vendors.sort((a, b) => a.price - b.price);
    const entry = {
      desc: sk.desc, rawDesc: sk.rawDesc, matCode: sk.matCode, unit: sk.unit,
      spend: round(vendors.reduce((s, v) => s + v.spend, 0)), qty: round(vendors.reduce((s, v) => s + v.qty, 0), 3),
      vendorCount: vendors.length,
      bestVendorKey: bestRow.vendorKey, bestVendor: bestRow.vendor, bestPrice: round(best, 3),
      bestActiveVendorKey: bestActiveRow?.vendorKey || null, bestActiveVendor: bestActiveRow?.vendor || null, bestActivePrice: bestActive != null ? round(bestActive, 3) : null,
      savings: round(savings), vendors,
    };
    materials[sk.material].skus.push(entry);
    materials[sk.material].spend = round(materials[sk.material].spend + entry.spend);
    if (vendors.length >= 2) { savingsByMaterial[sk.material] += savings; totalSavings += savings; materials[sk.material].savings = round(materials[sk.material].savings + savings); }
    if (!materials[sk.material].unit) materials[sk.material].unit = sk.unit;
  }
  for (const mkey of Object.keys(materials)) {
    materials[mkey].skus.sort((a, b) => b.savings - a.savings || b.spend - a.spend);
    savingsByMaterial[mkey] = round(savingsByMaterial[mkey]);
  }
  // Disambiguate SKUs that share a display name but are different material codes
  // (e.g. the unified "Dextrose Anhydrous IP" covers both the (FO) and (EXMPT) codes) —
  // surface the distinguishing variant from the raw description, else fall back to the code.
  for (const mkey of Object.keys(materials)) {
    const byDesc = {};
    for (const s of materials[mkey].skus) (byDesc[s.desc] ||= []).push(s);
    for (const group of Object.values(byDesc)) {
      if (group.length < 2) continue;
      for (const s of group) {
        const m = String(s.rawDesc || '').match(/\(([^)]+)\)\s*$/); // trailing "(FO)" / "(EXMPT)" etc.
        s.desc = m ? `${s.desc} (${m[1].trim()})` : `${s.desc} · ${s.matCode}`;
      }
    }
  }

  // ---- freshness strip per material (per canonical vendor, this material) ----
  for (const rk of Object.keys(vFresh)) {
    const [vkey, mkey] = rk.split('|');
    const f = vFresh[rk];
    const avgAge = f.ageN ? Math.round(f.ageSum / f.ageN) : null;
    const avgShelf = f.shelfN ? Math.round(f.shelfSum / f.shelfN) : null;
    if (materials[mkey]) materials[mkey].freshness.push({ vendorKey: vkey, vendor: vendorName(vkey), color: vendorColor[vkey] || '#707070', avgAgeDays: avgAge, avgShelfDays: avgShelf, grade: ageGrade(avgAge), receipts: f.ageN });
  }
  for (const mkey of Object.keys(materials)) materials[mkey].freshness.sort((a, b) => (b.avgAgeDays ?? -1) - (a.avgAgeDays ?? -1));

  // ---- per-vendor value facts (Vendors tab) ----
  const vendors = {};
  const vLastByMat = {};
  for (const rk of Object.keys(vLast)) { const [vkey, mkey] = rk.split('|'); (vLastByMat[vkey] ||= []).push({ materialKey: mkey, lastPurchase: fmtDate(vLast[rk]), daysSince: dayDiff(maxDate, vLast[rk]), active: vLast[rk] >= cutoff }); }
  for (const p of parsed) { for (const r of p.records) { const cv = canonicalOf(r.vendorCode); vendors[cv.key] ||= { vendorKey: cv.key, name: cv.name }; } }
  for (const vkey of Object.keys(vendors)) {
    const cv = ctx.canonicalByKey[vkey];
    const freshnessByMaterial = [], orders = [];
    for (const mkey of Object.keys(MATERIAL_META)) {
      const rk = `${vkey}|${mkey}`;
      if (vFresh[rk]) { const f = vFresh[rk]; freshnessByMaterial.push({ materialKey: mkey, avgAgeDays: f.ageN ? Math.round(f.ageSum / f.ageN) : null, avgShelfDays: f.shelfN ? Math.round(f.shelfSum / f.shelfN) : null, grade: ageGrade(f.ageN ? Math.round(f.ageSum / f.ageN) : null) }); }
      if (vOrders[rk]) { const o = vOrders[rk]; orders.push({ materialKey: mkey, poCount: o.pos.size, lineCount: o.lines, avgOrderQty: o.pos.size ? Math.round(o.qty / o.pos.size) : null, deliveriesPerPo: o.pos.size ? round(o.lines / o.pos.size, 1) : null }); }
    }
    vendors[vkey] = {
      vendorKey: vkey, name: cv?.name || vendorName(vkey), color: vendorColor[vkey] || '#707070',
      spend: round(matShareOf.vendorSpend[vkey] || 0),
      termText: cv?.terms?.text || null, termDays: cv?.terms?.days ?? null, termCategory: cv?.terms?.category || 'unknown',
      materialKeys: [...new Set((vLastByMat[vkey] || []).map((x) => x.materialKey))],
      freshnessByMaterial, orders, recency: vLastByMat[vkey] || [],
    };
  }

  // ---- top-3 action cards (biggest defensible levers) ----
  const actions = buildActions({ materials, savingsByMaterial, vendors, canonicalByKey: ctx.canonicalByKey, fin, matShareOf });

  // ---- cash you can FREE (working capital) — kept strictly separate from price (P&L) savings ----
  // Vendors paid on advance/immediate terms tie up cash. Moving them to 30-day credit releases,
  // one time, roughly annual spend × 30/365. This is NOT a cost saving and is never added to one.
  const cashFreedBy = Object.values(vendors)
    .filter((v) => (v.termCategory === 'advance' || v.termCategory === 'immediate') && v.spend > 0)
    .map((v) => ({ vendorKey: v.vendorKey, name: v.name, spend: round(v.spend), termText: v.termText, termCategory: v.termCategory, cashFreed: round(v.spend * 30 / 365) }))
    .sort((a, b) => b.cashFreed - a.cashFreed);
  const cashFreed = round(cashFreedBy.reduce((s, x) => s + x.cashFreed, 0));

  return {
    generatedAt: new Date().toISOString(), currency: 'INR',
    dateRange: { from: fmtDate(new Date(Math.min(...all.map((r) => +r.posting)))), to: fmtDate(maxDate) },
    activeWindowDays: ACTIVE_DAYS,
    headline: {
      totalSavings: round(totalSavings), // retained = cost (price) savings only
      costSavings: round(totalSavings),
      cashFreed,
      cashFreedBy,
      note: `Cost you can save is price-only — what FDC overpaid this year versus the cheapest price it already paid for the same items (every material bought from 2+ vendors). Cash you can free is one-time working capital, released by moving suppliers off advance/immediate terms onto 30-day credit (annual spend × 30/365) — a different kind of money, never added to the cost saving.`,
    },
    savingsByMaterial: Object.keys(MATERIAL_META).map((k) => ({ materialKey: k, displayName: MATERIAL_META[k].displayName, color: MATERIAL_META[k].color, savings: savingsByMaterial[k] })),
    actions,
    materials,
    vendors,
    ledger,
    counts: { ledgerRows: ledger.length, skus: Object.values(materials).reduce((s, m) => s + m.skus.length, 0), vendors: Object.keys(vendors).length },
  };
}

// Build the three highest-value, defensible action cards from real computed numbers.
function buildActions({ materials, savingsByMaterial, vendors, canonicalByKey, fin, matShareOf }) {
  const croreOrL = (n) => (n >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : `₹${(n / 1e5).toFixed(1)} L`);
  const out = [];

  // Candidate A — biggest over-paying ACTIVE vendor PER MATERIAL, moved to the cheapest ACTIVE vendor
  const priceLevers = [];
  for (const [mkey, M] of Object.entries(materials)) {
    let lever = null;
    for (const sku of M.skus) {
      if (sku.vendorCount < 2 || !sku.bestActivePrice) continue;
      for (const v of sku.vendors) {
        if (!v.active || v.vendorKey === sku.bestActiveVendorKey) continue;
        const saving = round((v.price - sku.bestActivePrice) * v.qty);
        if (saving <= 0) continue;
        if (!lever || saving > lever.saving) lever = { mkey, M, sku, from: v, toVendor: sku.bestActiveVendor, toKey: sku.bestActiveVendorKey, toPrice: sku.bestActivePrice, saving };
      }
    }
    if (lever) priceLevers.push(lever);
  }
  priceLevers.sort((a, b) => b.saving - a.saving);

  // Candidate B — worst payment terms (advance / immediate) on real spend → move to a cheaper credit-giving vendor
  let termsLever = null;
  for (const v of Object.values(vendors)) {
    if (v.termCategory !== 'advance' && v.termCategory !== 'immediate') continue;
    if (!v.spend || v.spend < 5e5) continue;
    // a 30-day credit vendor on the same material, cheaper if possible
    const mkey = v.materialKeys[0];
    const M = materials[mkey];
    const sku = M?.skus.find((s) => s.vendors.some((x) => x.vendorKey === v.vendorKey));
    const mine = sku?.vendors.find((x) => x.vendorKey === v.vendorKey);
    const alt = sku?.vendors.find((x) => x.active && x.vendorKey !== v.vendorKey && (canonicalByKey[x.vendorKey]?.terms?.category === 'net'));
    const cashFreed = round(v.spend * 30 / 365);
    const priceSave = mine && alt && mine.price > alt.price ? round((mine.price - alt.price) * mine.qty) : 0;
    const score = cashFreed + priceSave;
    if (!termsLever || score > termsLever.score) termsLever = { v, mkey, M, sku, mine, alt, cashFreed, priceSave, score };
  }

  // Candidate C — a vendor that CHARGES MORE and ships OLDER stock than a fresher rival (same material)
  let freshLever = null;
  for (const [mkey, M] of Object.entries(materials)) {
    const fr = M.freshness.filter((f) => f.avgAgeDays != null);
    if (fr.length < 2) continue;
    const oldest = fr[0]; // sorted desc by age
    const freshest = fr[fr.length - 1];
    if (oldest.vendorKey === freshest.vendorKey || (oldest.avgAgeDays - freshest.avgAgeDays) < 20) continue;
    // does the older one also cost more?
    const sku = M.skus.find((s) => s.vendors.some((x) => x.vendorKey === oldest.vendorKey) && s.vendors.some((x) => x.vendorKey === freshest.vendorKey));
    const oldV = sku?.vendors.find((x) => x.vendorKey === oldest.vendorKey);
    const frV = sku?.vendors.find((x) => x.vendorKey === freshest.vendorKey);
    if (!oldV || !frV || oldV.price <= frV.price) continue;
    const saving = round((oldV.price - frV.price) * oldV.qty);
    if (!freshLever || saving > freshLever.saving) freshLever = { mkey, M, oldest, freshest, oldV, frV, saving };
  }

  // assemble candidates, biggest first, de-duped by vendor+material
  const cand = [];
  for (const L of priceLevers) {
    const fragile = isFragile(L.toKey, fin, matShareOf, L.mkey);
    const toMargin = fin[L.toKey]?.metrics?.netMargin ?? null;
    const fromMargin = fin[L.from.vendorKey]?.metrics?.netMargin ?? null;
    const fromTerms = canonicalByKey[L.from.vendorKey]?.terms;
    const fromTermLabel = fromTerms?.category === 'net' && fromTerms.days ? `${fromTerms.days}-day credit` : null;
    const fromStronger = fromMargin != null && toMargin != null && fromMargin >= toMargin + 2;
    if (fragile) {
      // The cheapest vendor is fragility-flagged (thin margin and/or already the biggest share).
      // Don't recommend piling MORE volume onto a weak sole source — use its price as leverage.
      const strongBits = [fromTermLabel, fromStronger ? 'stronger financials' : null].filter(Boolean).join(', ');
      cand.push({
        key: `price-${L.from.vendorKey}-${L.mkey}`, kind: 'price', isLeverage: true, saving: L.saving, material: L.mkey, vendorKey: L.from.vendorKey,
        action: `Use ${short(L.toVendor)}'s lower price to push ${short(L.from.vendor)} down — don't just move more volume to ${short(L.toVendor)}.`,
        why: `You pay ${short(L.from.vendor)} ₹${pf(L.from.price)}/${unitLbl(L.sku.unit)} for ${L.sku.desc}; ${short(L.toVendor)} sells the same at ₹${pf(L.toPrice)}/${unitLbl(L.sku.unit)}. But ${short(L.toVendor)} is already your biggest ${L.M.displayName} source${toMargin != null ? ` on a thin ~${Math.round(toMargin)}% net margin` : ''} — adding volume there deepens single-source risk. Use that gap to get ${short(L.from.vendor)}${strongBits ? ` (${strongBits})` : ''} down to it, or split to a second healthy source.`,
        savingLabel: croreOrL(L.saving),
        proof: { tab: 'material', material: L.mkey, skuDesc: L.sku.desc, vendorKey: L.from.vendorKey },
        risk: `${short(L.toVendor)} is already your biggest ${L.M.displayName} source — keep its price as leverage, not a bigger basket.`,
      });
    } else if (isBacked(L.toKey, fin)) {
      // Destination is the cheapest ACTIVE vendor AND we can stand behind its books.
      cand.push({
        key: `price-${L.from.vendorKey}-${L.mkey}`, kind: 'price', saving: L.saving, material: L.mkey, vendorKey: L.from.vendorKey,
        action: `Move ${L.M.displayName} volume off ${short(L.from.vendor)} to ${short(L.toVendor)}.`,
        why: `You pay ${short(L.from.vendor)} ₹${pf(L.from.price)}/${unitLbl(L.sku.unit)} for ${L.sku.desc} — ${short(L.toVendor)} already gives you the same at ₹${pf(L.toPrice)}/${unitLbl(L.sku.unit)}.`,
        savingLabel: croreOrL(L.saving),
        proof: { tab: 'material', material: L.mkey, skuDesc: L.sku.desc, vendorKey: L.from.vendorKey },
        risk: null,
      });
    } else {
      // The cheapest quote is from a vendor whose financials we CANNOT verify yet.
      // Never vouch for an unbacked supplier. Option (b): if a cheaper, financially-backed
      // supplier also beats the incumbent, recommend THAT one. Option (a): otherwise keep
      // the ₹ gap as leverage on the incumbent and flag the cheap vendor for verification.
      const backedAlt = L.sku.vendors
        .filter((x) => x.active && x.vendorKey !== L.from.vendorKey && x.price < L.from.price && isBacked(x.vendorKey, fin))
        .sort((a, b) => a.price - b.price)[0] || null;
      if (backedAlt) {
        const saving = round((L.from.price - backedAlt.price) * L.from.qty);
        cand.push({
          key: `price-${L.from.vendorKey}-${L.mkey}`, kind: 'price', saving, material: L.mkey, vendorKey: L.from.vendorKey,
          action: `Move ${L.M.displayName} volume off ${short(L.from.vendor)} to ${short(backedAlt.vendor)} (financially vetted).`,
          why: `You pay ${short(L.from.vendor)} ₹${pf(L.from.price)}/${unitLbl(L.sku.unit)} for ${L.sku.desc}. ${short(backedAlt.vendor)} already gives you the same at ₹${pf(backedAlt.price)}/${unitLbl(L.sku.unit)} — and unlike the very cheapest quote (${short(L.toVendor)} at ₹${pf(L.toPrice)}, financials not yet verified) we can stand behind ${short(backedAlt.vendor)}'s books.`,
          savingLabel: croreOrL(saving),
          proof: { tab: 'material', material: L.mkey, skuDesc: L.sku.desc, vendorKey: L.from.vendorKey },
          risk: null,
        });
      } else {
        cand.push({
          key: `price-${L.from.vendorKey}-${L.mkey}`, kind: 'price', isLeverage: true, saving: L.saving, material: L.mkey, vendorKey: L.from.vendorKey,
          action: `Use ${short(L.toVendor)}'s lower price to push ${short(L.from.vendor)} down — verify ${short(L.toVendor)} before moving volume.`,
          why: `You pay ${short(L.from.vendor)} ₹${pf(L.from.price)}/${unitLbl(L.sku.unit)} for ${L.sku.desc}; ${short(L.toVendor)} quotes the same at ₹${pf(L.toPrice)}/${unitLbl(L.sku.unit)} — a real price gap to lean on in your next review with ${short(L.from.vendor)}. But ${short(L.toVendor)}'s financials aren't verified yet, so qualify it (health, supply continuity) before shifting volume — we don't vouch for a supplier we can't back.`,
          savingLabel: croreOrL(L.saving),
          proof: { tab: 'material', material: L.mkey, skuDesc: L.sku.desc, vendorKey: L.from.vendorKey },
          risk: `${short(L.toVendor)}'s financials are pending verification — use its price as leverage now; move volume only once it's vetted.`,
        });
      }
    }
  }
  if (termsLever && termsLever.cashFreed > 0) {
    const tv = termsLever.v;
    const isAdvance = tv.termCategory === 'advance';
    // biggest OTHER advance-term vendor — mentioned as an even-worse (but smaller) secondary case
    const worstAdvance = Object.values(vendors)
      .filter((w) => w.termCategory === 'advance' && w.spend > 0 && w.vendorKey !== tv.vendorKey)
      .sort((a, b) => b.spend - a.spend)[0] || null;
    const action = isAdvance
      ? `Stop pre-paying ${short(tv.name)} — it's 100% advance today.`
      : `Put ${short(tv.name)} on 30-day credit — today it's pay-on-receipt.`;
    const payPhrase = isAdvance
      ? `you pay 100% up front, before the goods are even dispatched`
      : `you pay on the day goods arrive — no credit at all`;
    let why = `${short(tv.name)} is your largest supplier on weak terms: ${payPhrase}, while your other big suppliers already give you 30 days. On ${croreOrL(tv.spend)} of spend, securing 30-day credit frees about ${croreOrL(termsLever.cashFreed)} of working capital — a one-time cash release, not a price cut.`;
    if (worstAdvance) why += ` ${short(worstAdvance.name)} is on even worse terms — 100% advance — but far smaller spend (${croreOrL(worstAdvance.spend)}).`;
    cand.push({
      key: `terms-${tv.vendorKey}`, kind: 'terms', isCash: true, saving: termsLever.cashFreed, material: termsLever.mkey, vendorKey: tv.vendorKey,
      action,
      why,
      savingLabel: croreOrL(termsLever.cashFreed),
      proof: { tab: 'vendors', vendorKey: tv.vendorKey },
      risk: null,
    });
  }
  if (freshLever) {
    cand.push({
      key: `fresh-${freshLever.oldest.vendorKey}-${freshLever.mkey}`, kind: 'freshness', saving: freshLever.saving, material: freshLever.mkey, vendorKey: freshLever.oldest.vendorKey,
      action: `Challenge ${short(freshLever.oldV.vendor)} on ${freshLever.M.displayName} — they cost more AND ship older stock.`,
      why: `${short(freshLever.oldV.vendor)} charges ₹${pf(freshLever.oldV.price)}/${unitLbl(freshLever.M.unit)} and ships stock ~${freshLever.oldest.avgAgeDays}d old, vs ${short(freshLever.frV.vendor)} at ₹${pf(freshLever.frV.price)} and ~${freshLever.freshest.avgAgeDays}d old.`,
      savingLabel: croreOrL(freshLever.saving),
      proof: { tab: 'material', material: freshLever.mkey, vendorKey: freshLever.oldest.vendorKey },
      risk: null,
    });
  }

  // pick the 3 biggest, keeping variety: no repeated vendor, prefer different materials
  cand.sort((a, b) => b.saving - a.saving);
  const usedV = new Set(), usedM = new Set();
  for (const c of cand) {
    if (out.length >= 3) break;
    if (usedV.has(c.vendorKey)) continue;
    out.push(c); usedV.add(c.vendorKey); usedM.add(c.material);
  }
  // if fewer than 3 (e.g. vendor-dedup trimmed), backfill with next biggest regardless of material
  for (const c of cand) { if (out.length >= 3) break; if (!out.includes(c) && !usedV.has(c.vendorKey)) { out.push(c); usedV.add(c.vendorKey); } }
  return out.slice(0, 3).map((a, i) => ({ ...a, rank: i + 1 }));
}

const short = (n) => {
  let s = String(n).replace(/\b(PRIVATE|PVT|LIMITED|LTD|INDIA|\(INDIA\))\b\.?/gi, '').replace(/\s{2,}/g, ' ').replace(/[.,]\s*$/, '').trim();
  // title-case words that are shouting in ALL CAPS (keep short acronyms like PGP, GLS, TPAC)
  s = s.split(' ').map((w) => (w.length > 3 && w === w.toUpperCase() && /[A-Z]/.test(w) ? w[0] + w.slice(1).toLowerCase() : w)).join(' ');
  return s;
};
const unitLbl = (u) => (/nos/i.test(u) ? 'pc' : /kg/i.test(u) ? 'kg' : String(u || '').toLowerCase());
const pf = (n) => (n == null ? '—' : n >= 100 ? String(Math.round(n)) : n >= 10 ? n.toFixed(1) : n.toFixed(2));
function isFragile(vendorKey, fin, matShareOf, mkey) {
  const f = fin[vendorKey];
  const thinMargin = f?.metrics?.netMargin != null && f.metrics.netMargin < 3;
  const bigShare = (matShareOf.byMaterial[mkey]?.[vendorKey] || 0) >= 0.45;
  return thinMargin || bigShare;
}
// A destination we can stand behind: real financials on file (listed metrics or a
// Probe42/MCA profile), status ok. An unresolved/pending vendor is NOT backed, so we
// never tell the client to move volume to it — we only use its price as leverage.
function isBacked(vendorKey, fin) {
  const f = fin[vendorKey];
  return !!(f && f.status === 'ok' && (f.metrics || f.probe));
}

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
    phase: 'Phase 2 — Intelligence',
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
      'Vendor financials are real and source-stamped: listed suppliers via the Munshot market-data API, private suppliers via Probe42 (MCA filings). Where a supplier does not file free financials, the card says "pending" rather than showing another entity\'s numbers.',
    ],
  };

  // =========================================================================
  // value.json  (Phase 5 — the money + the three unused fields)
  // =========================================================================
  const matShareOf = { vendorSpend: {}, byMaterial: {} };
  for (const v of vendorList) matShareOf.vendorSpend[v.key] = v.totalNetSpend;
  for (const m of materialsOut) {
    matShareOf.byMaterial[m.key] = {};
    const tot = m.totalNetSpend || m.vendors.reduce((s, v) => s + v.spend, 0) || 1;
    for (const v of m.vendors) matShareOf.byMaterial[m.key][v.vendorKey] = v.spend / tot;
  }
  const value = buildValue(parsed, {
    canonicalOf,
    canonicalByKey: vIdx.canonical,
    vendorColor,
    vendorName,
    matShareOf,
  });

  // ---- write everything --------------------------------------------------
  const write = (name, obj) => {
    writeFileSync(path.join(OUT_DIR, name), JSON.stringify(obj, null, 2));
    return `${name} (${(JSON.stringify(obj).length / 1024).toFixed(1)} KB)`;
  };
  // Hand-curated marketplace ASK benchmark (reference data, not derived from SAP).
  // Copied verbatim from the master so public/data stays the single fetch source.
  const marketAsks = readJsonOpt(path.join(RAW_DIR, 'masters', 'market-asks.json'));
  const written = [
    write('meta.json', meta),
    write('materials.json', materialsOut),
    write('vendors.json', vendorList),
    write('price-gaps.json', priceGaps),
    write('plants.json', plantsOut),
    write('payment-terms.json', paymentTerms),
    write('value.json', value),
    ...(marketAsks ? [write('market-asks.json', marketAsks)] : []),
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
