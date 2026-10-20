import { useMemo, useState, useEffect } from 'react';
import {
  Factory, Hourglass, TrendingDown, TrendingUp, Clock, PackageSearch, Repeat2,
  Maximize2, BadgeCheck, Lock, CalendarClock, HandCoins, Info, CircleHelp, Layers, ChevronDown,
} from 'lucide-react';
import type { AppData, ValueVendor, ValueMaterial, ValueData, VendorFin, MaterialKey, FinMetrics, AltVendor } from '../types';
import type { Nav } from '../App';
import { Card, Badge, Pill } from '../components/ui/Card';
import { Dropdown, Segmented, type Option } from '../components/ui/Controls';
import { Table, type Column } from '../components/ui/Table';
import { Sparkline } from '../components/charts/Sparkline';
import VendorProfile, { type ProfileSubject } from '../components/VendorProfile';
import { MaterialDetail } from './MaterialTab';
import { MarketSuppliers } from './BackupSuppliersTab';
import { FDC, MATERIAL_COLOR } from '../lib/brand';
import { vendorShort, crore, pct } from '../lib/format';

const MAT_NAME: Record<string, string> = { dextrose: 'Dextrose', packaging: 'Rigid packaging', laminates: 'Laminates' };
const priceFmt = (n: number | null | undefined, unit = 'kg') => (n == null ? '—' : `₹${n >= 100 ? Math.round(n) : n >= 10 ? n.toFixed(1) : n.toFixed(2)}/${unit === 'NOS' ? 'pc' : unit.toLowerCase()}`);
const fmtSave = (n: number) => (n >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `₹${(n / 1e5).toFixed(1)} L` : `₹${Math.round(n).toLocaleString('en-IN')}`);

// map our materials to the backup-database material keys
const DB_MATS: Record<string, string[]> = { dextrose: ['dextrose'], packaging: ['pet-resin', 'pet-bottles', 'caps'], laminates: ['bopet'] };

/* ---- "who could replace them": our cheaper suppliers + external alternatives ---- */
export interface AltItem {
  key: string; name: string; why: string;
  cheaper?: boolean; size?: 'bigger' | 'smaller' | null; price?: string; term?: string;
  navKey?: string;                 // click → open this existing FDC supplier
  alt?: { material: MaterialKey; index: number };  // click → open this external alternative's profile
  backed: boolean;                 // do we have real financials to stand behind?
  gradeLabel?: string;             // honest spec/grade-match caveat
}
function buildAlternatives(vendorKey: string, data: AppData): AltItem[] {
  const x = data.value?.vendors[vendorKey];
  if (!x) return [];
  const fin = data.financials?.vendors ?? {};
  const myRev = fin[vendorKey]?.metrics?.revenue ?? null;
  const items: AltItem[] = [];
  // our OWN cheaper suppliers for the same materials — SAME UNIT only (never KG vs pieces)
  for (const mkey of x.materialKeys) {
    const mat = data.materials.find((mm) => mm.key === mkey);
    const mine = mat?.vendors.find((mv) => mv.vendorKey === vendorKey);
    if (!mat || !mine || mine.avgPrice == null) continue;
    for (const o of mat.vendors) {
      if (o.vendorKey === vendorKey || o.avgPrice == null || o.unit !== mine.unit || o.avgPrice >= mine.avgPrice) continue;
      const term = data.value?.vendors[o.vendorKey]?.termText;
      items.push({
        key: `own-${o.vendorKey}-${mkey}`, name: vendorShort(o.vendor), navKey: o.vendorKey,
        cheaper: true, price: priceFmt(o.avgPrice, o.unit), term: term ? shortTerm(term) : undefined,
        backed: !!(fin[o.vendorKey]?.status === 'ok' && (fin[o.vendorKey]?.metrics || fin[o.vendorKey]?.probe)),
        why: `Supplies ${MAT_NAME[mkey]} at ${priceFmt(o.avgPrice, o.unit)} — cheaper than ${vendorShort(x.name)}'s ${priceFmt(mine.avgPrice, mine.unit)}.`,
      });
    }
  }
  // external alternatives (Munshot / Probe42) for the same materials
  for (const mkey of x.materialKeys) {
    const alts = data.alternatives?.byMaterial?.[mkey as 'dextrose'] ?? [];
    alts.forEach((a, index) => {
      if (items.some((it) => it.name === vendorShort(a.name))) return;
      const rev = a.metrics?.revenue ?? null;
      items.push({
        key: `alt-${mkey}-${index}`, name: vendorShort(a.name), why: a.fitNote,
        size: rev && myRev ? (rev > myRev ? 'bigger' : 'smaller') : null,
        alt: { material: mkey as MaterialKey, index },
        backed: !!(a.status === 'ok' && (a.metrics || a.probe)),
        gradeLabel: a.gradeLabel ?? undefined,
      });
    });
  }
  return items;
}

