import { dateLabel } from '../lib/format';
import type { Meta } from '../types';

export function Header({ meta }: { meta?: Meta }) {
  return (
    <header className="sticky top-0 z-40 border-b border-black/[0.06] bg-white/90 backdrop-blur-md">
      {/* subtle green gradient bar */}
      <div className="h-1 w-full bg-gradient-to-r from-fdc-green-dark via-fdc-green to-fdc-green-lighter" />
      <div className="mx-auto flex max-w-[1240px] items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
        <div className="flex items-center gap-3">
          <img src={`${import.meta.env.BASE_URL}fdc-logo.png`} alt="FDC" className="h-9 w-auto" />
          <div className="h-8 w-px bg-fdc-light/70" />
          <div>
            <h1 className="text-[15px] font-extrabold leading-tight text-fdc-ink sm:text-[17px]">
              Procurement Intelligence Cockpit
            </h1>
            <p className="hidden text-[11.5px] leading-tight text-fdc-grey sm:block">
              Where we overpay, where terms are weak, and who to negotiate with — from real purchase data
            </p>
          </div>
        </div>
        {meta && (
          <div className="hidden text-right md:block">
            <div className="flex items-center justify-end gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-fdc-green" />
              <span className="text-[11px] font-semibold text-fdc-slate">Live from SAP exports</span>
            </div>
            <p className="tnum mt-0.5 text-[11px] text-fdc-grey">
              {dateLabel(meta.dateRange.from)} – {dateLabel(meta.dateRange.to)}
            </p>
          </div>
        )}
      </div>
    </header>
  );
}
