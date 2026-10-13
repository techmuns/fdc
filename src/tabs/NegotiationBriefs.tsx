import { useMemo, useState } from 'react';
import {
  FileText, Sparkles, KeyRound, Printer, Target, Hourglass, Scale, Repeat2,
  AlertTriangle, MessageSquareQuote, ShieldCheck, ExternalLink, TrendingUp, ChevronRight,
} from 'lucide-react';
import type { AppData, Brief } from '../types';
import { Card, Badge } from '../components/ui/Card';
import { money, vendorShort } from '../lib/format';

export default function NegotiationBriefs({ data }: { data: AppData }) {
  const briefs = data.briefs;
  const list = useMemo(() => (briefs?.briefs ?? []).slice().sort((a, b) => b.priorityScore - a.priorityScore), [briefs]);
  const [sel, setSel] = useState<string | null>(list[0]?.vendorKey ?? null);
  const selected = list.find((b) => b.vendorKey === sel) ?? list[0] ?? null;

  if (!briefs || briefs.status === 'no-key' || list.length === 0) return <NoKeyState note={briefs?.note} models={briefs?.modelsConfigured} />;

  const modelsUsed = Array.from(new Set(list.map((b) => b.generatedBy))).filter(Boolean);

  return (
    <div className="animate-fade-up">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-1.5 text-[15px] font-bold text-fdc-ink"><Sparkles size={15} className="text-fdc-green" /> Negotiation Briefs</h2>
          <p className="text-[12.5px] text-fdc-grey">
            <span className="font-semibold text-fdc-slate">{list.length}</span> AI-written briefs, each grounded only in FDC's real data — price gaps, payment terms, vendor financials & levers, and alternates.
            {briefs.status === 'partial' && briefs.note ? <span className="text-fdc-orange"> {briefs.note}</span> : null}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selected?.vendorKey ?? ''}
            onChange={(e) => setSel(e.target.value)}
            className="rounded-lg border border-black/[0.12] bg-white px-2.5 py-1.5 text-[12.5px] font-medium text-fdc-ink outline-none focus:border-fdc-green"
          >
            {list.map((b) => <option key={b.vendorKey} value={b.vendorKey}>{vendorShort(b.vendor)} · {b.material}</option>)}
          </select>
          <button onClick={() => window.print()} className="inline-flex items-center gap-1 rounded-lg border border-black/[0.12] bg-white px-2.5 py-1.5 text-[12px] font-semibold text-fdc-slate hover:border-fdc-green hover:text-fdc-green print:hidden">
            <Printer size={13} /> Print
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="min-w-0 lg:col-span-2 print:hidden">
          <Card pad={false}>
            <div className="border-b border-black/[0.05] px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-fdc-grey">Priority order</div>
            <div className="max-h-[640px] overflow-auto">
              {list.map((b, i) => (
                <button key={b.vendorKey} onClick={() => setSel(b.vendorKey)}
                  className={`flex w-full items-start gap-2 border-b border-black/[0.04] px-3 py-2.5 text-left transition-colors last:border-0 ${b.vendorKey === selected?.vendorKey ? 'bg-fdc-green/[0.06]' : 'hover:bg-black/[0.02]'}`}>
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md bg-fdc-green/10 text-[10px] font-extrabold text-fdc-green">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-[12.5px] font-bold text-fdc-ink">{vendorShort(b.vendor)}</span>
                      <span className="tnum shrink-0 text-[11px] font-semibold text-fdc-grey">{money(b.fdcSpend)}</span>
                    </span>
                    <span className="mt-0.5 block line-clamp-2 text-[11px] leading-snug text-fdc-grey">{b.headline}</span>
                  </span>
                  <ChevronRight size={14} className="mt-1 shrink-0 text-fdc-light" />
                </button>
              ))}
            </div>
          </Card>
        </div>
        <div className="min-w-0 lg:col-span-3">
          {selected && <BriefCard brief={selected} />}
        </div>
      </div>

      <p className="mt-3 text-[10.5px] text-fdc-grey print:mt-2">
        {modelsUsed.length ? <>Briefs written by <span className="font-semibold text-fdc-slate">{modelsUsed.join(', ')}</span> on {briefs.provider}. </> : null}
        Every figure is copied from FDC's own data; the model is instructed never to invent a number. Advisory only — Procurement, QA and R&D approve all changes.
      </p>
    </div>
  );
}

