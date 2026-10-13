import { useMemo, useState } from 'react';
import {
  HeartPulse, BadgeCheck, Lock, TrendingUp, TrendingDown, Minus, Factory,
  Lightbulb, AlertTriangle, Eye, ExternalLink, Scale, Gauge, Activity, Database,
} from 'lucide-react';
import type { AppData, Vendor, VendorFin, Lever, ProbeProfile, ProbeYear, ProbeFlag, ProbeScore } from '../types';
import { Card, CardHeader, PageHeader, Badge, Pill } from '../components/ui/Card';
import { Table, type Column } from '../components/ui/Table';
import { Sparkline } from '../components/charts/Sparkline';
import { money, pct, crore, vendorShort } from '../lib/format';

const GRADE_COLOR: Record<string, string> = { A: '#00973D', B: '#00A65B', C: '#EFAE0E', D: '#D91701' };
const TONE: Record<ProbeFlag['tone'], string> = { risk: '#D91701', watch: '#F36D06', ok: '#00973D' };
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
  const probeN = (m as { privateProbe?: number }).privateProbe ?? 0;
  const okSpend = rows.filter((r) => r.fin?.status === 'ok').reduce((s, r) => s + r.vendor.totalNetSpend, 0);
  const totalSpend = rows.reduce((s, r) => s + r.vendor.totalNetSpend, 0);

  const columns: Column<Row>[] = [
    {
      key: 'name', header: 'Supplier', sortable: true, sortValue: (r) => r.vendor.name, width: 210,
      render: (r) => (
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: r.vendor.color }} />
          <span className="min-w-0">
            <span className="block truncate font-semibold text-fdc-ink" title={r.vendor.name}>{vendorShort(r.vendor.name)}</span>
            <span className="flex flex-wrap items-center gap-1 pt-0.5">
              {r.fin?.type === 'listed' ? <Pill color="#2E7CE4"><BadgeCheck size={10} /> Listed</Pill>
                : r.fin?.primarySource === 'probe' ? <Pill color="#8E44AD"><Database size={10} /> Probe42</Pill>
                : <Pill color="#8E44AD"><Lock size={10} /> Private</Pill>}
              {r.fin?.ratingGrade && <Pill color={gradeColor(r.fin.ratingGrade)}>{r.fin.ratingGrade}</Pill>}
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
      <PageHeader
        icon={HeartPulse}
        title="Vendor Health"
        subtitle={
          <>
            Real financials for <span className="font-semibold text-fdc-slate">{m.listedResolved} listed</span> +{' '}
            <span className="font-semibold text-fdc-slate">{m.privateRated} private</span> suppliers ({pct((okSpend / totalSpend) * 100, 0)} of spend) ·{' '}
            {m.privateUnrated} not public · listed via Munshot, <span className="font-semibold text-fdc-slate">{probeN} private via Probe42</span> (MCA filings; credit-rating docs cross-check) — a price win should never come from a supplier about to wobble.
          </>
        }
      />

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
  return <span className="text-[11px] text-fdc-grey">{r.fin?.status === 'unrated' ? 'not public' : 'pending'}</span>;
}
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
// rating grade → colour (investment-grade green → speculative red)
function gradeColor(g: string): string {
  if (/^(AAA|AA|A)/.test(g)) return '#00973D';
  if (/^BBB/.test(g)) return '#00A65B';
  if (/^BB/.test(g)) return '#EFAE0E';
  if (/^B/.test(g)) return '#F36D06';
  return '#D91701';
}

