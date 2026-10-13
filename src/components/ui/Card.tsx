import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export function Card({
  children,
  className = '',
  pad = true,
}: {
  children: ReactNode;
  className?: string;
  pad?: boolean;
}) {
  return (
    <section
      className={`min-w-0 rounded-2xl border border-black/[0.06] bg-white shadow-card ${pad ? 'p-4 sm:p-5' : ''} ${className}`}
    >
      {children}
    </section>
  );
}

export function CardHeader({
  icon: Icon,
  title,
  subtitle,
  right,
  accent = '#00973D',
}: {
  icon?: LucideIcon;
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  accent?: string;
}) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div className="flex items-start gap-2.5">
        {Icon && (
          <span
            className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg"
            style={{ background: `${accent}14`, color: accent }}
          >
            <Icon size={17} strokeWidth={2.2} />
          </span>
        )}
        <div>
          <h3 className="text-[15px] font-bold leading-tight text-fdc-ink">{title}</h3>
          {subtitle && <p className="mt-0.5 text-[12.5px] leading-snug text-fdc-grey">{subtitle}</p>}
        </div>
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}

export function Badge({
  children,
  color = '#707070',
  soft = true,
  className = '',
}: {
  children: ReactNode;
  color?: string;
  soft?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold leading-none ${className}`}
      style={
        soft
          ? { background: `${color}18`, color }
          : { background: color, color: '#fff' }
      }
    >
      {children}
    </span>
  );
}

export function Pill({
  children,
  className = '',
  color = '#343434',
}: {
  children: ReactNode;
  className?: string;
  color?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10.5px] font-medium ${className}`}
      style={{ borderColor: `${color}30`, color }}
    >
      {children}
    </span>
  );
}

/** A compact inline stat used sparingly (not a KPI wall). */
export function MiniStat({
  label,
  value,
  sub,
  color = '#00973D',
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  color?: string;
}) {
  return (
    <div className="rounded-xl border border-black/[0.06] bg-white px-3.5 py-2.5">
      <div className="text-[11px] font-medium uppercase tracking-wide text-fdc-grey">{label}</div>
      <div className="tnum mt-0.5 text-[19px] font-extrabold leading-none" style={{ color }}>
        {value}
      </div>
      {sub && <div className="mt-1 text-[11.5px] leading-snug text-fdc-grey">{sub}</div>}
    </div>
  );
}