/* ---- the lead money table: one row per supplier of the selected material ---- */
type TagTone = 'save' | 'old' | 'term' | 'single' | 'cheap';
const TAG_COLOR: Record<TagTone, string> = { save: FDC.orange, old: FDC.red, term: FDC.blue, single: FDC.orange, cheap: FDC.green };
interface SupRow {
  vendorKey: string; name: string; color: string;
  pay: number; save: number; items: number;
  main: string; tags: { label: string; tone: TagTone }[];
}
/** Aggregate every price line for this material down to one honest row per supplier:
 *  what you pay them a year, what you could save vs the cheapest you already pay, and the single
 *  most useful "why & what to do". No scripts — just spend, saving, and the reason. */
function buildSupplierRows(M: ValueMaterial, v: ValueData, mat: MaterialKey): SupRow[] {
  const agg = new Map<string, { pay: number; save: number; items: number; single: boolean; cheap: number }>();
  for (const s of M.skus) {
    for (const vp of s.vendors) {
      const cur = agg.get(vp.vendorKey) ?? { pay: 0, save: 0, items: 0, single: false, cheap: 0 };
      cur.pay += vp.spend;
      cur.save += Math.max(0, vp.excess);
      cur.items += 1;
      if (s.vendorCount < 2) cur.single = true;
      if ((s.bestActiveVendorKey ?? s.bestVendorKey) === vp.vendorKey) cur.cheap += 1;
      agg.set(vp.vendorKey, cur);
    }
  }
  const rows: SupRow[] = [];
  for (const [vk, a] of agg) {
    const vv = v.vendors[vk];
    if (!vv) continue;
    const fr = vv.freshnessByMaterial.find((f) => f.materialKey === mat);
    const isOld = fr?.grade === 'old';
    const isAdvance = vv.termCategory === 'advance' || vv.termCategory === 'immediate';

    let main: string;
    if (a.save >= 50000) main = `You pay about ${fmtSave(a.save)}/yr more than the cheapest price you already pay${a.items > 1 ? ` across ${a.items} items` : ''}. Match that price, or move some volume to the cheaper supplier.`;
    else if (isOld) main = `Ships old stock — about ${fr?.avgAgeDays}d old on average when it reaches you. Ask for fresher, newer-made batches before you reorder.`;
    else if (isAdvance) main = `You pay ${termPlain(vv.termCategory, vv.termText).toLowerCase()}. Ask to move onto 30-day credit to free up cash.`;
    else if (a.single) main = `The only supplier on file for ${a.items > 1 ? 'these items' : 'this item'} — bring in a second quote so you have a price to compare against.`;
    else if (a.cheap > 0) main = `Already the cheapest you pay here${a.cheap > 1 ? ` on ${a.cheap} items` : ''} — protect it, and use it to push the dearer suppliers down.`;
    else main = `Roughly in line on price. If you want more off, lead with bigger volume or faster payment, not a flat price ask.`;

    const tags: { label: string; tone: TagTone }[] = [];
    if (a.save > 0) tags.push({ label: `save ${fmtSave(a.save)}`, tone: 'save' });
    if (isOld) tags.push({ label: 'old stock', tone: 'old' });
    if (isAdvance) tags.push({ label: 'you pay early', tone: 'term' });
    if (a.single) tags.push({ label: 'sole supplier', tone: 'single' });
    if (a.save === 0 && a.cheap > 0) tags.push({ label: 'cheapest', tone: 'cheap' });

    rows.push({ vendorKey: vk, name: vv.name, color: vv.color, pay: a.pay, save: a.save, items: a.items, main, tags });
  }
  rows.sort((x, y) => y.save - x.save || y.pay - x.pay);
  return rows;
}

