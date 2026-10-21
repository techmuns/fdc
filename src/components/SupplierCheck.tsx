import { AlertTriangle, ShieldCheck, ExternalLink } from 'lucide-react';
import type { SupplierIntel } from '../types';
import { FDC } from '../lib/brand';

// Plain-language due-diligence panel for one supplier — the web + news research
// (risk, the "why", any red flag, and what to do), shown wherever a supplier is in focus.
const RISK: Record<string, { label: string; color: string }> = {
  red: { label: 'High risk — verify', color: FDC.red },
  amber: { label: 'Watch', color: FDC.orange },
  green: { label: 'Low risk', color: FDC.green },
};

export function SupplierCheck({ intel, who }: { intel: SupplierIntel; who?: string }) {
  const R = RISK[intel.riskLevel] ?? RISK.amber;
  return (
    <div className="rounded-xl border p-3.5" style={{ borderColor: `${R.color}40`, background: `${R.color}0D` }}>
      <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-white" style={{ background: R.color }}>
          {intel.riskLevel === 'green' ? <ShieldCheck size={12} /> : <AlertTriangle size={12} />} {R.label}
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-fdc-grey">Supplier check{who ? ` · ${who}` : ''}</span>
      </div>
      <p className="text-[13px] font-bold leading-snug text-fdc-ink">{intel.headline}</p>

      {intel.flag && (
        <div className="mt-2 rounded-lg border p-2.5" style={{ borderColor: `${R.color}66`, background: `${R.color}14` }}>
          <div className="flex items-center gap-1.5 text-[11.5px] font-bold" style={{ color: R.color }}>
            <AlertTriangle size={13} className="shrink-0" /> {intel.flag.label}
          </div>
          <p className="mt-1 text-[11.5px] leading-snug text-fdc-slate">
            {intel.flag.detail}
            {intel.flag.sourceUrl ? <> <a href={intel.flag.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-semibold text-fdc-blue hover:underline">source <ExternalLink size={10} /></a></> : null}
          </p>
        </div>
      )}

      <div className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-fdc-grey">What we found</div>
      <ul className="mt-0.5 space-y-1">
        {intel.findings.map((f, i) => (
          <li key={i} className="flex gap-1.5 text-[12px] leading-snug text-fdc-slate">
            <span className="mt-[6px] h-1 w-1 shrink-0 rounded-full" style={{ background: R.color }} /><span>{f}</span>
          </li>
        ))}
      </ul>

      <div className="mt-2 rounded-lg bg-white/70 px-2.5 py-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-fdc-grey">Bottom line</span>
        <p className="text-[12px] font-semibold leading-snug text-fdc-ink">{intel.verdict}</p>
      </div>

      {intel.sources?.length ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10.5px] text-fdc-grey">
          <span className="font-semibold uppercase tracking-wide">Sources:</span>
          {intel.sources.map((s, i) => (s.url ? (
            <a key={i} href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-fdc-blue hover:underline">{s.label} <ExternalLink size={9} /></a>
          ) : <span key={i}>{s.label}</span>))}
        </div>
      ) : null}
    </div>
  );
}
