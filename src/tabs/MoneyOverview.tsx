import { useState, useMemo, type ReactNode } from 'react';
import { ArrowRight, Sparkles, Wallet, Eye, ListChecks, ChevronDown } from 'lucide-react';
import type { AppData, ValueAction, PaymentTerms, MaterialKey } from '../types';
import type { Nav } from '../App';
import { Card, Pill } from '../components/ui/Card';
import { Table, type Column } from '../components/ui/Table';
import { ActionProof } from '../components/ActionProof';
import { HBars, type HBarDatum } from '../components/charts/Bars';
import { StackedBar, type StackSegment } from '../components/charts/StackedBar';
import { FDC, MATERIAL_COLOR, TERM_COLOR } from '../lib/brand';

const fmtSave = (n: number) => (n >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : `₹${(n / 1e5).toFixed(1)} L`);

export default function MoneyOverview({ data, onNavigate }: { data: AppData; onNavigate: (n: Nav) => void }) {
  const v = data.value;
  const [proof, setProof] = useState<ValueAction | null>(null);
  if (!v) return <Card><p className="text-[13px] text-fdc-grey">Run <code className="rounded bg-black/5 px-1 py-0.5 font-mono text-[11px]">npm run normalize</code> to generate the value data.</p></Card>;

  const cost = v.headline.costSavings ?? v.headline.totalSavings;
  const cash = v.headline.cashFreed ?? 0;
  const totalSpend = data.meta.totals.netSpend;
  const savePct = totalSpend ? (cost / totalSpend) * 100 : 0;
  const topMat = [...v.savingsByMaterial].sort((a, b) => b.savings - a.savings)[0]?.materialKey;
  const cashVendor = v.headline.cashFreedBy?.[0];

  const spendOf = (k: string) => (data.meta.totals.byMaterial as Record<string, number>)[k] ?? 0;
  const bars: HBarDatum[] = v.savingsByMaterial
    .filter((s) => s.savings > 0)
    .sort((a, b) => b.savings - a.savings)
    .map((s) => {
      const spend = spendOf(s.materialKey);
      const pc = spend ? (s.savings / spend) * 100 : 0;
      return {
        key: s.materialKey, label: s.displayName, value: s.savings, color: MATERIAL_COLOR[s.materialKey],
        valueLabel: fmtSave(s.savings),
        sublabel: `of ${fmtSave(spend)} spent · ${pc.toFixed(1)}%`,
        note: `${s.displayName}: you spend ${fmtSave(spend)}/yr and can save ${fmtSave(s.savings)} (${pc.toFixed(1)}%) by matching the cheapest price you already pay.`,
        tipRows: [{ label: 'You spend / yr', value: fmtSave(spend) }, { label: 'You can save', value: fmtSave(s.savings) }],
      };
    });

  return (
    <div className="animate-fade-up space-y-5">
      {/* hero */}
      <div className="relative overflow-hidden rounded-3xl bg-fdc-green px-5 py-5 text-white shadow-pop sm:px-7 sm:py-6">
        <div className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -bottom-12 right-20 h-28 w-28 rounded-full bg-fdc-gold/20" />
        <div className="relative">
          <div className="mb-1 flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-white/80">
            <Sparkles size={13} /> FDC procurement — the money
          </div>
          <h1 className="text-[20px] font-extrabold leading-tight sm:text-[25px]">
            You can save about <span className="text-fdc-gold">{fmtSave(cost)}</span> a year.
          </h1>
          <p className="mt-1 max-w-2xl text-[12.5px] leading-snug text-white/85">
            <b>{fmtSave(cost)}</b> ({savePct.toFixed(1)}%) saveable on price, plus <b>{fmtSave(cash)}</b> one-time cash from payment terms.
          </p>

          {/* two money figures — never added together */}
          <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
            <HeroStat
              eyebrow="Money you can save · every year" value={fmtSave(cost)} tone="white"
              sub={`${savePct.toFixed(1)}% of your ${fmtSave(totalSpend)} yearly spend — straight to profit.`}
              cta="See every line of proof" onClick={() => topMat && onNavigate({ tab: 'vendors', material: topMat })}
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

      {/* the one thing that matters: every insight in a single table — open by default, right under the banner */}
      <AllInsights data={data} onProof={setProof} defaultOpen />

      {/* the extras — kept, but tucked into one closed section you open only to dig deeper */}
      <DigDeeper>
        {/* savings by material */}
        <Card>
          <h2 className="mb-0.5 text-[15px] font-bold text-fdc-ink">Spend &amp; savings by material</h2>
          <p className="mb-3 text-[12.5px] text-fdc-grey">The bar = what you can save each year; the line under it = what you spend. Tap a bar for the proof.</p>
          <HBars
            data={bars}
            format={(n) => fmtSave(n)}
            barSize={30}
            labelWidth={160}
            axisTicks={4}
            onClick={(d) => onNavigate({ tab: 'vendors', material: d.key as MaterialKey })}
          />
        </Card>

        {/* payment terms & the cash they tie up */}
        {data.paymentTerms && <PaymentTermsPanel pt={data.paymentTerms} onNavigate={onNavigate} />}
      </DigDeeper>

      {proof && <ActionProof action={proof} data={data} onClose={() => setProof(null)} onNavigate={onNavigate} />}
    </div>
  );
}