function HealthPanel({ row }: { row: Row }) {
  const { vendor: v, fin } = row;
  const hs = fin?.healthScore ?? null;
  const met = fin?.metrics ?? null;
  const probe = fin?.probe ?? null;
  const isProbe = fin?.primarySource === 'probe';
  const fyLabel = probe?.latestFy ?? fin?.asOfFy ?? null;

  return (
    <Card>
      <div className="mb-3 flex items-start gap-2.5">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white" style={{ background: v.color }}><Factory size={19} /></span>
        <div className="min-w-0">
          <h3 className="text-[16px] font-extrabold leading-tight text-fdc-ink">{vendorShort(v.name)}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {fin?.type === 'listed' ? <Badge color="#2E7CE4"><BadgeCheck size={11} /> Listed{fin.symbol ? ` · ${fin.symbol}` : ''}</Badge>
              : isProbe ? <Badge color="#8E44AD"><Database size={11} /> Private · Probe42</Badge>
              : <Badge color="#8E44AD"><Lock size={11} /> Private</Badge>}
            {fin?.ratingLabel && <Badge color={gradeColor(fin.ratingGrade || '')} soft={false}>{fin.ratingLabel}</Badge>}
            {fin?.issuerNotCooperating && <Badge color="#D91701"><AlertTriangle size={10} /> Not cooperating</Badge>}
            {v.materialsSupplied.map((mm, i) => <Badge key={i} color="#707070">{mm}</Badge>)}
          </div>
          {(fyLabel || fin?.ratingDate) && (
            <div className="mt-1 text-[10.5px] text-fdc-grey">
              {isProbe ? `Probe42 · MCA filings · ${fyLabel || '—'}` : fin?.asOfFy ? `Financials as of ${fin.asOfFy}` : ''}
              {fin?.ratingDate ? ` · rated ${fin.ratingDate}` : ''}
            </div>
          )}
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
          {probe?.probeScore && <ProbeScoreStrip score={probe.probeScore} />}
          <p className="mt-2 text-[10.5px] italic leading-snug text-fdc-grey">{hs.note}</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-fdc-light bg-fdc-offwhite/60 p-4 text-center">
          <Lock size={20} className="mx-auto mb-1.5 text-fdc-grey" />
          <div className="text-[13px] font-bold text-fdc-slate">{fin?.status === 'unrated' ? 'Financials not public' : 'Financials pending'}</div>
          <p className="mx-auto mt-1 max-w-xs text-[11.5px] leading-snug text-fdc-grey">
            {fin?.note || 'No Probe42 report and no public credit rating under this company’s legal name — private, unlisted companies (and proprietorships) aren’t required to file financials freely.'}
            {fin?.cin && <> <span className="font-mono text-[10px]">({fin.cin})</span></>}
          </p>
        </div>
      )}

      {/* multi-year trend (Probe42) */}
      {probe && probe.series.length >= 2 && <TrendMini series={probe.series} />}

      {/* working capital vs peers (Probe42) */}
      {probe?.peer && <WorkingCapital probe={probe} />}

      {/* key metrics */}
      {met && (
        <>
          {isProbe && fyLabel && <div className="mt-3 mb-1 text-[10px] font-semibold uppercase tracking-wide text-fdc-grey">Probe42 · {fyLabel}</div>}
          <div className={`${isProbe && fyLabel ? '' : 'mt-3'} grid grid-cols-2 gap-2`}>
            <Metric label="Revenue" value={money(met.revenue)} />
            <Metric label={met.ebitdaMargin != null ? 'EBITDA margin' : 'Interest cover'} value={met.ebitdaMargin != null ? pct(met.ebitdaMargin) : met.interestCoverage != null ? `${met.interestCoverage}x` : '—'} />
            <Metric label="Net margin" value={met.netMargin != null ? pct(met.netMargin) : '—'} />
            <Metric label="Debt / equity" value={met.debtToEquity != null ? `${(met.debtToEquity / 100).toFixed(2)}x` : '—'} />
            <Metric label={fin?.type === 'listed' ? 'Market cap' : 'Net worth'} value={fin?.type === 'listed' ? money(met.marketCap) : money(met.netWorth ?? null)} />
            <Metric label={isProbe ? 'Return on capital' : 'Rev growth'} value={isProbe ? (met.roce != null ? pct(met.roce) : '—') : met.revenueGrowth != null ? pct(met.revenueGrowth) : '—'} />
          </div>
        </>
      )}

      {/* risk & compliance flags (Probe42) */}
      {probe && probe.flags.length > 0 && <FlagChips flags={probe.flags} />}

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

      {/* sources */}
      <div className="mt-3 space-y-0.5">
        {fin?.source && <SourceLine name={fin.source.sourceName} url={fin.source.sourceUrl} date={fin.source.date} />}
        {fin?.fallbackSource && <SourceLine name={`Cross-check: ${fin.fallbackSource.sourceName}${fin.fallbackSource.ratingLabel ? ` (${fin.fallbackSource.ratingLabel})` : ''}`} url={fin.fallbackSource.sourceUrl} date={fin.fallbackSource.date} />}
      </div>
    </Card>
  );
}

