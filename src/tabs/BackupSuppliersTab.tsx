import { useMemo, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Globe2, Search, X, ExternalLink, MapPin, Building2, ShieldCheck, FlaskConical, BadgeCheck,
  AlertTriangle, Boxes, FileText, Info, Factory,
} from 'lucide-react';
import type { AppData, SupplierLine } from '../types';
import type { Nav } from '../App';
import { Card, Badge } from '../components/ui/Card';
import { Dropdown, type Option } from '../components/ui/Controls';
import { Table, type Column } from '../components/ui/Table';
import { FDC } from '../lib/brand';

const CONF_COLOR: Record<string, string> = { High: FDC.green, Medium: FDC.goldDark, Low: FDC.grey };
const roleShort = (r: string) => (r.split(/[;,(|]/)[0] || r).trim();
const roleBucket = (r: string) => {
  const s = r.toLowerCase();
  if (/convert/.test(s)) return 'Converter';
  if (/recycl/.test(s)) return 'Recycler';
  if (/processor|miller/.test(s)) return 'Processor';
  if (/manufacturer|maker/.test(s)) return 'Manufacturer';
  if (/distributor|repackager|marketer/.test(s)) return 'Distributor';
  if (/trader|aggregator|exporter|importer|retailer|marketplace/.test(s)) return 'Trader';
  return 'Other';
};

export default function BackupSuppliersTab({ data, nav }: { data: AppData; nav: Extract<Nav, { tab: 'backup' }> }) {
  const db = data.backupSuppliers;
  const [mat, setMat] = useState<string>(nav.materialKey ?? 'all');
  useEffect(() => { if (nav.materialKey) setMat(nav.materialKey); }, [nav.materialKey]);
  const [country, setCountry] = useState<string>('all');
  const [role, setRole] = useState<string>('all');
  const [conf, setConf] = useState<string>('all');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<SupplierLine | null>(null);

  const colorOf = useMemo(() => {
    const m: Record<string, string> = {};
    db?.materials.forEach((x) => (m[x.key] = x.color));
    return m;
  }, [db]);

  const filtered = useMemo(() => {
    if (!db) return [];
    const ql = q.trim().toLowerCase();
    return db.lines.filter((l) =>
      (mat === 'all' || l.materialKey === mat) &&
      (country === 'all' || (country === 'India' ? /india/i.test(l.country) : country === 'International' ? !/india/i.test(l.country) : l.country === country)) &&
      (role === 'all' || roleBucket(l.role) === role) &&
      (conf === 'all' || l.confidence === conf) &&
      (!ql || (l.company + ' ' + l.brand + ' ' + l.products + ' ' + l.hq + ' ' + l.subcategory).toLowerCase().includes(ql))
    );
  }, [db, mat, country, role, conf, q]);

  if (!db) return <Card><p className="text-[13px] text-fdc-grey">No backup-supplier database loaded. Run <code className="rounded bg-black/5 px-1 py-0.5 font-mono text-[11px]">npm run suppliers</code>.</p></Card>;

  const countryOpts: Option<string>[] = [{ value: 'all', label: 'Anywhere' }, { value: 'India', label: 'India only' }, { value: 'International', label: 'International only' }, ...db.filters.countries.filter((c) => c && c !== 'India').map((c) => ({ value: c, label: c }))];
  const roleOpts: Option<string>[] = [{ value: 'all', label: 'Any role' }, ...db.filters.roles.map((r) => ({ value: r, label: r }))];
  const confOpts: Option<string>[] = [{ value: 'all', label: 'Any confidence' }, ...db.filters.confidence.map((c) => ({ value: c, label: `${c} confidence` }))];

  const cols: Column<SupplierLine>[] = [
    { key: 'company', header: 'Company', sortable: true, sortValue: (l) => l.company, render: (l) => (
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 font-semibold text-fdc-slate">{l.company}{l.legalVerified && <BadgeCheck size={12} className="shrink-0 text-fdc-green" />}</div>
        <div className="truncate text-[10.5px] text-fdc-grey">{l.brand || l.subcategory}</div>
      </div>
    ) },
    { key: 'material', header: 'Material', sortable: true, sortValue: (l) => l.material, render: (l) => (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colorOf[l.materialKey] }} />
        <span className="text-fdc-slate">{l.material.replace('Polyester/BOPET Film & Laminates', 'BOPET / Laminates')}</span>
      </span>
    ) },
    { key: 'where', header: 'Where', sortable: true, sortValue: (l) => l.region, render: (l) => (
      <span className="whitespace-nowrap text-fdc-grey">{/india/i.test(l.country) ? l.region.replace('India-', 'India · ') : (l.country || '—')}</span>
    ) },
    { key: 'conf', header: 'Confidence', align: 'right', sortable: true, sortValue: (l) => ({ High: 3, Medium: 2, Low: 1 }[l.confidence] ?? 0), render: (l) => (
      <Badge color={CONF_COLOR[l.confidence]}>{l.confidence}</Badge>
    ) },
  ];

  return (
    <div className="animate-fade-up space-y-4">
      {/* header */}
      <div className="mb-1">
        <h2 className="flex items-center gap-1.5 text-[16px] font-bold leading-tight text-fdc-ink">
          <Globe2 size={17} strokeWidth={2.3} className="text-fdc-green" /> Backup suppliers — the market beyond your vendors
        </h2>
        <p className="mt-1 max-w-3xl text-[12.5px] leading-snug text-fdc-grey">
          <b className="text-fdc-slate">{db.counts.companies} companies · {db.counts.lines} supplier lines · {db.counts.sources} sources.</b> Other firms that make or trade your materials — a list to create competition and backups. Tap a dot or a row for full details.
        </p>
      </div>

      {/* material filter chips = legend + coverage counts */}
      <div className="flex flex-wrap gap-1.5">
        <Chip active={mat === 'all'} onClick={() => setMat('all')} label="All materials" count={db.counts.lines} />
        {db.coverage.map((c) => (
          <Chip key={c.key} active={mat === c.key} color={c.color} onClick={() => setMat(mat === c.key ? 'all' : c.key)} label={c.label.replace('Polyester / BOPET Film & Laminates', 'BOPET / Laminates')} count={c.total} />
        ))}
      </div>

      {/* map */}
      <Card pad={false}>
        <SupplierMap lines={filtered} colorOf={colorOf} onPick={setSel} />
      </Card>

      {/* filters row */}
      <div className="flex flex-wrap items-center gap-2">
        <Dropdown label="Where" value={country} options={countryOpts} onChange={setCountry} width={180} />
        <Dropdown label="Role" value={role} options={roleOpts} onChange={setRole} width={160} />
        <Dropdown label="Evidence" value={conf} options={confOpts} onChange={setConf} width={170} />
        <label className="inline-flex items-center gap-1.5 rounded-lg border border-black/[0.12] bg-white px-2.5 py-1.5">
          <Search size={13} className="text-fdc-grey" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find company / product" className="w-44 bg-transparent text-[12.5px] text-fdc-ink outline-none placeholder:text-fdc-grey" />
        </label>
        {(mat !== 'all' || country !== 'all' || role !== 'all' || conf !== 'all' || q) && (
          <button onClick={() => { setMat('all'); setCountry('all'); setRole('all'); setConf('all'); setQ(''); }} className="text-[11.5px] font-semibold text-fdc-grey underline-offset-2 hover:text-fdc-slate hover:underline">Clear</button>
        )}
      </div>

      {/* table */}
      <Card pad={false}>
        <div className="px-4 pt-3.5">
          <h3 className="flex items-center gap-1.5 text-[14px] font-bold text-fdc-ink"><Boxes size={15} className="text-fdc-green" /> {filtered.length} supplier{filtered.length === 1 ? '' : 's'} {mat === 'all' ? 'across all materials' : `in ${db.materials.find((m) => m.key === mat)?.label}`}</h3>
          <p className="text-[12px] text-fdc-grey">Click any row to open the full profile and every source link.</p>
        </div>
        <div className="px-2 py-2">
          <Table columns={cols} rows={filtered} getKey={(l) => l.id + '|' + l.materialKey} initialSort={{ key: 'company', dir: 'asc' }} onRowClick={(l) => setSel(l)} maxHeight={520} dense />
        </div>
      </Card>

      {sel && <SupplierDetail line={sel} color={colorOf[sel.materialKey]} onClose={() => setSel(null)} />}
    </div>
  );
}