export default function VendorsTab({ data, nav, onNavigate }: { data: AppData; nav: Extract<Nav, { tab: 'vendors' }>; onNavigate: (n: Nav) => void }) {
  const v = data.value;
  const [mat, setMat] = useState<MaterialKey>(nav.material ?? 'dextrose');
  const [sel, setSel] = useState<string | null>(nav.vendorKey ?? null);
  const [view, setView] = useState<'current' | 'alternatives'>('current');
  const [profile, setProfile] = useState<ProfileSubject | null>(null);
  useEffect(() => { if (nav.material) setMat(nav.material); }, [nav.material]);
  useEffect(() => { if (nav.vendorKey) { setSel(nav.vendorKey); setView('current'); } }, [nav.vendorKey]);

  const M = v?.materials[mat] ?? null;
  const rows = useMemo(() => (v && M ? buildSupplierRows(M, v, mat) : []), [v, M, mat]);

  if (!v || !M) return <Card><p className="text-[13px] text-fdc-grey">No value data.</p></Card>;

  const matOptions: Option<MaterialKey>[] = (['dextrose', 'packaging', 'laminates'] as MaterialKey[])
    .filter((k) => v.materials[k])
    .map((k) => ({ value: k, label: v.materials[k].displayName, color: MATERIAL_COLOR[k] }));

  // the selected supplier — default to the biggest saver in this material
  const selKey = sel && rows.some((r) => r.vendorKey === sel) ? sel : (rows[0]?.vendorKey ?? null);
  const selVendor = selKey ? v.vendors[selKey] ?? null : null;
  const maxSave = Math.max(1, ...rows.map((r) => r.save));

  // how many alternatives exist for this material (curated + market research) — for the toggle label
  const marketCount = new Set((data.backupSuppliers?.lines ?? []).filter((l) => (DB_MATS[mat] ?? []).includes(l.materialKey)).map((l) => l.id)).size;
  const altCount = (data.alternatives?.byMaterial?.[mat]?.length ?? 0) + marketCount;

  // open an external alternative's profile (or an honest "pending" card for name-only ones)
  const openAlt = (ref: { material: MaterialKey; index: number }) => {
    const alt = data.alternatives?.byMaterial?.[ref.material]?.[ref.index];
    if (alt) setProfile({ kind: 'alt', alt });
  };
  const onPickAlt = (it: AltItem) => {
    if (it.navKey) { setSel(it.navKey); setView('current'); }
    else if (it.alt) openAlt(it.alt);
  };

  const cols: Column<SupRow>[] = [
    { key: 'name', header: 'Supplier', sortable: true, sortValue: (r) => vendorShort(r.name), render: (r) => (
      <span className="flex min-w-0 items-center gap-2">
        <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: r.color }} />
        <span className="truncate font-semibold text-fdc-slate">{vendorShort(r.name)}</span>
      </span>
    ) },
    { key: 'pay', header: 'You pay / yr', align: 'right', sortable: true, sortValue: (r) => r.pay, render: (r) => <span className="tnum whitespace-nowrap font-semibold text-fdc-ink">{fmtSave(r.pay)}</span> },
    { key: 'save', header: 'Can save', align: 'right', sortable: true, sortValue: (r) => r.save, render: (r) => (r.save > 0 ? <span className="tnum whitespace-nowrap font-bold text-fdc-orange">{fmtSave(r.save)}</span> : <span className="text-fdc-grey">—</span>), heat: (r) => (r.save > 0 ? Math.min(1, r.save / maxSave) : null), heatScale: 'hue', heatColor: FDC.orange },
    { key: 'why', header: 'Why & what to do', render: (r) => (
      <div className="min-w-0 max-w-[460px]">
        <p className="text-[12px] leading-snug text-fdc-slate">{r.main}</p>
        {r.tags.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{r.tags.map((t, i) => <Pill key={i} color={TAG_COLOR[t.tone]}>{t.label}</Pill>)}</div>}
      </div>
    ) },
  ];

  return (
    <div className="animate-fade-up space-y-4">
      {/* header + the one control that drives everything: the material dropdown */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 text-[16px] font-bold leading-tight text-fdc-ink"><Factory size={17} strokeWidth={2.3} className="text-fdc-green" /> Suppliers — {M.displayName}</h2>
          <p className="mt-1 text-[12.5px] leading-snug text-fdc-grey">Pick a material, then switch between the suppliers you use today and the alternatives you could bring in. Click any supplier for the full detail.</p>
        </div>
        <Dropdown label="Material" value={mat} options={matOptions} onChange={(k) => { setMat(k); setSel(null); }} width={210} />
      </div>

      {/* money strip — the whole mantra in four numbers */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-black/[0.06] bg-black/[0.05] sm:grid-cols-4">
        <Stat label="You spend / yr" value={fmtSave(M.spend)} />
        <Stat label="You can save / yr" value={M.savings > 0 ? fmtSave(M.savings) : '—'} tone={M.savings > 0 ? 'save' : undefined} />
        <Stat label="Suppliers you use" value={String(rows.length)} />
        <Stat label="Vs market ask" value={data.marketAsks?.materials[mat] ? (data.marketAsks.materials[mat].tone === 'headroom' ? 'Room to push' : 'Fair') : '—'} tone={data.marketAsks?.materials[mat]?.tone === 'headroom' ? 'warn' : data.marketAsks?.materials[mat] ? 'good' : undefined} />
      </div>

      {/* current suppliers  ⇄  alternative suppliers */}
      <div className="flex flex-wrap items-center gap-2.5">
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: 'current', label: `Current suppliers (${rows.length})` },
            { value: 'alternatives', label: `Alternative suppliers${altCount ? ` (${altCount})` : ''}` },
          ]}
        />
        <span className="text-[11.5px] text-fdc-grey">{view === 'current' ? 'Who you buy from today.' : 'Other suppliers you could bring in — not FDC suppliers yet.'}</span>
      </div>

      {view === 'current' ? (
        <>
          {/* the lead table */}
          <Card pad={false}>
            <div className="px-4 pt-3.5">
              <h3 className="text-[14px] font-bold text-fdc-ink">What you pay each supplier — biggest saving first</h3>
              <p className="text-[12px] text-fdc-grey">{rows.length} supplier{rows.length === 1 ? '' : 's'} of {M.displayName.toLowerCase()}. Click a row to open that supplier’s full detail.</p>
            </div>
            <div className="px-2 py-2">
              <Table columns={cols} rows={rows} getKey={(r) => r.vendorKey} initialSort={{ key: 'save', dir: 'desc' }} onRowClick={(r) => setSel(r.vendorKey)} activeKey={selKey} maxHeight={420} dense />
            </div>
          </Card>

          {/* the selected supplier's full operational read */}
          {selVendor && <VendorCard vendor={selVendor} data={data} onFull={(s) => setProfile(s)} onSeeAlternatives={() => setView('alternatives')} />}

          {/* everything else about this material — collapsed by default to keep the page short */}
          <Collapsible title={`All the numbers behind ${M.displayName}`} subtitle="Prices per item, who ships old stock, plant-by-plant, price trend, and every delivery." defaultOpen={!!nav.skuDesc}>
            <MaterialDetail key={mat} data={data} mat={mat} skuDesc={nav.skuDesc} onNavigate={onNavigate} showMarketSuppliers={false} />
          </Collapsible>
        </>
      ) : (
        <AlternativesView data={data} mat={mat} onOpenAlt={(alt) => setProfile({ kind: 'alt', alt })} />
      )}

      {profile && (
        <VendorProfile
          subject={profile}
          onClose={() => setProfile(null)}
          brief={null}
          replacements={profile.kind === 'vendor' ? buildAlternatives(profile.fin.vendorKey, data) : []}
          onPickReplacement={onPickAlt}
        />
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'save' | 'warn' | 'good' }) {
  const color = tone === 'save' ? FDC.orange : tone === 'warn' ? FDC.goldDark : tone === 'good' ? FDC.green : FDC.ink;
  return (
    <div className="bg-white px-4 py-2.5">
      <div className="text-[10px] font-medium uppercase tracking-wide text-fdc-grey">{label}</div>
      <div className="tnum mt-0.5 text-[16px] font-extrabold leading-none" style={{ color }}>{value}</div>
    </div>
  );
}

