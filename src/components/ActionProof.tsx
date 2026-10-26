import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ArrowRight, TrendingDown, Coins, Clock, AlertTriangle, Scale, LineChart as LineChartIcon, GitCompareArrows } from 'lucide-react';
import type { AppData, ValueAction, ValueSku, MaterialKey } from '../types';
import type { Nav } from '../App';
import { Badge } from './ui/Card';
import { HBars, type HBarDatum } from './charts/Bars';
import { Sparkline } from './charts/Sparkline';
import { SupplierCheck } from './SupplierCheck';
import { FDC } from '../lib/brand';
import { termLabel } from '../lib/brand';
import { vendorShort } from '../lib/format';
import { CalcSheet, CalcBtn } from './CalcSheet';
import { calcSupplierSave, calcCreditCash, calcSkuPrice, type CalcData } from '../lib/calc';

const fmtSave = (n: number) => (n >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `₹${(n / 1e5).toFixed(1)} L` : `₹${Math.round(n).toLocaleString('en-IN')}`);
const priceFmt = (n: number | null | undefined, unit: string) => (n == null ? '—' : `₹${n >= 100 ? Math.round(n) : n >= 10 ? n.toFixed(1) : n.toFixed(2)}/${unit.toLowerCase() === 'nos' ? 'pc' : unit.toLowerCase()}`);

export function ActionProof({ action, data, onClose, onNavigate }: { action: ValueAction; data: AppData; onClose: () => void; onNavigate: (n: Nav) => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);
  const [calc, setCalc] = useState<CalcData | null>(null);

  const isTerms = action.isCash || action.kind === 'terms';
  const isFresh = !isTerms && action.kind === 'freshness';
  const accent = isTerms ? FDC.blue : isFresh ? FDC.orange : FDC.green;
  const Icon = isTerms ? Coins : isFresh ? Clock : TrendingDown;
  const badgeText = isTerms ? `Cash freed ${action.savingLabel}` : isFresh ? action.savingLabel : `You can save ${action.savingLabel}`;

  // plain-language supplier due-diligence to show alongside the numbers:
  // always the supplier you tapped, plus (for a price move) the cheaper supplier you'd move volume to.
  const nameOf = (key: string | undefined | null) => (key ? vendorShort(data.value?.vendors[key]?.name ?? '') : '');
  const clickedIntel = action.vendorKey ? data.supplierIntel?.suppliers[action.vendorKey] ?? null : null;
  const moveToKey = (() => {
    if (isTerms || isFresh) return undefined;
    const M = data.value?.materials[action.material];
    if (!M) return undefined;
    const sku = M.skus.find((s) => s.desc === action.proof.skuDesc) ?? M.skus.find((s) => s.vendors.some((vv) => vv.vendorKey === action.proof.vendorKey)) ?? M.skus[0];
    const k = sku?.bestActiveVendorKey ?? sku?.bestVendorKey;
    return k && k !== action.vendorKey ? k : undefined;
  })();
  const moveToIntel = moveToKey ? data.supplierIntel?.suppliers[moveToKey] ?? null : null;

  return createPortal(
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-fdc-ink/55 backdrop-blur-sm animate-fade-in sm:p-4 md:p-6" onClick={onClose} role="dialog" aria-modal="true" aria-label={`Proof: ${action.action}`}>
      <div className="flex max-h-[92vh] min-h-0 w-full max-w-2xl flex-col overflow-hidden bg-fdc-offwhite shadow-pop sm:rounded-2xl animate-fade-up" onClick={(e) => e.stopPropagation()}>
        {/* header */}
        <div className="flex shrink-0 items-start gap-3 border-b border-black/[0.07] bg-white px-4 py-3 sm:px-5">
          <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white" style={{ background: accent }}><Icon size={18} /></span>
          <div className="min-w-0 flex-1">
            <div className="mb-0.5 flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wide" style={{ color: accent }}>The proof <Badge color={accent}>{badgeText}</Badge></div>
            <h2 className="text-[14.5px] font-bold leading-snug text-fdc-ink">{action.action}</h2>
          </div>
          <button onClick={onClose} className="shrink-0 rounded-lg p-1.5 text-fdc-grey transition hover:bg-black/5 hover:text-fdc-ink focus-ring" aria-label="Close"><X size={18} /></button>
        </div>
        {/* body */}
        <div className="fdc-scroll min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-4 sm:px-4">
          {isTerms ? <TermsProof action={action} data={data} onCalc={setCalc} /> : isFresh ? <FreshnessProof action={action} data={data} /> : <PriceProof action={action} data={data} onCalc={setCalc} />}
          {/* plain-language supplier check — who these suppliers are, any red flag, the bottom line */}
          {(clickedIntel || moveToIntel) && (
            <div className="space-y-2.5">
              {clickedIntel && <SupplierCheck intel={clickedIntel} who={nameOf(action.vendorKey)} />}
              {moveToIntel && <SupplierCheck intel={moveToIntel} who={`${nameOf(moveToKey)} — where you'd move volume`} />}
            </div>
          )}
          {/* recap */}
          {action.whyBullets?.length ? (
            <div className="rounded-xl border border-black/[0.06] bg-white p-3.5">
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-fdc-grey">In short</div>
              <ul className="space-y-1">
                {action.whyBullets.map((b, i) => <li key={i} className="flex gap-1.5 text-[12px] leading-snug text-fdc-slate"><span className="mt-[6px] h-1 w-1 shrink-0 rounded-full" style={{ background: accent }} />{b}</li>)}
              </ul>
            </div>
          ) : null}
          {action.risk && (
            <p className="flex items-start gap-1.5 rounded-lg bg-fdc-orange/[0.08] px-3 py-2 text-[11.5px] leading-snug text-fdc-slate"><AlertTriangle size={13} className="mt-0.5 shrink-0 text-fdc-orange" /> {action.risk}</p>
          )}
          <button onClick={() => { onClose(); onNavigate(action.proof.tab === 'vendors' ? { tab: 'vendors', vendorKey: action.proof.vendorKey } : { tab: 'vendors', material: action.proof.material as MaterialKey | undefined, skuDesc: action.proof.skuDesc, vendorKey: action.proof.vendorKey }); }}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-fdc-green/30 bg-fdc-green/[0.06] px-3 py-2.5 text-[12.5px] font-semibold text-fdc-green transition hover:bg-fdc-green/[0.12] focus-ring">
            Open the full detail in Suppliers <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
    <CalcSheet calc={calc} onClose={() => setCalc(null)} />
    </>,
    document.body
  );
}

