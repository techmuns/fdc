import { useMemo, useState, useEffect } from 'react';
import {
  Factory, Search, Hourglass, TrendingDown, TrendingUp, Clock, PackageSearch, Repeat2,
  Maximize2, BadgeCheck, Lock, CalendarClock,
} from 'lucide-react';
import type { AppData, ValueVendor, VendorFin } from '../types';
import type { Nav } from '../App';
import { Card, Badge, Pill } from '../components/ui/Card';
import { Sparkline } from '../components/charts/Sparkline';
import VendorProfile, { type ProfileSubject } from '../components/VendorProfile';
import { FDC, MATERIAL_COLOR } from '../lib/brand';
import { vendorShort, crore, pct } from '../lib/format';

const MAT_NAME: Record<string, string> = { dextrose: 'Dextrose', packaging: 'Rigid packaging', laminates: 'Laminates' };
const priceFmt = (n: number | null | undefined, unit = 'kg') => (n == null ? '—' : `₹${n >= 100 ? Math.round(n) : n >= 10 ? n.toFixed(1) : n.toFixed(2)}/${unit === 'NOS' ? 'pc' : unit.toLowerCase()}`);

export default function VendorsTab({ data, nav, onNavigate }: { data: AppData; nav: Extract<Nav, { tab: 'vendors' }>; onNavigate: (n: Nav) => void }) {
  const v = data.value;
  const list = useMemo(() => (v ? Object.values(v.vendors).sort((a, b) => b.spend - a.spend) : []), [v]);
  const [sel, setSel] = useState<string | null>(nav.vendorKey ?? list[0]?.vendorKey ?? null);
  const [q, setQ] = useState('');
  const [profile, setProfile] = useState<ProfileSubject | null>(null);
  useEffect(() => { if (nav.vendorKey) setSel(nav.vendorKey); }, [nav.vendorKey]);

  if (!v) return <Card><p className="text-[13px] text-fdc-grey">No value data.</p></Card>;
  const rows = list.filter((x) => !q || vendorShort(x.name).toLowerCase().includes(q.toLowerCase()));
  const selVendor = v.vendors[sel ?? ''] ?? list[0];

  return (
    <div className="animate-fade-up">
      <div className="mb-3">
        <h2 className="flex items-center gap-1.5 text-[16px] font-bold leading-tight text-fdc-ink"><Factory size={17} strokeWidth={2.3} className="text-fdc-green" /> Suppliers — where the negotiating room is</h2>
        <p className="mt-1 text-[12.5px] leading-snug text-fdc-grey">{list.length} suppliers. Click any name anywhere in the app to land here. Each card shows how hard you can push and who could replace them.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* list */}
        <div className="lg:col-span-2">
          <Card pad={false}>
            <div className="border-b border-black/[0.05] p-2.5">
              <label className="flex items-center gap-1.5 rounded-lg border border-black/[0.12] bg-white px-2.5 py-1.5">
                <Search size={14} className="text-fdc-grey" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a supplier" className="w-full bg-transparent text-[12.5px] text-fdc-ink outline-none placeholder:text-fdc-grey" />
              </label>
            </div>
            <div className="fdc-scroll max-h-[640px] overflow-y-auto p-1.5">
              {rows.map((x) => {
                const active = x.vendorKey === selVendor?.vendorKey;
                return (
                  <button key={x.vendorKey} onClick={() => setSel(x.vendorKey)} className={`mb-0.5 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition focus-ring ${active ? 'bg-fdc-green/[0.08] ring-1 ring-inset ring-fdc-green/30' : 'hover:bg-black/[0.03]'}`}>
                    <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: x.color }} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-semibold text-fdc-ink">{vendorShort(x.name)}</span>
                      <span className="block truncate text-[10.5px] text-fdc-grey">{x.materialKeys.map((k) => MAT_NAME[k]).join(', ')}</span>
                    </span>
                    <span className="tnum shrink-0 text-[11.5px] font-bold text-fdc-slate">{crore(x.spend)}</span>
                  </button>
                );
              })}
            </div>
          </Card>
        </div>

        {/* detail */}
        <div className="lg:col-span-3">
          {selVendor ? <VendorCard vendor={selVendor} data={data} onNavigate={onNavigate} onFull={(s) => setProfile(s)} /> : null}
        </div>
      </div>

      {profile && <VendorProfile subject={profile} onClose={() => setProfile(null)} />}
    </div>
  );
}