/* ---- collapsible "show more" wrapper — keeps the deep detail one tap away ---- */
function Collapsible({ title, subtitle, defaultOpen = false, children }: { title: string; subtitle?: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card pad={false}>
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left transition hover:bg-black/[0.02] focus-ring">
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-[14px] font-bold text-fdc-ink"><Layers size={15} strokeWidth={2.3} className="text-fdc-green" /> {title}</span>
          {subtitle && <span className="mt-0.5 block text-[11.5px] leading-snug text-fdc-grey">{subtitle}</span>}
        </span>
        <span className="flex shrink-0 items-center gap-1 text-[11.5px] font-semibold text-fdc-grey">{open ? 'Hide' : 'Show'} <ChevronDown size={15} className={`transition ${open ? 'rotate-180' : ''}`} /></span>
      </button>
      {open && <div className="border-t border-black/[0.06] p-4">{children}</div>}
    </Card>
  );
}

/* ============================ alternative suppliers view ============================ */
function AlternativesView({ data, mat, onOpenAlt }: { data: AppData; mat: MaterialKey; onOpenAlt: (alt: AltVendor) => void }) {
  const alts = data.alternatives?.byMaterial?.[mat] ?? [];
  return (
    <div className="space-y-4">
      {alts.length > 0 && <AlternativesTable alts={alts} onOpen={onOpenAlt} />}
      {/* broader public-research market database — map + filterable table + detail */}
      <MarketSuppliers data={data} materialKeys={DB_MATS[mat] ?? []} />
    </div>
  );
}

