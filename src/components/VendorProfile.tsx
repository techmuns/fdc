import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X, Building2, TrendingUp, Scale, Landmark, Gavel, Users, PiggyBank, AlertTriangle,
  ShieldCheck, Factory, Banknote, Activity, GitBranch, Lightbulb, Eye, MapPin, BadgeCheck,
  Gauge, Boxes, Receipt, CalendarClock, ExternalLink, FileText, ChevronDown, Repeat2, ArrowUpRight,
  Target, FlaskConical,
} from 'lucide-react';
import type { Vendor, VendorFin, AltVendor, ProbeProfile, ProbeYear, Lever, Brief } from '../types';
import type { AltItem } from '../tabs/VendorsTab';
import { Card, Badge, Pill } from './ui/Card';
import { Table, type Column } from './ui/Table';
import { Donut } from './charts/Donut';
import { Columns } from './charts/Columns';
import { Sparkline } from './charts/Sparkline';
import { NegotiationBrief } from './NegotiationBrief';
import { FDC } from '../lib/brand';
import { money, crore, pct, vendorShort } from '../lib/format';

export type ProfileSubject =
  | { kind: 'vendor'; fin: VendorFin; vendor: Vendor | null }
  | { kind: 'alt'; alt: AltVendor };

const gradeColor = (g?: string | null) => {
  if (!g) return FDC.grey;
  const c = g[0]?.toUpperCase();
  return c === 'A' ? FDC.green : c === 'B' ? FDC.greenLighter : c === 'C' ? FDC.goldDark : c === 'D' ? FDC.red : FDC.grey;
};
const deToX = (de: number | null | undefined) => (de == null ? '—' : `${(de / 100).toFixed(2)}x`);
const ZONE = { safe: { c: FDC.green, label: 'Looks safe' }, grey: { c: FDC.goldDark, label: 'Keep an eye' }, distress: { c: FDC.red, label: 'Shaky — careful' } } as const;
// Same real-world entity? Compare on alphanumerics only, so a hyphen/space/"Ltd" difference
// (e.g. "Universal Starch-Chem Allied Ltd" vs "Universal Starch Chem Allied") is NOT a proxy.
const normName = (s: string) => vendorShort(s).toLowerCase().replace(/[^a-z0-9]/g, '');

