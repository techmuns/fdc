import type { LucideIcon } from 'lucide-react';
import { Sparkles } from 'lucide-react';

export function ComingSoon({
  icon: Icon,
  title,
  blurb,
  features,
}: {
  icon: LucideIcon;
  title: string;
  blurb: string;
  features: { heading: string; detail: string }[];
}) {
  return (
    <div className="animate-fade-up">
      <div className="relative overflow-hidden rounded-2xl border border-black/[0.06] bg-white shadow-card">
        <div className="absolute inset-0 bg-gradient-to-br from-fdc-green/[0.05] via-transparent to-fdc-gold/[0.06]" />
        <div className="relative px-6 py-10 text-center sm:py-14">
          <span className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-fdc-green/10 text-fdc-green">
            <Icon size={30} strokeWidth={2} />
          </span>
          <div className="mx-auto mb-2 inline-flex items-center gap-1.5 rounded-full bg-fdc-gold/15 px-3 py-1 text-[11.5px] font-bold uppercase tracking-wide text-fdc-gold-dark">
            <Sparkles size={13} /> Coming in the next phase
          </div>
          <h2 className="text-[22px] font-extrabold text-fdc-ink">{title}</h2>
          <p className="mx-auto mt-2 max-w-xl text-[13.5px] leading-relaxed text-fdc-grey">{blurb}</p>

          <div className="mx-auto mt-7 grid max-w-3xl gap-3 sm:grid-cols-3">
            {features.map((f, i) => (
              <div
                key={i}
                className="rounded-xl border border-black/[0.06] bg-white/70 p-4 text-left shadow-sm"
              >
                <div className="mb-1 flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-fdc-green" />
                  <h4 className="text-[13px] font-bold text-fdc-slate">{f.heading}</h4>
                </div>
                <p className="text-[12px] leading-snug text-fdc-grey">{f.detail}</p>
              </div>
            ))}
          </div>

          <p className="mx-auto mt-7 max-w-lg text-[11.5px] italic text-fdc-light">
            This screen is scaffolded and ready — Phase 1 ships the data foundation these features will build on.
          </p>
        </div>
      </div>
    </div>
  );
}