function AlternativesTable({ alts, onOpen }: { alts: AltVendor[]; onOpen: (a: AltVendor) => void }) {
  const cols: Column<AltVendor>[] = [
    { key: 'name', header: 'Supplier', sortable: true, sortValue: (a) => vendorShort(a.name), render: (a) => (
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 font-semibold text-fdc-slate">{vendorShort(a.name)}{a.secondSourceFor && <Badge color={FDC.green}>2nd source</Badge>}</div>
        <div className="truncate text-[10.5px] text-fdc-grey">{(a.role || '').replace(/-/g, ' ')}</div>
      </div>
    ) },
    { key: 'type', header: 'Type', render: (a) => (a.type === 'listed' ? <Badge color={FDC.blue}><BadgeCheck size={11} /> Listed</Badge> : <Badge color="#8E44AD"><Lock size={11} /> Private</Badge>) },
    { key: 'size', header: 'Yearly sales', align: 'right', sortable: true, sortValue: (a) => a.metrics?.revenue ?? -1, render: (a) => (a.metrics?.revenue != null ? <span className="tnum whitespace-nowrap">{crore(a.metrics.revenue)}</span> : <span className="text-fdc-grey">{a.status !== 'ok' ? 'pending' : '—'}</span>) },
    { key: 'fit', header: 'Grade match / why it fits', render: (a) => (
      <div className="min-w-0 max-w-[460px]">
        {a.gradeLabel && <span className="mb-1 inline-block rounded bg-fdc-gold/15 px-1.5 py-0.5 text-[10px] font-semibold text-fdc-gold-dark">✓ {a.gradeLabel}</span>}
        <p className="text-[11.5px] leading-snug text-fdc-grey">{a.fitNote}</p>
      </div>
    ) },
  ];
  return (
    <Card pad={false}>
      <div className="px-4 pt-3.5">
        <h3 className="flex items-center gap-1.5 text-[14px] font-bold text-fdc-ink"><Repeat2 size={15} className="text-fdc-blue" /> Ready alternatives — researched &amp; grade-checked</h3>
        <p className="text-[12px] leading-snug text-fdc-grey">{alts.length} vetted option{alts.length === 1 ? '' : 's'} with real financials on file. Click a row for the full profile. Not FDC suppliers yet — confirm grade, certificates and an audit before any RFQ.</p>
      </div>
      <div className="px-2 py-2">
        <Table columns={cols} rows={alts} getKey={(a) => a.name} onRowClick={onOpen} initialSort={{ key: 'size', dir: 'desc' }} maxHeight={420} dense />
      </div>
    </Card>
  );
}

