import { useMemo, useState } from 'react';
import {
  Factory,
  X,
  Building2,
  Hourglass,
  PackageX,
  TrendingUp,
  Layers,
  BadgeCheck,
  MapPin,
} from 'lucide-react';
import type { AppData, Vendor, MaterialKey } from '../types';
import { Card, Badge, Pill } from '../components/ui/Card';
import { Dropdown, type Option } from '../components/ui/Controls';
import { Table, type Column } from '../components/ui/Table';
import { Columns } from '../components/charts/Columns';
import { MATERIAL_COLOR, TERM_COLOR } from '../lib/brand';
import { money, price, pct, qty as fmtQty, monthLabel, vendorShort as cleanName } from '../lib/format';

type Filter = 'all' | MaterialKey | 'listed' | 'worst';

export default function Vendors({ data }: { data: AppData }) {
  const { vendors } = data;
  const [selected, setSelected] = useState<string | null>(vendors[0]?.key ?? null);
  const [filter, setFilter] = useState<Filter>('all');

  const filterOptions: Option<Filter>[] = [
    { value: 'all', label: 'All suppliers', hint: `${vendors.length}` },
    { value: 'dextrose', label: 'Dextrose', color: MATERIAL_COLOR.dextrose },
    { value: 'packaging', label: 'Rigid packaging', color: MATERIAL_COLOR.packaging },
    { value: 'laminates', label: 'Laminates', color: MATERIAL_COLOR.laminates },
    { value: 'listed', label: 'Listed companies', color: '#2E7CE4' },
    { value: 'worst', label: 'Weak payment terms', color: '#D91701' },
  ];

  const rows = useMemo(() => {
    let r = vendors;
    if (filter === 'listed') r = r.filter((v) => v.isListed);
    else if (filter === 'worst') r = r.filter((v) => v.worstTerms);
    else if (filter !== 'all') r = r.filter((v) => v.materialKeys.includes(filter));
    return r;
  }, [vendors, filter]);

  const sel = vendors.find((v) => v.key === selected) ?? null;
  const maxRet = Math.max(1, ...vendors.map((v) => v.reversalRatePct));

  const columns: Column<Vendor>[] = [
    {
      key: 'name', header: 'Supplier', sortable: true, sortValue: (r) => r.name, width: 230,
      render: (r) => (
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: r.color }} />
          <span className="min-w-0">
            <span className="block truncate font-semibold text-fdc-ink" title={r.name}>{cleanName(r.name)}</span>
            <span className="flex items-center gap-1 pt-0.5">
              {r.isListed && <Pill color="#2E7CE4"><BadgeCheck size={10} /> Listed</Pill>}
              {r.underlyingCodes.length > 1 && <Pill color="#707070">{r.underlyingCodes.length} codes</Pill>}
              {r.accGrp === 'ZLLM' && <Pill color="#8E44AD">loan-license</Pill>}
            </span>
          </span>
        </div>
      ),
    },
    {
      key: 'materials', header: 'Supplies', sortable: true, sortValue: (r) => r.materialsSupplied.join(),
      render: (r) => (
        <div className="flex flex-wrap gap-1">
          {r.materialKeys.map((k) => (
            <span key={k} className="h-2.5 w-2.5 rounded-sm" style={{ background: MATERIAL_COLOR[k] }} title={r.materialsSupplied[r.materialKeys.indexOf(k)]} />
          ))}
        </div>
      ),
    },
    { key: 'spend', header: 'Annual spend', align: 'right', sortable: true, sortValue: (r) => r.totalNetSpend, render: (r) => <span className="tnum whitespace-nowrap font-bold">{money(r.totalNetSpend)}</span> },
    { key: 'qty', header: 'Volume', align: 'right', sortable: true, sortValue: (r) => r.totalNetQty, render: (r) => <span className="tnum whitespace-nowrap text-fdc-slate">{fmtQty(r.totalNetQty, r.primaryUnit)}</span> },
    {
      key: 'price', header: 'Avg price', align: 'right', sortable: true, sortValue: (r) => r.blendedAvgPrice ?? 0,
      render: (r) => <span className="tnum whitespace-nowrap font-semibold">{price(r.blendedAvgPrice, r.primaryUnit)}{r.multiUnit && <span className="text-fdc-grey">*</span>}</span>,
      headerHint: '* supplier sells in more than one unit; price shown for their main unit',
    },
    {
      key: 'terms', header: 'Terms', sortable: true, sortValue: (r) => r.termRank,
      render: (r) => <Badge color={TERM_COLOR[r.termCategory]}>{r.termCategory === 'advance' ? 'Advance' : r.termCategory === 'immediate' ? 'Immediate' : `${r.termDays}d`}</Badge>,
    },
    {
      key: 'ret', header: 'Return rate', align: 'right', sortable: true, sortValue: (r) => r.reversalRatePct,
      heat: (r) => r.reversalRatePct / maxRet, heatScale: 'gyr',
      render: (r) => <span className="tnum">{pct(r.reversalRatePct)}</span>,
      headerHint: 'Goods receipts later reversed, as a % of receipts',
    },
  ];

  return (
    <div className="animate-fade-up">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-bold text-fdc-ink">All suppliers</h2>
          <p className="text-[12.5px] text-fdc-grey">{vendors.length} suppliers across 3 materials · click any row for the full picture</p>
        </div>
        <Dropdown label="Filter" value={filter} options={filterOptions} onChange={setFilter} width={220} />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="min-w-0 lg:col-span-3">
          <Card pad={false}>
            <div className="px-2 py-2">
              <Table
                columns={columns}
                rows={rows}
                getKey={(r) => r.key}
                initialSort={{ key: 'spend', dir: 'desc' }}
                onRowClick={(r) => setSelected(r.key)}
                activeKey={selected}
                maxHeight={620}
              />
            </div>
          </Card>
        </div>

        <div className="min-w-0 lg:col-span-2">
          <div className="lg:sticky lg:top-[124px]">
            {sel ? <VendorPanel vendor={sel} data={data} onClose={() => setSelected(null)} /> : <EmptyPanel />}
          </div>
        </div>
      </div>
    </div>
  );
}

