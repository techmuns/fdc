import { useMemo, useState } from 'react';
import {
  HeartPulse, BadgeCheck, Lock, TrendingUp, TrendingDown, Minus, Factory,
  Lightbulb, AlertTriangle, Eye, ExternalLink, Scale, Gauge,
} from 'lucide-react';
import type { AppData, Vendor, VendorFin, Lever } from '../types';
import { Card, CardHeader, Badge, Pill } from '../components/ui/Card';
import { Table, type Column } from '../components/ui/Table';
import { money, pct, vendorShort } from '../lib/format';

const GRADE_COLOR: Record<string, string> = { A: '#00973D', B: '#00A65B', C: '#EFAE0E', D: '#D91701' };
const LEVER_STYLE = {
  opportunity: { color: '#00973D', soft: '#E6F3EC', icon: Lightbulb, label: 'Opportunity' },
  risk: { color: '#D91701', soft: '#FDECEA', icon: AlertTriangle, label: 'Risk' },
  watch: { color: '#F36D06', soft: '#FDEEE2', icon: Eye, label: 'Watch' },
};

interface Row {
  vendor: Vendor;
  fin: VendorFin | null;
}

export default function VendorHealth({ data }: { data: AppData }) {
  const fins = data.financials;
  const rows: Row[] = useMemo(
    () => [...data.vendors].sort((a, b) => b.totalNetSpend - a.totalNetSpend).map((v) => ({ vendor: v, fin: fins?.vendors[v.key] ?? null })),
    [data.vendors, fins]
  );
  const [sel, setSel] = useState<string | null>(rows[0]?.vendor.key ?? null);
  const selRow = rows.find((r) => r.vendor.key === sel) ?? null;

  if (!fins) {
    return (
      <Card>
        <CardHeader icon={HeartPulse} title="Vendor Health" subtitle="Financial strength & supply risk" />
        <p className="text-[13px] text-fdc-grey">Vendor financials haven’t been generated yet. Run <code className="rounded bg-black/5 px-1 py-0.5 font-mono text-[11px]">npm run financials</code>.</p>
      </Card>
    );
  }

  const m = fins.manifest;
  const listedSpend = rows.filter((r) => r.fin?.status === 'ok').reduce((s, r) => s + r.vendor.totalNetSpend, 0);
  const totalSpend = rows.reduce((s, r) => s + r.vendor.totalNetSpend, 0);

  const columns: Column<Row>[] = [
    {
      key: 'name', header: 'Supplier', sortable: true, sortValue: (r) => r.vendor.name, width: 210,
      render: (r) => (
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: r.vendor.color }} />
          <span className="min-w-0">
            <span className="block truncate font-semibold text-fdc-ink" title={r.vendor.name}>{vendorShort(r.vendor.name)}</span>
            <span className="flex items-center gap-1 pt-0.5">
              {r.fin?.type === 'listed' ? <Pill color="#2E7CE4"><BadgeCheck size={10} /> Listed</Pill> : <Pill color="#8E44AD"><Lock size={10} /> Private</Pill>}
            </span>
          </span>
        </div>
      ),
    },
    { key: 'spend', header: 'FDC spend', align: 'right', sortable: true, sortValue: (r) => r.vendor.totalNetSpend, render: (r) => <span className="tnum whitespace-nowrap font-bold">{money(r.vendor.totalNetSpend)}</span> },
    {
      key: 'netMargin', header: 'Net margin', align: 'right', sortable: true, sortValue: (r) => r.fin?.metrics?.netMargin ?? -999,
      heat: (r) => (r.fin?.metrics?.netMargin == null ? null : 1 - clamp01(r.fin.metrics.netMargin / 15)), heatScale: 'gyr',
      render: (r) => fin(r, (x) => <span className="tnum">{x.netMargin != null ? pct(x.netMargin) : '—'}</span>),
    },
    {
      key: 'growth', header: 'Rev growth', align: 'right', sortable: true, sortValue: (r) => r.fin?.metrics?.revenueGrowth ?? -999,
      render: (r) => fin(r, (x) => x.revenueGrowth == null ? <span>—</span> : (
        <span className="tnum inline-flex items-center gap-0.5" style={{ color: x.revenueGrowth > 1 ? '#00973D' : x.revenueGrowth < -1 ? '#D91701' : '#707070' }}>
          {x.revenueGrowth > 1 ? <TrendingUp size={12} /> : x.revenueGrowth < -1 ? <TrendingDown size={12} /> : <Minus size={12} />}{pct(x.revenueGrowth)}
        </span>
      )),
    },
    {
      key: 'de', header: 'Debt / equity', align: 'right', sortable: true, sortValue: (r) => r.fin?.metrics?.debtToEquity ?? -1,
      heat: (r) => (r.fin?.metrics?.debtToEquity == null ? null : clamp01(r.fin.metrics.debtToEquity / 200)), heatScale: 'gyr',
      render: (r) => fin(r, (x) => <span className="tnum">{x.debtToEquity != null ? `${(x.debtToEquity / 100).toFixed(2)}x` : '—'}</span>),
    },
    {
      key: 'health', header: 'Health', align: 'center', sortable: true, sortValue: (r) => r.fin?.healthScore?.value ?? -1,
      render: (r) => r.fin?.healthScore ? (
        <span className="tnum inline-flex items-center gap-1.5">
          <span className="grid h-6 w-6 place-items-center rounded-md text-[11px] font-extrabold text-white" style={{ background: GRADE_COLOR[r.fin.healthScore.grade] }}>{r.fin.healthScore.grade}</span>
          <span className="font-bold text-fdc-ink">{r.fin.healthScore.value}</span>
        </span>
      ) : <Pill color="#707070">pending</Pill>,
    },
  ];

  return (
    <div className="animate-fade-up">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-bold text-fdc-ink">Vendor Health</h2>
          <p className="text-[12.5px] text-fdc-grey">
            Real financials for <span className="font-semibold text-fdc-slate">{m.listedResolved} listed</span> suppliers ({pct((listedSpend / totalSpend) * 100, 0)} of spend) ·{' '}
            <span className="font-semibold text-fdc-slate">{m.privatePending} private</span> awaiting Probe42 · a price win should never come from a supplier about to wobble.
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="min-w-0 lg:col-span-3">
          <Card pad={false}>
            <div className="px-2 py-2">
              <Table columns={columns} rows={rows} getKey={(r) => r.vendor.key} initialSort={{ key: 'spend', dir: 'desc' }} onRowClick={(r) => setSel(r.vendor.key)} activeKey={sel} maxHeight={620} />
            </div>
          </Card>
        </div>
        <div className="min-w-0 lg:col-span-2">
          <div className="lg:sticky lg:top-[124px]">
            {selRow ? <HealthPanel row={selRow} /> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function fin(r: Row, render: (m: NonNullable<VendorFin['metrics']>) => React.ReactNode) {
  if (r.fin?.status === 'ok' && r.fin.metrics) return render(r.fin.metrics);
  return <span className="text-[11px] text-fdc-grey">pending</span>;
}
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

function HealthPanel({ row }: { row: Row }) {
  const { vendor: v, fin } = row;
  const hs = fin?.healthScore ?? null;
  const met = fin?.metrics ?? null;

  return (
    <Card>
      <div className="mb-3 flex items-start gap-2.5">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white" style={{ background: v.color }}><Factory size={19} /></span>
        <div className="min-w-0">
          <h3 className="text-[15px] font-extrabold leading-tight text-fdc-ink">{vendorShort(v.name)}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {fin?.type === 'listed' ? <Badge color="#2E7CE4"><BadgeCheck size={11} /> Listed{fin.symbol ? ` · ${fin.symbol}` : ''}</Badge> : <Badge color="#8E44AD"><Lock size={11} /> Private</Badge>}
            {v.materialsSupplied.map((mm, i) => <Badge key={i} color="#707070">{mm}</Badge>)}
          </div>
        </div>
      </div>

      {/* health gauge */}
      {hs ? (
        <div className="rounded-2xl border border-black/[0.06] p-3.5">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-fdc-grey"><Gauge size={13} /> Financial-health score</span>
            <span className="tnum inline-flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-lg text-[13px] font-extrabold text-white" style={{ background: GRADE_COLOR[hs.grade] }}>{hs.grade}</span>
              <span className="text-[22px] font-extrabold" style={{ color: GRADE_COLOR[hs.grade] }}>{hs.value}</span>
              <span className="text-[12px] text-fdc-grey">/100</span>
            </span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-fdc-offwhite">
            <div className="h-full rounded-full" style={{ width: `${hs.value}%`, background: GRADE_COLOR[hs.grade] }} />
          </div>
          <div className="mt-3 space-y-1.5">
            {hs.components.map((c, i) => (
              <div key={i} className="flex items-center gap-2 text-[11.5px]">
                <span className="w-28 shrink-0 text-fdc-grey">{c.label}</span>
                <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-fdc-offwhite">
                  <span className="absolute left-0 top-0 h-full rounded-full" style={{ width: `${c.score}%`, background: c.score >= 60 ? '#00973D' : c.score >= 40 ? '#EFAE0E' : '#D91701' }} />
                </span>
                <span className="tnum w-10 text-right font-semibold text-fdc-slate">{c.raw != null ? c.raw : c.score}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[10.5px] italic leading-snug text-fdc-grey">{hs.note}</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-fdc-light bg-fdc-offwhite/60 p-4 text-center">
          <Lock size={20} className="mx-auto mb-1.5 text-fdc-grey" />
          <div className="text-[13px] font-bold text-fdc-slate">Financials pending</div>
          <p className="mx-auto mt-1 max-w-xs text-[11.5px] leading-snug text-fdc-grey">
            {fin?.note || 'Private company — add a Probe42 key + VPN and run the enrich step to pull real financials.'}
            {fin?.cin && <> <span className="font-mono text-[10px]">({fin.cin})</span></>}
          </p>
        </div>
      )}

      {/* key metrics */}
      {met && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Metric label="Revenue" value={money(met.revenue)} />
          <Metric label="EBITDA margin" value={met.ebitdaMargin != null ? pct(met.ebitdaMargin) : '—'} />
          <Metric label="Net margin" value={met.netMargin != null ? pct(met.netMargin) : '—'} />
          <Metric label="Debt / equity" value={met.debtToEquity != null ? `${(met.debtToEquity / 100).toFixed(2)}x` : '—'} />
          <Metric label="Market cap" value={money(met.marketCap)} />
          <Metric label="Rev growth" value={met.revenueGrowth != null ? pct(met.revenueGrowth) : '—'} />
        </div>
      )}

      {/* FDC leverage context */}
      <div className="mt-3 flex items-center justify-between rounded-xl bg-fdc-green/[0.05] px-3 py-2">
        <span className="flex items-center gap-1.5 text-[12px] font-semibold text-fdc-green"><Scale size={14} /> Our spend with them</span>
        <span className="tnum text-[13px] font-extrabold text-fdc-ink">
          {money(v.totalNetSpend)}
          {met?.revenue ? <span className="ml-1 text-[11px] font-semibold text-fdc-grey">= {pct((v.totalNetSpend / met.revenue) * 100, 2)} of their revenue</span> : null}
        </span>
      </div>

      {/* levers */}
      {fin && fin.levers.length > 0 && (
        <div className="mt-3">
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-fdc-grey">Negotiation levers</div>
          <div className="space-y-2">
            {fin.levers.map((l, i) => <LeverCard key={i} lever={l} />)}
          </div>
        </div>
      )}

      {fin?.source && (
        <p className="mt-3 flex items-center gap-1 text-[10.5px] text-fdc-grey">
          <ExternalLink size={10} /> Financials: {fin.source.sourceName}{fin.source.date ? ` · ${fin.source.date}` : ''}
        </p>
      )}
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-black/[0.06] px-3 py-2">
      <div className="text-[10.5px] font-medium uppercase tracking-wide text-fdc-grey">{label}</div>
      <div className="tnum mt-0.5 text-[14px] font-extrabold text-fdc-ink">{value}</div>
    </div>
  );
}

function LeverCard({ lever }: { lever: Lever }) {
  const s = LEVER_STYLE[lever.type];
  const Icon = s.icon;
  return (
    <div className="rounded-xl border border-black/[0.05] p-2.5">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md" style={{ background: s.soft, color: s.color }}><Icon size={13} /></span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h4 className="text-[12.5px] font-bold leading-snug text-fdc-ink">{lever.title}</h4>
          </div>
          <p className="mt-0.5 text-[11.5px] leading-snug text-fdc-grey">{lever.detail}</p>
          {lever.evidence.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {lever.evidence.map((e, i) => (
                <span key={i} className="tnum inline-flex items-center gap-1 rounded-md bg-fdc-offwhite px-1.5 py-0.5 text-[10.5px] text-fdc-slate">
                  <span className="text-fdc-grey">{e.label}:</span> <span className="font-bold">{e.value}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