function VendorCard({ vendor: x, data, onFull, onSeeAlternatives }: { vendor: ValueVendor; data: AppData; onFull: (s: ProfileSubject) => void; onSeeAlternatives: () => void }) {
  const fin: VendorFin | null = data.financials?.vendors[x.vendorKey] ?? null;
  const probe = fin?.probe ?? null;
  const m = fin?.metrics ?? null;

  // negotiation-room read
  const netMargin = m?.netMargin ?? null;
  const marginSeries = (probe?.series ?? []).filter((y) => y.netMargin != null).map((y) => ({ label: y.fy || y.year, value: y.netMargin as number }));
  const marginFalling = marginSeries.length >= 2 && marginSeries[marginSeries.length - 1].value < marginSeries[0].value;
  const revenue = m?.revenue ?? null;
  const shareOfRev = revenue && x.spend ? (x.spend / revenue) * 100 : null;
  // source for the financial figures — for on-screen traceability
  const srcName = fin?.source?.sourceName ?? null;
  const srcWhen = probe?.latestFy ?? fin?.source?.date ?? null;
  const srcLabel = srcName ? `${srcName}${srcWhen ? ` · ${srcWhen}` : ''}` : null;
  // listed-proxy / pending honesty labels
  const norm = (s: string) => vendorShort(s).toLowerCase().replace(/[^a-z0-9]/g, '');
  const isProxy = fin?.type === 'listed' && fin.companyName && norm(fin.companyName) !== norm(x.name);
  const pending = fin && fin.status !== 'ok';

  let marginRoom: { tone: 'room' | 'tight' | 'none'; text: string };
  if (netMargin == null) marginRoom = { tone: 'none', text: 'We don’t have their profit on file yet — open the full details to check before you push on price.' };
  else if (netMargin < 2) marginRoom = { tone: 'tight', text: `They keep only about ${pct(netMargin)} as profit — almost no room to cut their price. Win on payment terms, bigger volume or fresher stock instead, not price.` };
  else if (marginFalling) marginRoom = { tone: 'room', text: `They keep about ${pct(netMargin)} as profit, and it’s shrinking — they want to hold on to your orders, so there’s room to ask for a better price.` };
  else marginRoom = { tone: 'room', text: `Healthy — they keep about ${pct(netMargin)} as profit, so there’s room to push on price, especially against a cheaper option.` };

  const alts = buildAlternatives(x.vendorKey, data);

  // extra backup candidates from the founder's researched market database (count only — full list in Alternatives view)
  const dbKeys = [...new Set(x.materialKeys.flatMap((k) => DB_MATS[k] ?? []))];
  const selfNorm = norm(x.name);
  const dbLines = (data.backupSuppliers?.lines ?? []).filter((l) => dbKeys.includes(l.materialKey) && norm(l.company) !== selfNorm);
  const dbCount = new Set(dbLines.map((l) => l.id)).size;

  return (
    <Card className="!p-0">
      {/* header */}
      <div className="flex items-start gap-3 border-b border-black/[0.06] p-4">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-white" style={{ background: x.color }}><Factory size={20} /></span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[17px] font-extrabold leading-tight text-fdc-ink">{vendorShort(x.name)}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {x.materialKeys.map((k) => <Badge key={k} color={MATERIAL_COLOR[k as 'dextrose']}>{MAT_NAME[k]}</Badge>)}
            {fin?.type === 'listed' ? <Badge color={FDC.blue}><BadgeCheck size={11} /> Listed company</Badge> : fin?.primarySource === 'probe' ? <Badge color="#8E44AD"><Lock size={11} /> Private company</Badge> : null}
            {pending && <Badge color={FDC.grey}><CircleHelp size={11} /> Money info pending</Badge>}
          </div>
        </div>
        {(probe || m) && (
          <button onClick={() => onFull({ kind: 'vendor', fin: fin!, vendor: data.vendors.find((dv) => dv.key === x.vendorKey) ?? null })} className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-fdc-green/30 bg-fdc-green/[0.06] px-2 py-1 text-[11px] font-semibold text-fdc-green transition hover:bg-fdc-green/[0.12] focus-ring">
            <Maximize2 size={12} /> Full details
          </button>
        )}
      </div>

      {/* honesty banners: listed proxy / financials pending */}
      {isProxy && (
        <div className="flex items-start gap-1.5 border-b border-black/[0.06] bg-fdc-blue/[0.05] px-4 py-2 text-[11px] leading-snug text-fdc-slate">
          <Info size={13} className="mt-0.5 shrink-0 text-fdc-blue" />
          <span>The money figures below are for their <b>listed parent company, {vendorShort(fin!.companyName!)}</b> — the supplier itself doesn’t publish its own.</span>
        </div>
      )}
      {pending && fin?.note && (
        <div className="flex items-start gap-1.5 border-b border-black/[0.06] bg-fdc-grey/[0.06] px-4 py-2 text-[11px] leading-snug text-fdc-slate">
          <Info size={13} className="mt-0.5 shrink-0 text-fdc-grey" />
          <span>{fin.note}</span>
        </div>
      )}

      {/* top facts */}
      <div className="grid grid-cols-2 gap-px bg-black/[0.05] sm:grid-cols-2">
        <Fact label="What you spend / yr" value={crore(x.spend)} />
        <Fact label="When you pay them" value={termPlain(x.termCategory, x.termText)} tone={x.termCategory === 'advance' || x.termCategory === 'immediate' ? 'bad' : 'good'} />
      </div>

      <div className="space-y-3 p-4">
        {/* negotiation room */}
        <Section icon={Hourglass} title="How hard can you push?" color={FDC.green}>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {/* margin room */}
            <div className="rounded-xl border border-black/[0.06] p-2.5">
              <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-fdc-grey">
                {marginRoom.tone === 'room' ? <TrendingDown size={12} className="text-fdc-green" /> : <TrendingUp size={12} className="text-fdc-orange" />} How much profit they keep
              </div>
              {marginSeries.length >= 2 && <div className="mb-1 h-8"><Sparkline points={marginSeries} color={marginFalling ? FDC.red : FDC.blue} height={32} format={(n) => pct(n)} /></div>}
              <p className="text-[11.5px] leading-snug text-fdc-slate">{marginRoom.text}</p>
            </div>
            {/* credit days — the RIGHT call per vendor */}
            <CreditDays x={x} m={m} srcLabel={creditSrcLabel(fin)} />
          </div>

          {/* payables fairness — for advance / immediate vendors */}
          <PayablesFairness x={x} m={m} />

          {shareOfRev != null && (
            <p className="mt-2 rounded-lg bg-fdc-green/[0.06] px-2.5 py-1.5 text-[11.5px] leading-snug text-fdc-slate">
              Your orders are <b className="tnum">{pct(shareOfRev, shareOfRev < 1 ? 2 : 1)}</b> of everything they sell (<b className="tnum">{crore(revenue!)}</b> a year){shareOfRev >= 5 ? ' — a big customer, so your ask carries real weight.' : ' — a small customer, so lead with bigger volume or a cheaper option you could switch to.'}
            </p>
          )}
          {srcLabel && (netMargin != null || revenue != null) && (
            <p className="mt-1.5 text-[10px] leading-snug text-fdc-grey">Their profit &amp; sales — {srcLabel}. Open <b>Full details</b> for every figure and where it comes from.</p>
          )}
        </Section>

        {/* freshness + orders */}
        <div className="grid gap-3 sm:grid-cols-2">
          <Section icon={Clock} title="How fresh they ship" color={FDC.orange}>
            {x.freshnessByMaterial.filter((f) => f.avgAgeDays != null).length ? (
              <div className="space-y-1.5">
                {x.freshnessByMaterial.filter((f) => f.avgAgeDays != null).map((f) => (
                  <div key={f.materialKey} className="flex items-center justify-between text-[12px]">
                    <span className="text-fdc-slate">{MAT_NAME[f.materialKey]}</span>
                    <span className="tnum"><b style={{ color: f.grade === 'old' ? FDC.red : f.grade === 'ok' ? FDC.goldDark : FDC.green }}>{f.avgAgeDays}d old</b>{f.avgShelfDays != null && <span className="text-fdc-grey"> · {Math.round(f.avgShelfDays / 30)}mo shelf</span>}</span>
                  </div>
                ))}
              </div>
            ) : <p className="text-[11.5px] text-fdc-grey">No manufacture dates on file.</p>}
          </Section>
          <Section icon={PackageSearch} title="How they order" color={FDC.slate}>
            {x.orders.length ? (
              <div className="space-y-1.5">
                {x.orders.map((o) => (
                  <div key={o.materialKey} className="flex items-center justify-between text-[12px]">
                    <span className="text-fdc-slate">{MAT_NAME[o.materialKey]}</span>
                    <span className="tnum text-fdc-grey"><b className="text-fdc-ink">{o.poCount}</b> POs · {o.deliveriesPerPo}/PO</span>
                  </div>
                ))}
              </div>
            ) : <p className="text-[11.5px] text-fdc-grey">No orders on file.</p>}
          </Section>
        </div>

        {/* alternatives — compact pointer to the dedicated Alternative suppliers view */}
        <Section icon={Repeat2} title="Who could replace them" color={FDC.blue}>
          {alts.length > 0 ? (
            <p className="text-[11.5px] leading-snug text-fdc-slate">
              <b>{alts.slice(0, 3).map((a) => a.name).join(' · ')}</b>{alts.length > 3 ? ` and ${alts.length - 3} more` : ''} can supply the same.{' '}
              <button onClick={onSeeAlternatives} className="font-semibold text-fdc-blue underline-offset-2 hover:underline">See all alternatives →</button>
            </p>
          ) : (
            <p className="text-[11.5px] leading-snug text-fdc-grey">No ready alternative on file for this one.{' '}
              <button onClick={onSeeAlternatives} className="font-semibold text-fdc-blue underline-offset-2 hover:underline">Browse the market →</button>
            </p>
          )}
          {dbCount > 0 && <p className="mt-1 text-[10.5px] leading-snug text-fdc-grey">Plus <b>{dbCount}</b> more potential backups from public market research — open the <b>Alternative suppliers</b> tab above.</p>}
        </Section>
      </div>
    </Card>
  );
}

