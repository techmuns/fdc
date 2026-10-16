import { ArrowRight, TrendingUp, Scale, Coins, Clock, Sparkles, AlertTriangle, Wallet } from 'lucide-react';
import type { AppData, ValueAction, PaymentTerms } from '../types';
import type { Nav } from '../App';
import { Card } from '../components/ui/Card';
import { HBars, type HBarDatum } from '../components/charts/Bars';
import { StackedBar, type StackSegment } from '../components/charts/StackedBar';
import { FDC, MATERIAL_COLOR, TERM_COLOR } from '../lib/brand';

const fmtSave = (n: number) => (n >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : `₹${(n / 1e5).toFixed(1)} L`);

const KIND = {
  price: { icon: TrendingUp, color: FDC.green, label: 'Paying too much', save: 'Save' },
  leverage: { icon: Scale, color: FDC.green, label: 'Price in your favour', save: 'Price gap in your favour' },
  terms: { icon: Coins, color: FDC.blue, label: 'Cash to free up', save: 'Cash freed' },
  freshness: { icon: Clock, color: FDC.orange, label: 'Old stock', save: 'Save' },
} as const;
const kindOf = (a: ValueAction): keyof typeof KIND => (a.isLeverage ? 'leverage' : a.isCash ? 'terms' : a.kind);

export default function MoneyOverview({ data, onNavigate }: { data: AppData; onNavigate: (n: Nav) => void }) {
  const v = data.value;
  if (!v) return <Card><p className="text-[13px] text-fdc-grey">Run <code className="rounded bg-black/5 px-1 py-0.5 font-mono text-[11px]">npm run normalize</code> to generate the value data.</p></Card>;

  const cost = v.headline.costSavings ?? v.headline.totalSavings;
  const cash = v.headline.cashFreed ?? 0;
  const topMat = [...v.savingsByMaterial].sort((a, b) => b.savings - a.savings)[0]?.materialKey;
  const cashVendor = v.headline.cashFreedBy?.[0];

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
            You can save about <span className="text-fdc-gold">{fmtSave(cost)}</span> a year.
          </h1>
          <p className="mt-1.5 max-w-2xl text-[13px] leading-snug text-white/85 sm:text-[14px]">
            That's just from price — paying the lower price you already pay elsewhere for the very same items. It drops into profit every year. Separately, you can free up a chunk of one-time cash by fixing weak payment terms — two different kinds of money, kept apart below.
          </p>

          {/* two money figures — never added together */}
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <HeroStat
              eyebrow="Money you can save · every year" value={fmtSave(cost)} tone="white"
              sub="Lower prices on items you already buy — goes straight to profit, every year."
              cta="See every line of proof" onClick={() => topMat && onNavigate({ tab: 'material', material: topMat })}
            />
            <HeroStat
              eyebrow="Cash you can free up · one-time" value={fmtSave(cash)} tone="gold"
              sub="One-time cash freed up by moving advance / pay-on-delivery suppliers onto 30-day credit. Not a yearly saving."
              cta={cashVendor ? `See ${shortName(cashVendor.name)} — the proof` : 'See the proof'}
              onClick={() => cashVendor && onNavigate({ tab: 'vendors', vendorKey: cashVendor.vendorKey })}
            />
          </div>
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

      {/* payment terms & the cash they tie up */}
      {data.paymentTerms && <PaymentTermsPanel pt={data.paymentTerms} onNavigate={onNavigate} />}
    </div>
  );
}

