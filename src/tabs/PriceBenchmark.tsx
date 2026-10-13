import { useEffect, useMemo, useState } from 'react';
import { LineChart, Wallet, Building2, Table2, TrendingUp, TrendingDown, Minus, Trophy } from 'lucide-react';
import type { AppData, MaterialKey, SkuGap } from '../types';
import { Card, CardHeader, Badge, Pill } from '../components/ui/Card';
import { Dropdown, type Option } from '../components/ui/Controls';
import { LineArea } from '../components/charts/LineArea';
import { HBars, type HBarDatum } from '../components/charts/Bars';
import { Table, type Column } from '../components/ui/Table';
import { MATERIAL_COLOR } from '../lib/brand';
import { rampGYR } from '../lib/brand';
import { money, price, pct, qty as fmtQty, unitShort, unitLong, monthLabel, plantShort, vendorShort as cleanName } from '../lib/format';

export default function PriceBenchmark({ data }: { data: AppData }) {
  const { materials, priceGaps, plants } = data;
  const [matKey, setMatKey] = useState<MaterialKey>('dextrose');
  const mat = materials.find((m) => m.key === matKey)!;
  const gap = priceGaps.byMaterial[matKey];
  const plantInfo = plants.byMaterial[matKey];
  const isCommodity = mat.singleCommodity;

  const [skuDesc, setSkuDesc] = useState<string>(mat.topSkuMonthly[0]?.desc ?? '');
  useEffect(() => {
    setSkuDesc(mat.topSkuMonthly[0]?.desc ?? '');
  }, [matKey, mat.topSkuMonthly]);
  const sku = mat.topSkuMonthly.find((s) => s.desc === skuDesc) ?? mat.topSkuMonthly[0];

  // SKU gap lookup (desc+unit) from price-gaps
  const skuGapByKey = useMemo(() => {
    const map = new Map<string, SkuGap>();
    gap.skus.forEach((s) => map.set(`${s.unit}|${s.desc}`, s));
    return map;
  }, [gap]);

  const materialOptions: Option<MaterialKey>[] = materials.map((m) => ({
    value: m.key,
    label: m.displayName,
    color: MATERIAL_COLOR[m.key],
    hint: m.category,
  }));
  const skuOptions: Option<string>[] = mat.topSkuMonthly.map((s) => ({
    value: s.desc,
    label: s.desc,
    hint: `${money(s.spend)} · ${unitShort(s.unit)}`,
  }));

  // ---- price trend series (one real product at a time) --------------------
  const trendUnit = isCommodity ? mat.primaryUnit : sku?.unit ?? mat.primaryUnit;
  const trendSeries = isCommodity ? mat.monthly : sku?.monthly ?? [];
  const trendPoints = trendSeries.map((p) => ({
    label: monthLabel(p.month),
    value: p.avgPrice,
    tipRows: [
      { label: 'Avg price', value: p.avgPrice != null ? price(p.avgPrice, trendUnit) : '—' },
      { label: 'Bought', value: fmtQty(p.qty, trendUnit) },
    ],
    note: 'Volume-weighted price we actually paid that month (goods receipts only).',
  }));
  const priced = trendSeries.filter((p) => p.avgPrice != null);
  const firstP = priced[0]?.avgPrice ?? null;
  const lastP = priced[priced.length - 1]?.avgPrice ?? null;
  const yoyChange = firstP != null && lastP != null && firstP > 0 ? ((lastP - firstP) / firstP) * 100 : null;

  // ---- supplier / SKU price-gap bars --------------------------------------
  const activeGap = isCommodity
    ? ({ vendors: gap.vendors ?? [], bestPrice: gap.bestPrice, unit: gap.unit, label: mat.displayName } as const)
    : (() => {
        const sg = sku ? skuGapByKey.get(`${sku.unit}|${sku.desc}`) : undefined;
        return { vendors: sg?.vendors ?? [], bestPrice: sg?.bestPrice, unit: sku?.unit ?? mat.primaryUnit, label: sku?.desc ?? '' } as const;
      })();

  const maxGapPct = Math.max(0.01, ...activeGap.vendors.map((v) => v.gapPct));
  const gapBars: HBarDatum[] = activeGap.vendors.map((v) => ({
    key: v.vendorKey,
    label: cleanName(v.vendor),
    value: v.avgPrice,
    color: v.gapVsBest <= 0.0001 ? '#00973D' : rampGYR(Math.min(1, v.gapPct / maxGapPct)),
    valueLabel: price(v.avgPrice, activeGap.unit),
    sublabel: v.gapVsBest <= 0.0001 ? 'cheapest we pay' : `+${price(v.gapVsBest, activeGap.unit)} vs best`,
    note:
      v.gapVsBest <= 0.0001
        ? 'This is the lowest price we actually pay for this — the benchmark.'
        : `${pct(v.gapPct)} more than the cheapest. Matching this volume to the best price saves about ${money(v.excessSpend)} a year.`,
    tipRows: [
      { label: 'Price', value: price(v.avgPrice, activeGap.unit) },
      { label: 'Bought', value: fmtQty(v.recQty, activeGap.unit) },
      { label: 'Extra / year', value: v.gapVsBest <= 0.0001 ? '—' : money(v.excessSpend) },
    ],
  }));

  // ---- inter-plant bars ---------------------------------------------------
  const plantBars: HBarDatum[] = isCommodity
    ? plantInfo.plants.map((p) => {
        const minP = plantInfo.spread?.min ?? p.avgPrice ?? 0;
        const maxP = plantInfo.spread?.max ?? p.avgPrice ?? 1;
        const t = maxP > minP ? ((p.avgPrice ?? minP) - minP) / (maxP - minP) : 0;
        return {
          key: p.plant,
          label: plantShort(p.plantName, p.plant),
          value: p.avgPrice ?? 0,
          color: (p.avgPrice ?? 0) <= minP + 1e-6 ? '#00973D' : rampGYR(Math.min(1, t)),
          valueLabel: price(p.avgPrice, plantInfo.unit),
          sublabel: fmtQty(p.qty, plantInfo.unit),
          note: `${plantShort(p.plantName, p.plant)} pays ${price(p.avgPrice, plantInfo.unit)} for the same material. Cheapest plant pays ${price(minP, plantInfo.unit)}.`,
          tipRows: [
            { label: 'Avg price', value: price(p.avgPrice, plantInfo.unit) },
            { label: 'Bought', value: fmtQty(p.qty, plantInfo.unit) },
          ],
        };
      })
    : plantInfo.plants.map((p) => ({
        key: p.plant,
        label: plantShort(p.plantName, p.plant),
        value: p.spend,
        color: MATERIAL_COLOR[matKey],
        valueLabel: money(p.spend),
        sublabel: `${fmtQty(p.qty, p.unit)}`,
        note: 'Plants buy different items, so we compare spend here. Like-for-like item prices are in the table below.',
        tipRows: [{ label: 'Spend', value: money(p.spend) }],
      }));

  return (
    <div className="animate-fade-up space-y-4">
      {/* controls */}
      <div className="flex flex-wrap items-end gap-3">
        <Dropdown label="Material" value={matKey} options={materialOptions} onChange={setMatKey} width={240} />
        {!isCommodity && sku && (
          <Dropdown label="Item to trend & benchmark" value={skuDesc} options={skuOptions} onChange={setSkuDesc} width={320} />
        )}
        <div className="ml-auto hidden items-center gap-2 text-[12px] text-fdc-grey sm:flex">
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-fdc-green" /> cheapest we pay</span>
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-fdc-red" /> most above best</span>
        </div>
      </div>

      {/* row A: trend + facts */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            icon={LineChart}
            title={isCommodity ? `Price over the year — ${mat.displayName}` : `Price over the year — ${sku?.desc ?? ''}`}
            subtitle={`What we actually paid each month, ${unitLong(trendUnit)}`}
            accent={MATERIAL_COLOR[matKey]}
          />
          {trendPoints.some((p) => p.value != null) ? (
            <LineArea points={trendPoints} color={MATERIAL_COLOR[matKey]} format={(n) => price(n, trendUnit)} height={250} yAxisFormat={(n) => `₹${n >= 100 ? n.toFixed(0) : n.toFixed(1)}`} />
          ) : (
            <div className="grid h-[250px] place-items-center text-[13px] text-fdc-grey">Not enough price history for this item.</div>
          )}
        </Card>

        <Card>
          <CardHeader icon={Wallet} title="At a glance" subtitle={isCommodity ? mat.plainName : 'For the selected item'} accent={MATERIAL_COLOR[matKey]} />
          <div className="space-y-2.5">
            <FactRow label="Typical price" value={price(isCommodity ? mat.vwap : sku?.avgPrice ?? null, trendUnit)} hint="volume-weighted average" />
            <FactRow
              label="Change over the year"
              value={
                yoyChange == null ? '—' : (
                  <span className="inline-flex items-center gap-1" style={{ color: yoyChange > 0.5 ? '#D91701' : yoyChange < -0.5 ? '#00973D' : '#707070' }}>
                    {yoyChange > 0.5 ? <TrendingUp size={14} /> : yoyChange < -0.5 ? <TrendingDown size={14} /> : <Minus size={14} />}
                    {yoyChange > 0 ? '+' : ''}{yoyChange.toFixed(1)}%
                  </span>
                )
              }
              hint={firstP != null && lastP != null ? `${price(firstP, trendUnit)} → ${price(lastP, trendUnit)}` : undefined}
            />
            <FactRow label="Price range seen" value={`${price(isCommodity ? mat.skus[0]?.minPrice ?? null : sku?.minPrice ?? null, trendUnit)} – ${price(isCommodity ? mat.skus[0]?.maxPrice ?? null : sku?.maxPrice ?? null, trendUnit)}`} hint="lowest to highest receipt" />
            {activeGap.bestPrice != null && activeGap.vendors.length > 0 && (
              <div className="rounded-xl border border-fdc-green/20 bg-fdc-green/[0.05] p-3">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-fdc-green">
                  <Trophy size={13} /> Best price we pay
                </div>
                <div className="tnum mt-0.5 text-[17px] font-extrabold text-fdc-green">{price(activeGap.bestPrice, activeGap.unit)}</div>
                <div className="text-[11.5px] text-fdc-grey">
                  from {cleanName(activeGap.vendors.find((v) => v.gapVsBest <= 0.0001)?.vendor ?? '')}
                  {activeGap.vendors.length > 1 && <> · {activeGap.vendors.length} suppliers compared</>}
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* row B: price gap + inter-plant */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            icon={Wallet}
            title="Price gap by supplier"
            subtitle={isCommodity ? 'Same product, different suppliers — cheapest first' : `For: ${truncateMid(activeGap.label, 46)}`}
            accent="#F36D06"
          />
          {gapBars.length > 1 ? (
            <HBars data={gapBars} format={(n) => price(n, activeGap.unit)} labelWidth={150} barSize={26} axisTicks={4} />
          ) : gapBars.length === 1 ? (
            <div className="rounded-xl bg-fdc-offwhite p-4 text-center text-[12.5px] text-fdc-grey">
              Only one supplier for this item ({cleanName(gapBars[0].label)} at {gapBars[0].valueLabel}). No competing price to benchmark against — a candidate for a second source.
            </div>
          ) : (
            <div className="grid h-[180px] place-items-center text-[13px] text-fdc-grey">No price data.</div>
          )}
        </Card>

        <Card>
          <CardHeader
            icon={Building2}
            title={isCommodity ? 'Same material, different plants' : 'Spend by plant'}
            subtitle={isCommodity ? 'Inter-plant price differences for the identical product' : 'Where this material is bought (prices compared per item in the table)'}
            accent="#2E7CE4"
          />
          <HBars data={plantBars} format={(n) => (isCommodity ? price(n, plantInfo.unit) : money(n))} labelWidth={130} barSize={24} axisTicks={4} />
          {isCommodity && plantInfo.spread && (
            <p className="mt-3 rounded-lg bg-fdc-offwhite px-3 py-2 text-[11.5px] leading-snug text-fdc-grey">
              Spread of <span className="font-bold text-fdc-ink">{price(plantInfo.spread.diff, plantInfo.unit)}</span> ({pct(plantInfo.spread.diffPct)}) between the cheapest and dearest plant for the same material — worth standardising.
            </p>
          )}
        </Card>
      </div>

      {/* row C: table */}
      {isCommodity ? (
        <Card pad={false}>
          <div className="p-4 sm:p-5 pb-3">
            <CardHeader icon={Table2} title="Supplier comparison" subtitle="Every dextrose supplier, benchmarked against the cheapest price we pay" />
          </div>
          <SupplierCompareTable data={data} matKey={matKey} />
        </Card>
      ) : (
        <Card pad={false}>
          <div className="p-4 sm:p-5 pb-3">
            <CardHeader icon={Table2} title="Every item, with its price range" subtitle="Min / average / max price we paid, suppliers, and the gap — click a row to trend it above" />
          </div>
          <SkuTable
            data={data}
            matKey={matKey}
            activeDesc={sku?.desc}
            onPick={(d) => {
              if (mat.topSkuMonthly.some((s) => s.desc === d)) setSkuDesc(d);
            }}
          />
        </Card>
      )}
    </div>
  );
}

function FactRow({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-dashed border-black/[0.07] pb-2 last:border-0">
      <div>
        <div className="text-[12.5px] font-medium text-fdc-slate">{label}</div>
        {hint && <div className="text-[11px] text-fdc-grey">{hint}</div>}
      </div>
      <div className="tnum text-[15px] font-bold text-fdc-ink">{value}</div>
    </div>
  );
}

function SupplierCompareTable({ data, matKey }: { data: AppData; matKey: MaterialKey }) {
  const gap = data.priceGaps.byMaterial[matKey];
  const rows = (gap.vendors ?? []).map((v) => {
    const vend = data.vendors.find((x) => x.key === v.vendorKey);
    return { ...v, vend };
  });
  const maxExcess = Math.max(1, ...rows.map((r) => r.excessSpend));
  const unit = gap.unit;

  const columns: Column<(typeof rows)[number]>[] = [
    {
      key: 'vendor', header: 'Supplier', sortable: true, sortValue: (r) => r.vendor,
      render: (r) => (
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: r.color }} />
          <span className="font-semibold text-fdc-ink">{cleanName(r.vendor)}</span>
          {r.gapVsBest <= 0.0001 && <Badge color="#00973D">cheapest</Badge>}
          {r.vend?.isListed && <Badge color="#2E7CE4">listed</Badge>}
        </div>
      ),
    },
    {
      key: 'terms', header: 'Payment', align: 'left',
      render: (r) => r.vend ? <Pill color={r.vend.termCategory === 'net' ? '#00973D' : '#D91701'}>{termShort(r.vend.termCategory, r.vend.termDays)}</Pill> : <span className="text-fdc-grey">—</span>,
    },
    { key: 'qty', header: `Bought (${unitShort(unit)})`, align: 'right', sortable: true, sortValue: (r) => r.recQty, render: (r) => <span className="tnum">{fmtQty(r.recQty, unit)}</span> },
    { key: 'price', header: 'Avg price', align: 'right', sortable: true, sortValue: (r) => r.avgPrice, render: (r) => <span className="tnum font-bold">{price(r.avgPrice, unit)}</span> },
    {
      key: 'gap', header: 'Vs best', align: 'right', sortable: true, sortValue: (r) => r.gapPct,
      render: (r) => r.gapVsBest <= 0.0001 ? <span className="text-fdc-green font-semibold">—</span> : <span className="tnum font-semibold text-fdc-slate">+{price(r.gapVsBest, unit)} <span className="text-fdc-grey">({pct(r.gapPct)})</span></span>,
    },
    {
      key: 'excess', header: 'Extra / year', align: 'right', sortable: true, sortValue: (r) => r.excessSpend,
      heat: (r) => (r.excessSpend <= 0 ? 0 : r.excessSpend / maxExcess), heatScale: 'gyr',
      render: (r) => <span className="tnum font-bold">{r.excessSpend <= 0 ? '—' : money(r.excessSpend)}</span>,
    },
    { key: 'ret', header: 'Return rate', align: 'right', sortable: true, sortValue: (r) => r.vend?.reversalRatePct ?? 0, render: (r) => <span className="tnum text-fdc-slate">{pct(r.vend?.reversalRatePct ?? 0)}</span> },
  ];

  return (
    <div className="px-2 pb-2">
      <Table columns={columns} rows={rows} getKey={(r) => r.vendorKey} initialSort={{ key: 'excess', dir: 'desc' }} stickyHeader={false} />
      <p className="px-2 pt-2 text-[11px] text-fdc-grey">
        “Extra / year” = (supplier’s price − cheapest price we pay) × their volume. Real arithmetic, no market estimates.
      </p>
    </div>
  );
}

function SkuTable({ data, matKey, activeDesc, onPick }: { data: AppData; matKey: MaterialKey; activeDesc?: string; onPick: (d: string) => void }) {
  const mat = data.materials.find((m) => m.key === matKey)!;
  const gaps = data.priceGaps.byMaterial[matKey];
  const gapByKey = new Map(gaps.skus.map((s) => [`${s.unit}|${s.desc}`, s]));
  const rows = mat.skus.map((s) => {
    const g = gapByKey.get(`${s.unit}|${s.desc}`);
    return { ...s, best: g?.bestVendor, bestPrice: g?.bestPrice, saving: g?.potentialSaving ?? 0, gapRange: s.maxPrice != null && s.minPrice != null ? s.maxPrice - s.minPrice : 0 };
  });
  const maxSaving = Math.max(1, ...rows.map((r) => r.saving));
  const hasTrend = new Set(mat.topSkuMonthly.map((s) => s.desc));

  const columns: Column<(typeof rows)[number]>[] = [
    {
      key: 'desc', header: 'Item', sortable: true, sortValue: (r) => r.desc, width: 280,
      render: (r) => (
        <div className="flex items-center gap-2">
          <span className="min-w-0">
            <span className="block truncate font-semibold text-fdc-ink" title={r.desc}>{r.desc}</span>
          </span>
          {hasTrend.has(r.desc) && <Pill color="#2E7CE4">trend</Pill>}
        </div>
      ),
    },
    { key: 'unit', header: 'Unit', align: 'center', render: (r) => <span className="text-fdc-grey">{unitShort(r.unit)}</span> },
    { key: 'suppliers', header: 'Suppliers', align: 'center', sortable: true, sortValue: (r) => r.vendorCount, render: (r) => <span className={`tnum font-semibold ${r.vendorCount >= 2 ? 'text-fdc-ink' : 'text-fdc-grey'}`}>{r.vendorCount}</span> },
    { key: 'spend', header: 'Spend', align: 'right', sortable: true, sortValue: (r) => r.spend, render: (r) => <span className="tnum font-bold">{money(r.spend)}</span> },
    { key: 'min', header: 'Min', align: 'right', sortable: true, sortValue: (r) => r.minPrice ?? 0, render: (r) => <span className="tnum text-fdc-green">{price(r.minPrice, r.unit)}</span> },
    { key: 'avg', header: 'Avg', align: 'right', sortable: true, sortValue: (r) => r.avgPrice ?? 0, render: (r) => <span className="tnum font-semibold">{price(r.avgPrice, r.unit)}</span> },
    { key: 'max', header: 'Max', align: 'right', sortable: true, sortValue: (r) => r.maxPrice ?? 0, render: (r) => <span className="tnum text-fdc-slate">{price(r.maxPrice, r.unit)}</span> },
    {
      key: 'saving', header: 'Match saving', align: 'right', sortable: true, sortValue: (r) => r.saving,
      heat: (r) => (r.saving <= 0 ? 0 : r.saving / maxSaving), heatScale: 'gyr',
      render: (r) => (r.vendorCount < 2 ? <span className="text-fdc-grey">—</span> : <span className="tnum font-bold">{money(r.saving)}</span>),
      headerHint: 'Saving if this item were matched to its cheapest supplier',
    },
  ];
  return (
    <div className="px-2 pb-2">
      <Table columns={columns} rows={rows} getKey={(r) => `${r.unit}|${r.desc}`} initialSort={{ key: 'spend', dir: 'desc' }} onRowClick={(r) => onPick(r.desc)} activeKey={activeDesc ? `${rows.find((x) => x.desc === activeDesc)?.unit}|${activeDesc}` : null} maxHeight={460} />
      <p className="px-2 pt-2 text-[11px] text-fdc-grey">
        Items with 2+ suppliers can be benchmarked like-for-like. “Match saving” totals <span className="font-semibold text-fdc-orange">{money(gaps.headlineSaving)}</span> across {gaps.skuComparable} such items.
      </p>
    </div>
  );
}

function truncateMid(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
}
function termShort(cat: string, days: number | null): string {
  return cat === 'advance' ? '100% advance' : cat === 'immediate' ? 'Immediate' : `${days} days`;
}