/* ---- credit-days: give the RIGHT call per vendor, from their real debtor days ---- */
function CreditDays({ x, m, srcLabel }: { x: ValueVendor; m: FinMetrics | null; srcLabel: string | null }) {
  const debtor = m?.receivableDays != null ? Math.round(m.receivableDays) : null;
  const cat = x.termCategory;
  const fdcDays = x.termDays;
  let call: { tone: 'opportunity' | 'satisfied' | 'neutral'; node: React.ReactNode } | null = null;

  if (debtor != null) {
    const theyWait = <>They wait on average <b className="tnum">{debtor} days</b> to be paid by their own customers.</>;
    if (cat === 'advance' || cat === 'immediate') {
      call = { tone: 'opportunity', node: <>{theyWait} Yet you pay <b>{termPlain(cat, x.termText)}</b> — you’re financing them. <b className="text-fdc-green">Push for 30-day credit</b> to match the terms they already extend others.</> };
    } else if (cat === 'net' && fdcDays != null) {
      const gap = debtor - fdcDays;
      if (gap >= 8) call = { tone: 'opportunity', node: <>{theyWait} You only get <b className="tnum">{fdcDays} days</b> — ask for <b className="text-fdc-green">+{gap} days</b>; they clearly live with longer credit.</> };
      else if (fdcDays - debtor >= 5) call = { tone: 'satisfied', node: <>{theyWait} You already pay slower (<b className="tnum">{fdcDays} days</b>) than they collect — <b className="text-fdc-green">better-than-average terms here</b>. Don’t push credit; win on volume or a credible alternative.</> };
      else call = { tone: 'neutral', node: <>{theyWait} Your <b className="tnum">{fdcDays} days</b> is already in line — little room on terms, so lead with price or volume.</> };
    } else {
      call = { tone: 'neutral', node: <>{theyWait} Match that against your own term when you talk credit.</> };
    }
  }

  const c = call?.tone === 'opportunity' ? FDC.green : call?.tone === 'satisfied' ? FDC.blue : FDC.grey;
  return (
    <div className="rounded-xl border p-2.5" style={{ borderColor: call ? `${c}33` : 'rgba(0,0,0,0.06)' }}>
      <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-fdc-grey"><CalendarClock size={12} style={{ color: c }} /> Credit days</div>
      {call ? (
        <>
          <p className="text-[11.5px] leading-snug text-fdc-slate">{call.node}</p>
          {srcLabel && <p className="mt-1 text-[10px] leading-snug text-fdc-grey">How long they wait to get paid — {srcLabel}. Your term — FDC’s SAP records.</p>}
        </>
      ) : <p className="text-[11.5px] leading-snug text-fdc-grey">We don’t yet know how long they let their own customers wait to pay.</p>}
    </div>
  );
}