function Section({ icon: Icon, title, color, children }: { icon: React.ElementType; title: string; color: string; children: React.ReactNode }) {
  return (
    <div className="mt-3.5">
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color }}><Icon size={13} /> {title}</div>
      {children}
    </div>
  );
}

function BriefCard({ brief: b }: { brief: Brief }) {
  return (
    <Card>
      <div id="brief-print" className="print:p-0">
        {/* header */}
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge color="#00973D"><FileText size={11} /> Negotiation brief</Badge>
              {b.type === 'listed' ? <Badge color="#2E7CE4">Listed</Badge> : <Badge color="#8E44AD">Private</Badge>}
              {b.materials.map((m, i) => <Badge key={i} color="#707070">{m}</Badge>)}
            </div>
            <h3 className="mt-1.5 text-[17px] font-extrabold leading-tight text-fdc-ink">{b.vendor}</h3>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-medium uppercase tracking-wide text-fdc-grey">FDC annual spend</div>
            <div className="tnum text-[16px] font-extrabold text-fdc-green">{money(b.fdcSpend)}</div>
          </div>
        </div>

        {/* headline */}
        <div className="mt-3 rounded-2xl bg-fdc-green/[0.06] p-3.5">
          <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-fdc-green"><Target size={13} /> The headline ask</div>
          <p className="mt-1 text-[14.5px] font-bold leading-snug text-fdc-ink">{b.headline}</p>
        </div>

        {/* asks */}
        <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
          <div className="rounded-xl border border-black/[0.06] p-3">
            <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-fdc-grey"><Target size={12} /> Price</div>
            <p className="mt-1 text-[12.5px] font-semibold text-fdc-ink">{b.priceAsk.summary}</p>
            {b.priceAsk.target && <p className="tnum mt-1 text-[12px] font-bold text-fdc-green">{b.priceAsk.target}</p>}
            <p className="mt-1 text-[11.5px] leading-snug text-fdc-grey">{b.priceAsk.basis}</p>
          </div>
          <div className="rounded-xl border border-black/[0.06] p-3">
            <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-fdc-grey"><Hourglass size={12} /> Payment terms</div>
            <p className="mt-1 text-[12.5px] font-semibold text-fdc-ink">{b.paymentTermAsk.summary}</p>
            {b.paymentTermAsk.cashImpact && b.paymentTermAsk.cashImpact.toLowerCase() !== 'none' && <p className="tnum mt-1 text-[12px] font-bold text-fdc-green">{b.paymentTermAsk.cashImpact}</p>}
          </div>
        </div>

        {/* evidence */}
        <Section icon={Scale} title="Evidence (every figure is real)" color="#2E7CE4">
          <div className="space-y-1.5">
            {b.evidence.map((e, i) => (
              <div key={i} className="flex items-start justify-between gap-3 rounded-lg bg-fdc-offwhite px-2.5 py-1.5">
                <span className="text-[12px] leading-snug text-fdc-slate">{e.point}</span>
                <span className="tnum shrink-0 rounded-md bg-white px-1.5 py-0.5 text-[11.5px] font-bold text-fdc-ink">{e.figure}</span>
              </div>
            ))}
          </div>
        </Section>

        {/* financial leverage */}
        <Section icon={TrendingUp} title="Their financial position — our leverage" color="#8E44AD">
          <p className="text-[12.5px] leading-relaxed text-fdc-slate">{b.financialLeverage}</p>
        </Section>

        {/* opening line */}
        <Section icon={MessageSquareQuote} title="Suggested opening line" color="#00973D">
          <blockquote className="rounded-xl border-l-[3px] border-fdc-green bg-fdc-green/[0.04] px-3 py-2 text-[13px] font-medium italic leading-snug text-fdc-ink">“{b.suggestedOpeningLine}”</blockquote>
        </Section>

        {/* alternates + risks */}
        <div className="grid gap-2.5 sm:grid-cols-2">
          {b.alternates.length > 0 && (
            <Section icon={Repeat2} title="Credible alternates" color="#2E7CE4">
              <div className="space-y-1.5">
                {b.alternates.map((a, i) => (
                  <div key={i} className="rounded-lg border border-black/[0.06] px-2.5 py-1.5">
                    <div className="text-[12px] font-bold text-fdc-ink">{a.name}</div>
                    <div className="text-[11px] leading-snug text-fdc-grey">{a.why}</div>
                  </div>
                ))}
              </div>
            </Section>
          )}
          {b.risks.length > 0 && (
            <Section icon={AlertTriangle} title="Watch-outs for us" color="#F36D06">
              <ul className="space-y-1">
                {b.risks.map((r, i) => <li key={i} className="flex gap-1.5 text-[11.5px] leading-snug text-fdc-slate"><span className="mt-[3px] h-1 w-1 shrink-0 rounded-full bg-fdc-orange" />{r}</li>)}
              </ul>
            </Section>
          )}
        </div>

        {/* governance (pharma rule) */}
        <div className="mt-3.5 flex items-start gap-2 rounded-xl border border-fdc-green/20 bg-fdc-green/[0.04] px-3 py-2">
          <ShieldCheck size={15} className="mt-0.5 shrink-0 text-fdc-green" />
          <p className="text-[11px] leading-snug text-fdc-slate">{b.approvalNote}</p>
        </div>

        {/* footer */}
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-1.5 border-t border-black/[0.05] pt-2 text-[10px] text-fdc-grey">
          <span>Generated by <span className="font-semibold text-fdc-slate">{b.generatedBy}</span> · {b.generatedAt}</span>
          <span className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
            {b.sources.map((s, i) => s.url ? (
              <a key={i} href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 hover:text-fdc-blue"><ExternalLink size={9} /> {s.label}</a>
            ) : <span key={i} className="inline-flex items-center gap-0.5"><ExternalLink size={9} /> {s.label}</span>)}
          </span>
        </div>
      </div>
    </Card>
  );
}

