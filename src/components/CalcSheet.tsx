import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Maximize2, Minimize2, Sigma, ExternalLink } from 'lucide-react';
import { FDC } from '../lib/brand';
import type { CalcData } from '../lib/calc';

/** Tiny "ƒx" affordance placed next to a number — click to open its calculation. */
export function CalcBtn({ onClick, light }: { onClick: (e: React.MouseEvent) => void; light?: boolean }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(e); }}
      title="Show the calculation"
      aria-label="Show the calculation"
      className={`ml-1 inline-flex h-[17px] w-[17px] shrink-0 translate-y-[-1px] items-center justify-center rounded-[5px] align-middle text-[10px] font-bold italic leading-none transition focus-ring ${light ? 'bg-white/25 text-white hover:bg-white/45' : 'bg-fdc-green/15 text-fdc-green hover:bg-fdc-green/30'}`}
    >
      ƒ
    </button>
  );
}

/** A draggable, resizable, maximizable "spreadsheet" window that shows how a number was worked out. */
export function CalcSheet({ calc, onClose }: { calc: CalcData | null; onClose: () => void }) {
  const [max, setMax] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  // a fresh number opens fresh: reset size + position
  useEffect(() => { setMax(false); setPos(null); }, [calc?.title]);

  if (!calc) return null;
  const cols = calc.columns ?? ['What', 'Number', 'Source'];

  const onDown = (e: React.PointerEvent) => {
    if (max) return;
    if ((e.target as HTMLElement).closest('button')) return; // don't start a drag when clicking the title-bar buttons
    const el = (e.currentTarget as HTMLElement).closest('[data-calcwin]') as HTMLElement | null;
    if (!el) return;
    const r = el.getBoundingClientRect();
    drag.current = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const x = Math.min(window.innerWidth - 90, Math.max(0, e.clientX - drag.current.dx));
    const y = Math.min(window.innerHeight - 40, Math.max(0, e.clientY - drag.current.dy));
    setPos({ x, y });
  };
  const onUp = (e: React.PointerEvent) => {
    drag.current = null;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  };

  const winStyle: React.CSSProperties = max
    ? { left: '3vw', top: '3vh', width: '94vw', height: '94vh' }
    : pos
      ? { left: pos.x, top: pos.y, width: 'min(580px, 94vw)', maxHeight: '82vh', resize: 'both' }
      : { left: '50%', top: '8vh', transform: 'translateX(-50%)', width: 'min(580px, 94vw)', maxHeight: '82vh', resize: 'both' };

  return createPortal(
    <div className="fixed inset-0 z-[60] bg-fdc-ink/15 animate-fade-in" onClick={onClose}>
      <div
        data-calcwin
        className="pointer-events-auto absolute flex min-h-[200px] min-w-[300px] flex-col overflow-hidden rounded-xl border border-black/20 bg-white shadow-pop"
        style={winStyle}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="false"
        aria-label={calc.title}
      >
        {/* title bar = drag handle */}
        <div
          className="flex shrink-0 cursor-move select-none items-center gap-2 bg-fdc-green px-3 py-2 text-white"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
        >
          <Sigma size={15} className="shrink-0" strokeWidth={2.4} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12.5px] font-bold leading-tight">{calc.title}</div>
            {calc.subtitle && <div className="truncate text-[10px] font-medium text-white/80">{calc.subtitle}</div>}
          </div>
          <button type="button" onClick={() => setMax((m) => !m)} className="rounded p-1 transition hover:bg-white/20 focus-ring" aria-label={max ? 'Restore size' : 'Maximize'}>{max ? <Minimize2 size={14} /> : <Maximize2 size={14} />}</button>
          <button type="button" onClick={onClose} className="rounded p-1 transition hover:bg-white/20 focus-ring" aria-label="Close"><X size={15} /></button>
        </div>

        {/* body */}
        <div className="fdc-scroll min-h-0 flex-1 overflow-auto bg-fdc-offwhite">
          {calc.formula && (
            <div className="border-b border-black/[0.06] bg-fdc-gold/[0.08] px-3 py-2">
              <div className="text-[9px] font-bold uppercase tracking-wide text-fdc-grey">How it’s worked out</div>
              <div className="mt-0.5 text-[11.5px] font-medium leading-snug text-fdc-ink">{calc.formula}</div>
            </div>
          )}

          <table className="w-full border-collapse text-[11.5px]">
            <thead>
              <tr className="bg-[#EEF1EE] text-[9.5px] uppercase tracking-wide text-fdc-grey">
                <th className="border border-black/10 px-2 py-1.5 text-left font-bold">{cols[0]}</th>
                <th className="border border-black/10 px-2 py-1.5 text-right font-bold">{cols[1]}</th>
                <th className="border border-black/10 px-2 py-1.5 text-left font-bold">{cols[2]}</th>
              </tr>
            </thead>
            <tbody>
              {calc.rows.map((r, i) => (
                <tr key={i} className={r.kind === 'result' ? 'bg-fdc-green/[0.10]' : i % 2 ? 'bg-white' : 'bg-black/[0.015]'}>
                  <td className="border border-black/10 px-2 py-1.5 align-top">
                    <div className={r.kind === 'result' ? 'font-extrabold text-fdc-ink' : 'font-medium text-fdc-slate'}>{r.label}</div>
                    {r.detail && <div className="mt-0.5 font-mono text-[10px] leading-snug text-fdc-grey">{r.detail}</div>}
                  </td>
                  <td className="tnum border border-black/10 px-2 py-1.5 text-right align-top font-semibold" style={{ color: r.kind === 'result' ? FDC.green : FDC.ink }}>{r.value ?? ''}</td>
                  <td className="border border-black/10 px-2 py-1.5 align-top text-[10px] text-fdc-grey">{r.source ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {(calc.note || calc.sources?.length) && (
            <div className="space-y-1.5 px-3 py-2.5 text-[10.5px] leading-snug text-fdc-grey">
              {calc.note && <p className="flex items-start gap-1"><span className="shrink-0 font-bold">ⓘ</span><span>{calc.note}</span></p>}
              {calc.sources?.length ? (
                <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="font-semibold uppercase tracking-wide">Sources:</span>
                  {calc.sources.map((s, i) => (s.url ? <a key={i} href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-fdc-blue hover:underline">{s.label}<ExternalLink size={9} /></a> : <span key={i}>{s.label}</span>))}
                </p>
              ) : null}
            </div>
          )}
        </div>

        <div className="shrink-0 select-none border-t border-black/[0.06] bg-white px-3 py-1 text-[9.5px] text-fdc-grey">
          Drag the title bar to move · drag the bottom-right corner or press ⤢ to resize · Esc to close
        </div>
      </div>
    </div>,
    document.body
  );
}