/* ---- the full insight list: every place there's money to save or cash to free ---- */
type InsightKind = 'price' | 'cash' | 'fresh';
interface InsightRow {
  key: string; supplier: string; vendorKey?: string; area: string;
  kind: InsightKind; spend: number; save: number; saveLabel: string; what: string;
  materialKey?: MaterialKey; skuDesc?: string; items?: number;
}
function buildAllInsights(data: AppData): InsightRow[] {
  const v = data.value;
  if (!v) return [];
  const rows: InsightRow[] = [];
  // price savings + old-stock, per material per supplier (same maths as the Suppliers table)
  for (const mk of Object.keys(v.materials)) {
    const M = v.materials[mk];
    const agg = new Map<string, { pay: number; save: number; items: number; topSku?: string; topExcess: number }>();
    for (const s of M.skus) for (const vp of s.vendors) {
      const c = agg.get(vp.vendorKey) ?? { pay: 0, save: 0, items: 0, topExcess: 0 };
      const ex = Math.max(0, vp.excess);
      c.pay += vp.spend; c.save += ex; c.items += 1;
      if (ex > c.topExcess) { c.topExcess = ex; c.topSku = s.desc; } // the single item with the biggest gap — the sharpest proof
      agg.set(vp.vendorKey, c);
    }
    for (const [vk, a] of agg) {
      const vv = v.vendors[vk];
      if (!vv) continue;
      const fr = vv.freshnessByMaterial.find((f) => f.materialKey === mk);
      if (a.save > 0) {
        rows.push({ key: `price-${mk}-${vk}`, supplier: vv.name, vendorKey: vk, area: M.displayName, kind: 'price', spend: a.pay, save: a.save, saveLabel: `${fmtSave(a.save)}/yr`, materialKey: mk as MaterialKey, skuDesc: a.topSku, items: a.items, what: `Match the cheapest ${M.displayName.toLowerCase()} price you already pay${a.items > 1 ? ` across ${a.items} items` : ''}, or move volume to the cheaper supplier.` });
      } else if (fr?.grade === 'old') {
        rows.push({ key: `fresh-${mk}-${vk}`, supplier: vv.name, vendorKey: vk, area: M.displayName, kind: 'fresh', spend: a.pay, save: 0, saveLabel: 'fresher stock', materialKey: mk as MaterialKey, what: `Ships old stock (~${fr.avgAgeDays}d old). Ask for newer-made batches before you reorder.` });
      }
    }
  }
  // one-time cash from fixing advance / pay-on-receipt terms
  for (const w of data.paymentTerms?.worstBySpend ?? []) {
    if (!w.cashFreed30) continue;
    rows.push({ key: `cash-${w.vendorKey}`, supplier: w.vendor, vendorKey: w.vendorKey, area: (w.materials || []).join(', ') || '—', kind: 'cash', spend: w.totalSpend, save: w.cashFreed30, saveLabel: `${fmtSave(w.cashFreed30)} one-time`, what: `You pay ${shortName(w.vendor)} ${w.termText} — either push them to 30-day credit, or move this volume to a cheaper supplier.` });
  }
  rows.sort((a, b) => b.save - a.save);
  return rows;
}