function Chip({ active, color, label, count, onClick }: { active: boolean; color?: string; label: string; count: number; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-semibold transition focus-ring ${active ? 'border-transparent text-white' : 'border-black/[0.1] bg-white text-fdc-slate hover:bg-black/[0.03]'}`} style={active ? { background: color ?? FDC.green } : undefined}>
      {color && <span className="h-2.5 w-2.5 rounded-full" style={{ background: active ? 'rgba(255,255,255,0.9)' : color }} />}
      {label}
      <span className={`tnum rounded-full px-1.5 text-[10px] ${active ? 'bg-white/20' : 'bg-black/[0.06] text-fdc-grey'}`}>{count}</span>
    </button>
  );
}

/* ============================ the map ============================ */
const BBOX = {
  world: { lon0: -169, lon1: 191, lat0: 80, lat1: -56, w: 1000, h: 378 },
  india: { lon0: 66, lon1: 98.5, lat0: 37.5, lat1: 6, w: 640, h: 620 },
};
function SupplierMap({ lines, colorOf, onPick }: { lines: SupplierLine[]; colorOf: Record<string, string>; onPick: (l: SupplierLine) => void }) {
  const [rings, setRings] = useState<number[][][] | null>(null);
  const [view, setView] = useState<'world' | 'india'>('world');
  const [hover, setHover] = useState<{ l: SupplierLine; x: number; y: number } | null>(null);
  const base = import.meta.env.BASE_URL || '/';

  useEffect(() => {
    let alive = true;
    fetch(`${base}data/world-land.json`.replace(/\/{2,}/g, '/'), { cache: 'force-cache' })
      .then((r) => (r.ok ? r.json() : null)).then((d) => { if (alive && d?.rings) setRings(d.rings); }).catch(() => {});
    return () => { alive = false; };
  }, [base]);

  const b = BBOX[view];
  const px = (lon: number) => ((lon - b.lon0) / (b.lon1 - b.lon0)) * b.w;
  const py = (lat: number) => ((b.lat0 - lat) / (b.lat0 - b.lat1)) * b.h;
  const landPath = useMemo(() => {
    if (!rings) return '';
    return rings.map((ring) => 'M' + ring.map(([lo, la]) => `${px(lo).toFixed(1)} ${py(la).toFixed(1)}`).join('L') + 'Z').join(' ');
  }, [rings, view]);
  const dots = useMemo(() => lines.filter((l) => px(l.lon) >= -4 && px(l.lon) <= b.w + 4 && py(l.lat) >= -4 && py(l.lat) <= b.h + 4), [lines, view]);

  return (
    <div className="relative">
      <div className="flex items-center justify-between px-4 pt-3">
        <h3 className="flex items-center gap-1.5 text-[14px] font-bold text-fdc-ink"><MapPin size={15} className="text-fdc-green" /> Where they are <span className="text-[11.5px] font-medium text-fdc-grey">— {dots.length} on the map</span></h3>
        <div className="inline-flex overflow-hidden rounded-lg border border-black/[0.12] text-[11.5px] font-semibold">
          {(['world', 'india'] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} className={`px-3 py-1 transition ${view === v ? 'bg-fdc-green text-white' : 'bg-white text-fdc-grey hover:bg-black/[0.03]'}`}>{v === 'world' ? 'World' : 'India'}</button>
          ))}
        </div>
      </div>
      <div className="relative px-2 pb-2 pt-1">
        <svg viewBox={`0 0 ${b.w} ${b.h}`} className="w-full" style={{ background: '#EAF1F6', borderRadius: 12, maxHeight: 460 }} role="img" aria-label="Map of supplier locations">
          <path d={landPath} fill="#D6E3DB" stroke="#C2D4C8" strokeWidth={0.6} />
          {dots.map((l) => (
            <circle
              key={l.id + l.materialKey} cx={px(l.lon)} cy={py(l.lat)} r={view === 'india' ? 6 : 4.2}
              fill={colorOf[l.materialKey]} stroke="#fff" strokeWidth={1.1} opacity={0.92}
              className="cursor-pointer transition-[r]"
              onMouseEnter={() => setHover({ l, x: px(l.lon), y: py(l.lat) })}
              onMouseLeave={() => setHover(null)}
              onClick={() => onPick(l)}
            />
          ))}
        </svg>
        {hover && (
          <div className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg bg-fdc-ink/92 px-2.5 py-1.5 text-[11px] leading-tight text-white shadow-pop"
            style={{ left: `calc(${(hover.x / b.w) * 100}% )`, top: `calc(${(hover.y / b.h) * 100}% - 6px)`, maxWidth: 220 }}>
            <div className="font-bold">{hover.l.company}</div>
            <div className="opacity-80">{hover.l.material.replace('Polyester/BOPET Film & Laminates', 'BOPET / Laminates')} · {/india/i.test(hover.l.country) ? hover.l.region.replace('India-', '') + ', India' : hover.l.country}</div>
          </div>
        )}
      </div>
      <p className="px-4 pb-3 text-[10.5px] leading-snug text-fdc-grey">Dot colour = material (see chips above). Position is approximate (from the company's stated location). Tap a dot for the full profile.</p>
    </div>
  );
}

/* ============================ detail modal ============================ */
function Field({ label, value, mono }: { label: string; value?: string; mono?: boolean }) {
  if (!value || !String(value).trim()) return null;
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-fdc-grey">{label}</div>
      <div className={`mt-0.5 text-[12px] leading-snug text-fdc-slate ${mono ? 'font-mono text-[11px]' : ''}`}>{value}</div>
    </div>
  );
}
function Section({ icon: Icon, title, color, children }: { icon: typeof Boxes; title: string; color: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-black/[0.06] bg-white p-3.5">
      <div className="mb-2 flex items-center gap-1.5 text-[12px] font-bold text-fdc-ink"><Icon size={14} style={{ color }} strokeWidth={2.2} /> {title}</div>
      <div className="grid gap-2.5 sm:grid-cols-2">{children}</div>
    </div>
  );
}
function SupplierDetail({ line: l, color, onClose }: { line: SupplierLine; color: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);
  const host = /india/i.test(l.country) ? `${l.hq || l.region.replace('India-', '') + ', India'}` : (l.hq || l.country);
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-fdc-ink/55 backdrop-blur-sm animate-fade-in sm:p-4 md:p-6" onClick={onClose} role="dialog" aria-modal="true" aria-label={`${l.company} — supplier profile`}>
      <div className="flex max-h-[92vh] min-h-0 w-full max-w-3xl flex-col overflow-hidden bg-fdc-offwhite shadow-pop sm:rounded-2xl animate-fade-up" onClick={(e) => e.stopPropagation()}>
        {/* header */}
        <div className="flex shrink-0 items-start gap-3 border-b border-black/[0.07] bg-white px-4 py-3 sm:px-5">
          <span className="mt-0.5 grid h-11 w-11 shrink-0 place-items-center rounded-xl text-white" style={{ background: color }}><Factory size={20} /></span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <h2 className="text-[17px] font-extrabold leading-tight text-fdc-ink">{l.company}</h2>
              {l.legalVerified ? <Badge color={FDC.green}><BadgeCheck size={11} /> Legal name verified</Badge> : <Badge color={FDC.orange}>Trade name — verify on MCA</Badge>}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1">
              <Badge color={color} soft={false}>{l.material.replace('Polyester/BOPET Film & Laminates', 'BOPET / Laminates')}</Badge>
              <Badge color={CONF_COLOR[l.confidence]}>{l.confidence} confidence</Badge>
              {l.listed && <Badge color={FDC.blue}>Listed</Badge>}
              <Badge color={FDC.grey}>{roleShort(l.role)}</Badge>
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-fdc-grey">
              {host && <span><MapPin size={10} className="mr-0.5 inline" />{host}</span>}
              {l.website && <a href={l.website} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-0.5 text-fdc-blue hover:underline">{l.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*$/, '')} <ExternalLink size={10} /></a>}
              <span className="font-mono">{l.id}</span>
            </p>
          </div>
          <button onClick={onClose} className="shrink-0 rounded-lg p-1.5 text-fdc-grey transition hover:bg-black/5 hover:text-fdc-ink focus-ring" aria-label="Close"><X size={18} /></button>
        </div>
        {/* body */}
        <div className="fdc-scroll min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-4 sm:px-5">
          <div className="flex items-start gap-1.5 rounded-xl border border-fdc-gold/35 bg-fdc-gold/[0.08] px-3 py-2 text-[11.5px] leading-snug text-fdc-slate">
            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-fdc-gold-dark" />
            <span>A <b>potential supplier</b> found from public research — not qualified, not priced, not an FDC relationship. Confirm grade certificates (CoA, DMF/CEP), food-contact and ISO 15378 / FSSC 22000, and audit the plant before any RFQ.</span>
          </div>
          <Section icon={Boxes} title="What they make" color={color}>
            <Field label="Material / subcategory" value={[l.material, l.subcategory].filter(Boolean).join(' · ')} />
            <Field label="Role" value={l.role} />
            <Field label="Relevant products" value={l.products} />
            <Field label="Grades / specs / sizes" value={l.grades} />
            <Field label="Applications" value={l.applications} />
            <Field label="Pharma/ORS match" value={l.priority} />
            <Field label="Related products (out of scope here)" value={l.relatedOut} />
          </Section>
          <Section icon={Building2} title="Who &amp; where" color={FDC.blue}>
            <Field label="Region" value={l.region} />
            <Field label="Head office" value={l.hq} />
            <Field label="Country" value={l.country} />
            <Field label="Plants" value={l.plants} />
            <Field label="Ownership" value={l.ownership} />
            <Field label="Also listed under" value={l.alsoUnder} />
          </Section>
          {(l.certifications || l.capacity || l.revenue || l.creditRating) && (
            <Section icon={ShieldCheck} title="Credentials (as stated)" color={FDC.green}>
              <Field label="Certifications" value={l.certifications} />
              <Field label="Capacity (published)" value={l.capacity} />
              <Field label="Revenue (published)" value={l.revenue} />
              <Field label="Credit rating" value={l.creditRating} />
            </Section>
          )}
          {l.notes && (
            <div className="rounded-xl border border-black/[0.06] bg-white p-3.5">
              <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-bold text-fdc-ink"><FlaskConical size={14} className="text-fdc-gold-dark" strokeWidth={2.2} /> Verification notes</div>
              <p className="text-[12px] leading-snug text-fdc-slate">{l.notes}</p>
            </div>
          )}
          {/* sources */}
          <div className="rounded-xl border border-black/[0.06] bg-white p-3.5">
            <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-bold text-fdc-ink"><FileText size={14} className="text-fdc-slate" strokeWidth={2.2} /> Sources ({l.sources.length})</div>
            <div className="space-y-1">
              {l.sources.map((s, i) => (
                <a key={i} href={s} target="_blank" rel="noreferrer noopener" className="flex items-center gap-1.5 truncate text-[11px] text-fdc-blue hover:underline">
                  <ExternalLink size={11} className="shrink-0" /> <span className="truncate">{s.replace(/^https?:\/\/(www\.)?/, '')}</span>
                </a>
              ))}
              {!l.sources.length && <p className="text-[11px] text-fdc-grey">No source links recorded.</p>}
            </div>
            <p className="mt-2 flex items-start gap-1 border-t border-black/[0.06] pt-2 text-[10.5px] leading-snug text-fdc-grey"><Info size={12} className="mt-px shrink-0" /> Public sources only (company sites, trade press, catalogues, registries). No paid databases. Evidence confidence: <b className="ml-1" style={{ color: CONF_COLOR[l.confidence] }}>{l.confidence}</b>.</p>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