export default function VendorProfile({
  subject, onClose, brief = null, replacements = [], onPickReplacement,
}: {
  subject: ProfileSubject;
  onClose: () => void;
  brief?: Brief | null;
  replacements?: AltItem[];
  onPickReplacement?: (it: AltItem) => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  const isVendor = subject.kind === 'vendor';
  const fin = isVendor ? subject.fin : null;
  const alt = isVendor ? null : subject.alt;
  const vendor = isVendor ? subject.vendor : null;

  const name = isVendor ? fin!.name : alt!.name;
  const type = isVendor ? fin!.type : alt!.type;
  const status = isVendor ? fin!.status : alt!.status;
  const probe = (isVendor ? fin!.probe : alt!.probe) || null;
  const metrics = isVendor ? fin!.metrics : alt!.metrics;
  const health = isVendor ? fin!.healthScore : alt!.healthScore;
  const ratingLabel = isVendor ? fin!.ratingLabel : alt!.ratingLabel;
  const ratingGrade = isVendor ? fin!.ratingGrade : alt!.ratingGrade;
  const inc = isVendor ? fin!.issuerNotCooperating : alt!.issuerNotCooperating;
  const asOfFy = (isVendor ? fin!.asOfFy : alt!.asOfFy) || probe?.latestFy || null;
  const source = isVendor ? fin!.source : alt!.source;
  const note = isVendor ? fin!.note : alt!.note;
  const levers = (isVendor ? fin!.levers : alt!.levers) || [];
  const accent = gradeColor(health?.grade);
  const fyBadge = probe ? `Probe42 · ${asOfFy ?? probe.latestFy}` : type === 'listed' ? 'Listed · market data' : asOfFy ? `As of ${asOfFy}` : null;
  // honesty: listed figures shown under a different (parent) company name
  const proxyName = type === 'listed' && isVendor && fin!.companyName && normName(fin!.companyName) !== normName(name) ? fin!.companyName : null;
  const gradeLabel = alt?.gradeLabel || null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-fdc-ink/55 backdrop-blur-sm animate-fade-in sm:p-4 md:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${name} — full supplier profile`}
    >
      <div
        className="flex max-h-[92vh] min-h-0 w-full max-w-5xl flex-col overflow-hidden bg-fdc-offwhite shadow-pop sm:rounded-2xl animate-fade-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* sticky header */}
        <div className="flex shrink-0 items-start gap-3 border-b border-black/[0.07] bg-white px-4 py-3 sm:px-5">
          <span className="mt-0.5 grid h-11 w-11 shrink-0 place-items-center rounded-xl text-white" style={{ background: accent }}>
            <Factory size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <h2 className="text-[17px] font-extrabold leading-tight text-fdc-ink">{vendorShort(name)}</h2>
              {alt?.secondSourceFor && <Badge color={FDC.green}>Second-source candidate</Badge>}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1">
              {type === 'listed' ? <Badge color={FDC.blue}><BadgeCheck size={11} /> Listed company</Badge> : <Badge color="#8E44AD">Private company</Badge>}
              {ratingLabel && <Badge color={gradeColor(ratingGrade)} soft={false}>{ratingLabel}</Badge>}
              {inc && <Badge color={FDC.red}><AlertTriangle size={10} /> Stopped sharing info</Badge>}
              {probe?.industry && <Badge color={FDC.grey}>{probe.industry}</Badge>}
              {alt && <Badge color={FDC.grey}>{alt.role.replace(/-/g, ' ')}</Badge>}
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-fdc-grey">
              {fyBadge && <span className="font-semibold text-fdc-slate">{fyBadge}</span>}
              {probe?.incorporationDate && <span><CalendarClock size={10} className="mr-0.5 inline" />Inc. {probe.incorporationDate.slice(0, 4)}</span>}
              {probe?.cin && <span className="font-mono">{probe.cin}</span>}
              {probe?.registeredAddress && <span className="hidden items-center sm:inline-flex"><MapPin size={10} className="mr-0.5 inline" />{probe.registeredAddress.split(',').slice(-2).join(',').trim()}</span>}
            </p>
          </div>
          <button onClick={onClose} className="shrink-0 rounded-lg p-1.5 text-fdc-grey transition hover:bg-black/5 hover:text-fdc-ink focus-ring" aria-label="Close profile">
            <X size={18} />
          </button>
        </div>

        {/* scrollable body */}
        <div className="fdc-scroll min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-5">
          {/* negotiating weight (kept — it's the one-line "why they'll listen") */}
          {isVendor && vendor && (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-fdc-green/15 bg-fdc-green/[0.05] px-3 py-2 text-[12px] text-fdc-slate">
              <PiggyBank size={14} className="text-fdc-green" />
              <span>You buy <b className="tnum">{money(vendor.totalNetSpend)}</b> a year from them
                {metrics?.revenue ? <> — that's <b className="tnum">{pct((vendor.totalNetSpend / metrics.revenue) * 100, 2)}</b> of everything they sell. You're a big customer, so they'll listen.</> : '.'}</span>
            </div>
          )}
          {proxyName && (
            <div className="mb-3 flex items-start gap-1.5 rounded-xl border border-fdc-blue/20 bg-fdc-blue/[0.05] px-3 py-2 text-[11.5px] leading-snug text-fdc-slate">
              <Building2 size={14} className="mt-0.5 shrink-0 text-fdc-blue" />
              <span>The numbers below are for their <b>listed parent company, {vendorShort(proxyName)}</b> — the supplier itself doesn’t publish its own.</span>
            </div>
          )}
          {gradeLabel && (
            <div className="mb-3 flex items-start gap-1.5 rounded-xl border border-fdc-gold/35 bg-fdc-gold/[0.10] px-3 py-2 text-[11.5px] leading-snug text-fdc-slate">
              <FlaskConical size={14} className="mt-0.5 shrink-0 text-fdc-gold-dark" />
              <span><b>Grade match:</b> {gradeLabel}. {alt?.fitNote}{alt?.fitNote && !/[.!?]$/.test(alt.fitNote.trim()) ? '.' : ''} These are market/reference figures for a possible alternative — not a price FDC has agreed.</span>
            </div>
          )}

          {probe ? (
            <ProbeBody probe={probe} health={health} levers={levers} brief={brief} replacements={replacements} onPickReplacement={onPickReplacement} />
          ) : type === 'listed' ? (
            <ListedBody metrics={metrics} health={health} levers={levers} brief={brief} replacements={replacements} onPickReplacement={onPickReplacement} />
          ) : (
            <PendingBody note={note} status={status} />
          )}

          {/* sources */}
          <div className="mt-4 space-y-1 border-t border-black/[0.07] pt-3 text-[11px] text-fdc-grey">
            {source && (
              <div className="flex items-center gap-1.5">
                <ExternalLink size={11} />
                <span>Source: <span className="font-semibold text-fdc-slate">{source.sourceName}</span>{'date' in source && source.date ? ` · ${source.date}` : ''}</span>
              </div>
            )}
            {isVendor && fin!.fallbackSource && (
              <div className="flex items-center gap-1.5">
                <ExternalLink size={11} />
                <span>Cross-check: <span className="font-semibold text-fdc-slate">{fin!.fallbackSource.sourceName}</span>{fin!.fallbackSource.ratingLabel ? ` (${fin!.fallbackSource.ratingLabel})` : ''}</span>
              </div>
            )}
            <p className="pt-0.5">Every figure above is real and traceable to the source shown — no estimates. Where a filing omits a datapoint, the card says so.</p>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ============================ shared lead: takeaway + replacements + expander ============================ */
function Takeaway({ brief, levers }: { brief: Brief | null; levers: Lever[] }) {
  if (brief) {
    return (
      <div>
        <LeadLabel icon={Target} text="What this means for FDC" />
        <NegotiationBrief brief={brief} dense />
      </div>
    );
  }
  if (!levers.length) return null;
  return (
    <div>
      <LeadLabel icon={Target} text="What this means for FDC" />
      <div className="space-y-2">{levers.map((l, i) => <LeverCard key={i} lever={l} />)}</div>
    </div>
  );
}

/** Evidence-backed levers as a collapsible-section body (used inside the full-detail expander when a brief is the lead). */
function LeversSection({ levers }: { levers: Lever[] }) {
  if (!levers.length) return null;
  return (
    <Section icon={Lightbulb} title="Your bargaining points (with proof)" color={FDC.green}>
      <div className="space-y-2">{levers.map((l, i) => <LeverCard key={i} lever={l} />)}</div>
    </Section>
  );
}

function LeadLabel({ icon: Icon, text }: { icon: typeof Target; text: string }) {
  return <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide text-fdc-green"><Icon size={13} strokeWidth={2.4} /> {text}</div>;
}

function Replacements({ items, onPick }: { items: AltItem[]; onPick?: (it: AltItem) => void }) {
  const top = items.slice(0, 6);
  if (!top.length || !onPick) return null;
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-bold text-fdc-ink"><Repeat2 size={14} className="text-fdc-blue" strokeWidth={2.2} /> Who could replace them</div>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {top.map((it) => (
          <button key={it.key} onClick={() => onPick(it)} className="flex items-start justify-between gap-2 rounded-lg border border-black/[0.06] bg-white px-2.5 py-1.5 text-left transition hover:border-fdc-green/40 hover:bg-fdc-green/[0.04] focus-ring">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center gap-0.5 text-[12px] font-semibold text-fdc-slate">{it.name} <ArrowUpRight size={11} className="text-fdc-grey" /></span>
                {it.cheaper && <Pill color={FDC.green}>cheaper · ours</Pill>}
                {!it.backed && <Pill color={FDC.grey}>pending</Pill>}
              </div>
              <p className="mt-0.5 line-clamp-2 text-[10.5px] leading-snug text-fdc-grey">{it.why}</p>
            </div>
            {it.price && <span className="tnum shrink-0 rounded-md bg-fdc-offwhite px-1.5 py-0.5 text-[11px] font-bold text-fdc-green">{it.price}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

function Expander({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="overflow-hidden rounded-xl border border-black/[0.08] bg-white">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left transition hover:bg-black/[0.02] focus-ring">
        <span className="flex items-center gap-1.5 text-[13px] font-bold text-fdc-ink"><FileText size={14} className="text-fdc-slate" /> {title}</span>
        <span className="flex items-center gap-1 text-[11.5px] font-semibold text-fdc-grey">{open ? 'Hide' : 'Show'} <ChevronDown size={15} className={`transition ${open ? 'rotate-180' : ''}`} /></span>
      </button>
      {open && <div className="space-y-3 border-t border-black/[0.06] bg-fdc-offwhite p-3 sm:p-3.5">{children}</div>}
    </div>
  );
}

/* ============================ PROBE (private) BODY ============================ */
function ProbeBody({ probe, health, levers, brief, replacements, onPickReplacement }: { probe: ProbeProfile; health: VendorFin['healthScore']; levers: Lever[]; brief: Brief | null; replacements: AltItem[]; onPickReplacement?: (it: AltItem) => void }) {
  const m = probe.metrics;
  const an = probe.analytics || null;
  return (
    <div className="space-y-3">
      {/* compact at-a-glance — shown ONCE */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <HealthTile health={health} />
        <ProbeScoreTile probe={probe} />
        <AltmanTile altman={an?.altman} />
        <StatTile label="Their yearly sales" value={crore(m.revenue)} sub={probe.latestFy ?? undefined} color={FDC.green} />
        <StatTile label="Profit they keep" value={m.netMargin != null ? pct(m.netMargin) : '—'} sub={m.netMargin != null ? 'of every ₹100 sold' : undefined} color={m.netMargin != null && m.netMargin < 0 ? FDC.red : FDC.ink} />
        <StatTile label="Money they owe" value={deToX(m.debtToEquity)} sub="vs their own cash" color={m.debtToEquity != null && m.debtToEquity >= 150 ? FDC.orange : FDC.ink} />
      </div>

      {/* flags */}
      {probe.flags?.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {probe.flags.map((f, i) => (
            <span key={i} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: `${f.tone === 'risk' ? FDC.red : f.tone === 'watch' ? FDC.orange : FDC.green}14`, color: f.tone === 'risk' ? FDC.red : f.tone === 'watch' ? FDC.orange : FDC.green }}>
              <AlertTriangle size={11} /> {f.label}
            </span>
          ))}
        </div>
      )}

      {/* lead takeaway: the negotiation brief (what to say & ask); levers are the takeaway when no brief */}
      <Takeaway brief={brief} levers={levers} />

      {/* who could replace them */}
      <Replacements items={replacements} onPick={onPickReplacement} />

      {/* everything deep — collapsed behind ONE expander */}
      <Expander title="Show all the background detail (money, loans, court cases, owners)">
        {brief && <LeversSection levers={levers} />}
        <Section icon={TrendingUp} title="Their track record, year by year" sub={`${probe.series.length} years on file · ${probe.nature.toLowerCase()}`} color={FDC.green}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <TrendTile series={probe.series} field="revenue" label="Yearly sales" color={FDC.green} fmt={(n) => crore(n)} />
            <TrendTile series={probe.series} field="netMargin" label="Profit they keep %" color={FDC.blue} fmt={(n) => pct(n)} />
            <TrendTile series={probe.series} field="ebitdaMargin" label="Operating profit %" color="#8E44AD" fmt={(n) => pct(n)} />
            <TrendTile series={probe.series} field="roce" label="Return on money used %" color={FDC.goldDark} fmt={(n) => pct(n)} />
            <TrendTile series={probe.series} field="debtToEquity" label="Owed vs own cash" color={FDC.orange} fmt={(n) => `${(n / 100).toFixed(2)}x`} />
            <TrendTile series={probe.series} field="pat" label="Final profit" color={FDC.greenLighter} fmt={(n) => crore(n)} />
          </div>
          <div className="mt-3">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-fdc-grey">Sales by year</div>
            <Columns
              data={probe.series.filter((y) => y.revenue != null).map((y) => ({ key: y.year, label: (y.fy || y.year).replace('FY', '').slice(0, 5), value: y.revenue as number, color: FDC.green, valueLabel: crore(y.revenue), note: `${y.fy}: sales ${crore(y.revenue)}${y.pat != null ? `, profit ${crore(y.pat)}` : ''}.`, tipRows: [{ label: 'Sales', value: crore(y.revenue) }, { label: 'Final profit', value: y.pat != null ? crore(y.pat) : '—' }, { label: 'Profit kept', value: y.netMargin != null ? pct(y.netMargin) : '—' }] }))}
              format={(n) => crore(n)}
              height={170}
              yAxisFormat={(n) => (n >= 1e7 ? `${(n / 1e7).toFixed(0)}Cr` : n >= 1e5 ? `${(n / 1e5).toFixed(0)}L` : '0')}
            />
          </div>
        </Section>

        <div className="grid gap-3 lg:grid-cols-2">
          <Section icon={Boxes} title="Do they make it, or just resell it?" color={FDC.blue}>
            <RevenueMix probe={probe} />
          </Section>
          <Section icon={Activity} title="What drives their profit" color="#8E44AD">
            <DuPont dupont={an?.dupont} />
          </Section>
        </div>

        <Section icon={Gauge} title="Warning signs to watch" sub="worked out from their filings — not something they reported" color={FDC.goldDark}>
          <div className="grid gap-3 md:grid-cols-2">
            <Altman altman={an?.altman} />
            <Piotroski piotroski={an?.piotroski} />
          </div>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <QualTile label="Spare cash generated" value={an?.fcf?.value != null ? crore(an.fcf.value) : '—'} tone={an?.fcf?.value != null && an.fcf.value < 0 ? 'risk' : 'ok'} note={an?.fcf?.method} />
            <QualTile label="Are the profits real?" value={an?.accruals?.quality ? an.accruals.quality[0].toUpperCase() + an.accruals.quality.slice(1) : '—'} sub={an?.accruals?.ratioPct != null ? `${an.accruals.ratioPct}% on paper, not cash` : undefined} tone={an?.accruals?.quality === 'low' ? 'risk' : an?.accruals?.quality === 'moderate' ? 'watch' : 'ok'} note={an?.accruals?.note} />
            <QualTile label="Swings with sales" value={an?.operatingLeverage?.dol != null ? `${an.operatingLeverage.dol}×` : '—'} tone={an?.operatingLeverage?.dol != null && Math.abs(an.operatingLeverage.dol) > 3 ? 'watch' : 'ok'} note={an?.operatingLeverage?.note} />
          </div>
        </Section>

        {probe.peer && <Section icon={Scale} title="How fast they handle cash vs rivals" sub={`${probe.peer.bizSegment ?? probe.peer.bizIndustry ?? 'similar firms'} · ${probe.peer.peers ?? '—'} companies (Probe42)`} color={FDC.blue}>
          <WorkingCapital probe={probe} />
        </Section>}

        <Section icon={Landmark} title="What their loans cost — your early-pay angle" sub="pay them faster, ask for a cut in return" color={FDC.orange}>
          <Borrowing probe={probe} />
        </Section>

        {probe.ratingHistory && probe.ratingHistory.length > 0 && (
          <Section icon={ShieldCheck} title="Credit rating over the years" color={FDC.green}>
            <RatingHistory probe={probe} />
          </Section>
        )}

        {(probe.legal.total > 0 || (probe.financialDisputeItems && probe.financialDisputeItems.length > 0)) && (
          <Section icon={Gavel} title="Court cases & disputes" sub={`${probe.legal.total} cases · ${probe.legal.against} against them · ${probe.legal.pending} still open`} color={FDC.red}>
            <Legal probe={probe} />
          </Section>
        )}

        <Section icon={Users} title="Who owns and runs it" color="#8E44AD">
          <OwnershipBoard probe={probe} />
        </Section>

        <div className="grid gap-3 lg:grid-cols-2">
          {probe.fundraising && probe.fundraising.length > 0 && (
            <Section icon={Banknote} title="Money they've raised" color={FDC.green}>
              <Fundraising probe={probe} />
            </Section>
          )}
          <Section icon={Receipt} title="Staff & linked companies" color={FDC.slate}>
            <PeopleRpt probe={probe} />
          </Section>
        </div>
      </Expander>
    </div>
  );
}

/* ============================ LISTED BODY ============================ */
function ListedBody({ metrics, health, levers, brief, replacements, onPickReplacement }: { metrics: VendorFin['metrics']; health: VendorFin['healthScore']; levers: Lever[]; brief: Brief | null; replacements: AltItem[]; onPickReplacement?: (it: AltItem) => void }) {
  const m = metrics;
  if (!m) return <PendingBody note="Listed company — market financials not resolved on the last run." status="pending" />;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <HealthTile health={health} />
        <StatTile label="Their yearly sales" value={crore(m.revenue)} color={FDC.green} />
        <StatTile label="Profit they keep" value={m.netMargin != null ? pct(m.netMargin) : '—'} sub={m.netMargin != null ? 'of every ₹100 sold' : undefined} color={m.netMargin != null && m.netMargin < 0 ? FDC.red : FDC.ink} />
        <StatTile label="Sales growth" value={m.revenueGrowth != null ? pct(m.revenueGrowth) : '—'} sub="vs last year" color={m.revenueGrowth != null && m.revenueGrowth < 0 ? FDC.red : FDC.green} />
        <StatTile label="Money they owe" value={deToX(m.debtToEquity)} sub="vs their own cash" color={FDC.ink} />
        <StatTile label="They get paid in" value={m.receivableDays != null ? `${Math.round(m.receivableDays)}d` : '—'} sub={m.payableDays != null ? `they pay out in ${Math.round(m.payableDays)}d` : undefined} color={FDC.slate} />
      </div>

      {/* lead takeaway */}
      <Takeaway brief={brief} levers={levers} />

      {/* who could replace them */}
      <Replacements items={replacements} onPick={onPickReplacement} />

      <Expander title="Show the full stock-market detail">
        {brief && <LeversSection levers={levers} />}
        <Section icon={Building2} title="Stock-market snapshot" sub="live market data (Munshot)" color={FDC.blue}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <KV label="Return on money used" value={m.roce != null ? pct(m.roce) : '—'} />
            <KV label="Return for owners" value={m.roe != null ? pct(m.roe) : '—'} />
            <KV label="Operating profit" value={m.ebitdaMargin != null ? pct(m.ebitdaMargin) : '—'} />
            <KV label="Company size" value={m.marketCap != null ? crore(m.marketCap) : '—'} />
            <KV label="Price vs profit (P/E)" value={m.pe != null ? `${m.pe.toFixed(1)}×` : '—'} />
            <KV label="Value vs profit" value={m.evEbitda != null ? `${m.evEbitda.toFixed(1)}×` : '—'} />
            <KV label="Dividend payout" value={m.dividendYield != null ? pct(m.dividendYield) : '—'} />
            <KV label="Share price, 1 yr" value={m.yearlyChange != null ? pct(m.yearlyChange) : '—'} tone={m.yearlyChange != null && m.yearlyChange < 0 ? 'risk' : 'ok'} />
            <KV label="Margin before overheads" value={m.grossMargin != null ? pct(m.grossMargin) : '—'} />
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <KV label="They get paid in" value={m.receivableDays != null ? `${Math.round(m.receivableDays)}d` : '—'} />
            <KV label="They pay out in" value={m.payableDays != null ? `${Math.round(m.payableDays)}d` : '—'} />
            <KV label="Stock sits for" value={m.inventoryDays != null ? `${Math.round(m.inventoryDays)}d` : '—'} />
            <KV label="Cash stuck for" value={m.cashConversionCycle != null ? `${Math.round(m.cashConversionCycle)}d` : '—'} />
          </div>
          <p className="mt-2 rounded-lg bg-fdc-offwhite px-3 py-2 text-[11.5px] leading-snug text-fdc-grey">
            Share-price figures are live; the profit and payment-speed numbers come from their audited yearly accounts (Screener.in) and feed the health score. For <b>private</b> suppliers we pull the same kind of detail from their government filings (Probe42).
          </p>
        </Section>
      </Expander>
    </div>
  );
}

function PendingBody({ note, status }: { note: string | null; status: string }) {
  return (
    <div className="grid place-items-center py-14 text-center">
      <span className="mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-fdc-grey/10"><FileText size={26} className="text-fdc-grey" /></span>
      <h3 className="text-[15px] font-bold text-fdc-ink">{status === 'unrated' ? "Their money details aren't public" : 'No money details yet'}</h3>
      <p className="mx-auto mt-1.5 max-w-md text-[12.5px] leading-relaxed text-fdc-grey">
        {note || "We couldn't find any public financial records for this supplier. Small private firms and proprietorships often don't publish accounts you can read for free."}
      </p>
      <p className="mx-auto mt-2 max-w-md text-[11px] text-fdc-grey">We never make numbers up — this stays blank until we find a real record.</p>
    </div>
  );
}

/* ============================ sub-components ============================ */
function Section({ icon: Icon, title, sub, color, children }: { icon: typeof TrendingUp; title: string; sub?: string; color: string; children: React.ReactNode }) {
  return (
    <Card className="!p-0">
      <div className="flex items-start gap-2 border-b border-black/[0.05] px-3.5 py-2.5 sm:px-4">
        <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg" style={{ background: `${color}14`, color }}><Icon size={15} strokeWidth={2.2} /></span>
        <div className="min-w-0">
          <h3 className="text-[13.5px] font-bold leading-tight text-fdc-ink">{title}</h3>
          {sub && <p className="mt-0.5 text-[11px] leading-snug text-fdc-grey">{sub}</p>}
        </div>
      </div>
      <div className="px-3.5 py-3 sm:px-4">{children}</div>
    </Card>
  );
}

function StatTile({ label, value, sub, color = FDC.ink }: { label: string; value: React.ReactNode; sub?: string; color?: string }) {
  return (
    <div className="rounded-xl border border-black/[0.06] bg-white px-3 py-2">
      <div className="text-[10px] font-medium uppercase tracking-wide text-fdc-grey">{label}</div>
      <div className="tnum mt-0.5 text-[16px] font-extrabold leading-none" style={{ color }}>{value}</div>
      {sub && <div className="mt-0.5 text-[10px] text-fdc-grey">{sub}</div>}
    </div>
  );
}

function HealthTile({ health }: { health: VendorFin['healthScore'] }) {
  const c = gradeColor(health?.grade);
  return (
    <div className="rounded-xl border px-3 py-2" style={{ borderColor: `${c}40`, background: `${c}0c` }}>
      <div className="text-[10px] font-medium uppercase tracking-wide text-fdc-grey">Overall health</div>
      <div className="mt-0.5 flex items-baseline gap-1.5">
        <span className="tnum text-[18px] font-extrabold leading-none" style={{ color: c }}>{health ? health.value : '—'}</span>
        <span className="text-[10px] text-fdc-grey">/100</span>
        {health && <span className="rounded px-1 text-[10px] font-bold text-white" style={{ background: c }}>{health.grade}</span>}
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-black/[0.06]"><div className="h-full rounded-full" style={{ width: `${health?.value ?? 0}%`, background: c }} /></div>
    </div>
  );
}

function ProbeScoreTile({ probe }: { probe: ProbeProfile }) {
  const ps = probe.probeScore;
  if (!ps || ps.overall == null) return <StatTile label="Money-health score" value="—" sub="not scored" color={FDC.grey} />;
  return (
    <div className="rounded-xl border border-black/[0.06] bg-white px-3 py-2">
      <div className="text-[10px] font-medium uppercase tracking-wide text-fdc-grey">Money-health score</div>
      <div className="tnum mt-0.5 text-[16px] font-extrabold leading-none text-fdc-ink">{ps.overall}<span className="text-[10px] font-medium text-fdc-grey">/10</span></div>
      <div className="mt-1 flex gap-0.5">
        {([['Growing', ps.growth], ['Profit', ps.profitability], ['Cash on hand', ps.liquidity], ['Can repay debt', ps.solvency], ['Run well', ps.efficiency]] as [string, number | null][]).map(([k, v]) => (
          <span key={k} title={`${k}: ${v ?? '—'} out of 5`} className="grid h-4 flex-1 place-items-center rounded text-[8px] font-bold text-white" style={{ background: v == null ? FDC.light : v >= 4 ? FDC.green : v >= 3 ? FDC.goldDark : FDC.red }}>{v ?? '–'}</span>
        ))}
      </div>
    </div>
  );
}

function AltmanTile({ altman }: { altman?: NonNullable<ProbeProfile['analytics']>['altman'] }) {
  const a = altman as { z: number | null; zone: 'safe' | 'grey' | 'distress' | null } | null | undefined;
  if (!a || a.z == null || !a.zone) return <StatTile label="Will they last?" value="—" sub="not enough data" color={FDC.grey} />;
  const z = ZONE[a.zone];
  return (
    <div className="rounded-xl border px-3 py-2" style={{ borderColor: `${z.c}40`, background: `${z.c}0c` }}>
      <div className="text-[10px] font-medium uppercase tracking-wide text-fdc-grey">Will they last?</div>
      <div className="tnum mt-0.5 text-[16px] font-extrabold leading-none" style={{ color: z.c }}>{a.z}</div>
      <div className="mt-0.5 text-[10px] font-semibold" style={{ color: z.c }}>{z.label}</div>
    </div>
  );
}

function TrendTile({ series, field, label, color, fmt }: { series: ProbeYear[]; field: keyof ProbeYear; label: string; color: string; fmt: (n: number) => string }) {
  const pts = series.filter((y) => y[field] != null).map((y) => ({ label: (y.fy || y.year) as string, value: y[field] as number }));
  const last = pts.length ? pts[pts.length - 1].value : null;
  const first = pts.length ? pts[0].value : null;
  const dir = last != null && first != null ? (last > first ? 1 : last < first ? -1 : 0) : 0;
  return (
    <div className="rounded-xl border border-black/[0.06] bg-white p-2">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] font-medium uppercase tracking-wide text-fdc-grey">{label}</span>
        <span className="tnum text-[12.5px] font-bold" style={{ color: dir < 0 && field !== 'debtToEquity' ? FDC.red : FDC.ink }}>{last != null ? fmt(last) : '—'}</span>
      </div>
      <div className="mt-1 h-9">{pts.length >= 2 ? <Sparkline points={pts} color={color} height={36} format={fmt} /> : <div className="grid h-full place-items-center text-[10px] text-fdc-light">single year</div>}</div>
    </div>
  );
}

function RevenueMix({ probe }: { probe: ProbeProfile }) {
  const rm = probe.revenueMix;
  if (!rm || !rm.available) {
    return (
      <div>
        <div className="rounded-lg border border-dashed border-black/15 bg-fdc-offwhite px-3 py-4 text-center text-[12px] text-fdc-grey">
          {rm?.note || "Their filings don't split out what they make vs resell."}
        </div>
        {rm?.activity && <p className="mt-2 text-[11.5px] text-fdc-slate"><b>What they mainly do:</b> {rm.activity}</p>}
        {rm?.forexEarningsPct != null && rm.forexEarningsPct > 0 && <p className="mt-1 text-[11.5px] text-fdc-grey">About <b className="tnum">{pct(rm.forexEarningsPct)}</b> of their sales come from exports.</p>}
      </div>
    );
  }
  const segs = [
    { key: 'mfg', label: 'They make it', value: rm.manufacturedPct || 0, color: FDC.green, note: `${rm.manufacturedPct}% of sales are goods they make themselves (${rm.fy}).` },
    { key: 'trd', label: 'They resell it', value: rm.tradedPct || 0, color: FDC.orange, note: `${rm.tradedPct}% are goods they buy and resell — so the price carries a middleman markup, not a maker's.` },
    { key: 'svc', label: 'Services', value: rm.servicesPct || 0, color: FDC.blue, note: `${rm.servicesPct}% is services.` },
  ].filter((s) => s.value > 0);
  return (
    <div>
      <Donut data={segs} format={(n) => pct(n)} height={160} thickness={26} centerTitle="Revenue" centerValue={rm.fy || ''} />
      <div className="mt-2 flex flex-wrap gap-2 text-[11.5px]">
        {segs.map((s) => <span key={s.key} className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />{s.label} <b className="tnum">{pct(s.value)}</b></span>)}
        <span className="inline-flex items-center gap-1 text-fdc-grey">· Export <b className="tnum text-fdc-ink">{pct(rm.exportPct || 0)}</b></span>
      </div>
      {(rm.tradedPct ?? 0) >= 50 && <p className="mt-1.5 rounded-lg bg-fdc-orange/[0.08] px-2.5 py-1.5 text-[11px] text-fdc-slate"><b>Heads up:</b> most of what they sell is bought-in and resold, not made in-house — so you're paying a middleman markup. Push for the maker's price.</p>}
    </div>
  );
}

