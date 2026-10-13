import { useMemo } from 'react';
import {
  TrendingDown,
  AlertTriangle,
  CircleDollarSign,
  Hourglass,
  PackageX,
  Building2,
  ArrowRight,
  Target,
  PieChart,
  Layers,
  LayoutDashboard,
} from 'lucide-react';
import type { AppData, MaterialKey, Material } from '../types';
import { Card, CardHeader, PageHeader, Badge, MiniStat } from '../components/ui/Card';
import { Table, type Column } from '../components/ui/Table';
import { Donut } from '../components/charts/Donut';
import { HBars, type HBarDatum } from '../components/charts/Bars';
import { StackedBar } from '../components/charts/StackedBar';
import { MATERIAL_COLOR } from '../lib/brand';
import { money, crore, price, pct, unitShort, plantShort, vendorShort as cleanName } from '../lib/format';

interface Alert {
  severity: 'high' | 'med' | 'info';
  icon: typeof AlertTriangle;
  title: string;
  detail: string;
  tag: string;
  tab?: string;
}

const SEV = {
  high: { color: '#D91701', soft: '#FDECEA' },
  med: { color: '#F36D06', soft: '#FDEEE2' },
  info: { color: '#00973D', soft: '#E6F3EC' },
};

export default function Overview({ data, onNavigate }: { data: AppData; onNavigate?: (t: string) => void }) {
  const { meta, materials, priceGaps, plants, paymentTerms } = data;

  const totalPriceSaving = useMemo(
    () => (Object.keys(priceGaps.byMaterial) as MaterialKey[]).reduce((s, k) => s + priceGaps.byMaterial[k].headlineSaving, 0),
    [priceGaps]
  );

  // spend-by-material donut
  const donutData = materials.map((m) => ({
    key: m.key,
    label: m.displayName,
    value: m.totalNetSpend,
    color: MATERIAL_COLOR[m.key],
    note: m.plainName,
  }));

  // biggest price-match savings (ranked bars, one per material — same metric)
  const savingsBars: HBarDatum[] = (Object.keys(priceGaps.byMaterial) as MaterialKey[])
    .map((k) => {
      const g = priceGaps.byMaterial[k];
      const m = materials.find((x) => x.key === k)!;
      return {
        key: k,
        label: m.displayName,
        value: g.headlineSaving,
        color: MATERIAL_COLOR[k],
        valueLabel: money(g.headlineSaving),
        sublabel: g.level === 'material' ? 'match everyone to cheapest' : `${g.skuComparable} items with ≥2 suppliers`,
        note:
          g.level === 'material'
            ? `If all dextrose were bought at the lowest price we already pay (${price(g.bestPrice, g.unit)}), we'd save this much a year.`
            : `Across items bought from 2+ suppliers, if each were matched to the cheapest supplier we already use, we'd save this a year.`,
        tipRows: [
          { label: 'Saving / year', value: money(g.headlineSaving) },
          { label: 'Share of spend', value: pct((g.headlineSaving / m.totalNetSpend) * 100) },
        ],
      };
    })
    .sort((a, b) => b.value - a.value);

  // vendor concentration per material (share of spend)
  const concentration = materials.map((m) => {
    const top = m.vendors.slice(0, 4);
    const rest = m.vendors.slice(4);
    const restSum = rest.reduce((s, v) => s + v.spend, 0);
    const segs = top.map((v) => ({
      key: v.vendorKey,
      label: v.vendor,
      value: v.spend,
      color: v.color,
      note: `${pct((v.spend / m.totalNetSpend) * 100)} of ${m.displayName.toLowerCase()} spend`,
    }));
    if (restSum > 0)
      segs.push({ key: 'others', label: `${rest.length} other suppliers`, value: restSum, color: '#CECECE', note: 'smaller suppliers combined' });
    const topShare = (m.vendors[0]?.spend ?? 0) / m.totalNetSpend;
    return { m, segs, topShare, topVendor: m.vendors[0] };
  });

  // ---- alerts (all computed from the data) --------------------------------
  const alerts: Alert[] = [];
  concentration.forEach(({ m, topShare, topVendor }) => {
    if (topShare >= 0.5 && topVendor) {
      alerts.push({
        severity: topShare >= 0.6 ? 'high' : 'med',
        icon: PackageX,
        title: `${cleanName(topVendor.vendor)} = ${pct(topShare * 100, 0)} of ${m.displayName.toLowerCase()} spend`,
        detail: `One supplier covers most of this material (${money(topVendor.spend)}). If they stop, production is exposed — a second source reduces the risk.`,
        tag: 'Single-source risk',
        tab: 'vendors',
      });
    }
  });
  paymentTerms.worstBySpend.forEach((v) => {
    alerts.push({
      severity: v.termCategory === 'advance' ? 'high' : 'med',
      icon: Hourglass,
      title:
        v.termCategory === 'advance'
          ? `${cleanName(v.vendor)} is paid 100% in advance`
          : `${cleanName(v.vendor)} is paid immediately`,
      detail:
        v.termCategory === 'advance'
          ? `We pay ${money(v.totalSpend)} before the goods even arrive — the weakest possible terms. Moving to 30-day credit frees ${money(v.cashFreed30)}.`
          : `No credit period on ${money(v.totalSpend)} of spend. Moving to 30-day credit frees ${money(v.cashFreed30)} of cash.`,
      tag: 'Weak payment terms',
      tab: 'payment',
    });
  });
  // biggest single price gap (dextrose — single commodity)
  const dg = priceGaps.byMaterial.dextrose;
  if (dg?.vendors && dg.vendors.length > 1) {
    const worst = [...dg.vendors].sort((a, b) => b.excessSpend - a.excessSpend)[0];
    if (worst && worst.gapVsBest > 0) {
      alerts.push({
        severity: 'med',
        icon: CircleDollarSign,
        title: `${cleanName(worst.vendor)} costs ${price(worst.gapVsBest, dg.unit)} more than the cheapest dextrose`,
        detail: `They charge ${price(worst.avgPrice, dg.unit)} vs ${price(dg.bestPrice, dg.unit)} from ${cleanName(dg.bestVendor!)} — about ${money(worst.excessSpend)} extra a year for the same product.`,
        tag: 'Overpaying',
        tab: 'price',
      });
    }
  }
  // inter-plant price gap (dextrose like-for-like)
  const dp = plants.byMaterial.dextrose;
  if (dp?.spread && dp.spread.diff > 0 && dp.cheapestPlant && dp.dearestPlant) {
    alerts.push({
      severity: 'info',
      icon: Building2,
      title: `Same dextrose costs ${price(dp.spread.diff, dp.unit)} more at some plants`,
      detail: `${plantShort(dp.dearestPlant.plantName, dp.dearestPlant.plant)} pays ${price(dp.dearestPlant.avgPrice, dp.unit)} while ${plantShort(dp.cheapestPlant.plantName, dp.cheapestPlant.plant)} pays ${price(dp.cheapestPlant.avgPrice, dp.unit)} for the identical material.`,
      tag: 'Plant price gap',
      tab: 'price',
    });
  }
  // high reversal / return rate
  const retRisk = [...data.vendors].filter((v) => v.reversalRatePct >= 10 && v.totalNetSpend > 1e7).sort((a, b) => b.reversalRatePct - a.reversalRatePct)[0];
  if (retRisk) {
    alerts.push({
      severity: 'info',
      icon: PackageX,
      title: `${cleanName(retRisk.name)} has a high goods-receipt reversal rate (${pct(retRisk.reversalRatePct, 0)})`,
      detail: `${pct(retRisk.reversalRatePct, 0)} of their receipts were later reversed — worth checking for quality or paperwork issues.`,
      tag: 'Quality / returns',
      tab: 'vendors',
    });
  }
  const orderedAlerts = alerts.sort((a, b) => sevRank(b.severity) - sevRank(a.severity)).slice(0, 6);

  return (
    <div className="animate-fade-up space-y-4">
      <PageHeader
        icon={LayoutDashboard}
        title="Procurement at a glance"
        subtitle="Spend, savings, cash freed and supply risk — every number read straight off FDC's real purchase data."
      />

      {/* slim context strip (not a KPI wall) */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MiniStat label="Annual spend" value={crore(meta.totals.netSpend)} sub={`${materials.length} materials · ${meta.canonicalVendorCount} suppliers`} color="#00973D" />
        <MiniStat label="Price-match opportunity" value={money(totalPriceSaving)} sub="matching to prices we already pay" color="#F36D06" />
        <MiniStat label="Cash freed if +30 days" value={money(paymentTerms.cashFreed30Total)} sub="working capital from better terms" color="#2E7CE4" />
        <MiniStat label="Weakest-term exposure" value={money(paymentTerms.worstBySpend.reduce((s, v) => s + v.totalSpend, 0))} sub="paid advance / on delivery" color="#D91701" />
      </div>

      {/* hero: spend donut + top alerts */}
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader icon={PieChart} title="Where the money goes" subtitle="Share of total purchase spend, by material" />
          <Donut data={donutData} format={(n) => money(n)} height={230} centerTitle="Total spend" centerValue={crore(meta.totals.netSpend)} />
          <div className="mt-2 space-y-1.5">
            {materials.map((m) => (
              <div key={m.key} className="flex items-center justify-between gap-2 text-[12.5px]">
                <span className="flex items-center gap-2 text-fdc-slate">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: MATERIAL_COLOR[m.key] }} />
                  <span className="font-semibold">{m.displayName}</span>
                  <span className="hidden text-fdc-grey sm:inline">· {m.plainName}</span>
                </span>
                <span className="tnum whitespace-nowrap font-bold text-fdc-ink">{crore(m.totalNetSpend)}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader
            icon={AlertTriangle}
            title="Top alerts"
            subtitle="The things worth acting on first — read straight off the data"
            accent="#F36D06"
          />
          <div className="space-y-2">
            {orderedAlerts.map((a, i) => {
              const Icon = a.icon;
              const sev = SEV[a.severity];
              return (
                <button
                  key={i}
                  onClick={() => a.tab && onNavigate?.(a.tab)}
                  className="group flex w-full items-start gap-3 rounded-xl border border-black/[0.05] bg-white p-3 text-left transition hover:border-black/10 hover:shadow-sm"
                >
                  <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg" style={{ background: sev.soft, color: sev.color }}>
                    <Icon size={16} strokeWidth={2.3} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="text-[13px] font-bold leading-snug text-fdc-ink">{a.title}</h4>
                    </div>
                    <p className="mt-0.5 text-[12px] leading-snug text-fdc-grey">{a.detail}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Badge color={sev.color}>{a.tag}</Badge>
                    {a.tab && <ArrowRight size={13} className="text-fdc-light transition group-hover:translate-x-0.5 group-hover:text-fdc-grey" />}
                  </div>
                </button>
              );
            })}
          </div>
        </Card>
      </div>

      {/* opportunities + concentration */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader icon={Target} title="Biggest price-match savings" subtitle="Yearly saving if every buyer matched the best price we already pay" accent="#F36D06" />
          <HBars data={savingsBars} format={(n) => money(n)} labelWidth={150} barSize={30} tipTitlePrefix="" />
          <p className="mt-3 rounded-lg bg-fdc-offwhite px-3 py-2 text-[11.5px] leading-snug text-fdc-grey">
            Pure arithmetic on real purchases — no market estimates. Total identified: <span className="font-bold text-fdc-orange">{money(totalPriceSaving)}</span> a year.
          </p>
        </Card>

        <Card>
          <CardHeader icon={Layers} title="How concentrated is each material?" subtitle="Share of spend per supplier — a long single colour means single-source risk" accent="#2E7CE4" />
          <div className="space-y-3.5">
            {concentration.map(({ m, segs, topShare, topVendor }) => (
              <div key={m.key}>
                <div className="mb-1 flex items-center justify-between text-[12px]">
                  <span className="font-semibold text-fdc-slate">{m.displayName}</span>
                  <span className="text-fdc-grey">
                    top supplier{' '}
                    <span className="font-bold" style={{ color: topShare >= 0.5 ? '#D91701' : '#343434' }}>
                      {pct(topShare * 100, 0)}
                    </span>{' '}
                    · {m.vendorCount} suppliers
                  </span>
                </div>
                <StackedBar segments={segs} format={(n) => money(n)} height={34} />
                {topVendor && (
                  <p className="mt-1 text-[11px] text-fdc-grey">
                    {cleanName(topVendor.vendor)} leads at {money(topVendor.spend)}
                    {topShare >= 0.5 && <span className="font-semibold text-fdc-red"> — concentrated</span>}
                  </p>
                )}
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* one smart table */}
      <Card pad={false}>
        <div className="p-4 sm:p-5 pb-3">
          <CardHeader icon={TrendingDown} title="The money map" subtitle="Each material: what we spend, who we depend on, and the opportunity — click a row to dig in" />
        </div>
        <MoneyMapTable data={data} onNavigate={onNavigate} />
      </Card>
    </div>
  );
}

function MoneyMapTable({ data, onNavigate }: { data: AppData; onNavigate?: (t: string) => void }) {
  const { materials, priceGaps, paymentTerms } = data;
  const worstByMaterial = (matName: string) => paymentTerms.worstBySpend.find((x) => x.materials.includes(matName));
  const share = (m: Material) => (m.vendors[0] ? m.vendors[0].spend / m.totalNetSpend : 0);

  const columns: Column<Material>[] = [
    {
      key: 'material', header: 'Material', sortable: true, sortValue: (m) => m.displayName, width: 190,
      render: (m) => (
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: MATERIAL_COLOR[m.key] }} />
          <div className="min-w-0">
            <div className="font-bold text-fdc-ink">{m.displayName}</div>
            <div className="text-[11px] text-fdc-grey">{m.plainName}</div>
          </div>
        </div>
      ),
    },
    { key: 'spend', header: 'Annual spend', align: 'right', sortable: true, sortValue: (m) => m.totalNetSpend, render: (m) => <span className="tnum whitespace-nowrap font-bold text-fdc-ink">{crore(m.totalNetSpend)}</span> },
    {
      key: 'top', header: 'Top supplier (share)', sortable: true, sortValue: (m) => share(m),
      render: (m) => {
        const top = m.vendors[0];
        const s = share(m);
        return (
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: top?.color }} />
            <span className="font-semibold text-fdc-slate">{cleanName(top?.vendor ?? '—')}</span>
            <span className="tnum rounded-full px-1.5 py-0.5 text-[10.5px] font-bold" style={{ background: s >= 0.5 ? '#FDECEA' : '#E6F3EC', color: s >= 0.5 ? '#D91701' : '#00973D' }}>
              {pct(s * 100, 0)}
            </span>
          </div>
        );
      },
    },
    { key: 'count', header: 'Suppliers', align: 'right', sortable: true, sortValue: (m) => m.vendorCount, render: (m) => <span className="tnum font-semibold text-fdc-slate">{m.vendorCount}</span> },
    { key: 'saving', header: 'Price-match saving', align: 'right', sortable: true, sortValue: (m) => priceGaps.byMaterial[m.key].headlineSaving, render: (m) => <span className="tnum font-bold text-fdc-orange">{money(priceGaps.byMaterial[m.key].headlineSaving)}</span> },
    {
      key: 'terms', header: 'Weakest terms',
      render: (m) => {
        const worst = worstByMaterial(m.displayName);
        return worst ? (
          <Badge color={worst.termCategory === 'advance' ? '#D91701' : '#F36D06'}>
            {worst.termCategory === 'advance' ? '100% advance' : 'Immediate'} · {cleanName(worst.vendor)}
          </Badge>
        ) : (
          <span className="text-[11.5px] text-fdc-grey">All on credit · {unitShort(m.primaryUnit)}</span>
        );
      },
    },
  ];

  return (
    <div className="px-2 pb-3">
      <Table columns={columns} rows={materials} getKey={(m) => m.key} initialSort={{ key: 'spend', dir: 'desc' }} onRowClick={() => onNavigate?.('price')} stickyHeader={false} />
    </div>
  );
}

function sevRank(s: Alert['severity']): number {
  return s === 'high' ? 3 : s === 'med' ? 2 : 1;
}