function VendorPanel({ vendor: v, data, onClose }: { vendor: Vendor; data: AppData; onClose: () => void }) {
  const monthCols = v.monthly.map((m) => ({
    key: m.month,
    label: monthLabel(m.month).split(" ")[0],
    value: Math.max(0, m.spend),
    color: v.color,
    valueLabel: money(m.spend),
    note: `Bought ${money(m.spend)} from ${cleanName(v.name)} in ${monthLabel(m.month)}.`,
    tipRows: [
      { label: 'Spend', value: money(m.spend) },
      { label: 'Volume', value: fmtQty(m.qty, v.primaryUnit) },
    ],
  }));

  // price positioning per material (where this vendor sits vs best/worst we pay)
  const positions = v.perMaterial.map((pm) => {
    const g = data.priceGaps.byMaterial[pm.materialKey];
    let best: number | undefined;
    let worst: number | undefined;
    if (g.singleCommodity && g.vendors) {
      best = g.bestPrice;
      worst = g.worstPrice;
    }
    return { pm, best, worst };
  });

  return (
    <Card>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex items-start gap-2.5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white" style={{ background: v.color }}>
            <Factory size={19} />
          </span>
          <div>
            <h3 className="text-[15px] font-extrabold leading-tight text-fdc-ink">{cleanName(v.name)}</h3>
            <div className="mt-1 flex flex-wrap items-center gap-1">
              {v.isListed && <Badge color="#2E7CE4"><BadgeCheck size={11} /> Listed{v.listing?.ticker ? ` · ${v.listing.ticker}` : ''}</Badge>}
              <Badge color={v.accGrp === 'ZLLM' ? '#8E44AD' : '#707070'}>{v.accGrpLabel}</Badge>
              <Badge color="#707070"><MapPin size={10} /> {v.country || '—'}</Badge>
            </div>
          </div>
        </div>
        <button onClick={onClose} className="rounded-lg p-1 text-fdc-grey transition hover:bg-black/5 hover:text-fdc-ink">
          <X size={16} />
        </button>
      </div>

      {/* key facts */}
      <div className="grid grid-cols-3 gap-2">
        <PanelStat icon={TrendingUp} label="Annual spend" value={money(v.totalNetSpend)} color="#00973D" />
        <PanelStat icon={Hourglass} label="Terms" value={v.termCategory === 'advance' ? 'Advance' : v.termCategory === 'immediate' ? 'Immediate' : `${v.termDays} days`} color={TERM_COLOR[v.termCategory]} />
        <PanelStat icon={PackageX} label="Return rate" value={pct(v.reversalRatePct)} color={v.reversalRatePct >= 10 ? '#D91701' : '#707070'} />
      </div>

      {v.underlyingCodes.length > 1 && (
        <p className="mt-2 rounded-lg bg-fdc-offwhite px-3 py-1.5 text-[11px] text-fdc-grey">
          Merged from vendor codes <span className="font-semibold text-fdc-slate">{v.underlyingCodes.join(' + ')}</span> (same company, duplicate SAP codes).
        </p>
      )}

      {/* materials supplied */}
      <div className="mt-3">
        <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-fdc-grey">
          <Layers size={12} /> What they supply
        </div>
        <div className="space-y-2">
          {v.perMaterial.map((pm, i) => {
            const posn = positions.find((p) => p.pm.materialKey === pm.materialKey);
            return (
              <div key={i} className="rounded-xl border border-black/[0.06] p-2.5">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-[12.5px] font-bold text-fdc-ink">
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ background: MATERIAL_COLOR[pm.materialKey] }} />
                    {pm.material}
                  </span>
                  <span className="tnum text-[12.5px] font-bold text-fdc-ink">{money(pm.netSpend)}</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-[11.5px] text-fdc-grey">
                  <span>{fmtQty(pm.netQty, pm.unit)}</span>
                  <span className="tnum">avg {price(pm.avgPrice, pm.unit)}</span>
                </div>
                {posn?.best != null && posn.worst != null && pm.avgPrice != null && posn.worst > posn.best && (
                  <PricePosition best={posn.best} worst={posn.worst} value={pm.avgPrice} unit={pm.unit} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* monthly trend */}
      <div className="mt-3">
        <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-fdc-grey">
          <Building2 size={12} /> Monthly purchases
        </div>
        <Columns data={monthCols} format={(n) => money(n)} height={150} yAxisFormat={(n) => (n >= 1e7 ? `${(n / 1e7).toFixed(0)}Cr` : n >= 1e5 ? `${(n / 1e5).toFixed(0)}L` : '0')} />
      </div>

      {v.isListed && (
        <p className="mt-3 rounded-lg border border-fdc-blue/20 bg-fdc-blue/[0.05] px-3 py-2 text-[11px] leading-snug text-fdc-slate">
          <BadgeCheck size={12} className="mr-1 inline text-fdc-blue" />
          Publicly listed{v.listing ? ` on ${v.listing.exchange}` : ''}. Financial-health scores arrive in the <span className="font-semibold">Vendor Health</span> phase.
        </p>
      )}
    </Card>
  );
}

function PricePosition({ best, worst, value, unit }: { best: number; worst: number; value: number; unit: string }) {
  const t = Math.max(0, Math.min(1, (value - best) / (worst - best)));
  return (
    <div className="mt-2">
      <div className="relative h-1.5 rounded-full" style={{ background: 'linear-gradient(90deg,#00973D,#EFAE0E,#D91701)' }}>
        <span className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow" style={{ left: `${t * 100}%`, background: '#161616' }} />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-fdc-grey">
        <span>best {price(best, unit)}</span>
        <span className="font-semibold text-fdc-ink">{t <= 0.02 ? 'cheapest we pay' : `${pct(((value - best) / best) * 100)} above best`}</span>
        <span>worst {price(worst, unit)}</span>
      </div>
    </div>
  );
}

function PanelStat({ icon: Icon, label, value, color }: { icon: typeof TrendingUp; label: string; value: string; color: string }) {
  return (
    <div className="rounded-xl border border-black/[0.06] bg-white p-2.5 text-center">
      <Icon size={15} className="mx-auto mb-1" style={{ color }} />
      <div className="tnum text-[13px] font-extrabold leading-tight text-fdc-ink">{value}</div>
      <div className="text-[10px] text-fdc-grey">{label}</div>
    </div>
  );
}

function EmptyPanel() {
  return (
    <Card>
      <div className="grid place-items-center py-16 text-center text-fdc-grey">
        <Factory size={28} className="mb-2 opacity-40" />
        <p className="text-[13px]">Pick a supplier to see their full profile.</p>
      </div>
    </Card>
  );
}