function DuPont({ dupont }: { dupont?: NonNullable<ProbeProfile['analytics']>['dupont'] }) {
  const d = dupont as { netMarginPct: number | null; assetTurnover: number | null; equityMultiplier: number | null; roePct: number | null } | null | undefined;
  if (!d) return <div className="rounded-lg border border-dashed border-black/15 bg-fdc-offwhite px-3 py-4 text-center text-[12px] text-fdc-grey">Not enough detail in their accounts to break this down.</div>;
  const factor = (label: string, v: number | null, suffix: string) => (
    <div className="flex-1 rounded-lg border border-black/[0.06] bg-white px-2 py-1.5 text-center">
      <div className="tnum text-[14px] font-extrabold text-fdc-ink">{v != null ? `${v}${suffix}` : '—'}</div>
      <div className="text-[9.5px] leading-tight text-fdc-grey">{label}</div>
    </div>
  );
  return (
    <div>
      <div className="flex items-stretch gap-1.5">
        {factor('Profit kept', d.netMarginPct, '%')}
        <span className="grid place-items-center text-[13px] font-bold text-fdc-grey">×</span>
        {factor('Sales vs assets', d.assetTurnover, '×')}
        <span className="grid place-items-center text-[13px] font-bold text-fdc-grey">×</span>
        {factor('Loan boost', d.equityMultiplier, '×')}
        <span className="grid place-items-center text-[13px] font-bold text-fdc-grey">=</span>
        <div className="flex-1 rounded-lg px-2 py-1.5 text-center text-white" style={{ background: FDC.green }}>
          <div className="tnum text-[14px] font-extrabold">{d.roePct != null ? `${d.roePct}%` : '—'}</div>
          <div className="text-[9.5px] leading-tight opacity-90">Return for owners</div>
        </div>
      </div>
      <p className="mt-1.5 text-[11px] text-fdc-grey">Shows whether their returns come from real profit and busy assets, or just from borrowing. Heavy "loan boost" = returns propped up by debt.</p>
    </div>
  );
}

