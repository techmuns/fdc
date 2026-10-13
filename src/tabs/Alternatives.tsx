import { useState } from 'react';
import {
  Repeat2, BadgeCheck, Lock, ShieldAlert, Star, Factory, Film, FlaskConical, ExternalLink, TrendingUp,
} from 'lucide-react';
import type { AppData, MaterialKey, AltVendor } from '../types';
import { Card, CardHeader, Badge, Pill } from '../components/ui/Card';
import { SubTabs } from '../components/ui/Tabs';
import { MATERIAL_COLOR } from '../lib/brand';
import { money, pct, vendorShort } from '../lib/format';

const GRADE_COLOR: Record<string, string> = { A: '#00973D', B: '#00A65B', C: '#EFAE0E', D: '#D91701' };
const ROLE_ICON: Record<string, typeof Factory> = {
  producer: FlaskConical, 'rigid-packaging': Factory, converter: Repeat2, 'film-maker': Film, 'converter+film': Repeat2,
};

export default function Alternatives({ data }: { data: AppData }) {
  const alts = data.alternatives;
  const [mat, setMat] = useState<MaterialKey>('laminates');

  if (!alts) {
    return (
      <Card>
        <CardHeader icon={Repeat2} title="Alternatives" subtitle="Backup suppliers" />
        <p className="text-[13px] text-fdc-grey">Alternatives haven’t been generated yet. Run <code className="rounded bg-black/5 px-1 py-0.5 font-mono text-[11px]">npm run financials</code>.</p>
      </Card>
    );
  }

  const material = data.materials.find((x) => x.key === mat)!;
  const incumbentTop = material.vendors[0];
  const topShare = incumbentTop ? incumbentTop.spend / material.totalNetSpend : 0;
  const singleSource = topShare >= 0.5;

  const list = (alts.byMaterial[mat] ?? []).slice().sort((a, b) => {
    const ss = (b.secondSourceFor === mat ? 1 : 0) - (a.secondSourceFor === mat ? 1 : 0);
    if (ss) return ss;
    const hb = b.healthScore?.value ?? -1;
    const ha = a.healthScore?.value ?? -1;
    if (hb !== ha) return hb - ha;
    return (b.metrics?.revenue ?? 0) - (a.metrics?.revenue ?? 0);
  });

  const secondSources = list.filter((a) => a.secondSourceFor === mat);

  return (
    <div className="animate-fade-up space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-bold text-fdc-ink">Alternative suppliers</h2>
          <p className="text-[12.5px] text-fdc-grey">Credible backups to de-risk single-source materials and keep incumbents honest on price.</p>
        </div>
        <SubTabs
          tabs={data.materials.map((m) => ({ key: m.key, label: m.displayName, color: MATERIAL_COLOR[m.key] }))}
          active={mat}
          onChange={(k) => setMat(k as MaterialKey)}
        />
      </div>

      {/* incumbent risk banner */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg" style={{ background: singleSource ? '#FDECEA' : '#E6F3EC', color: singleSource ? '#D91701' : '#00973D' }}>
              <ShieldAlert size={18} />
            </span>
            <div>
              <h3 className="text-[14px] font-bold text-fdc-ink">
                {singleSource ? `Single-source risk: ${vendorShort(incumbentTop.vendor)} = ${pct(topShare * 100, 0)} of ${material.displayName.toLowerCase()}` : `${material.displayName}: reasonably spread`}
              </h3>
              <p className="text-[12px] text-fdc-grey">
                {singleSource
                  ? `${money(incumbentTop.spend)} runs through one supplier. The alternates below could become a qualified second source.`
                  : `Top supplier is ${pct(topShare * 100, 0)} — still worth having benchmarked backups for price leverage.`}
              </p>
            </div>
          </div>
          {secondSources.length > 0 && (
            <Badge color="#00973D" soft={false}><Star size={11} /> {secondSources.length} second-source candidate{secondSources.length > 1 ? 's' : ''}</Badge>
          )}
        </div>
      </Card>

      {/* alternates grid */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {list.map((a) => <AltCard key={a.name} alt={a} material={mat} />)}
      </div>

      <p className="text-[11px] italic text-fdc-grey">
        Listed alternates are benchmarked live via Munshot (real financials). Private alternates show financials once a Probe42 key + VPN are configured. Fit notes are editable in <span className="font-mono">data/raw/masters/alt-vendors.json</span>.
      </p>
    </div>
  );
}

function AltCard({ alt, material }: { alt: AltVendor; material: MaterialKey }) {
  const RoleIcon = ROLE_ICON[alt.role] || Factory;
  const isSecond = alt.secondSourceFor === material;
  const hs = alt.healthScore;
  const met = alt.metrics;
  return (
    <div className={`rounded-2xl border bg-white p-4 shadow-card transition ${isSecond ? 'border-fdc-green/40 ring-1 ring-fdc-green/20' : 'border-black/[0.06]'}`}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-fdc-offwhite text-fdc-slate"><RoleIcon size={16} /></span>
          <div className="min-w-0">
            <h4 className="text-[13.5px] font-bold leading-tight text-fdc-ink">{vendorShort(alt.name)}</h4>
            <div className="mt-0.5 flex flex-wrap items-center gap-1">
              {alt.type === 'listed' ? <Pill color="#2E7CE4"><BadgeCheck size={10} /> Listed</Pill> : <Pill color="#8E44AD"><Lock size={10} /> Private</Pill>}
              <Pill color="#707070">{alt.role.replace(/-/g, ' ')}</Pill>
            </div>
          </div>
        </div>
        {hs && <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[12px] font-extrabold text-white" style={{ background: GRADE_COLOR[hs.grade] }} title={`Health ${hs.value}/100`}>{hs.grade}</span>}
      </div>

      {isSecond && (
        <div className="mb-2 inline-flex items-center gap-1 rounded-md bg-fdc-green/10 px-2 py-0.5 text-[10.5px] font-bold text-fdc-green">
          <Star size={11} /> Second-source candidate
        </div>
      )}

      <p className="text-[12px] leading-snug text-fdc-grey">{alt.fitNote}</p>

      {met ? (
        <div className="mt-2.5 grid grid-cols-3 gap-1.5">
          <Mini label="Revenue" value={money(met.revenue)} />
          <Mini label="Net mgn" value={met.netMargin != null ? pct(met.netMargin) : '—'} />
          <Mini label="Growth" value={met.revenueGrowth != null ? pct(met.revenueGrowth) : '—'} grow={met.revenueGrowth} />
        </div>
      ) : (
        <div className="mt-2.5 rounded-lg border border-dashed border-fdc-light bg-fdc-offwhite/60 px-2.5 py-1.5 text-[10.5px] text-fdc-grey">
          {alt.status === 'cin-unresolved' ? 'CIN unresolved — resolve before Probe42 lookup.' : 'Financials via Probe42 (add key + VPN).'}
          {alt.cin && <span className="ml-1 font-mono text-[9.5px]">{alt.cin}</span>}
        </div>
      )}

      {alt.source && (
        <p className="mt-2 flex items-center gap-1 text-[10px] text-fdc-grey">
          <ExternalLink size={9} /> {alt.source.sourceName}{alt.symbol ? ` · ${alt.symbol}` : ''}
        </p>
      )}
    </div>
  );
}

function Mini({ label, value, grow }: { label: string; value: string; grow?: number | null }) {
  const color = grow == null ? '#161616' : grow > 1 ? '#00973D' : grow < -1 ? '#D91701' : '#161616';
  return (
    <div className="rounded-lg bg-fdc-offwhite px-2 py-1 text-center">
      <div className="text-[9.5px] font-medium uppercase tracking-wide text-fdc-grey">{label}</div>
      <div className="tnum mt-0.5 inline-flex items-center gap-0.5 text-[12px] font-extrabold" style={{ color }}>
        {grow != null && grow > 1 && <TrendingUp size={10} />}{value}
      </div>
    </div>
  );
}
