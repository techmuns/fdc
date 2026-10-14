import { useMemo, useState, useEffect } from 'react';
import { Layers, Search, Clock, Table2, Info } from 'lucide-react';
import type { AppData, MaterialKey, ValueSku, ValueMaterial, LedgerRow } from '../types';
import type { Nav } from '../App';
import { Card, Pill } from '../components/ui/Card';
import { SubTabs } from '../components/ui/Tabs';
import { Dropdown, type Option } from '../components/ui/Controls';
import { Table, type Column } from '../components/ui/Table';
import { HBars, type HBarDatum } from '../components/charts/Bars';
import { FDC, MATERIAL_COLOR, rampGYR } from '../lib/brand';
import { vendorShort, dateLabel } from '../lib/format';

const price = (n: number | null, unit: string) => (n == null ? '—' : `₹${n >= 100 ? Math.round(n) : n >= 10 ? n.toFixed(1) : n.toFixed(2)}/${unit.toLowerCase() === 'nos' ? 'pc' : unit.toLowerCase()}`);
const fmtSave = (n: number) => (n >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `₹${(n / 1e5).toFixed(1)} L` : `₹${Math.round(n).toLocaleString('en-IN')}`);
const qtyFmt = (n: number, unit: string) => `${Math.abs(n) >= 1e5 ? (n / 1e5).toFixed(1) + 'L' : Math.round(n).toLocaleString('en-IN')} ${unit.toLowerCase() === 'nos' ? 'pc' : unit.toLowerCase()}`;
const GRADE = { fresh: FDC.green, ok: FDC.goldDark, old: FDC.red } as const;

export default function MaterialTab({ data, nav, onNavigate }: { data: AppData; nav: Extract<Nav, { tab: 'material' }>; onNavigate: (n: Nav) => void }) {
  const v = data.value;
  const [mat, setMat] = useState<MaterialKey>(nav.material ?? 'dextrose');
  useEffect(() => { if (nav.material) setMat(nav.material); }, [nav.material]);
  const M = v?.materials[mat];

  // selected SKU for the price-gap visual
  const [skuSel, setSkuSel] = useState<string | null>(nav.skuDesc ?? null);
  useEffect(() => { if (nav.skuDesc) setSkuSel(nav.skuDesc); }, [nav.skuDesc]);
  const sku: ValueSku | undefined = useMemo(() => {
    if (!M?.skus.length) return undefined;
    return M.skus.find((s) => s.desc === skuSel) ?? M.skus[0];
  }, [M, skuSel]);

  if (!v || !M) return <Card><p className="text-[13px] text-fdc-grey">No value data.</p></Card>;

  return (
    <div className="animate-fade-up space-y-4">
      <div className="mb-1 flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 text-[16px] font-bold leading-tight text-fdc-ink">
            <Layers size={17} strokeWidth={2.3} className="text-fdc-green" /> What we pay — {M.displayName}
          </h2>
          <p className="mt-1 text-[12.5px] leading-snug text-fdc-grey">{M.plainName} · <span className="font-semibold text-fdc-slate">{fmtSave(M.savings)}</span> to save vs the cheapest price we already pay.</p>
        </div>
        <SubTabs
          tabs={(['dextrose', 'packaging', 'laminates'] as MaterialKey[]).map((k) => ({ key: k, label: v.materials[k].displayName, color: MATERIAL_COLOR[k] }))}
          active={mat}
          onChange={(k) => { setMat(k as MaterialKey); setSkuSel(null); }}
        />
      </div>

      {/* price gap + freshness */}
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3"><PriceGap sku={sku} M={M} onNavigate={onNavigate} /></div>
        <div className="lg:col-span-2"><Freshness M={M} onNavigate={onNavigate} /></div>
      </div>

      {/* SKU list */}
      <SkuList M={M} selectedDesc={sku?.desc} onPick={(d) => setSkuSel(d)} />

      {/* ledger */}
      <Ledger key={mat} rows={v.ledger.filter((r) => r.material === mat)} onNavigate={onNavigate} />
    </div>
  );
}