/* ---------- PRICE / leverage proof: the price gap + the cheaper supplier's margin ---------- */
function PriceProof({ action, data, onCalc }: { action: ValueAction; data: AppData; onCalc: (c: CalcData) => void }) {
  const M = data.value?.materials[action.material];
  const sku: ValueSku | undefined = useMemo(() => M?.skus.find((s) => s.desc === action.proof.skuDesc) ?? M?.skus.find((s) => s.vendors.some((v) => v.vendorKey === action.proof.vendorKey)) ?? M?.skus[0], [M, action]);
  if (!sku) return <Empty text="No comparable price lines for this item." />;
  const fromKey = action.proof.vendorKey;
  const cheapestKey = sku.bestActiveVendorKey ?? sku.bestVendorKey;
  const best = sku.bestPrice;
  const worst = Math.max(...sku.vendors.map((v) => v.price));
  const bars: HBarDatum[] = [...sku.vendors].sort((a, b) => a.price - b.price).map((v) => ({
    key: v.vendorKey, label: vendorShort(v.vendor), value: v.price,
    color: v.vendorKey === cheapestKey ? FDC.green : v.vendorKey === fromKey ? FDC.orange : '#C9C9C9',
    valueLabel: priceFmt(v.price, sku.unit),
    sublabel: v.vendorKey === fromKey ? 'you pay this' : v.vendorKey === cheapestKey ? 'cheapest you pay' : undefined,
  }));
  const gap = worst - best;

  // the cheaper supplier's financial health — the reason not to just pile all volume on it
  const cFin = data.financials?.vendors[cheapestKey ?? ''];
  const cName = vendorShort(sku.bestActiveVendor ?? sku.bestVendor ?? 'the cheaper supplier');
  const marginSeries = (cFin?.probe?.series ?? []).filter((y) => y.netMargin != null).map((y) => ({ label: (y.fy || y.year) as string, value: y.netMargin as number }));
  const cMargin = cFin?.metrics?.netMargin ?? null;

  return (
    <>
      <Section icon={GitCompareArrows} title="The price gap — same item, what each supplier charges" color={FDC.green}>
        <HBars data={bars} format={(n) => priceFmt(n, sku.unit)} barSize={26} labelWidth={140} axisTicks={4} onClick={(d) => { const c = calcSkuPrice(data, action.material as MaterialKey, sku.desc, d.key); if (c) onCalc(c); }} />
        <p className="mt-1 text-[10.5px] text-fdc-grey">Tap any bar to see how that price is worked out.</p>
        <p className="mt-2 text-[11.5px] leading-snug text-fdc-slate"><b className="tnum">{sku.desc}</b> — gap of <b className="tnum">{priceFmt(gap, sku.unit)}</b> between the dearest and the cheapest you already pay. Matching the cheapest price you already pay is worth about <b className="tnum" style={{ color: FDC.green }}>{fmtSave(action.saving)}</b>/yr.{action.vendorKey && <CalcBtn onClick={() => onCalc(calcSupplierSave(data, action.vendorKey!, action.material as MaterialKey, vendorShort(data.value?.vendors[action.vendorKey!]?.name ?? '')))} />}</p>
      </Section>

      {action.isLeverage && cMargin != null ? (
        <Section icon={LineChartIcon} title={`Why not just move all volume to ${cName}`} color={FDC.orange}>
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-fdc-grey">{cName} — profit they keep</div>
              <div className="tnum text-[22px] font-extrabold leading-none" style={{ color: cMargin < 2 ? FDC.red : FDC.ink }}>{cMargin.toFixed(1)}%</div>
              <div className="mt-0.5 text-[10.5px] text-fdc-grey">of every ₹100 they sell</div>
            </div>
            {marginSeries.length >= 2 && <div className="h-12 w-40"><Sparkline points={marginSeries} color={marginSeries[marginSeries.length - 1].value < marginSeries[0].value ? FDC.red : FDC.blue} height={46} format={(n) => `${n.toFixed(1)}%`} /></div>}
          </div>
          <p className="mt-2 rounded-lg bg-fdc-orange/[0.08] px-2.5 py-1.5 text-[11.5px] leading-snug text-fdc-slate">They run a thin <b>~{cMargin.toFixed(1)}% profit</b> and are already your biggest source here — piling on more volume is risky. <b>Use their low price to push the dearer one down</b>, or split to a second supplier.</p>
        </Section>
      ) : action.isLeverage ? (
        <Section icon={AlertTriangle} title={`Verify ${cName} before moving volume`} color={FDC.orange}>
          <p className="rounded-lg bg-fdc-orange/[0.08] px-2.5 py-1.5 text-[11.5px] leading-snug text-fdc-slate">{cName}'s financials aren't on file yet, so we can't vouch for its health or supply continuity. <b>Use its price as leverage now</b>; qualify it (health, certs, audit) before shifting volume.</p>
        </Section>
      ) : null}
    </>
  );
}