const TERM_LABEL: Record<string, string> = { net: 'On credit (30-day)', immediate: 'Pay on receipt', advance: 'Paid in advance', unknown: 'Unknown' };
function PaymentTermsPanel({ pt, onNavigate }: { pt: PaymentTerms; onNavigate: (n: Nav) => void }) {
  const segs: StackSegment[] = [...pt.byCategory]
    .sort((a, b) => b.spend - a.spend)
    .map((c) => ({ key: c.category, label: TERM_LABEL[c.category] ?? c.category, value: c.spend, color: TERM_COLOR[c.category] ?? FDC.grey, note: `${c.count} supplier${c.count > 1 ? 's' : ''} · ${fmtSave(c.spend)} of spend on ${(TERM_LABEL[c.category] ?? c.category).toLowerCase()} terms.` }));
  const weak = pt.worstBySpend ?? [];
  // only the advance / pay-on-receipt suppliers have cash to free (the rest already give 30 days) —
  // keep this consistent with the headline figure, never the gross "all spend × 30/365".
  const freeable = weak.reduce((s, w) => s + (w.cashFreed30 || 0), 0);
  return (
    <Card>
      <div className="mb-0.5 flex items-center gap-1.5">
        <Wallet size={16} className="text-fdc-blue" strokeWidth={2.2} />
        <h2 className="text-[15px] font-bold text-fdc-ink">Payment terms &amp; the cash they tie up</h2>
      </div>
      <p className="mb-3 text-[12.5px] leading-snug text-fdc-grey">
        On average you pay your suppliers in about <b className="text-fdc-slate">{pt.weightedAvgTermDays ?? '—'} days</b>. Most already give you 30 days, so the cash to free up sits with the few you pay in advance or on delivery. Moving just those onto 30-day credit frees up about <b className="text-fdc-slate">{fmtSave(freeable)}</b> in one-time cash (not a yearly saving).
      </p>
      <StackedBar segments={segs} format={(n) => fmtSave(n)} height={44} />
      <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-fdc-grey">
        {segs.map((s) => <span key={s.key} className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />{s.label} <b className="tnum text-fdc-slate">{fmtSave(s.value)}</b></span>)}
      </div>

      {weak.length > 0 && (
        <div className="mt-3">
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-fdc-grey">Suppliers you pay too soon — where your cash is stuck</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {weak.map((w) => (
              <button key={w.vendorKey} onClick={() => onNavigate({ tab: 'vendors', vendorKey: w.vendorKey })} className="flex items-center justify-between gap-2 rounded-xl border border-black/[0.06] bg-white px-3 py-2 text-left transition hover:border-fdc-blue/40 hover:bg-fdc-blue/[0.04] focus-ring">
                <div className="min-w-0">
                  <div className="truncate text-[12.5px] font-semibold text-fdc-ink">{shortName(w.vendor)}</div>
                  <div className="text-[11px] text-fdc-grey">{w.termText} · {fmtSave(w.totalSpend)} spend</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="tnum text-[14px] font-extrabold text-fdc-blue">{fmtSave(w.cashFreed30)}</div>
                  <div className="text-[9.5px] uppercase tracking-wide text-fdc-grey">cash freed</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function HeroStat({ eyebrow, value, sub, cta, onClick, tone }: { eyebrow: string; value: string; sub: string; cta: string; onClick: () => void; tone: 'white' | 'gold' }) {
  const gold = tone === 'gold';
  return (
    <button
      onClick={onClick}
      className={`group flex flex-col rounded-2xl border p-3.5 text-left backdrop-blur transition focus-ring ${gold ? 'border-fdc-gold/40 bg-fdc-gold/[0.14] hover:bg-fdc-gold/20' : 'border-white/25 bg-white/10 hover:bg-white/[0.18]'}`}
    >
      <div className="text-[10.5px] font-bold uppercase tracking-wide text-white/75">{eyebrow}</div>
      <div className={`tnum mt-0.5 text-[28px] font-extrabold leading-none ${gold ? 'text-fdc-gold' : 'text-white'}`}>{value}</div>
      <div className="mt-1.5 text-[11.5px] leading-snug text-white/80">{sub}</div>
      <div className="mt-2 inline-flex items-center gap-1 text-[11.5px] font-semibold text-white">
        {cta} <ArrowRight size={13} className="transition group-hover:translate-x-0.5" />
      </div>
    </button>
  );
}

function ActionCard({ a, onNavigate }: { a: ValueAction; onNavigate: (n: Nav) => void }) {
  const K = KIND[kindOf(a)];
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
          <div className="text-[10px] font-semibold uppercase tracking-wide text-fdc-grey">{K.save}</div>
          <div className="tnum text-[22px] font-extrabold leading-none" style={{ color: a.isCash ? FDC.blue : FDC.green }}>{a.savingLabel}</div>
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

function shortName(name: string): string {
  return String(name).replace(/\b(PRIVATE|PVT|LIMITED|LTD|INDIA|\(INDIA\))\b\.?/gi, '').replace(/\s{2,}/g, ' ').replace(/[.,]\s*$/, '').trim();
}