function NoKeyState({ note, models }: { note?: string | null; models?: string[] }) {
  return (
    <div className="animate-fade-up">
      <Card>
        <div className="mx-auto max-w-xl py-6 text-center">
          <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-fdc-green/10"><Sparkles size={26} className="text-fdc-green" /></span>
          <h2 className="text-[17px] font-extrabold text-fdc-ink">AI Negotiation Briefs</h2>
          <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-relaxed text-fdc-grey">
            One-click negotiation packs per vendor — the headline ask, the price &amp; payment-terms moves, the evidence, credible alternates and the opening line — written by <span className="font-semibold text-fdc-slate">Claude on AWS Bedrock</span>, grounded <span className="font-semibold text-fdc-slate">only</span> in the real data already in this cockpit. No invented numbers.
        </p>

          <div className="mx-auto mt-4 max-w-md rounded-2xl border border-dashed border-fdc-light bg-fdc-offwhite/60 p-4 text-left">
            <div className="flex items-center gap-1.5 text-[12px] font-bold text-fdc-slate"><KeyRound size={14} className="text-fdc-orange" /> One-time setup to switch it on</div>
            <p className="mt-1 text-[11.5px] leading-snug text-fdc-grey">{note || 'Add the Bedrock key and model IDs, then the briefs generate automatically on every data refresh.'}</p>
            <ul className="mt-2 space-y-1 text-[11.5px] text-fdc-slate">
              <li>• <code className="rounded bg-black/5 px-1 py-0.5 font-mono text-[10.5px]">BEDROCK_API_KEY</code> — repository <b>secret</b></li>
              <li>• <code className="rounded bg-black/5 px-1 py-0.5 font-mono text-[10.5px]">AWS_REGION</code> — variable (e.g. <code className="font-mono text-[10.5px]">us-east-1</code>)</li>
              <li>• <code className="rounded bg-black/5 px-1 py-0.5 font-mono text-[10.5px]">BEDROCK_MODEL_IDS</code> — variable (comma-separated inference-profile IDs; a current Sonnet first)</li>
            </ul>
            <p className="mt-2 text-[10.5px] leading-snug text-fdc-grey">Then run the <span className="font-semibold">Negotiation briefs</span> GitHub Action (or wait for the nightly refresh). Until then nothing is faked — this screen stays.</p>
          </div>
          {models && models.length > 0 && <p className="mt-3 text-[10.5px] text-fdc-grey">Configured models: <span className="font-mono">{models.join(', ')}</span></p>}
        </div>
      </Card>
    </div>
  );
}