/* ---------- FRESHNESS proof: how old each supplier's stock is for the same item ---------- */
function FreshnessProof({ action, data }: { action: ValueAction; data: AppData }) {
  const M = data.value?.materials[action.material];
  const rated = (M?.freshness ?? []).filter((f) => f.avgAgeDays != null);
  if (!rated.length) return <Empty text="No stock-age records for this item yet." />;
  const mine = rated.find((f) => f.vendorKey === action.vendorKey);
  const freshest = [...rated].sort((a, b) => (a.avgAgeDays as number) - (b.avgAgeDays as number))[0];
  const bars: HBarDatum[] = [...rated]
    .sort((a, b) => (a.avgAgeDays as number) - (b.avgAgeDays as number))
    .map((f) => ({
      key: f.vendorKey, label: vendorShort(f.vendor), value: f.avgAgeDays as number,
      color: f.vendorKey === action.vendorKey ? FDC.orange : f.vendorKey === freshest.vendorKey ? FDC.green : '#C9C9C9',
      valueLabel: `${Math.round(f.avgAgeDays as number)}d`,
      sublabel: f.vendorKey === action.vendorKey ? 'old stock' : f.vendorKey === freshest.vendorKey ? 'freshest' : undefined,
    }));
  const name = mine ? vendorShort(mine.vendor) : 'This supplier';
  return (
    <>
      <Section icon={Clock} title="Stock age — same item, how old each supplier's stock is" color={FDC.orange}>
        <HBars data={bars} format={(n) => `${Math.round(n)}d old`} barSize={24} labelWidth={140} axisTicks={4} />
        <p className="mt-2 text-[11.5px] leading-snug text-fdc-slate">
          {mine && mine.avgAgeDays != null ? (
            <><b style={{ color: FDC.orange }}>{name}</b> ships stock about <b className="tnum">{Math.round(mine.avgAgeDays)} days</b> old{freshest && freshest.vendorKey !== mine.vendorKey && freshest.avgAgeDays != null ? <> — while the freshest you already get, <b>{vendorShort(freshest.vendor)}</b>, is ~<b className="tnum">{Math.round(freshest.avgAgeDays)} days</b>.</> : '.'}</>
          ) : (
            <>Lower is fresher. The green bar is the freshest stock you already receive for this item.</>
          )}
        </p>
      </Section>
      <Section icon={Scale} title="What to do" color={FDC.green}>
        <p className="text-[11.5px] leading-snug text-fdc-slate">Ask {name} for newer-made batches (closer to the production date) before you reorder — same price, more usable shelf life left. Fresher stock means less write-off risk, not a price cut.</p>
      </Section>
    </>
  );
}

