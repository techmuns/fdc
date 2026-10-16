/**
 * Backup-supplier database — turns the founder's researched Excel
 * (data/raw/masters/FDC_Supplier_Database.xlsx) into clean JSON for the app.
 *
 * Source: public web research (company sites, catalogues, trade press, rating
 * pages, registries) — no paid databases. POTENTIAL suppliers only: no
 * qualification, audit, price or FDC relationship is implied. Every field is
 * copied straight from the sheet; nothing is invented. Lat/long is geocoded
 * from the Country / Region / HQ text purely to place a dot on the map.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'data', 'raw', 'masters', 'FDC_Supplier_Database.xlsx');
const OUT = path.join(ROOT, 'public', 'data', 'backup-suppliers.json');

// 6 material families → stable key + label + colour (validated categorical hues).
const MATERIALS = [
  { key: 'dextrose', label: 'Dextrose / Glucose', match: 'Dextrose/Glucose', color: '#008300' },
  { key: 'maize', label: 'Corn / Maize', match: 'Corn/Maize', color: '#EDA100' },
  { key: 'pet-resin', label: 'PET Resin', match: 'PET Resin', color: '#EB6834' },
  { key: 'pet-bottles', label: 'PET Bottles & Preforms', match: 'PET Bottles & Preforms', color: '#2A78D6' },
  { key: 'caps', label: 'Caps & Closures', match: 'Caps & Closures', color: '#1BAF7A' },
  { key: 'bopet', label: 'Polyester / BOPET Film & Laminates', match: 'Polyester/BOPET Film & Laminates', color: '#E87BA4' },
];
const matKey = (m) => (MATERIALS.find((x) => x.match === String(m || '').trim())?.key ?? 'other');

// --- geocoding (lon, lat). Country centroids + Indian state/region centroids. ---
const COUNTRY = {
  India: [79, 22], USA: [-98, 39], China: [104, 35], Germany: [10.4, 51], France: [2.3, 46.6],
  Spain: [-3.7, 40.3], Mexico: [-102, 23.6], Singapore: [103.8, 1.35], Denmark: [10, 56], Switzerland: [8.2, 46.8],
  Canada: [-106, 56], 'United Kingdom': [-2, 54], Indonesia: [113, -1], 'Czech Republic': [15.5, 49.8],
  Italy: [12.5, 42.8], Austria: [14.5, 47.6], Hungary: [19.5, 47.2], Thailand: [101, 15.2],
};
const IN_STATE = {
  Gujarat: [71.6, 22.5], Maharashtra: [75.7, 19.4], Punjab: [75.4, 31], Haryana: [76.1, 29.2],
  Telangana: [79, 17.9], 'Madhya Pradesh': [78.2, 23.5], 'West Bengal': [87.9, 23.6], Delhi: [77.1, 28.6],
  Karnataka: [76, 15], Odisha: [85, 20.5], 'Uttar Pradesh': [80.5, 27], Puducherry: [79.8, 11.9],
  Uttarakhand: [79.1, 30], 'Tamil Nadu': [78.4, 11.1], Rajasthan: [74.2, 27], Kerala: [76.5, 10.5],
  Bihar: [85.5, 25.8], 'Andhra Pradesh': [80, 15.9],
};
const IN_REGION = {
  'India-West': [73.5, 20.5], 'India-North': [77, 29.5], 'India-South': [78, 13], 'India-Central': [79, 23.3],
  'India-East': [86, 23], 'India-Pan': [79, 22], 'India-Northeast': [93, 26],
};
// small deterministic jitter so dots at the same place fan out instead of stacking
function jitter(id) {
  let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return [((h % 1000) / 1000 - 0.5) * 2.4, (((h >> 10) % 1000) / 1000 - 0.5) * 2.4];
}
function geo(country, region, hq, id) {
  const c = String(country || '').trim();
  const [jx, jy] = jitter(id);
  if (c && c.toLowerCase() !== 'india' && COUNTRY[c]) return [COUNTRY[c][0] + jx, COUNTRY[c][1] + jy];
  // India (or blank): try state from HQ, then region, then India centre
  const hqs = String(hq || '');
  for (const [st, ll] of Object.entries(IN_STATE)) if (new RegExp(`\\b${st}\\b`, 'i').test(hqs)) return [ll[0] + jx * 0.6, ll[1] + jy * 0.6];
  const r = String(region || '').trim();
  if (IN_REGION[r]) return [IN_REGION[r][0] + jx, IN_REGION[r][1] + jy];
  if (COUNTRY[c]) return [COUNTRY[c][0] + jx, COUNTRY[c][1] + jy];
  return [79 + jx, 22 + jy];
}

const wb = XLSX.readFile(SRC);
const rows = XLSX.utils.sheet_to_json(wb.Sheets['All Supplier Lines'], { header: 1, defval: '' });
const hdr = rows[0].map((h) => String(h).trim());
const idx = (name) => hdr.indexOf(name);
const col = {
  id: idx('Company ID'), company: idx('Company (legal / registered name)'), brand: idx('Trade / brand name'),
  legal: idx('Legal name verified'), material: idx('Material category'), segment: idx('Segment'),
  sub: idx('Subcategory'), products: idx('Relevant products'), grades: idx('Grades / specs / sizes / materials'),
  related: idx('Related products kept separate (out of scope)'), role: idx('Role'), apps: idx('Applications'),
  priority: idx('Priority match (keyword-derived)'), region: idx('Region'), hq: idx('HQ'), country: idx('Country'),
  plants: idx('Plants'), website: idx('Website'), certs: idx('Certifications (as stated)'),
  capacity: idx('Capacity (published)'), revenue: idx('Revenue (published)'), ownership: idx('Ownership'),
  rating: idx('Credit rating'), notes: idx('Suitability / verification notes'), confidence: idx('Evidence confidence'),
  also: idx('Also listed under'), nsrc: idx('No. of sources'), sources: idx('Sources'),
};
const S = (r, c) => (c >= 0 ? String(r[c] ?? '').trim() : '');

const lines = [];
for (const r of rows.slice(1)) {
  if (!r || !S(r, col.id)) continue;
  const material = S(r, col.material);
  const country = S(r, col.country);
  const region = S(r, col.region);
  const hq = S(r, col.hq);
  const id = S(r, col.id);
  const ownRating = (S(r, col.ownership) + ' ' + S(r, col.rating)).toLowerCase();
  const role = S(r, col.role);
  const [lon, lat] = geo(country, region, hq, id + material);
  lines.push({
    id, company: S(r, col.company), brand: S(r, col.brand),
    legalVerified: /^yes$/i.test(S(r, col.legal)),
    material, materialKey: matKey(material), segment: S(r, col.segment), subcategory: S(r, col.sub),
    products: S(r, col.products), grades: S(r, col.grades), relatedOut: S(r, col.related),
    role, applications: S(r, col.apps), priority: S(r, col.priority),
    region, hq, country: country || (/\bindia\b/i.test(hq) ? 'India' : ''), plants: S(r, col.plants),
    website: S(r, col.website), certifications: S(r, col.certs), capacity: S(r, col.capacity),
    revenue: S(r, col.revenue), ownership: S(r, col.ownership), creditRating: S(r, col.rating),
    notes: S(r, col.notes), confidence: S(r, col.confidence) || 'Low', alsoUnder: S(r, col.also),
    sourceCount: Number(S(r, col.nsrc)) || 0,
    sources: S(r, col.sources).split(/\r?\n/).map((s) => s.trim()).filter((s) => /^https?:/i.test(s)),
    listed: /listed/.test(ownRating), maker: /^manufacturer|^converter|^processor|^recycler/i.test(role),
    lon: Math.round(lon * 100) / 100, lat: Math.round(lat * 100) / 100,
  });
}

// coverage analysis per material (for the strip)
const coverage = MATERIALS.map((m) => {
  const ls = lines.filter((l) => l.materialKey === m.key);
  const credible = ls.filter((l) => l.maker && /india/i.test(l.country) && l.confidence !== 'Low').length;
  return {
    key: m.key, label: m.label, color: m.color, total: ls.length,
    india: ls.filter((l) => /india/i.test(l.country)).length,
    intl: ls.filter((l) => !/india/i.test(l.country)).length,
    makers: ls.filter((l) => l.maker).length,
    strong: ls.filter((l) => l.confidence === 'High').length,
    credible,
  };
}).filter((c) => c.total > 0);

const uniq = (arr) => [...new Set(arr.filter(Boolean))].sort();
const out = {
  compiledAt: '2026-10-16',
  source: 'Public web research — company sites, catalogues, trade press, rating pages, registries. No paid databases.',
  note: 'POTENTIAL / backup suppliers only — not qualified, not priced, not an FDC relationship. Verify legal name, grade certificates and plant audits before any RFQ.',
  counts: { companies: new Set(lines.map((l) => l.id)).size, lines: lines.length, sources: lines.reduce((s, l) => s + l.sources.length, 0) },
  materials: MATERIALS.map(({ key, label, color }) => ({ key, label, color })),
  coverage,
  filters: {
    regions: uniq(lines.map((l) => l.region)),
    countries: uniq(lines.map((l) => l.country)),
    roles: ['Manufacturer', 'Converter', 'Processor', 'Recycler', 'Distributor', 'Trader', 'Other'],
    confidence: ['High', 'Medium', 'Low'],
  },
  lines,
};
writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(`✓ backup-suppliers.json — ${out.counts.companies} companies, ${out.counts.lines} lines, ${out.counts.sources} source links`);
console.log('  by material:', coverage.map((c) => `${c.key} ${c.total}`).join(' · '));