function Altman({ altman }: { altman?: NonNullable<ProbeProfile['analytics']>['altman'] }) {
  const a = altman as { z: number | null; zone: 'safe' | 'grey' | 'distress' | null; model: string } | null | undefined;
  if (!a || a.z == null || !a.zone) return <div className="rounded-lg border border-dashed border-black/15 bg-fdc-offwhite px-3 py-4 text-center text-[12px] text-fdc-grey">Their accounts don't show enough to work this out.</div>;
  const z = ZONE[a.zone];
  const pos = Math.max(0, Math.min(100, (a.z / 4) * 100));
  return (
    <div className="rounded-xl border border-black/[0.06] bg-white p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-fdc-grey">Will they stay afloat?</span>
        <span className="tnum text-[15px] font-extrabold" style={{ color: z.c }}>{a.z} <span className="text-[11px] font-semibold">· {z.label}</span></span>
      </div>
      <div className="relative mt-2 h-2.5 rounded-full" style={{ background: 'linear-gradient(90deg,#D91701 0%,#D91701 30%,#EFAE0E 30%,#EFAE0E 72%,#00973D 72%)' }}>
        <span className="absolute top-1/2 h-4 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white bg-fdc-ink shadow" style={{ left: `${pos}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-[9.5px] text-fdc-grey"><span>shaky</span><span>watch</span><span>safe</span></div>
    </div>
  );
}

function Piotroski({ piotroski }: { piotroski?: NonNullable<ProbeProfile['analytics']>['piotroski'] }) {
  const p = piotroski as { score: number | null; outOf: number; signals: { label: string; pass: boolean | null }[]; note: string } | null | undefined;
  if (!p) return <div className="rounded-lg border border-dashed border-black/15 bg-fdc-offwhite px-3 py-4 text-center text-[12px] text-fdc-grey">Needs two years of accounts to score.</div>;
  const good = p.score != null && p.outOf ? p.score / p.outOf >= 0.6 : false;
  return (
    <div className="rounded-xl border border-black/[0.06] bg-white p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-fdc-grey">Getting stronger?</span>
        <span className="tnum text-[15px] font-extrabold" style={{ color: good ? FDC.green : FDC.goldDark }}>{p.score}<span className="text-[11px] font-semibold text-fdc-grey">/{p.outOf}</span></span>
      </div>
      <div className="mt-1.5 grid grid-cols-1 gap-0.5">
        {p.signals.map((s, i) => (
          <div key={i} className="flex items-center gap-1.5 text-[11px]">
            <span className="grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full text-[8px] font-bold text-white" style={{ background: s.pass === null ? FDC.light : s.pass ? FDC.green : FDC.red }}>{s.pass === null ? '–' : s.pass ? '✓' : '✗'}</span>
            <span className={s.pass === null ? 'text-fdc-light' : 'text-fdc-slate'}>{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function QualTile({ label, value, sub, tone, note }: { label: string; value: string; sub?: string; tone: 'risk' | 'watch' | 'ok'; note?: string | null }) {
  const c = tone === 'risk' ? FDC.red : tone === 'watch' ? FDC.orange : FDC.green;
  return (
    <div className="rounded-xl border border-black/[0.06] bg-white px-3 py-2" title={note || undefined}>
      <div className="text-[10px] font-medium uppercase tracking-wide text-fdc-grey">{label}</div>
      <div className="tnum mt-0.5 text-[15px] font-extrabold leading-none" style={{ color: c }}>{value}</div>
      {sub && <div className="mt-0.5 text-[10px] text-fdc-grey">{sub}</div>}
    </div>
  );
}

function WorkingCapital({ probe }: { probe: ProbeProfile }) {
  const m = probe.metrics; const p = probe.peer!;
  const rows: { label: string; v: number | null; peer: number | null; lowerBetter: boolean }[] = [
    { label: 'Time they take to get paid', v: m.receivableDays, peer: p.receivableDays, lowerBetter: true },
    { label: 'Time they take to pay others', v: m.payableDays, peer: p.payableDays, lowerBetter: false },
    { label: 'Days their cash is stuck', v: m.ccc, peer: p.ccc, lowerBetter: true },
  ];
  const maxV = Math.max(1, ...rows.flatMap((r) => [r.v ?? 0, r.peer ?? 0]));
  return (
    <div className="space-y-2.5">
      {rows.map((r) => {
        const worse = r.lowerBetter && r.v != null && r.peer != null && r.v > r.peer * 1.1;
        return (
          <div key={r.label}>
            <div className="flex items-baseline justify-between text-[11.5px]">
              <span className="font-medium text-fdc-slate">{r.label}</span>
              <span className="tnum"><b style={{ color: worse ? FDC.orange : FDC.ink }}>{r.v != null ? `${Math.round(r.v)}d` : '—'}</b> <span className="text-fdc-grey">· similar firms {r.peer != null ? `${Math.round(r.peer)}d` : '—'}</span>{worse && <span className="ml-1 font-semibold text-fdc-orange">slower than most</span>}</span>
            </div>
            <div className="relative mt-1 h-2 rounded-full bg-black/[0.05]">
              <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${((r.v ?? 0) / maxV) * 100}%`, background: worse ? FDC.orange : FDC.blue }} />
              {r.peer != null && <span className="absolute top-1/2 h-3 w-0.5 -translate-y-1/2 bg-fdc-ink" style={{ left: `${(r.peer / maxV) * 100}%` }} title={`similar firms: ${Math.round(r.peer)} days`} />}
            </div>
          </div>
        );
      })}
      <p className="text-[10.5px] text-fdc-grey">Bar = this supplier; black tick = typical for similar firms. The longer their cash is stuck, the tighter their cash — a lever when you ask for a better price in exchange for faster payment.</p>
    </div>
  );
}