// turn a table row into a ValueAction, so the same proof popup
// (price-gap bars / credit comparison / stock age) opens on row click.
function insightToAction(r: InsightRow): ValueAction {
  const base = { rank: 0, key: r.key, vendorKey: r.vendorKey, action: r.what, why: r.what, risk: null };
  if (r.kind === 'cash') {
    return { ...base, kind: 'terms', saving: r.save, savingLabel: fmtSave(r.save), material: '', isCash: true,
      whyBullets: [`You pay ${shortName(r.supplier)} too soon on ${fmtSave(r.spend)} of spend.`, `Moving them onto 30-day credit frees about ${fmtSave(r.save)} in one-time cash.`],
      proof: { tab: 'vendors', vendorKey: r.vendorKey } };
  }
  if (r.kind === 'fresh') {
    return { ...base, kind: 'freshness', saving: 0, savingLabel: 'Fresher stock', material: r.materialKey ?? '',
      whyBullets: [`${shortName(r.supplier)} ships older ${r.area.toLowerCase()} stock than other suppliers you use.`, `Ask for newer-made batches before your next order — same price, more shelf life.`],
      proof: { tab: 'vendors', material: r.materialKey, vendorKey: r.vendorKey } };
  }
  return { ...base, kind: 'price', saving: r.save, savingLabel: fmtSave(r.save), material: r.materialKey ?? '',
    whyBullets: [`You spend ${fmtSave(r.spend)}/yr with ${shortName(r.supplier)} on ${r.area.toLowerCase()}.`,
      (r.items ?? 1) > 1 ? `The bars below show your biggest single gap; across all ${r.items} ${r.area.toLowerCase()} items you buy from them, matching the cheapest price you already pay is worth about ${fmtSave(r.save)}/yr.` : `Matching the cheapest price you already pay is worth about ${fmtSave(r.save)}/yr.`],
    proof: { tab: 'material', material: r.materialKey, skuDesc: r.skuDesc, vendorKey: r.vendorKey } };
}

const INSIGHT_KIND: Record<InsightKind, { label: string; color: string }> = {
  price: { label: 'Lower price', color: FDC.green },
  cash: { label: 'Free up cash', color: FDC.blue },
  fresh: { label: 'Fresher stock', color: FDC.orange },
};

// the plain-language supplier risk check, shown as a small dot by the supplier name
const RISK_DOT: Record<string, { color: string; label: string }> = {
  red: { color: FDC.red, label: 'High risk — verify' },
  amber: { color: FDC.orange, label: 'Watch' },
  green: { color: FDC.green, label: 'Low risk' },
};