function VendorCard({ vendor: x, data, onNavigate, onFull }: { vendor: ValueVendor; data: AppData; onNavigate: (n: Nav) => void; onFull: (s: ProfileSubject) => void }) {
  const fin: VendorFin | null = data.financials?.vendors[x.vendorKey] ?? null;
  const probe = fin?.probe ?? null;
  const m = fin?.metrics ?? null;

  // negotiation-room read
  const netMargin = m?.netMargin ?? null;
  const marginSeries = (probe?.series ?? []).filter((y) => y.netMargin != null).map((y) => ({ label: y.fy || y.year, value: y.netMargin as number }));
  const marginFalling = marginSeries.length >= 2 && marginSeries[marginSeries.length - 1].value < marginSeries[0].value;
  const creditDays = m?.receivableDays ?? null; // days their customers take to pay them = credit they extend
  const yourDays = x.termDays ?? (x.termCategory === 'advance' ? -100 : x.termCategory === 'immediate' ? 0 : null);
  const pushDays = creditDays != null && yourDays != null ? Math.round(creditDays - yourDays) : null;
  const revenue = m?.revenue ?? null;
  const shareOfRev = revenue && x.spend ? (x.spend / revenue) * 100 : null;

  let marginRoom: { tone: 'room' | 'tight' | 'none'; text: string };
  if (netMargin == null) marginRoom = { tone: 'none', text: 'Their margin isn’t on file yet — open the full profile to check before pressing on price.' };
  else if (netMargin < 2) marginRoom = { tone: 'tight', text: `Wafer-thin ~${pct(netMargin)} net margin — there is little room to cut their price. Win on payment terms, volume or freshness instead, not price.` };
  else if (marginFalling) marginRoom = { tone: 'room', text: `Net margin ~${pct(netMargin)} and sliding — they value keeping your volume, so there is room to ask for a better price.` };
  else marginRoom = { tone: 'room', text: `Healthy ~${pct(netMargin)} net margin — room to negotiate price, especially against a cheaper alternative.` };

  return (
    <Card className="!p-0">
      {/* header */}
      <div className="flex items-start gap-3 border-b border-black/[0.06] p-4">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-white" style={{ background: x.color }}><Factory size={20} /></span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[17px] font-extrabold leading-tight text-fdc-ink">{vendorShort(x.name)}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {x.materialKeys.map((k) => <Badge key={k} color={MATERIAL_COLOR[k as 'dextrose']}>{MAT_NAME[k]}</Badge>)}
            {fin?.type === 'listed' ? <Badge color={FDC.blue}><BadgeCheck size={11} /> Listed</Badge> : fin?.primarySource === 'probe' ? <Badge color="#8E44AD"><Lock size={11} /> Private</Badge> : null}
          </div>
        </div>
        {(probe || m) && (
          <button onClick={() => onFull({ kind: 'vendor', fin: fin!, vendor: data.vendors.find((dv) => dv.key === x.vendorKey) ?? null })} className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-fdc-green/30 bg-fdc-green/[0.06] px-2 py-1 text-[11px] font-semibold text-fdc-green transition hover:bg-fdc-green/[0.12] focus-ring">
            <Maximize2 size={12} /> Full financials
          </button>
        )}
      </div>

      {/* top facts */}
      <div className="grid grid-cols-2 gap-px bg-black/[0.05] sm:grid-cols-2">
        <Fact label="Your spend / yr" value={crore(x.spend)} />
        <Fact label="Your payment term" value={x.termText ? shortTerm(x.termText) : '—'} tone={x.termCategory === 'advance' || x.termCategory === 'immediate' ? 'bad' : 'good'} />
      </div>

      <div className="space-y-3 p-4">
        {/* negotiation room */}
        <Section icon={Hourglass} title="How hard can you push?" color={FDC.green}>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {/* margin room */}
            <div className="rounded-xl border border-black/[0.06] p-2.5">
              <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-fdc-grey">
                {marginRoom.tone === 'room' ? <TrendingDown size={12} className="text-fdc-green" /> : <TrendingUp size={12} className="text-fdc-orange" />} Their margin
              </div>
              {marginSeries.length >= 2 && <div className="mb-1 h-8"><Sparkline points={marginSeries} color={marginFalling ? FDC.red : FDC.blue} height={32} format={(n) => pct(n)} /></div>}
              <p className="text-[11.5px] leading-snug text-fdc-slate">{marginRoom.text}</p>
            </div>
            {/* credit days */}
            <div className="rounded-xl border border-black/[0.06] p-2.5">
              <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-fdc-grey"><CalendarClock size={12} className="text-fdc-blue" /> Credit days</div>
              {creditDays != null ? (
                <p className="text-[11.5px] leading-snug text-fdc-slate">
                  They wait on average <b className="tnum">{Math.round(creditDays)} days</b> to get paid by their own customers, but give you <b className="tnum">{x.termText ? shortTerm(x.termText) : '—'}</b>.
                  {pushDays != null && pushDays > 5 && <> Ask for <b className="text-fdc-green">+{pushDays} days</b> — they clearly live with it.</>}
                </p>
              ) : <p className="text-[11.5px] leading-snug text-fdc-grey">Their customer credit days aren’t on file yet.</p>}
            </div>
          </div>
          {shareOfRev != null && (
            <p className="mt-2 rounded-lg bg-fdc-green/[0.06] px-2.5 py-1.5 text-[11.5px] leading-snug text-fdc-slate">
              You are <b className="tnum">{pct(shareOfRev, shareOfRev < 1 ? 2 : 1)}</b> of their <b className="tnum">{crore(revenue!)}</b> revenue{shareOfRev >= 5 ? ' — a meaningful customer, so your ask carries weight.' : ' — a small customer, so lead with volume or a credible alternative.'}
            </p>
          )}
        </Section>

        {/* freshness + orders */}
        <div className="grid gap-3 sm:grid-cols-2">
          <Section icon={Clock} title="How fresh they ship" color={FDC.orange}>
            {x.freshnessByMaterial.filter((f) => f.avgAgeDays != null).length ? (
              <div className="space-y-1.5">
                {x.freshnessByMaterial.filter((f) => f.avgAgeDays != null).map((f) => (
                  <div key={f.materialKey} className="flex items-center justify-between text-[12px]">
                    <span className="text-fdc-slate">{MAT_NAME[f.materialKey]}</span>
                    <span className="tnum"><b style={{ color: f.grade === 'old' ? FDC.red : f.grade === 'ok' ? FDC.goldDark : FDC.green }}>{f.avgAgeDays}d old</b>{f.avgShelfDays != null && <span className="text-fdc-grey"> · {Math.round(f.avgShelfDays / 30)}mo shelf</span>}</span>
                  </div>
                ))}
              </div>
            ) : <p className="text-[11.5px] text-fdc-grey">No manufacture dates on file.</p>}
          </Section>
          <Section icon={PackageSearch} title="How they order" color={FDC.slate}>
            {x.orders.length ? (
              <div className="space-y-1.5">
                {x.orders.map((o) => (
                  <div key={o.materialKey} className="flex items-center justify-between text-[12px]">
                    <span className="text-fdc-slate">{MAT_NAME[o.materialKey]}</span>
                    <span className="tnum text-fdc-grey"><b className="text-fdc-ink">{o.poCount}</b> POs · {o.deliveriesPerPo}/PO</span>
                  </div>
                ))}
              </div>
            ) : <p className="text-[11.5px] text-fdc-grey">No orders on file.</p>}
          </Section>
        </div>

        {/* alternatives */}
        <Section icon={Repeat2} title="Who could replace them" color={FDC.blue}>
          <Alternatives vendor={x} data={data} onNavigate={onNavigate} />
        </Section>
      </div>
    </Card>
  );
}