function Borrowing({ probe }: { probe: ProbeProfile }) {
  const b = probe.borrowing;
  if (!b) return <div className="rounded-lg border border-dashed border-black/15 bg-fdc-offwhite px-3 py-4 text-center text-[12px] text-fdc-grey">No loan details on file for them.</div>;
  const cols: Column<NonNullable<typeof b.lenders>[number]>[] = [
    { key: 'name', header: 'Lender', sortable: true, sortValue: (r) => r.name || '', render: (r) => <span className="font-semibold text-fdc-slate">{r.name || '—'}</span> },
    { key: 'amount', header: 'Amount', align: 'right', sortable: true, sortValue: (r) => r.amount || 0, render: (r) => <span className="tnum">{r.amount != null ? money(r.amount) : '—'}</span> },
    { key: 'rate', header: 'Rate', align: 'right', sortable: true, sortValue: (r) => r.ratePct || 0, render: (r) => <span className="tnum font-bold" style={{ color: r.ratePct != null ? FDC.orange : FDC.grey }}>{r.ratePct != null ? `${r.ratePct}%` : '—'}</span> },
    { key: 'type', header: 'Type', render: (r) => <span className="text-fdc-grey">{r.type || '—'}</span> },
    { key: 'date', header: 'Date', align: 'right', sortable: true, sortValue: (r) => r.date || '', render: (r) => <span className="tnum text-fdc-grey">{r.date || '—'}</span> },
  ];
  return (
    <div>
      <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile label="What their loans cost" value={b.effectiveRatePct != null ? `${b.effectiveRatePct}%` : '—'} sub="roughly, per year" color={FDC.orange} />
        <StatTile label="Loan rate range" value={b.chargeRate ? `${b.chargeRate.minPct}–${b.chargeRate.maxPct}%` : '—'} sub={b.chargeRate ? `${b.chargeRate.count} loans` : 'none on file'} color={FDC.slate} />
        <StatTile label="Loans against assets" value={probe.charges.count} sub={probe.charges.sumAmount != null ? money(probe.charges.sumAmount) : undefined} color={FDC.ink} />
        <StatTile label="Typical rate" value={b.chargeRate?.medianPct != null ? `${b.chargeRate.medianPct}%` : '—'} color={FDC.slate} />
      </div>
      {b.lenders.length > 0 && <Table columns={cols} rows={b.lenders} getKey={(r) => `${r.name ?? ''}|${r.amount ?? ''}|${r.date ?? ''}|${r.type ?? ''}`} initialSort={{ key: 'amount', dir: 'desc' }} dense />}
      {b.note && <p className="mt-1.5 text-[10.5px] text-fdc-grey">{b.note}</p>}
      {b.effectiveRatePct != null && <p className="mt-1 rounded-lg bg-fdc-green/[0.06] px-2.5 py-1.5 text-[11px] text-fdc-slate"><b>Do this:</b> they borrow money at about {b.effectiveRatePct}%. Offer to pay them faster, and ask for a price cut in return — faster cash is worth roughly that much to them.</p>}
    </div>
  );
}

