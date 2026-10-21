import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Wallet, Coins, Clock, Scale, X, Info, CalendarClock, ArrowRight } from 'lucide-react';
import type { AppData, MaterialKey } from '../types';
import type { Nav } from '../App';
import { Card, Badge } from '../components/ui/Card';
import { Table, type Column } from '../components/ui/Table';
import { Dropdown, Segmented, Toggle, type Option } from '../components/ui/Controls';
import { FDC, MATERIAL_COLOR, termLabel } from '../lib/brand';
import { vendorShort } from '../lib/format';

const fmtCash = (n: number) =>
  n >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `₹${(n / 1e5).toFixed(1)} L` : `₹${Math.round(n).toLocaleString('en-IN')}`;

/** Credit you actually get, in days. Net terms → the days; pay-now / advance → 0. */
const creditDaysOf = (termCategory: string, termDays: number | null) => (termCategory === 'net' ? termDays ?? 30 : 0);
const oppAt = (spend: number, youGet: number, target: number) => (spend * Math.max(0, target - youGet)) / 365;

interface Row {
  key: string;
  name: string;
  color: string;
  spend: number;
  termCategory: string;
  termDays: number | null;
  termText: string;
  youGet: number; // days of credit you get
  theyGive: number | null; // debtor days — days they let their own customers take
  theyPay: number | null; // payable days — how long they take to pay their own suppliers
  netMargin: number | null;
  matKeys: MaterialKey[];
  hasFin: boolean;
}