function AllInsights({ data, onProof, defaultOpen = false }: { data: AppData; onProof: (a: ValueAction) => void; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const rows = useMemo(() => buildAllInsights(data), [data]);
  if (!rows.length) return null;
  const maxSave = Math.max(1, ...rows.map((r) => r.save));
  const priceTotal = rows.filter((r) => r.kind === 'price').reduce((s, r) => s + r.save, 0);
  const cols: Column<InsightRow>[] = [
    { key: 'supplier', header: 'Supplier', sortable: true, sortValue: (r) => r.supplier, render: (r) => {
      const lvl = r.vendorKey ? data.supplierIntel?.suppliers[r.vendorKey]?.riskLevel : undefined;
      const dot = lvl ? RISK_DOT[lvl] : null;
      return (
        <span className="flex min-w-0 items-center gap-1.5">
          {dot && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: dot.color }} title={`Supplier check: ${dot.label}`} />}
          <span className="font-semibold text-fdc-slate">{shortName(r.supplier)}</span>
        </span>
      );
    } },
    { key: 'area', header: 'Area', sortable: true, sortValue: (r) => r.area, render: (r) => <span className="whitespace-nowrap text-fdc-grey">{r.area}</span> },
    { key: 'kind', header: 'Type', render: (r) => <Pill color={INSIGHT_KIND[r.kind].color}>{INSIGHT_KIND[r.kind].label}</Pill> },
    { key: 'spend', header: 'You spend / yr', align: 'right', sortable: true, sortValue: (r) => r.spend, render: (r) => <span className="tnum whitespace-nowrap">{fmtSave(r.spend)}</span> },
    { key: 'save', header: 'Can save', align: 'right', sortable: true, sortValue: (r) => r.save, render: (r) => <span className="tnum whitespace-nowrap font-bold" style={{ color: r.save > 0 ? INSIGHT_KIND[r.kind].color : FDC.grey }}>{r.saveLabel}</span>, heat: (r) => (r.save > 0 ? Math.min(1, r.save / maxSave) : null), heatScale: 'hue', heatColor: FDC.green },
    { key: 'what', header: 'What to do', render: (r) => <span className="text-[12px] leading-snug text-fdc-slate">{r.what}</span> },
  ];
  return (
    <Card pad={false}>
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-2 px-4 py-3.5 text-left transition hover:bg-black/[0.02] focus-ring">
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-[15px] font-bold text-fdc-ink"><ListChecks size={16} strokeWidth={2.3} className="text-fdc-green" /> All insights <span className="font-medium text-fdc-grey">— {rows.length} opportunities</span></span>
          <span className="mt-0.5 block text-[12px] leading-snug text-fdc-grey">Every supplier where there’s money to save or cash to free — the full, end-to-end list. About <b className="text-fdc-slate">{fmtSave(priceTotal)}/yr</b> in price savings across them all.</span>
        </span>
        <span className="flex shrink-0 items-center gap-1 text-[12px] font-semibold text-fdc-slate">{open ? 'Hide' : 'Show all'} <ChevronDown size={16} className={`transition ${open ? 'rotate-180' : ''}`} /></span>
      </button>
      {open && (
        <div className="border-t border-black/[0.06] px-2 py-2">
          <p className="flex items-center gap-1.5 px-2 pb-1.5 text-[11px] font-medium text-fdc-slate"><Eye size={12} className="text-fdc-green" /> Tap any row to see the proof — the price gap, the credit comparison, or the stock age behind it.</p>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2 pb-1.5 text-[10.5px] text-fdc-grey">
            <span className="font-semibold uppercase tracking-wide">Dot = our supplier check:</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: FDC.red }} /> verify</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: FDC.orange }} /> watch</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: FDC.green }} /> low risk</span>
          </p>
          <Table columns={cols} rows={rows} getKey={(r) => r.key} initialSort={{ key: 'save', dir: 'desc' }} onRowClick={(r) => onProof(insightToAction(r))} maxHeight={520} dense />
          <p className="px-2 pb-1 pt-1.5 text-[10.5px] leading-snug text-fdc-grey">Price savings are per year; “free up cash” is a one-time amount from fixing payment terms — the two are never added together.</p>
        </div>
      )}
    </Card>
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
      className={`group flex flex-col rounded-2xl border p-3 text-left backdrop-blur transition focus-ring ${gold ? 'border-fdc-gold/40 bg-fdc-gold/[0.14] hover:bg-fdc-gold/20' : 'border-white/25 bg-white/10 hover:bg-white/[0.18]'}`}
    >
      <div className="text-[10px] font-bold uppercase tracking-wide text-white/75">{eyebrow}</div>
      <div className={`tnum mt-0.5 text-[22px] font-extrabold leading-none ${gold ? 'text-fdc-gold' : 'text-white'}`}>{value}</div>
      <div className="mt-1 text-[11px] leading-snug text-white/80">{sub}</div>
      <div className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-white">
        {cta} <ArrowRight size={12} className="transition group-hover:translate-x-0.5" />
      </div>
    </button>
  );
}

// the extras the founder doesn't want on the main view, but may want to open to dig deeper —
// one closed-by-default section that keeps the spend/savings chart and payment-terms detail available.
function DigDeeper({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-5">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-2 rounded-2xl border border-black/[0.06] bg-white px-4 py-3.5 text-left shadow-card transition hover:bg-black/[0.02] focus-ring">
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-[15px] font-bold text-fdc-ink">Dig deeper <span className="font-medium text-fdc-grey">— the extra detail</span></span>
          <span className="mt-0.5 block text-[12px] leading-snug text-fdc-grey">Spend &amp; savings by material, and the full payment-terms breakdown — here when you want to dig in, out of the way when you don’t.</span>
        </span>
        <span className="flex shrink-0 items-center gap-1 text-[12px] font-semibold text-fdc-slate">{open ? 'Hide' : 'Show'} <ChevronDown size={16} className={`transition ${open ? 'rotate-180' : ''}`} /></span>
      </button>
      {open && children}
    </div>
  );
}

function shortName(name: string): string {
  return String(name).replace(/\b(PRIVATE|PVT|LIMITED|LTD|INDIA|\(INDIA\))\b\.?/gi, '').replace(/\s{2,}/g, ' ').replace(/[.,]\s*$/, '').trim();
}