function RatingHistory({ probe }: { probe: ProbeProfile }) {
  const rows = probe.ratingHistory || [];
  const cols: Column<(typeof rows)[number]>[] = [
    { key: 'date', header: 'Date', sortable: true, sortValue: (r) => r.date || '', render: (r) => <span className="tnum text-fdc-slate">{r.date || '—'}</span> },
    { key: 'grade', header: 'Grade', render: (r) => <Badge color={gradeColor(r.grade)} soft={false}>{r.grade}{r.outlook ? ` / ${r.outlook}` : ''}</Badge> },
    { key: 'agency', header: 'Agency', render: (r) => <span className="text-fdc-slate">{r.agency || '—'}</span> },
    { key: 'loan', header: 'Loan', render: (r) => <span className="text-fdc-grey">{r.loanType || '—'}</span> },
    { key: 'wd', header: 'Status', render: (r) => r.withdrawn ? <Pill color={FDC.grey}>Dropped</Pill> : <Pill color={FDC.green}>Current</Pill> },
  ];
  return (
    <>
      {probe.issuerNotCooperating && <p className="mb-2 flex items-center gap-1.5 rounded-lg bg-fdc-red/[0.07] px-2.5 py-1.5 text-[11.5px] text-fdc-slate"><AlertTriangle size={13} className="text-fdc-red" /> The agency noted this supplier stopped sharing information, so an old rating may be out of date — treat with caution.</p>}
      <Table columns={cols} rows={rows} getKey={(r) => `${r.date ?? ''}|${r.grade ?? ''}|${r.loanType ?? ''}`} initialSort={{ key: 'date', dir: 'desc' }} dense />
    </>
  );
}