export default function CreditTermsTab({ data, nav, onNavigate }: { data: AppData; nav: Nav; onNavigate: (n: Nav) => void }) {
  const pt = data.paymentTerms;
  const [target, setTarget] = useState<'30' | '45'>('30');
  const [mat, setMat] = useState<string>('all');
  const [pushOnly, setPushOnly] = useState(false);
  const [open, setOpen] = useState<string | null>((nav.tab === 'credit' && nav.vendorKey) || null);

  // vendorKey → the material keys it supplies (from the always-present vendor master)
  const matKeyOf = useMemo(() => {
    const m: Record<string, MaterialKey[]> = {};
    for (const v of data.vendors) m[v.key] = v.materialKeys;
    return m;
  }, [data.vendors]);

  const rows: Row[] = useMemo(() => {
    if (!pt) return [];
    return pt.vendors.map((v) => {
      const fin = data.financials?.vendors[v.vendorKey];
      const youGet = creditDaysOf(v.termCategory, v.termDays);
      const theyGive = fin?.metrics?.receivableDays != null ? Math.round(fin.metrics.receivableDays) : null;
      const theyPay = fin?.metrics?.payableDays != null ? Math.round(fin.metrics.payableDays) : null;
      return {
        key: v.vendorKey,
        name: v.vendor,
        color: v.color,
        spend: v.totalSpend,
        termCategory: v.termCategory,
        termDays: v.termDays,
        termText: v.termText,
        youGet,
        theyGive,
        theyPay,
        netMargin: fin?.metrics?.netMargin ?? null,
        matKeys: matKeyOf[v.vendorKey] ?? [],
        hasFin: theyGive != null || theyPay != null,
      };
    });
  }, [pt, data.financials, matKeyOf]);

  const targetN = Number(target);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (mat !== 'all' && !r.matKeys.includes(mat as MaterialKey)) return false;
      if (pushOnly) {
        const floorAsk = Math.max(0, targetN - r.youGet);
        const debtGap = r.theyGive != null ? r.theyGive - r.youGet : 0;
        if (floorAsk <= 0 && debtGap <= 0) return false;
      }
      return true;
    });
  }, [rows, mat, pushOnly, targetN]);

  if (!pt) return <Card><p className="text-[13px] text-fdc-grey">No payment-terms data loaded. Run <code className="rounded bg-black/5 px-1 py-0.5 font-mono text-[11px]">npm run normalize</code>.</p></Card>;

  const matOpts: Option<string>[] = [
    { value: 'all', label: 'All materials' },
    ...data.meta.materialMeta.map((m) => ({ value: m.key, label: m.plainName || m.displayName, color: MATERIAL_COLOR[m.key] })),
  ];

  const maxOpp = Math.max(1, ...filtered.map((r) => oppAt(r.spend, r.youGet, targetN)));

  const columns: Column<Row>[] = [
    {
      key: 'name',
      header: 'Supplier',
      sortable: true,
      sortValue: (r) => r.name,
      render: (r) => (
        <div className="flex items-center gap-2">
          <span className="flex shrink-0 gap-0.5">
            {r.matKeys.map((k) => <span key={k} className="h-2.5 w-2.5 rounded-sm" style={{ background: MATERIAL_COLOR[k] }} />)}
          </span>
          <span className="font-semibold text-fdc-ink">{vendorShort(r.name)}</span>
        </div>
      ),
    },
    {
      key: 'spend',
      header: 'Yearly spend',
      align: 'right',
      sortable: true,
      sortValue: (r) => r.spend,
      render: (r) => <span className="tnum font-semibold text-fdc-slate">{fmtCash(r.spend)}</span>,
    },
    {
      key: 'youGet',
      header: 'Credit you get',
      align: 'center',
      sortable: true,
      sortValue: (r) => r.youGet,
      headerHint: 'How many days they give YOU to pay, from the purchase order.',
      render: (r) => {
        const col = r.youGet >= 30 ? FDC.green : r.youGet > 0 ? FDC.orange : FDC.red;
        const label = r.termCategory === 'net' ? `${r.youGet} days` : r.termCategory === 'advance' ? 'Pay in advance' : 'Pay on delivery';
        return <Badge color={col}>{label}</Badge>;
      },
    },
    {
      key: 'theyGive',
      header: 'They give their customers',
      align: 'center',
      sortable: true,
      sortValue: (r) => r.theyGive ?? -1,
      headerHint: 'Days THEY let their own customers take to pay them (from their filed accounts). “—” = accounts not public.',
      render: (r) => (r.theyGive == null ? <span className="text-fdc-light">—</span> : <span className="tnum font-semibold text-fdc-slate">{r.theyGive} days</span>),
    },
    {
      key: 'opening',
      header: 'Your opening',
      sortable: true,
      sortValue: (r) => {
        const floorAsk = Math.max(0, targetN - r.youGet);
        const debtGap = r.theyGive != null ? Math.max(0, r.theyGive - r.youGet) : 0;
        return Math.max(floorAsk, debtGap);
      },
      render: (r) => {
        const floorAsk = Math.max(0, targetN - r.youGet);
        const debtGap = r.theyGive != null ? r.theyGive - r.youGet : null;
        if (floorAsk > 0) {
          const extra = debtGap != null && debtGap > floorAsk ? ` · they give others ${r.theyGive}d` : '';
          return <span className="text-[12px] font-semibold" style={{ color: FDC.red }}>Ask for +{floorAsk} days → {targetN}d{extra}</span>;
        }
        if (debtGap != null && debtGap > 0) {
          return <span className="text-[12px] font-semibold" style={{ color: FDC.blue }}>They give others +{debtGap}d — room to push</span>;
        }
        return <span className="text-[12px] font-medium text-fdc-grey">You’re already ahead</span>;
      },
    },
    {
      key: 'cash',
      header: `Cash freed at ${targetN}d`,
      align: 'right',
      sortable: true,
      sortValue: (r) => oppAt(r.spend, r.youGet, targetN),
      headerHint: `One-time cash you stop handing over early if this supplier moves to ${targetN}-day credit. Not a yearly saving.`,
      heat: (r) => oppAt(r.spend, r.youGet, targetN) / maxOpp || null,
      heatScale: 'hue',
      heatColor: FDC.blue,
      render: (r) => {
        const o = oppAt(r.spend, r.youGet, targetN);
        return o > 0 ? <span className="tnum font-bold text-fdc-blue">{fmtCash(o)}</span> : <span className="text-fdc-light">—</span>;
      },
    },
  ];

  const openRow = rows.find((r) => r.key === open) ?? null;

  return (
    <div className="animate-fade-up space-y-4">
      {/* header */}
      <div className="mb-1">
        <h2 className="flex items-center gap-1.5 text-[16px] font-bold leading-tight text-fdc-ink">
          <Wallet size={17} strokeWidth={2.3} className="text-fdc-green" /> Credit &amp; terms — who gives you time to pay, and who doesn’t
        </h2>
        <p className="mt-1 max-w-3xl text-[12.5px] leading-snug text-fdc-grey">
          Every supplier, side by side: the credit they give <b className="text-fdc-slate">you</b> vs the credit they give <b className="text-fdc-slate">their own customers</b>. The gap is your opening. Tap any row for the full picture.
        </p>
      </div>

      {/* controls */}
      <div className="flex flex-wrap items-end gap-3">
        <Dropdown value={mat} options={matOpts} onChange={setMat} label="Material" width={190} />
        <div>
          <span className="mb-1 block text-[11px] font-medium text-fdc-grey">Push everyone to</span>
          <Segmented value={target} options={[{ value: '30', label: '30 days' }, { value: '45', label: '45 days' }]} onChange={(v) => setTarget(v as '30' | '45')} />
        </div>
        <div className="pb-1.5">
          <Toggle checked={pushOnly} onChange={setPushOnly} label="Only where I can push" color={FDC.blue} />
        </div>
      </div>

      {/* the table */}
      <Table
        columns={columns}
        rows={filtered}
        getKey={(r) => r.key}
        initialSort={{ key: 'spend', dir: 'desc' }}
        onRowClick={(r) => setOpen(r.key)}
        activeKey={open}
      />

      {/* honest limit */}
      <div className="flex items-start gap-2 rounded-xl border border-black/[0.06] bg-white px-3.5 py-2.5 text-[11.5px] leading-snug text-fdc-grey">
        <Info size={14} className="mt-0.5 shrink-0 text-fdc-grey" />
        <span>
          <b className="text-fdc-slate">What this is, and what it isn’t.</b> This compares the credit on the purchase order (what you <i>agreed</i>) with what each supplier gives its own customers (their “debtor days”, from their public filed accounts). It does <b>not</b> yet show the actual number of days you really take to pay each one — that needs the SAP vendor payment ledger (invoice date vs the date the payment cleared, the FBL1N / accounts-payable export). Get that export and we can add a “terms vs reality” column that proves exactly how many days you really pay in.
        </span>
      </div>

      {openRow && <CreditDetail row={openRow} target={targetN} onClose={() => setOpen(null)} onNavigate={onNavigate} />}
    </div>
  );
}