function PriceGap({ sku, M, onNavigate }: { sku: ValueSku | undefined; M: ValueMaterial; onNavigate: (n: Nav) => void }) {
  if (!sku) return <Card><p className="text-[12.5px] text-fdc-grey">No comparable prices for this material.</p></Card>;
  const best = sku.bestPrice;
  const worst = Math.max(...sku.vendors.map((x) => x.price));
  const span = worst - best || 1;
  const bars: HBarDatum[] = sku.vendors.map((x) => ({
    key: x.vendorKey,
    label: vendorShort(x.vendor),
    value: x.price,
    color: !x.active ? '#C9C9C9' : x.vendorKey === sku.bestActiveVendorKey ? FDC.green : rampGYR((x.price - best) / span),
    valueLabel: price(x.price, sku.unit),
    sublabel: x.active ? qtyFmt(x.qty, sku.unit) : `last ${x.lastPurchase?.slice(0, 7) ?? '—'} · stale`,
    faded: !x.active,
    note: `${vendorShort(x.vendor)}: ${price(x.price, sku.unit)}${x.gapVsBest > 0 ? `, ₹${x.gapVsBest.toFixed(2)} above the cheapest — about ${fmtSave(x.excess)}/yr extra` : ' — the cheapest you pay'}.${x.active ? '' : ' (stale — not bought recently)'}`,
    tipRows: [
      { label: 'Price', value: price(x.price, sku.unit) },
      { label: 'Volume', value: qtyFmt(x.qty, sku.unit) },
      { label: 'Last bought', value: x.lastPurchase ?? '—' },
      ...(x.gapVsBest > 0 ? [{ label: 'Extra / yr', value: fmtSave(x.excess) }] : []),
    ],
  }));
  const showMarket = M.marketRef && /kg/i.test(M.marketRef.unit) && /kg/i.test(sku.unit);
  return (
    <Card>
      <div className="mb-0.5 flex items-start justify-between gap-2">
        <h3 className="text-[14px] font-bold text-fdc-ink">What each supplier charges</h3>
      </div>
      <p className="mb-3 text-[12px] leading-snug text-fdc-grey"><span className="font-semibold text-fdc-slate">{sku.desc}</span> · green = cheapest you already pay · grey = stale (not bought recently). Click a bar to open the supplier.</p>
      <HBars data={bars} format={(n) => price(n, sku.unit)} barSize={28} labelWidth={150} axisTicks={4} onClick={(d) => onNavigate({ tab: 'vendors', vendorKey: d.key })} />
      {showMarket && M.marketRef && (
        <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-fdc-blue/[0.06] px-2.5 py-1.5 text-[11px] leading-snug text-fdc-slate">
          <Info size={13} className="mt-0.5 shrink-0 text-fdc-blue" />
          <span>Market input reference: <b>{M.marketRef.label}</b> ≈ <b className="tnum">₹{M.marketRef.price}/{M.marketRef.unit.replace('₹/', '')}</b> ({M.marketRef.date.slice(0, 4)}). This is an input/benchmark cost — not FDC's price — shown for context only.</span>
        </p>
      )}
      {!showMarket && M.marketRef && (
        <p className="mt-2 text-[11px] text-fdc-grey">Market input trend: {M.marketRef.label} ≈ ₹{M.marketRef.price}/{M.marketRef.unit.replace('₹/', '')} — a ₹/kg input, so it isn't overlaid on a per-piece price.</p>
      )}
    </Card>
  );
}