function SourceLine({ name, url, date }: { name: string; url?: string | null; date?: string | null }) {
  const label = <>Source: {name}{date ? ` · ${date}` : ''}</>;
  return url ? (
    <a href={url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[10.5px] text-fdc-grey hover:text-fdc-blue"><ExternalLink size={10} /> {label}</a>
  ) : (
    <p className="flex items-center gap-1 text-[10.5px] text-fdc-grey"><ExternalLink size={10} /> {label}</p>
  );
}

function TrendMini({ series }: { series: ProbeYear[] }) {
  const specs: { label: string; key: keyof ProbeYear; color: string; fmt: (n: number) => string }[] = [
    { label: 'Revenue', key: 'revenue', color: '#00973D', fmt: (n) => crore(n, 0) },
    { label: 'Net margin', key: 'netMargin', color: '#2E7CE4', fmt: (n) => pct(n) },
    { label: 'RoCE', key: 'roce', color: '#8E44AD', fmt: (n) => pct(n) },
  ];
  return (
    <div className="mt-3 grid grid-cols-3 gap-2">
      {specs.map((sp) => {
        const pts = series.filter((s) => s[sp.key] != null).map((s) => ({ label: s.fy || s.year, value: s[sp.key] as number }));
        const latest = pts[pts.length - 1];
        return (
          <div key={sp.label} className="rounded-xl border border-black/[0.06] p-2">
            <div className="flex items-baseline justify-between gap-1">
              <span className="truncate text-[9.5px] font-medium uppercase tracking-wide text-fdc-grey">{sp.label}</span>
              <span className="tnum text-[11px] font-bold text-fdc-ink">{latest ? sp.fmt(latest.value) : '—'}</span>
            </div>
            {pts.length >= 2 ? <Sparkline points={pts} color={sp.color} height={32} format={sp.fmt} /> : <div className="grid h-[32px] place-items-center text-[10px] text-fdc-grey">1 yr</div>}
          </div>
        );
      })}
    </div>
  );
}

function WorkingCapital({ probe }: { probe: ProbeProfile }) {
  const m = probe.metrics;
  const peer = probe.peer!;
  const rows: { label: string; v: number | null; p: number | null; lowerBetter: boolean }[] = [
    { label: 'Receivable days', v: m.receivableDays, p: peer.receivableDays, lowerBetter: true },
    { label: 'Payable days', v: m.payableDays, p: peer.payableDays, lowerBetter: false },
    { label: 'Cash-conversion cycle', v: m.ccc, p: peer.ccc, lowerBetter: true },
  ];
  return (
    <div className="mt-3 rounded-2xl border border-black/[0.06] p-3">
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-fdc-grey"><Activity size={13} /> Working capital vs peers</div>
      <div className="space-y-1.5">
        {rows.map((r) => {
          if (r.v == null) return null;
          const worse = r.lowerBetter && r.p != null && r.v > r.p * 1.1;
          return (
            <div key={r.label} className="flex items-center gap-2 text-[11.5px]">
              <span className="w-32 shrink-0 text-fdc-grey">{r.label}</span>
              <span className="tnum font-bold text-fdc-ink">{Math.round(r.v)}d</span>
              {r.p != null && <span className="tnum text-[10.5px] text-fdc-grey">peer {Math.round(r.p)}d</span>}
              {worse && <span className="ml-auto text-[10px] font-semibold" style={{ color: '#F36D06' }}>above peers</span>}
            </div>
          );
        })}
      </div>
      {peer.bizSegment && <p className="mt-1.5 text-[10px] text-fdc-grey">Peer set: {peer.bizSegment}{peer.peers ? ` · ${peer.peers} cos` : ''} (Probe42)</p>}
    </div>
  );
}

function ProbeScoreStrip({ score }: { score: ProbeScore }) {
  if (score.overall == null) return null;
  const col = (n: number | null) => (n == null ? '#C9C9C9' : n >= 6 ? '#00973D' : n >= 3 ? '#EFAE0E' : '#D91701');
  const subs: [string, number | null][] = [['Growth', score.growth], ['Profit', score.profitability], ['Liquidity', score.liquidity], ['Solvency', score.solvency], ['Efficiency', score.efficiency]];
  return (
    <div className="mt-2.5 border-t border-black/[0.05] pt-2">
      <div className="flex items-center justify-between">
        <span className="text-[10.5px] font-semibold uppercase tracking-wide text-fdc-grey">Probe42 financial score</span>
        <span className="tnum text-[12px] font-extrabold" style={{ color: col(score.overall) }}>{score.overall}<span className="text-[10px] font-medium text-fdc-grey">/10</span></span>
      </div>
      <div className="mt-1 flex gap-1">
        {subs.map(([label, n]) => (
          <div key={label} className="flex-1 text-center">
            <div className="grid h-5 place-items-center rounded text-[10px] font-bold text-white" style={{ background: col(n) }}>{n ?? '–'}</div>
            <div className="mt-0.5 text-[8.5px] text-fdc-grey">{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FlagChips({ flags }: { flags: ProbeFlag[] }) {
  return (
    <div className="mt-3">
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-fdc-grey">Risk & compliance flags</div>
      <div className="flex flex-wrap gap-1">
        {flags.map((f, i) => (
          <span key={i} className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold" style={{ background: `${TONE[f.tone]}18`, color: TONE[f.tone] }}>
            <AlertTriangle size={9} /> {f.label}
          </span>
        ))}
      </div>
    </div>
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