function Legal({ probe }: { probe: ProbeProfile }) {
  const items = [...(probe.legalItems || []), ...(probe.financialDisputeItems || [])];
  const sevColor = (s?: string | null) => (/high/i.test(s || '') ? FDC.red : /medium/i.test(s || '') ? FDC.orange : FDC.grey);
  const cols: Column<(typeof items)[number]>[] = [
    { key: 'cat', header: 'What about', sortable: true, sortValue: (r) => r.category || '', render: (r) => <span className="font-medium text-fdc-slate">{r.category || '—'}</span> },
    { key: 'dir', header: 'Side', render: (r) => <Pill color={r.against ? FDC.red : FDC.grey}>{r.against ? 'Against them' : 'They filed'}</Pill> },
    { key: 'sev', header: 'How serious', render: (r) => r.severity ? <Badge color={sevColor(r.severity)}>{r.severity}</Badge> : <span className="text-fdc-grey">—</span> },
    { key: 'status', header: 'Status', render: (r) => <span className="text-fdc-slate">{r.status || '—'}</span> },
    { key: 'court', header: 'Court', render: (r) => <span className="text-fdc-grey">{r.court || '—'}</span> },
    { key: 'date', header: 'Date', align: 'right', sortable: true, sortValue: (r) => r.date || '', render: (r) => <span className="tnum text-fdc-grey">{r.date || '—'}</span> },
  ];
  return (
    <div>
      <div className="mb-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
        <StatTile label="Total cases" value={probe.legal.total} color={FDC.ink} />
        <StatTile label="Against them" value={probe.legal.against} color={probe.legal.against > 0 ? FDC.orange : FDC.ink} />
        <StatTile label="Still open" value={probe.legal.pending} color={probe.legal.pending > 0 ? FDC.orange : FDC.ink} />
        <StatTile label="Serious" value={probe.legal.severe} color={probe.legal.severe > 0 ? FDC.red : FDC.ink} />
        <StatTile label="Money disputes" value={probe.legal.financialDisputes} color={probe.legal.financialDisputes > 0 ? FDC.red : FDC.ink} />
      </div>
      {items.length > 0 && <Table columns={cols} rows={items.slice(0, 15)} getKey={(r) => `${r.category ?? ''}|${r.date ?? ''}|${r.court ?? ''}|${r.status ?? ''}`} maxHeight={320} dense />}
    </div>
  );
}