function Freshness({ M, onNavigate }: { M: ValueMaterial; onNavigate: (n: Nav) => void }) {
  const fr = M.freshness.filter((f) => f.avgAgeDays != null);
  if (!fr.length) return <Card><p className="text-[12.5px] text-fdc-grey">No manufacture dates on file for this material.</p></Card>;
  return (
    <Card>
      <h3 className="flex items-center gap-1.5 text-[14px] font-bold text-fdc-ink"><Clock size={15} className="text-fdc-orange" /> Who ships old stock</h3>
      <p className="mb-3 text-[12px] leading-snug text-fdc-grey">Average age of stock when it reaches you (lower = fresher). From the manufacture date on every receipt.</p>
      <div className="space-y-1.5">
        {fr.map((f) => {
          const c = GRADE[f.grade ?? 'ok'];
          const w = Math.min(100, ((f.avgAgeDays ?? 0) / Math.max(...fr.map((x) => x.avgAgeDays ?? 0))) * 100);
          return (
            <button key={f.vendorKey} onClick={() => onNavigate({ tab: 'vendors', vendorKey: f.vendorKey })} className="block w-full rounded-lg px-2 py-1 text-left transition hover:bg-black/[0.03] focus-ring">
              <div className="flex items-baseline justify-between text-[12px]">
                <span className="truncate font-medium text-fdc-slate">{vendorShort(f.vendor)}</span>
                <span className="tnum shrink-0"><b style={{ color: c }}>{f.avgAgeDays}d old</b>{f.avgShelfDays != null && <span className="text-fdc-grey"> · {Math.round(f.avgShelfDays / 30)}mo shelf left</span>}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-black/[0.05]"><div className="h-full rounded-full" style={{ width: `${w}%`, background: c }} /></div>
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex gap-3 text-[10.5px] text-fdc-grey">
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: FDC.green }} /> fresh ≤30d</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: FDC.goldDark }} /> 31–90d</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: FDC.red }} /> old &gt;90d</span>
      </div>
    </Card>
  );
}

function SkuList({ M, selectedDesc, onPick }: { M: ValueMaterial; selectedDesc?: string; onPick: (d: string) => void }) {
  const rows = M.skus.filter((s) => s.vendorCount >= 1);
  const cols: Column<ValueSku>[] = [
    { key: 'desc', header: 'Item', sortable: true, sortValue: (s) => s.desc, render: (s) => <span className="font-semibold text-fdc-slate">{s.desc}</span> },
    { key: 'vendors', header: 'Suppliers', align: 'right', sortable: true, sortValue: (s) => s.vendorCount, render: (s) => <span className="tnum">{s.vendorCount}</span> },
    { key: 'spend', header: 'Spend/yr', align: 'right', sortable: true, sortValue: (s) => s.spend, render: (s) => <span className="tnum">{fmtSave(s.spend)}</span> },
    { key: 'best', header: 'Cheapest you pay', align: 'right', sortable: true, sortValue: (s) => s.bestPrice, render: (s) => <span className="tnum text-fdc-green">{price(s.bestPrice, s.unit)} <span className="text-[10px] text-fdc-grey">{vendorShort(s.bestVendor)}</span></span> },
    { key: 'savings', header: 'Save by matching', align: 'right', sortable: true, sortValue: (s) => s.savings, render: (s) => <span className="tnum font-bold" style={{ color: s.savings > 0 ? FDC.orange : FDC.grey }}>{s.savings > 0 ? fmtSave(s.savings) : '—'}</span>, heat: (s) => (s.savings > 0 ? Math.min(1, s.savings / Math.max(...rows.map((x) => x.savings || 1))) : null), heatScale: 'hue', heatColor: FDC.orange },
  ];
  return (
    <Card pad={false}>
      <div className="flex items-center justify-between px-4 pt-3.5">
        <div>
          <h3 className="flex items-center gap-1.5 text-[14px] font-bold text-fdc-ink"><Table2 size={15} className="text-fdc-green" /> Every item, biggest saving first</h3>
          <p className="text-[12px] text-fdc-grey">{rows.length} items · click one to see its supplier prices above.</p>
        </div>
      </div>
      <div className="px-2 py-2">
        <Table columns={cols} rows={rows} getKey={(s) => `${s.matCode}|${s.unit}`} initialSort={{ key: 'savings', dir: 'desc' }} onRowClick={(s) => onPick(s.desc)} activeKey={selectedDesc ? rows.find((r) => r.desc === selectedDesc)?.matCode + '|' + rows.find((r) => r.desc === selectedDesc)?.unit : null} maxHeight={360} dense />
      </div>
    </Card>
  );
}

