import { useMemo, useState } from 'react';
import { PackageSearch } from 'lucide-react';
import type { AppData, MaterialKey } from '../types';
import type { Nav } from '../App';
import { Card, Badge } from '../components/ui/Card';
import { Table, type Column } from '../components/ui/Table';
import { Dropdown, type Option } from '../components/ui/Controls';
import { FDC, MATERIAL_COLOR } from '../lib/brand';
import { vendorShort } from '../lib/format';
import { CalcSheet, CalcBtn } from '../components/CalcSheet';
import { calcStockAge, type CalcData } from '../lib/calc';

const MAT_NAME: Record<string, string> = { dextrose: 'Dextrose', packaging: 'Rigid packaging', laminates: 'Laminates', cartons: 'Aseptic cartons' };
const gradeColor = (g: string | null) => (g === 'old' ? FDC.red : g === 'ok' ? FDC.goldDark : g === 'fresh' ? FDC.green : FDC.grey);
const gradeLabel = (g: string | null) => (g === 'old' ? 'Old stock' : g === 'ok' ? 'Okay' : g === 'fresh' ? 'Fresh' : '—');

interface SRow {
  key: string; vendorKey: string; name: string; color: string;
  materialKey: MaterialKey; ageDays: number; shelfDays: number | null; grade: string | null;
  freshestDays: number; freshestName: string; gapDays: number; receipts: number;
}

/** One place that lists how old every supplier's stock is when it reaches you — the data the
 *  client asked for as its own tab, alongside Credit & terms. Oldest first, with the freshest
 *  you already get for the same material as the negotiation benchmark. */