/* ---- payables fairness: advance/immediate vendors who stretch their OWN suppliers ---- */
function PayablesFairness({ x, m }: { x: ValueVendor; m: FinMetrics | null }) {
  const payable = m?.payableDays != null ? Math.round(m.payableDays) : null;
  if ((x.termCategory !== 'advance' && x.termCategory !== 'immediate') || payable == null || payable < 10) return null;
  const target = payable >= 25 ? `their own ~${payable}-day terms` : '30-day credit';
  return (
    <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-fdc-gold/[0.10] px-2.5 py-1.5 text-[11.5px] leading-snug text-fdc-slate">
      <HandCoins size={14} className="mt-0.5 shrink-0 text-fdc-gold-dark" />
      <span><b>{vendorShort(x.name)}</b> takes about <b className="tnum">{payable} days</b> to pay its own suppliers, but makes you pay <b>{termPlain(x.termCategory, x.termText).toLowerCase()}</b>. That gap is your strongest argument on payment — ask to move onto {target}.</span>
    </p>
  );
}

function Section({ icon: Icon, title, color, children }: { icon: typeof Hourglass; title: string; color: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5">
        <Icon size={14} style={{ color }} strokeWidth={2.2} />
        <h4 className="text-[12.5px] font-bold text-fdc-ink">{title}</h4>
      </div>
      {children}
    </div>
  );
}

function Fact({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="bg-white px-4 py-2.5">
      <div className="text-[10px] font-medium uppercase tracking-wide text-fdc-grey">{label}</div>
      <div className="tnum mt-0.5 text-[15px] font-extrabold leading-none" style={{ color: tone === 'bad' ? FDC.red : tone === 'good' ? FDC.green : FDC.ink }}>{value}</div>
    </div>
  );
}

/** Source line for the credit-days (Screener for listed, Probe42 for private). */
function creditSrcLabel(fin: VendorFin | null): string | null {
  if (!fin) return null;
  const cd = (fin as VendorFin & { creditDaysSource?: { sourceName: string; asOf: string | null } }).creditDaysSource;
  if (cd) return `${cd.sourceName}${cd.asOf ? ` · ${cd.asOf}` : ''}`;
  if (fin.probe) return `${fin.source?.sourceName ?? 'Probe42 (MCA filings)'}${fin.probe.latestFy ? ` · ${fin.probe.latestFy}` : ''}`;
  return fin.source?.sourceName ?? null;
}

function shortTerm(t: string): string {
  if (/advance/i.test(t)) return '100% advance';
  if (/immediate/i.test(t)) return 'Immediate';
  const m = t.match(/(\d+)\s*day/i);
  return m ? `${m[1]}-day credit` : t;
}

// plain, unambiguous payment-term label keyed off the category (not just the text)
function termPlain(cat: string, text: string | null): string {
  if (cat === 'advance') return '100% advance — before dispatch';
  if (cat === 'immediate') return 'Immediate — pay on receipt';
  const m = (text || '').match(/(\d+)\s*day/i);
  return m ? `${m[1]}-day credit` : (text || '—');
}
