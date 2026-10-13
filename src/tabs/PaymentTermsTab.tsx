import { useMemo, useState } from 'react';
import { Hourglass, AlertTriangle, Banknote, CalendarClock, Table2 } from 'lucide-react';
import type { AppData, PtVendor } from '../types';
import { Card, CardHeader, PageHeader, Badge } from '../components/ui/Card';
import { Segmented, type Option } from '../components/ui/Controls';
import { HBars, type HBarDatum } from '../components/charts/Bars';
import { Table, type Column } from '../components/ui/Table';
import { TERM_COLOR } from '../lib/brand';
import { money, pct, num, vendorShort as cleanName } from '../lib/format';

type Scenario = '15' | '30';

export default function PaymentTermsTab({ data }: { data: AppData }) {
  const { paymentTerms: pt } = data;
  const [scenario, setScenario] = useState<Scenario>('30');
  const extraDays = scenario === '15' ? 15 : 30;
  const cashFreedOf = (v: PtVendor) => (scenario === '15' ? v.cashFreed15 : v.cashFreed30);
  const totalCashFreed = scenario === '15' ? pt.cashFreed15Total : pt.cashFreed30Total;

  // spend grouped into term buckets (worst → best)
  const buckets = useMemo(() => {
    const defs = [
      { key: 'advance', label: '100% advance', color: TERM_COLOR.advance, order: 0, plain: 'We pay before goods arrive' },
      { key: 'immediate', label: 'Immediate — 0 days', color: TERM_COLOR.immediate, order: 1, plain: 'Pay on delivery, no credit' },
      { key: 'net30', label: '30-day credit', color: '#00A65B', order: 2, plain: '30 days to pay' },
      { key: 'net45', label: '45-day credit', color: '#00973D', order: 3, plain: '45 days to pay' },
      { key: 'net60', label: '60-day credit', color: '#00612D', order: 4, plain: '60 days to pay' },
    ];
    const map: Record<string, { spend: number; count: number }> = {};
    for (const v of pt.vendors) {
      let k = 'net30';
      if (v.termCategory === 'advance') k = 'advance';
      else if (v.termCategory === 'immediate') k = 'immediate';
      else if (v.termDays === 45) k = 'net45';
      else if (v.termDays === 60) k = 'net60';
      else if (v.termDays === 30) k = 'net30';
      (map[k] ||= { spend: 0, count: 0 });
      map[k].spend += v.totalSpend;
      map[k].count += 1;
    }
    return defs.map((d) => ({ ...d, ...(map[d.key] ?? { spend: 0, count: 0 }) })).filter((d) => d.count > 0);
  }, [pt.vendors]);

  const bucketBars: HBarDatum[] = buckets.map((b) => ({
    key: b.key,
    label: b.label,
    value: b.spend,
    color: b.color,
    valueLabel: money(b.spend),
    sublabel: `${b.count} supplier${b.count > 1 ? 's' : ''}`,
    note: `${b.plain}. ${pct((b.spend / pt.totalSpend) * 100)} of all spend.`,
    tipRows: [
      { label: 'Spend', value: money(b.spend) },
      { label: 'Suppliers', value: num(b.count) },
      { label: 'Share', value: pct((b.spend / pt.totalSpend) * 100) },
    ],
  }));

  // cash-freed bars (top suppliers by the selected scenario)
  const cashBars: HBarDatum[] = [...pt.vendors]
    .sort((a, b) => cashFreedOf(b) - cashFreedOf(a))
    .slice(0, 12)
    .map((v) => ({
      key: v.vendorKey,
      label: cleanName(v.vendor),
      value: cashFreedOf(v),
      color: v.worstTerms ? TERM_COLOR[v.termCategory] : v.color,
      valueLabel: money(cashFreedOf(v)),
      sublabel: termShort(v),
      note: `Holding ${cleanName(v.vendor)}'s payment ${extraDays} days longer frees ${money(cashFreedOf(v))} of cash (on ${money(v.totalSpend)} of spend).`,
      tipRows: [
        { label: `Cash freed (+${extraDays}d)`, value: money(cashFreedOf(v)) },
        { label: 'Annual spend', value: money(v.totalSpend) },
        { label: 'Current terms', value: termShort(v) },
      ],
    }));

  return (
    <div className="animate-fade-up space-y-4">
      {/* header row with scenario toggle */}
      <PageHeader
        icon={Hourglass}
        title="Payment terms & working capital"
        subtitle={<>Longer credit = cash stays with FDC longer. Weighted-average term today: <span className="font-bold text-fdc-ink">{pt.weightedAvgTermDays} days</span>.</>}
        right={
          <div className="flex items-center gap-2">
            <span className="hidden text-[12px] font-medium text-fdc-grey sm:inline">If we negotiated more credit:</span>
            <Segmented<Scenario>
              value={scenario}
              onChange={setScenario}
              options={[
                { value: '15', label: '+15 days' },
                { value: '30', label: '+30 days' },
              ] as Option<Scenario>[]}
            />
          </div>
        }
      />

      {/* row A */}
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader icon={Hourglass} title="Where our spend sits on payment terms" subtitle="Most money should sit on credit — anything red is a cash leak" accent="#F36D06" />
          <HBars data={bucketBars} format={(n) => money(n)} labelWidth={150} barSize={28} axisTicks={4} />
          <p className="mt-3 text-[11.5px] leading-snug text-fdc-grey">
            <span className="font-semibold text-fdc-slate">{pct(((buckets.find((b) => b.key === 'advance')?.spend ?? 0) + (buckets.find((b) => b.key === 'immediate')?.spend ?? 0)) / pt.totalSpend * 100)}</span> of spend has no credit period (advance or immediate) — the first place to push for terms.
          </p>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader icon={Banknote} title="Cash you'd free up" subtitle={`By extending every supplier's terms by ${extraDays} days`} accent="#2E7CE4" />
          <div className="rounded-2xl bg-gradient-to-br from-fdc-blue/[0.08] to-fdc-green/[0.06] p-4 text-center">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-fdc-grey">Working capital freed</div>
            <div className="tnum mt-1 text-[30px] font-extrabold leading-none text-fdc-blue">{money(totalCashFreed)}</div>
            <div className="mt-1 text-[11.5px] text-fdc-grey">one-off cash release at +{extraDays} days across {money(pt.totalSpend)} of spend</div>
          </div>
          <div className="mt-3 space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-fdc-grey">Weakest terms — act here first</div>
            {pt.worstBySpend.map((v) => (
              <div key={v.vendorKey} className="flex items-center justify-between gap-2 rounded-xl border border-black/[0.06] bg-white p-2.5">
                <div className="flex items-center gap-2">
                  <span className="grid h-7 w-7 place-items-center rounded-lg" style={{ background: `${TERM_COLOR[v.termCategory]}18`, color: TERM_COLOR[v.termCategory] }}>
                    <AlertTriangle size={14} />
                  </span>
                  <div>
                    <div className="text-[12.5px] font-bold text-fdc-ink">{cleanName(v.vendor)}</div>
                    <div className="text-[11px] text-fdc-grey">{v.termCategory === 'advance' ? '100% advance' : 'Immediate'} · {money(v.totalSpend)}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="tnum text-[13px] font-bold text-fdc-green">{money(v.cashFreed30)}</div>
                  <div className="text-[10px] text-fdc-grey">if moved to 30-day</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* row B */}
      <Card>
        <CardHeader icon={CalendarClock} title={`Cash freed by supplier — ${extraDays} extra days`} subtitle="Biggest working-capital wins (red/orange = supplier currently gives no credit)" accent="#00973D" />
        <HBars data={cashBars} format={(n) => money(n)} labelWidth={160} barSize={22} axisTicks={4} />
      </Card>

      {/* row C: full table */}
      <Card pad={false}>
        <div className="p-4 sm:p-5 pb-3">
          <CardHeader icon={Table2} title="Every supplier's terms" subtitle="Sorted worst-first — click a column to re-sort" />
        </div>
        <TermsTable vendors={pt.vendors} scenario={scenario} />
      </Card>
    </div>
  );
}

function TermsTable({ vendors, scenario }: { vendors: PtVendor[]; scenario: Scenario }) {
  const maxCash = Math.max(1, ...vendors.map((v) => (scenario === '15' ? v.cashFreed15 : v.cashFreed30)));
  const columns: Column<PtVendor>[] = [
    {
      key: 'vendor', header: 'Supplier', sortable: true, sortValue: (r) => r.vendor,
      render: (r) => (
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: r.color }} />
          <span className="font-semibold text-fdc-ink">{cleanName(r.vendor)}</span>
        </div>
      ),
    },
    { key: 'materials', header: 'Supplies', render: (r) => <span className="text-[11.5px] text-fdc-grey">{r.materials.join(', ')}</span> },
    {
      key: 'term', header: 'Terms', align: 'left', sortable: true, sortValue: (r) => r.termRank,
      render: (r) => (
        <Badge color={TERM_COLOR[r.termCategory]}>
          {r.termCategory === 'advance' ? '100% advance' : r.termCategory === 'immediate' ? 'Immediate' : `${r.termDays} days`}
        </Badge>
      ),
    },
    { key: 'days', header: 'Credit days', align: 'right', sortable: true, sortValue: (r) => r.termRank, render: (r) => <span className="tnum font-semibold" style={{ color: r.worstTerms ? TERM_COLOR[r.termCategory] : '#343434' }}>{r.termCategory === 'advance' ? '−100%' : r.termDays}</span> },
    { key: 'spend', header: 'Annual spend', align: 'right', sortable: true, sortValue: (r) => r.totalSpend, render: (r) => <span className="tnum font-bold">{money(r.totalSpend)}</span> },
    {
      key: 'cash', header: `Cash freed +${scenario}d`, align: 'right', sortable: true,
      sortValue: (r) => (scenario === '15' ? r.cashFreed15 : r.cashFreed30),
      heat: (r) => (scenario === '15' ? r.cashFreed15 : r.cashFreed30) / maxCash, heatScale: 'hue', heatColor: '#2E7CE4',
      render: (r) => <span className="tnum font-bold">{money(scenario === '15' ? r.cashFreed15 : r.cashFreed30)}</span>,
    },
  ];
  return (
    <div className="px-2 pb-3">
      <Table columns={columns} rows={vendors} getKey={(r) => r.vendorKey} initialSort={{ key: 'term', dir: 'asc' }} maxHeight={520} />
      <p className="px-2 pt-2 text-[11px] text-fdc-grey">
        Cash freed = annual spend × extra days ÷ 365. A one-off working-capital release from paying later — real arithmetic on real spend.
      </p>
    </div>
  );
}

function termShort(v: PtVendor): string {
  return v.termCategory === 'advance' ? '100% advance' : v.termCategory === 'immediate' ? 'Immediate' : `${v.termDays}-day credit`;
}