export default function StockAgeTab({ data, onNavigate }: { data: AppData; onNavigate: (n: Nav) => void }) {
  const v = data.value;
  const [mat, setMat] = useState<string>('all');
  const [calc, setCalc] = useState<CalcData | null>(null);

  const rows: SRow[] = useMemo(() => {
    if (!v) return [];
    const out: SRow[] = [];
    for (const mk of Object.keys(v.materials)) {
      const fr = (v.materials[mk].freshness ?? []).filter((f) => f.avgAgeDays != null);
      if (!fr.length) continue;
      const freshest = [...fr].sort((a, b) => (a.avgAgeDays as number) - (b.avgAgeDays as number))[0];
      for (const f of fr) {
        out.push({
          key: `${mk}-${f.vendorKey}`, vendorKey: f.vendorKey, name: f.vendor, color: f.color,
          materialKey: mk as MaterialKey, ageDays: Math.round(f.avgAgeDays as number),
          shelfDays: f.avgShelfDays != null ? Math.round(f.avgShelfDays) : null, grade: f.grade,
          freshestDays: Math.round(freshest.avgAgeDays as number), freshestName: vendorShort(freshest.vendor),
          gapDays: Math.round((f.avgAgeDays as number) - (freshest.avgAgeDays as number)), receipts: f.receipts,
        });
      }
    }
    return out;
  }, [v]);

  const filtered = useMemo(() => rows.filter((r) => mat === 'all' || r.materialKey === mat), [rows, mat]);

  if (!v) return <Card><p className="text-[13px] text-fdc-grey">No data.</p></Card>;
  if (!rows.length) return <Card><p className="text-[13px] text-fdc-grey">No manufacture-date records on file yet — stock age can't be measured.</p></Card>;

  const oldCount = rows.filter((r) => r.grade === 'old').length;
  const matOpts: Option<string>[] = [
    { value: 'all', label: 'All materials' },
    ...[...new Set(rows.map((r) => r.materialKey))].map((k) => ({ value: k, label: MAT_NAME[k] ?? k, color: MATERIAL_COLOR[k as MaterialKey] })),
  ];

  const cols: Column<SRow>[] = [
    { key: 'name', header: 'Supplier', sortable: true, sortValue: (r) => vendorShort(r.name), render: (r) => (
      <span className="flex min-w-0 items-center gap-2"><span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: r.color }} /><span className="truncate font-semibold text-fdc-ink">{vendorShort(r.name)}</span></span>
    ) },
    { key: 'material', header: 'Material', sortable: true, sortValue: (r) => r.materialKey, render: (r) => <span className="whitespace-nowrap text-fdc-grey">{MAT_NAME[r.materialKey] ?? r.materialKey}</span> },
    { key: 'age', header: 'Stock age (avg)', align: 'right', sortable: true, sortValue: (r) => r.ageDays, render: (r) => (
      <span className="inline-flex items-center justify-end gap-0.5 whitespace-nowrap">
        <span className="tnum font-bold" style={{ color: gradeColor(r.grade) }}>{r.ageDays}d old</span>
        <CalcBtn onClick={() => setCalc(calcStockAge({ name: r.name, material: r.materialKey, avgAgeDays: r.ageDays, avgShelfDays: r.shelfDays, receipts: r.receipts, grade: r.grade, freshestName: r.freshestName, freshestDays: r.freshestDays }))} />
      </span>
    ) },
    { key: 'grade', header: 'How fresh', align: 'center', sortable: true, sortValue: (r) => (r.grade === 'old' ? 2 : r.grade === 'ok' ? 1 : 0), render: (r) => <Badge color={gradeColor(r.grade)}>{gradeLabel(r.grade)}</Badge> },
    { key: 'shelf', header: 'Shelf left', align: 'right', sortable: true, sortValue: (r) => r.shelfDays ?? 1e9, render: (r) => (r.shelfDays != null ? <span className="tnum whitespace-nowrap text-fdc-slate">{Math.round(r.shelfDays / 30)} mo</span> : <span className="text-fdc-grey">—</span>) },
    { key: 'what', header: 'What to do', render: (r) => (
      <span className="text-[12px] leading-snug text-fdc-slate">{r.gapDays >= 15
        ? <>Ships ~<b>{r.gapDays} days older</b> than the freshest you already get here ({r.freshestName}, {r.freshestDays}d). Ask for newer-made batches before you reorder — same price, more shelf life.</>
        : <>About as fresh as the best you get here — no action needed.</>}</span>
    ) },
  ];

  return (
    <div className="animate-fade-up space-y-4">
      <div className="mb-1">
        <h2 className="flex items-center gap-1.5 text-[16px] font-bold leading-tight text-fdc-ink"><PackageSearch size={17} strokeWidth={2.3} className="text-fdc-green" /> Stock age — who ships you old stock, and where to push for fresher</h2>
        <p className="mt-1 text-[12.5px] leading-snug text-fdc-grey">How old each supplier's stock is on average when it reaches you, measured from the manufacture date on every receipt. Oldest first. <b className="text-fdc-slate">{oldCount}</b> supplier-line{oldCount === 1 ? '' : 's'} flagged as old stock. Fresher stock is free shelf life — ask for newer batches, it's not a price cut.</p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <Dropdown value={mat} options={matOpts} onChange={setMat} label="Material" width={200} />
      </div>
      <Card pad={false}>
        <div className="px-4 pt-3.5">
          <h3 className="text-[14px] font-bold text-fdc-ink">Stock age by supplier — oldest first</h3>
          <p className="text-[12px] text-fdc-grey">{filtered.length} supplier-material line{filtered.length === 1 ? '' : 's'}. Click a row to open that supplier's full detail.</p>
        </div>
        <div className="px-2 py-2">
          <Table columns={cols} rows={filtered} getKey={(r) => r.key} initialSort={{ key: 'age', dir: 'desc' }} onRowClick={(r) => onNavigate({ tab: 'vendors', vendorKey: r.vendorKey, material: r.materialKey })} maxHeight={560} dense />
        </div>
      </Card>
      <CalcSheet calc={calc} onClose={() => setCalc(null)} />
    </div>
  );
}