/* ---------- per-supplier detail ---------- */
function CreditDetail({ row, target, onClose, onNavigate }: { row: Row; target: number; onClose: () => void; onNavigate: (n: Nav) => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  const floorAsk = Math.max(0, target - row.youGet);
  const opp = oppAt(row.spend, row.youGet, target);
  const youLabel = row.termCategory === 'net' ? `${row.youGet} days` : row.termCategory === 'advance' ? '100% in advance' : 'On delivery';
  const barMax = Math.max(row.youGet, row.theyGive ?? 0, 30, target);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-fdc-ink/55 backdrop-blur-sm animate-fade-in sm:p-4 md:p-6" onClick={onClose} role="dialog" aria-modal="true" aria-label={`Terms: ${row.name}`}>
      <div className="flex max-h-[92vh] min-h-0 w-full max-w-xl flex-col overflow-hidden bg-fdc-offwhite shadow-pop sm:rounded-2xl animate-fade-up" onClick={(e) => e.stopPropagation()}>
        {/* header */}
        <div className="flex shrink-0 items-start gap-3 border-b border-black/[0.07] bg-white px-4 py-3 sm:px-5">
          <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white" style={{ background: FDC.blue }}><CalendarClock size={18} /></span>
          <div className="min-w-0 flex-1">
            <div className="mb-0.5 flex flex-wrap items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wide text-fdc-blue">Credit &amp; terms
              <Badge color={row.youGet >= 30 ? FDC.green : FDC.red}>{termLabel(row.termCategory, row.termDays)}</Badge>
            </div>
            <h2 className="text-[14.5px] font-bold leading-snug text-fdc-ink">{vendorShort(row.name)}</h2>
            <div className="mt-0.5 text-[11.5px] text-fdc-grey">{fmtCash(row.spend)} a year · {row.termText}</div>
          </div>
          <button onClick={onClose} className="shrink-0 rounded-lg p-1.5 text-fdc-grey transition hover:bg-black/5 hover:text-fdc-ink focus-ring" aria-label="Close"><X size={18} /></button>
        </div>

        {/* body */}
        <div className="fdc-scroll min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-4 sm:px-4">
          {/* the comparison */}
          <Section icon={Scale} title="Credit you get vs what they give others" color={FDC.blue}>
            <div className="space-y-2.5">
              <DayBar label="They give you" value={row.youGet} max={barMax} color={row.youGet >= 30 ? FDC.green : FDC.red} valueLabel={youLabel} />
              <DayBar label="Most suppliers give you" value={30} max={barMax} color={FDC.grey} valueLabel="30 days" dashed />
              {row.theyGive != null && <DayBar label="They give their own customers" value={row.theyGive} max={barMax} color={FDC.orange} valueLabel={`${row.theyGive} days`} />}
            </div>
            {row.theyGive != null ? (
              <p className="mt-2.5 rounded-lg bg-fdc-blue/[0.06] px-2.5 py-1.5 text-[11.5px] leading-snug text-fdc-slate">
                They comfortably let <b>their</b> customers take <b>{row.theyGive} days</b>, but give you <b>{youLabel.toLowerCase()}</b>. {row.theyGive - row.youGet > 0 ? <>That {row.theyGive - row.youGet}-day gap is your argument — <b>ask for the same.</b></> : <>You’re already on par or better.</>}
              </p>
            ) : (
              <p className="mt-2.5 rounded-lg bg-black/[0.03] px-2.5 py-1.5 text-[11.5px] leading-snug text-fdc-grey">Their accounts aren’t public, so we can’t show what they give their own customers. Ask for 30-day credit on the strength of your volume.</p>
            )}
          </Section>

          {/* how they pay their own suppliers */}
          {row.theyPay != null && (
            <Section icon={Clock} title="How fast they pay their own suppliers" color={FDC.orange}>
              <div className="flex items-baseline gap-2">
                <span className="tnum text-[24px] font-extrabold leading-none text-fdc-slate">{row.theyPay} days</span>
                <span className="text-[11.5px] text-fdc-grey">they take to pay the people who supply them</span>
              </div>
              <p className="mt-1.5 text-[11.5px] leading-snug text-fdc-grey">Useful context: a supplier who takes {row.theyPay} days to pay others is used to credit in the chain — so a 30-day ask from you is normal, not a stretch.</p>
            </Section>
          )}

          {/* cash */}
          {opp > 0 ? (
            <Section icon={Coins} title={`Cash you'd free at ${target}-day credit`} color={FDC.green}>
              <div className="flex items-baseline gap-2">
                <span className="tnum text-[26px] font-extrabold leading-none text-fdc-blue">{fmtCash(opp)}</span>
                <span className="text-[12px] text-fdc-grey">one-time cash</span>
              </div>
              <p className="mt-1.5 text-[11.5px] leading-snug text-fdc-slate">Moving {vendorShort(row.name)} from {youLabel.toLowerCase()} to <b>{target}-day</b> credit stops you handing over about <b>{fmtCash(opp)}</b> early (on {fmtCash(row.spend)} of spend). It’s a one-time cash release — not a price cut. {floorAsk > 0 && <>Your ask: <b>+{floorAsk} days.</b></>}</p>
            </Section>
          ) : (
            <Section icon={Coins} title="Cash position" color={FDC.green}>
              <p className="text-[11.5px] leading-snug text-fdc-slate">You already get {youLabel.toLowerCase()} here — at or above the {target}-day mark — so there’s no early cash to free. Hold the terms at renewal.</p>
            </Section>
          )}

          <button onClick={() => { onClose(); onNavigate({ tab: 'vendors', vendorKey: row.key }); }}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-fdc-green/30 bg-fdc-green/[0.06] px-3 py-2.5 text-[12.5px] font-semibold text-fdc-green transition hover:bg-fdc-green/[0.12] focus-ring">
            See this supplier’s full profile <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function DayBar({ label, value, max, color, valueLabel, dashed }: { label: string; value: number; max: number; color: string; valueLabel: string; dashed?: boolean }) {
  const w = Math.max(2, (value / (max || 1)) * 100);
  return (
    <div>
      <div className="mb-0.5 flex items-baseline justify-between text-[11.5px]"><span className="text-fdc-slate">{label}</span><span className="tnum font-bold" style={{ color }}>{valueLabel}</span></div>
      <div className="h-2.5 overflow-hidden rounded-full bg-black/[0.05]">
        <div className="h-full rounded-full" style={{ width: `${w}%`, background: color, opacity: dashed ? 0.45 : 1 }} />
      </div>
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
