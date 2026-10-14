import { ArrowRight, TrendingUp, Hourglass, Clock, Sparkles, AlertTriangle } from 'lucide-react';
import type { AppData, ValueAction } from '../types';
import type { Nav } from '../App';
import { Card } from '../components/ui/Card';
import { HBars, type HBarDatum } from '../components/charts/Bars';
import { FDC, MATERIAL_COLOR } from '../lib/brand';

const fmtSave = (n: number) => (n >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : `₹${(n / 1e5).toFixed(1)} L`);
const KIND = {
  price: { icon: TrendingUp, color: FDC.green, label: 'Overpaying' },
  terms: { icon: Hourglass, color: FDC.blue, label: 'Cash tied up' },
  freshness: { icon: Clock, color: FDC.orange, label: 'Old stock' },
} as const;

export default function MoneyOverview({ data, onNavigate }: { data: AppData; onNavigate: (n: Nav) => void }) {
  const v = data.value;
  if (!v) return <Card><p className="text-[13px] text-fdc-grey">Run <code className="rounded bg-black/5 px-1 py-0.5 font-mono text-[11px]">npm run normalize</code> to generate the value data.</p></Card>;

  const bars: HBarDatum[] = v.savingsByMaterial
    .filter((s) => s.savings > 0)
    .sort((a, b) => b.savings - a.savings)
    .map((s) => ({
      key: s.materialKey, label: s.displayName, value: s.savings, color: MATERIAL_COLOR[s.materialKey],
      valueLabel: fmtSave(s.savings),
      note: `${s.displayName}: you overpaid ${fmtSave(s.savings)} this year vs the cheapest price you already paid for the same items.`,
      tipRows: [{ label: 'Saving / yr', value: fmtSave(s.savings) }],
    }));

  return (
    <div className="animate-fade-up space-y-5">
      {/* hero */}
      <div className="relative overflow-hidden rounded-3xl bg-fdc-green px-5 py-6 text-white shadow-pop sm:px-8 sm:py-8">
        <div className="pointer-events-none absolute -right-8 -top-10 h-40 w-40 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -bottom-12 right-20 h-32 w-32 rounded-full bg-fdc-gold/20" />
        <div className="relative">
          <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-white/80">
            <Sparkles size={14} /> FDC procurement — the money
          </div>
          <h1 className="text-[26px] font-extrabold leading-tight sm:text-[34px]">
            You can save about <span className="text-fdc-gold">{fmtSave(v.headline.totalSavings)}</span> a year.
          </h1>
          <p className="mt-1.5 max-w-2xl text-[13px] leading-snug text-white/85 sm:text-[14px]">
            That's what you overpaid this year versus the cheapest price you already paid for the same items — plus cash tied up in weak payment terms. Three moves below capture most of it.
          </p>
        </div>
      </div>

      {/* 3 action cards */}
      <div>
        <h2 className="mb-2.5 text-[13px] font-bold uppercase tracking-wide text-fdc-grey">Do these three things first</h2>
        <div className="grid gap-3 lg:grid-cols-3">
          {v.actions.map((a) => <ActionCard key={a.key} a={a} onNavigate={onNavigate} />)}
        </div>
      </div>

      {/* savings by material */}
      <Card>
        <h2 className="mb-0.5 text-[15px] font-bold text-fdc-ink">Where the savings are</h2>
        <p className="mb-3 text-[12.5px] text-fdc-grey">Yearly overpay by material — click a bar to see every line of proof.</p>
        <HBars
          data={bars}
          format={(n) => fmtSave(n)}
          barSize={30}
          labelWidth={160}
          axisTicks={4}
          onClick={(d) => onNavigate({ tab: 'material', material: d.key as Nav extends { material?: infer M } ? M : never })}
        />
      </Card>
    </div>
  );
}

function ActionCard({ a, onNavigate }: { a: ValueAction; onNavigate: (n: Nav) => void }) {
  const K = KIND[a.kind] || KIND.price;
  const Icon = K.icon;
  return (
    <Card className="flex flex-col">
      <div className="mb-2 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide" style={{ background: `${K.color}14`, color: K.color }}>
          <Icon size={12} /> {K.label}
        </span>
        <span className="grid h-6 w-6 place-items-center rounded-full bg-fdc-ink/5 text-[12px] font-extrabold text-fdc-slate">{a.rank}</span>
      </div>

      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-fdc-grey">Action</div>
      <p className="text-[15px] font-bold leading-snug text-fdc-ink">{a.action}</p>

      <div className="mt-2.5 mb-1 text-[10px] font-semibold uppercase tracking-wide text-fdc-grey">Why</div>
      <p className="text-[12.5px] leading-snug text-fdc-slate">{a.why}</p>

      {a.risk && (
        <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-fdc-orange/[0.08] px-2.5 py-1.5 text-[11.5px] leading-snug text-fdc-slate">
          <AlertTriangle size={13} className="mt-0.5 shrink-0 text-fdc-orange" /> {a.risk}
        </p>
      )}

      <div className="mt-auto flex items-end justify-between gap-2 pt-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-fdc-grey">Save</div>
          <div className="tnum text-[22px] font-extrabold leading-none" style={{ color: FDC.green }}>{a.savingLabel}</div>
        </div>
        <button
          onClick={() => onNavigate(a.proof.tab === 'vendors' ? { tab: 'vendors', vendorKey: a.proof.vendorKey } : { tab: 'material', material: a.proof.material as never, skuDesc: a.proof.skuDesc, vendorKey: a.proof.vendorKey })}
          className="inline-flex items-center gap-1 rounded-lg border border-fdc-green/30 bg-fdc-green/[0.06] px-2.5 py-1.5 text-[12px] font-semibold text-fdc-green transition hover:bg-fdc-green/[0.12] focus-ring"
        >
          See proof <ArrowRight size={13} />
        </button>
      </div>
    </Card>
  );
}