/* ---------- TERMS proof: credit you get vs other suppliers + what they give others ---------- */
function TermsProof({ action, data, onCalc }: { action: ValueAction; data: AppData; onCalc: (c: CalcData) => void }) {
  const vendors = data.value?.vendors ?? {};
  const tv = vendors[action.vendorKey ?? ''];
  const fin = data.financials?.vendors[action.vendorKey ?? ''];
  const creditDays = (v: { termCategory: string; termDays: number | null }) => (v.termCategory === 'net' ? (v.termDays ?? 30) : 0);
  const top = Object.values(vendors).filter((v) => v.spend > 0).sort((a, b) => b.spend - a.spend).slice(0, 8);
  const bars: HBarDatum[] = top.map((v) => ({
    key: v.vendorKey, label: vendorShort(v.name), value: creditDays(v),
    color: v.vendorKey === action.vendorKey ? FDC.red : creditDays(v) >= 30 ? FDC.green : FDC.orange,
    valueLabel: termLabel(v.termCategory, v.termDays) === '—' ? `${creditDays(v)}d` : termLabel(v.termCategory, v.termDays),
    sublabel: v.vendorKey === action.vendorKey ? 'you pay too soon' : undefined,
  }));
  const recv = fin?.metrics?.receivableDays != null ? Math.round(fin.metrics.receivableDays) : null;

  return (
    <>
      <Section icon={Scale} title="Credit you get — each big supplier vs the rest" color={FDC.blue}>
        <HBars data={bars} format={(n) => `${Math.round(n)}d`} barSize={24} labelWidth={140} axisTicks={4} />
        <p className="mt-2 text-[11.5px] leading-snug text-fdc-slate">Most big suppliers already give you <b>30 days</b>. <b style={{ color: FDC.red }}>{tv ? vendorShort(tv.name) : 'This supplier'}</b> is the odd one out — you pay them <b>{tv ? termLabel(tv.termCategory, tv.termDays).toLowerCase() : 'too soon'}</b>.</p>
      </Section>

      {recv != null && (
        <Section icon={Clock} title={`${tv ? vendorShort(tv.name) : 'They'} give their own customers more than they give you`} color={FDC.orange}>
          <div className="space-y-2.5">
            <TwoBar label="They give their customers" value={recv} max={Math.max(recv, 30)} color={FDC.orange} suffix="days" />
            <TwoBar label="They give you" value={creditDays(tv ?? { termCategory: 'immediate', termDays: null })} max={Math.max(recv, 30)} color={FDC.red} suffix="days" />
          </div>
          <p className="mt-2 rounded-lg bg-fdc-green/[0.06] px-2.5 py-1.5 text-[11.5px] leading-snug text-fdc-slate">They wait <b className="tnum">{recv} days</b> to be paid by others, yet make you pay almost upfront. That gap is your argument — <b>ask for 30-day credit.</b></p>
        </Section>
      )}

      <Section icon={Coins} title="What this frees up" color={FDC.green}>
        <div className="flex items-baseline gap-2">
          <span className="tnum text-[26px] font-extrabold leading-none text-fdc-blue">{action.savingLabel}</span>
          {tv && <CalcBtn onClick={() => onCalc(calcCreditCash({ name: tv.name, spend: tv.spend, youGet: creditDays(tv), target: 30, termText: tv.termText }))} />}
          <span className="text-[12px] text-fdc-grey">one-time cash</span>
        </div>
        <p className="mt-1.5 text-[11.5px] leading-snug text-fdc-slate">Moving {tv ? vendorShort(tv.name) : 'them'} from pay-now to 30-day credit frees about <b>{action.savingLabel}</b> of cash you're currently handing over early (on {tv ? fmtSave(tv.spend) : '—'} of spend). One-time — not a price cut.</p>
      </Section>
    </>
  );
}

function TwoBar({ label, value, max, color, suffix }: { label: string; value: number; max: number; color: string; suffix: string }) {
  const w = Math.max(2, (value / (max || 1)) * 100);
  return (
    <div>
      <div className="mb-0.5 flex items-baseline justify-between text-[11.5px]"><span className="text-fdc-slate">{label}</span><span className="tnum font-bold" style={{ color }}>{value} {suffix}</span></div>
      <div className="h-2.5 overflow-hidden rounded-full bg-black/[0.05]"><div className="h-full rounded-full" style={{ width: `${w}%`, background: color }} /></div>
    </div>
  );
}

function Section({ icon: Icon, title, color, children }: { icon: typeof Coins; title: string; color: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-black/[0.06] bg-white p-3.5">
      <div className="mb-2 flex items-center gap-1.5 text-[12.5px] font-bold text-fdc-ink"><Icon size={14} style={{ color }} strokeWidth={2.2} /> {title}</div>
      {children}
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-black/15 bg-white px-3 py-6 text-center text-[12px] text-fdc-grey">{text}</div>;
}