function OwnershipBoard({ probe }: { probe: ProbeProfile }) {
  const o = probe.ownership;
  const dirs = probe.directors || [];
  const dirCols: Column<(typeof dirs)[number]>[] = [
    { key: 'name', header: 'Director', render: (r) => <span className="font-semibold text-fdc-slate">{r.name}</span> },
    { key: 'desig', header: 'Role', render: (r) => <span className="text-fdc-grey">{r.designation || '—'}</span> },
    { key: 'boards', header: 'On how many boards', align: 'right', sortable: true, sortValue: (r) => r.boards ?? 0, render: (r) => r.boards != null ? <span className="tnum font-bold" style={{ color: r.boards >= 15 ? FDC.red : r.boards >= 8 ? FDC.orange : FDC.ink }}>{r.boards}</span> : <span className="text-fdc-grey">—</span> },
  ];
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <div>
        <div className="mb-2 grid grid-cols-3 gap-2">
          <StatTile label="Owners' stake" value={o?.promoterPct != null ? pct(o.promoterPct) : '—'} color="#8E44AD" />
          <StatTile label="Directors' stake" value={o?.directorsHoldingPct != null ? pct(o.directorsHoldingPct) : '—'} color={FDC.slate} />
          <StatTile label="Biggest owner" value={o?.topHolderPct != null ? pct(o.topHolderPct) : '—'} sub={o?.topHolderType || undefined} color={FDC.slate} />
        </div>
        {probe.group && probe.group.length > 0 ? (
          <div>
            <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-fdc-grey"><GitBranch size={12} /> Group companies ({probe.group.length})</div>
            <div className="space-y-1">
              {probe.group.slice(0, 8).map((g, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg bg-fdc-offwhite px-2.5 py-1 text-[11.5px]">
                  <span className="min-w-0 truncate text-fdc-slate">{g.name ? vendorShort(g.name) : g.cin || '—'}</span>
                  <Pill color={FDC.grey}>{g.relation}</Pill>
                </div>
              ))}
            </div>
          </div>
        ) : <p className="text-[11.5px] text-fdc-grey">No parent, subsidiary or sister companies on file — they stand alone.</p>}
      </div>
      <div>
        <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-fdc-grey"><Users size={12} /> Board ({dirs.length}){dirs.some((d) => (d.boards ?? 0) >= 15) && <span className="text-fdc-orange">· spread thin</span>}</div>
        {dirs.length > 0 ? <Table columns={dirCols} rows={dirs} getKey={(r) => `${r.din ?? ''}|${r.name}`} initialSort={{ key: 'boards', dir: 'desc' }} dense /> : <p className="text-[11.5px] text-fdc-grey">No active directors on file.</p>}
      </div>
    </div>
  );
}

function Fundraising({ probe }: { probe: ProbeProfile }) {
  const rows = probe.fundraising || [];
  const cols: Column<(typeof rows)[number]>[] = [
    { key: 'date', header: 'Date', sortable: true, sortValue: (r) => r.date || '', render: (r) => <span className="tnum text-fdc-slate">{r.date || '—'}</span> },
    { key: 'inst', header: 'Type', render: (r) => <span className="text-fdc-slate">{r.instrument || '—'}</span> },
    { key: 'amt', header: 'Raised', align: 'right', sortable: true, sortValue: (r) => r.amountRaised || 0, render: (r) => <span className="tnum font-bold">{r.amountRaised != null ? money(r.amountRaised) : '—'}</span> },
    { key: 'type', header: 'How', render: (r) => <span className="text-fdc-grey">{r.type || '—'}</span> },
  ];
  return <Table columns={cols} rows={rows} getKey={(r) => `${r.date ?? ''}|${r.instrument ?? ''}|${r.amountRaised ?? ''}`} initialSort={{ key: 'date', dir: 'desc' }} dense />;
}

function PeopleRpt({ probe }: { probe: ProbeProfile }) {
  const h = probe.headcount; const rp = probe.relatedParty;
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <StatTile label="Staff on the books" value={h?.latest != null ? h.latest.toLocaleString('en-IN') : (h?.band || '—')} sub={h?.establishments ? `${h.establishments} location${h.establishments > 1 ? 's' : ''}` : undefined} color={FDC.blue} />
        <StatTile label="Linked companies" value={rp?.counterparties ?? '—'} sub={rp?.fy || undefined} color={FDC.slate} />
      </div>
      {h?.paymentTimeliness && <p className="text-[11px] text-fdc-grey">Staff provident-fund payments: <span className={/due date|delay|after/i.test(h.paymentTimeliness) ? 'font-semibold text-fdc-orange' : 'font-semibold text-fdc-green'}>{h.paymentTimeliness}</span></p>}
      {rp?.note && <p className="text-[11px] text-fdc-grey">{rp.note}</p>}
    </div>
  );
}

const LEVER_STYLE: Record<string, { icon: typeof Lightbulb; color: string }> = {
  opportunity: { icon: Lightbulb, color: FDC.green },
  risk: { icon: AlertTriangle, color: FDC.red },
  watch: { icon: Eye, color: FDC.orange },
};
function LeverCard({ lever: l }: { lever: Lever }) {
  const s = LEVER_STYLE[l.type] || LEVER_STYLE.watch;
  const Icon = s.icon;
  return (
    <div className="rounded-xl border border-black/[0.06] bg-white p-3">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg" style={{ background: `${s.color}14`, color: s.color }}><Icon size={13} strokeWidth={2.3} /></span>
        <div className="min-w-0">
          <h4 className="text-[12.5px] font-bold leading-tight text-fdc-ink">{l.title}</h4>
          <p className="mt-0.5 text-[11.5px] leading-snug text-fdc-slate">{l.detail}</p>
          {l.evidence.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {l.evidence.map((e, i) => <span key={i} className="tnum rounded-md bg-fdc-offwhite px-1.5 py-0.5 text-[10.5px] text-fdc-slate"><span className="text-fdc-grey">{e.label}:</span> <b className="text-fdc-ink">{e.value}</b></span>)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function KV({ label, value, tone }: { label: string; value: string; tone?: 'risk' | 'ok' }) {
  return (
    <div className="rounded-lg border border-black/[0.06] bg-white px-2.5 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-fdc-grey">{label}</div>
      <div className="tnum text-[13px] font-bold" style={{ color: tone === 'risk' ? FDC.red : FDC.ink }}>{value}</div>
    </div>
  );
}