function Alternatives({ vendor: x, data, onNavigate }: { vendor: ValueVendor; data: AppData; onNavigate: (n: Nav) => void }) {
  const fin = data.financials?.vendors ?? {};
  const myRev = fin[x.vendorKey]?.metrics?.revenue ?? null;
  const items: { name: string; vendorKey?: string; price?: string; term?: string; why: string; size?: 'bigger' | 'smaller' | null; cheaper?: boolean }[] = [];

  // our own cheaper suppliers for the same materials — SAME UNIT only (never mix KG vs pieces)
  for (const mkey of x.materialKeys) {
    const mat = data.materials.find((mm) => mm.key === mkey);
    const mine = mat?.vendors.find((mv) => mv.vendorKey === x.vendorKey);
    if (!mat || !mine || mine.avgPrice == null) continue;
    for (const o of mat.vendors) {
      if (o.vendorKey === x.vendorKey || o.avgPrice == null || o.unit !== mine.unit || o.avgPrice >= mine.avgPrice) continue;
      const term = data.value?.vendors[o.vendorKey]?.termText;
      items.push({ name: vendorShort(o.vendor), vendorKey: o.vendorKey, price: priceFmt(o.avgPrice, o.unit), term: term ? shortTerm(term) : undefined, cheaper: true, why: `Supplies ${MAT_NAME[mkey]} at ${priceFmt(o.avgPrice, o.unit)} — cheaper than ${vendorShort(x.name)}'s ${priceFmt(mine.avgPrice, mine.unit)}.` });
    }
  }
  // external alternatives (Munshot/Probe42) for the same materials
  for (const mkey of x.materialKeys) {
    const alts = data.alternatives?.byMaterial?.[mkey as 'dextrose'] ?? [];
    for (const a of alts.slice(0, 3)) {
      if (items.some((it) => it.name === vendorShort(a.name))) continue;
      const rev = a.metrics?.revenue ?? null;
      items.push({ name: vendorShort(a.name), why: a.fitNote, size: rev && myRev ? (rev > myRev ? 'bigger' : 'smaller') : null });
    }
  }
  const top = items.slice(0, 5);
  if (!top.length) return <p className="text-[11.5px] text-fdc-grey">No ready alternative on file for this material.</p>;
  return (
    <div className="space-y-1.5">
      {top.map((it, i) => (
        <div key={i} className="flex items-start justify-between gap-2 rounded-lg bg-fdc-offwhite px-2.5 py-1.5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              {it.vendorKey ? (
                <button onClick={() => onNavigate({ tab: 'vendors', vendorKey: it.vendorKey! })} className="text-[12.5px] font-semibold text-fdc-slate underline-offset-2 hover:text-fdc-green hover:underline">{it.name}</button>
              ) : <span className="text-[12.5px] font-semibold text-fdc-slate">{it.name}</span>}
              {it.cheaper && <Pill color={FDC.green}>cheaper · ours</Pill>}
              {it.size && <Pill color={FDC.grey}>{it.size}</Pill>}
              {it.term && <Pill color={FDC.blue}>{it.term}</Pill>}
            </div>
            <p className="mt-0.5 text-[11px] leading-snug text-fdc-grey">{it.why}</p>
          </div>
          {it.price && <span className="tnum shrink-0 rounded-md bg-white px-1.5 py-0.5 text-[11.5px] font-bold text-fdc-green">{it.price}</span>}
        </div>
      ))}
    </div>
  );
}

function Section({ icon: Icon, title, color, children }: { icon: typeof Hourglass; title: string; color: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5">
        <Icon size={14} style={{ color }} strokeWidth={2.2} />
        <h4 className="text-[12.5px] font-bold text-fdc-ink">{title}</h4>
      </div>
      {children}
    </div>
  );
}

function Fact({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="bg-white px-4 py-2.5">
      <div className="text-[10px] font-medium uppercase tracking-wide text-fdc-grey">{label}</div>
      <div className="tnum mt-0.5 text-[15px] font-extrabold leading-none" style={{ color: tone === 'bad' ? FDC.red : tone === 'good' ? FDC.green : FDC.ink }}>{value}</div>
    </div>
  );
}

function shortTerm(t: string): string {
  if (/advance/i.test(t)) return '100% advance';
  if (/immediate/i.test(t)) return 'Immediate';
  const m = t.match(/(\d+)\s*day/i);
  return m ? `${m[1]}-day credit` : t;
}