function Ledger({ rows, onNavigate }: { rows: LedgerRow[]; onNavigate: (n: Nav) => void }) {
  const [vendor, setVendor] = useState('all');
  const [plant, setPlant] = useState('all');
  const [q, setQ] = useState('');
  const vendorOpts: Option<string>[] = [{ value: 'all', label: 'All suppliers' }, ...[...new Map(rows.map((r) => [r.vendorKey, r.vendor])).entries()].map(([k, n]) => ({ value: k, label: vendorShort(n) }))];
  const plantOpts: Option<string>[] = [{ value: 'all', label: 'All plants' }, ...[...new Map(rows.map((r) => [r.plant, r.plantName])).entries()].map(([k, n]) => ({ value: k, label: n || k }))];
  const filtered = useMemo(() => rows.filter((r) => (vendor === 'all' || r.vendorKey === vendor) && (plant === 'all' || r.plant === plant) && (!q || (r.desc + r.po + r.matCode).toLowerCase().includes(q.toLowerCase()))), [rows, vendor, plant, q]);

  const cols: Column<LedgerRow>[] = [
    { key: 'date', header: 'Date', sortable: true, sortValue: (r) => r.date, render: (r) => <span className="tnum whitespace-nowrap text-fdc-slate">{dateLabel(r.date)}</span> },
    { key: 'vendor', header: 'Supplier', render: (r) => <button onClick={() => onNavigate({ tab: 'vendors', vendorKey: r.vendorKey })} className="truncate text-left font-semibold text-fdc-slate underline-offset-2 hover:text-fdc-green hover:underline">{vendorShort(r.vendor)}</button> },
    { key: 'desc', header: 'Item', render: (r) => <span className="text-fdc-grey">{r.desc}</span> },
    { key: 'plant', header: 'Plant', render: (r) => <span className="text-fdc-grey">{(r.plantName || r.plant).replace(/FDC Limited,?/i, '').trim() || r.plant}</span> },
    { key: 'qty', header: 'Qty', align: 'right', sortable: true, sortValue: (r) => r.qty, render: (r) => <span className={`tnum whitespace-nowrap ${r.isReturn ? 'text-fdc-red' : ''}`}>{r.qty.toLocaleString('en-IN')} {r.unit.toLowerCase() === 'nos' ? 'pc' : r.unit.toLowerCase()}</span> },
    { key: 'price', header: '₹/unit', align: 'right', sortable: true, sortValue: (r) => r.price ?? 0, render: (r) => (r.isReturn ? <Pill color={FDC.red}>return</Pill> : <span className="tnum whitespace-nowrap font-semibold">{price(r.price, r.unit)}</span>) },
    { key: 'po', header: 'PO', align: 'right', render: (r) => <span className="tnum text-fdc-grey">{r.po ?? '—'}</span> },
  ];
  return (
    <Card pad={false}>
      <div className="flex flex-wrap items-end justify-between gap-2 px-4 pt-3.5">
        <div className="min-w-0">
          <h3 className="flex items-center gap-1.5 text-[14px] font-bold text-fdc-ink"><Table2 size={15} className="text-fdc-green" /> Every delivery — the proof</h3>
          <p className="text-[12px] text-fdc-grey">{filtered.length.toLocaleString('en-IN')} goods receipts, latest first. This is the raw record behind every number.</p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <Dropdown label="Supplier" value={vendor} options={vendorOpts} onChange={setVendor} width={190} />
          <Dropdown label="Plant" value={plant} options={plantOpts} onChange={setPlant} width={170} />
          <label className="inline-flex items-center gap-1.5 rounded-lg border border-black/[0.12] bg-white px-2.5 py-1.5">
            <Search size={13} className="text-fdc-grey" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find item / PO" className="w-32 bg-transparent text-[12.5px] text-fdc-ink outline-none placeholder:text-fdc-grey" />
          </label>
        </div>
      </div>
      <div className="px-2 py-2">
        <Table columns={cols} rows={filtered.slice(0, 400)} getKey={(r) => `${r.date}-${r.matCode}-${r.po}-${r.amt}-${r.qty}`} initialSort={{ key: 'date', dir: 'desc' }} maxHeight={480} dense />
        {filtered.length > 400 && <p className="px-2 pt-1 text-[10.5px] text-fdc-grey">Showing the latest 400 of {filtered.length.toLocaleString('en-IN')} — filter to narrow.</p>}
      </div>
    </Card>
  );
}
