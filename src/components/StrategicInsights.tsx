import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Factory, PackageSearch, Lightbulb, AlertTriangle, BadgeCheck, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { FDC } from '../lib/brand';

// Curated, high-value plays found in the Oct-2026 deep research — the one-off structural
// moves the SAP purchase data can't surface on its own. Shown as pinned rows in the Overview
// "All insights" table; clicking a row opens StrategicDetail. Edit this array to add/change a play.
export interface StrategicItem {
  id: string;
  // how it appears as a row in the insights table
  rowSupplier: string;
  rowArea: string;
  rowSpend: number | null;
  rowSaveLabel: string;
  rowSortSave: number;
  rowWhat: string;
  // the detail popup
  tag: string;
  color: string;
  icon: LucideIcon;
  title: string;
  potential: string;
  potentialTone: 'save' | 'leverage';
  why: string[];
  doNext: string;
  caveat: string;
  source: string;
}

export const STRATEGIC_ITEMS: StrategicItem[] = [
  {
    id: 'tetrapak',
    rowSupplier: 'Tetra Pak',
    rowArea: 'Aseptic cartons',
    rowSpend: 54634604,
    rowSaveLabel: '~₹1.4–2.2 Cr/yr',
    rowSortSave: 18000000,
    rowWhat: 'Break the lock-in: qualify Greatview cartons on your existing fillers, and use the EU/China antitrust rulings as leverage.',
    tag: 'Aseptic cartons · break the lock-in',
    color: '#8E44AD',
    icon: PackageSearch,
    title: 'Break the Tetra Pak lock-in — no new machine needed',
    potential: '~₹1.4–2.2 Cr / yr',
    potentialTone: 'save',
    why: [
      'Greatview cartons run on your existing Tetra Pak fillers — a 2nd supplier at near-zero cost.',
      'A carton’s real material is only ~₹1.2–1.5; the rest is hidden machine cost + monopoly margin.',
      'The EU and China have both fined Tetra Pak for exactly this lock-in — that’s your legal leverage.',
    ],
    doNext: 'Get Greatview to confirm fit on your exact fillers + a landed quote, ask Tetra Pak for a decoupled (machine vs carton) price, then renegotiate.',
    caveat: 'Confirm per-machine compatibility & requalify (ELECTRAL is a drug); Greatview has no India plant, so supply would be imported.',
    source: 'Public research · EU (1991) & China (2016) antitrust rulings, Greatview',
  },
  {
    id: 'sanstar',
    rowSupplier: 'Sanstar (new)',
    rowArea: 'Dextrose',
    rowSpend: null,
    rowSaveLabel: 'Price leverage',
    rowSortSave: 17000000,
    rowWhat: 'A hungry new-capacity dextrose maker 2–3 hrs away — use it to pressure your current dextrose price now.',
    tag: 'Dextrose · hungry new supplier',
    color: '#00973D',
    icon: Factory,
    title: 'A strong new dextrose supplier opening 2–3 hrs away',
    potential: 'Lever on your ₹38 Cr dextrose spend',
    potentialTone: 'leverage',
    why: [
      'Sanstar (Dhule, Maharashtra) just doubled capacity to 2,350 TPD — a hungry new plant gives the deepest price for committed volume.',
      'Right next to your Nashik / Aurangabad plants, so freight is low.',
      'Global ingredients giant Ingredion just took a 9% stake — strong backing.',
    ],
    doNext: 'Use it to pressure your current dextrose price now; qualify it (confirm pharma IP grade) as a cheaper 2nd source for FY27.',
    caveat: 'Its dextrose line launches FY2026-27 (not available today), and pharma (IP) grade isn’t confirmed yet — verify directly.',
    source: 'Sanstar NSE filings, Aug 2026 (verified)',
  },
];

export function StrategicDetail({ item: it, onClose }: { item: StrategicItem; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);
  const Icon = it.icon;
  const potColor = it.potentialTone === 'save' ? FDC.green : FDC.blue;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-fdc-ink/55 backdrop-blur-sm animate-fade-in sm:p-4 md:p-6" onClick={onClose} role="dialog" aria-modal="true" aria-label={it.title}>
      <div className="flex max-h-[92vh] min-h-0 w-full max-w-xl flex-col overflow-hidden bg-fdc-offwhite shadow-pop sm:rounded-2xl animate-fade-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex shrink-0 items-start gap-3 border-b border-black/[0.07] bg-white px-4 py-3 sm:px-5">
          <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white" style={{ background: it.color }}><Icon size={18} /></span>
          <div className="min-w-0 flex-1">
            <div className="mb-0.5 text-[10px] font-bold uppercase tracking-wide" style={{ color: it.color }}>{it.tag}</div>
            <h2 className="text-[15px] font-extrabold leading-snug text-fdc-ink">{it.title}</h2>
          </div>
          <button onClick={onClose} className="shrink-0 rounded-lg p-1.5 text-fdc-grey transition hover:bg-black/5 hover:text-fdc-ink focus-ring" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="fdc-scroll min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
          <div className="inline-flex w-fit items-center gap-1 rounded-full px-3 py-1 text-[13px] font-bold" style={{ background: `${potColor}18`, color: potColor }}>
            {it.potentialTone === 'save' ? '💰' : '⚡'} {it.potential}
          </div>
          <div className="rounded-xl border border-black/[0.06] bg-white p-3.5">
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-fdc-grey">Why it works</div>
            <ul className="space-y-1.5">
              {it.why.map((w, i) => <li key={i} className="flex gap-1.5 text-[12.5px] leading-snug text-fdc-slate"><span className="mt-[6px] h-1 w-1 shrink-0 rounded-full" style={{ background: it.color }} />{w}</li>)}
            </ul>
          </div>
          <div className="flex gap-2 rounded-xl border p-3.5" style={{ borderColor: `${it.color}33`, background: `${it.color}0D` }}>
            <Lightbulb size={16} className="mt-0.5 shrink-0" style={{ color: it.color }} />
            <p className="text-[12.5px] font-semibold leading-snug text-fdc-ink"><span className="font-bold" style={{ color: it.color }}>Do next: </span>{it.doNext}</p>
          </div>
          <p className="flex items-start gap-1.5 rounded-lg bg-fdc-gold/[0.08] px-3 py-2 text-[11.5px] leading-snug text-fdc-slate"><AlertTriangle size={14} className="mt-0.5 shrink-0 text-fdc-gold-dark" /><span><b>Verify first:</b> {it.caveat}</span></p>
          <p className="flex items-center gap-1.5 text-[11px] text-fdc-grey"><BadgeCheck size={12} className="shrink-0 text-fdc-green" /> Source: {it.source}</p>
        </div>
      </div>
    </div>,
    document.body
  );
}
