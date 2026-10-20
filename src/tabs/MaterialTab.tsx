import { useMemo, useState, useEffect } from 'react';
import { Search, Clock, Table2, Info, Building2, LineChart as LineChartIcon, Globe2, GitCompareArrows, ChevronDown, Tag, Store, ShieldAlert, ExternalLink } from 'lucide-react';
import type { AppData, MaterialKey, ValueSku, ValueMaterial, LedgerRow, MaterialPlants, AltVendor, MarketAskMaterial, MarketAsks, MarketAskSeller } from '../types';
import type { Nav } from '../App';
import { Card, Pill, Badge } from '../components/ui/Card';
import { Dropdown, type Option } from '../components/ui/Controls';
import { Table, type Column } from '../components/ui/Table';
import { HBars, type HBarDatum } from '../components/charts/Bars';
import { LineArea } from '../components/charts/LineArea';
import { MarketBenchmark } from '../components/MarketBenchmark';
import { FDC, MATERIAL_COLOR, rampGYR } from '../lib/brand';
import { vendorShort, dateLabel, monthLabel } from '../lib/format';
import { MarketSuppliers } from './BackupSuppliersTab';

// our 3 materials → the backup-database material keys they map to
const DB_MATS: Record<string, string[]> = { dextrose: ['dextrose'], packaging: ['pet-resin', 'pet-bottles', 'caps'], laminates: ['bopet'] };

const price = (n: number | null, unit: string) => (n == null ? '—' : `₹${n >= 100 ? Math.round(n) : n >= 10 ? n.toFixed(1) : n.toFixed(2)}/${unit.toLowerCase() === 'nos' ? 'pc' : unit.toLowerCase()}`);
const fmtSave = (n: number) => (n >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `₹${(n / 1e5).toFixed(1)} L` : `₹${Math.round(n).toLocaleString('en-IN')}`);
const qtyFmt = (n: number, unit: string) => `${Math.abs(n) >= 1e5 ? (n / 1e5).toFixed(1) + 'L' : Math.round(n).toLocaleString('en-IN')} ${unit.toLowerCase() === 'nos' ? 'pc' : unit.toLowerCase()}`;
const GRADE = { fresh: FDC.green, ok: FDC.goldDark, old: FDC.red } as const;
const plantShort = (name: string, code: string) => (name || code).replace(/FDC\s*Limited[,\s-]*/i, '').replace(/^\(|\)$/g, '').trim() || code;

/**
 * The full "what we pay" detail for ONE material — every section the old Material tab
 * had, minus its own heading + material picker (the Suppliers tab now owns the dropdown
 * and renders this filtered to the chosen material). Remount with key={mat} on change.
 */
export function MaterialDetail({ data, mat, skuDesc, onNavigate, showMarketSuppliers = true }: { data: AppData; mat: MaterialKey; skuDesc?: string; onNavigate: (n: Nav) => void; showMarketSuppliers?: boolean }) {
  const v = data.value;
  const M = v?.materials[mat] ?? null;

  // selected SKU for the price-gap visual (seeded from a deep-link, else the biggest item)
  const [skuSel, setSkuSel] = useState<string | null>(skuDesc ?? null);
  useEffect(() => { if (skuDesc) setSkuSel(skuDesc); }, [skuDesc]);
  const sku: ValueSku | undefined = useMemo(() => {
    if (!M?.skus.length) return undefined;
    return M.skus.find((s) => s.desc === skuSel) ?? M.skus[0];
  }, [M, skuSel]);

  if (!v || !M) return null;

  const mp = data.plants?.byMaterial?.[mat] ?? null;
  const alts = data.alternatives?.byMaterial?.[mat] ?? [];
  const mdlMaterial = data.materials.find((m) => m.key === mat) ?? null;
  const asks = data.marketAsks ?? null;
  const ask = asks?.materials[mat] ?? null;

  return (
    <div className="space-y-4">
      {/* you pay vs market ask — honest headline strip + packaging WAD-CHECK */}
      <MarketAskStrip mat={mat} ask={ask} meta={asks} />

      {/* price gap + freshness */}
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3"><PriceGap sku={sku} M={M} alts={alts} ask={ask} meta={asks} onNavigate={onNavigate} /></div>
        <div className="lg:col-span-2"><Freshness M={M} onNavigate={onNavigate} /></div>
      </div>

      {/* plant arbitrage + price trend */}
      <div className="grid gap-4 lg:grid-cols-2">
        <PlantSpread mp={mp} />
        <PriceTrend topSku={mdlMaterial?.topSkuMonthly?.[0] ?? null} color={MATERIAL_COLOR[mat]} />
      </div>

      {/* SKU list */}
      <SkuList M={M} selectedDesc={sku?.desc} onPick={(d) => setSkuSel(d)} />

      {/* who else sells this — market-ask leverage list (NOT FDC suppliers) */}
      <MarketAskSellers ask={ask} meta={asks} />

      {/* other suppliers in the market for this material — shown here unless the Suppliers tab
          has moved them to its dedicated "Alternative suppliers" view */}
      {showMarketSuppliers && <MarketSuppliers data={data} materialKeys={DB_MATS[mat] ?? []} />}

      {/* ledger — the raw proof */}
      <Ledger rows={v.ledger.filter((r) => r.material === mat)} onNavigate={onNavigate} />

      {/* market reference (collapsible) — moved to the BOTTOM, after the ledger */}
      {data.market && <MarketReference material={mat} marketData={data.market} fdcPrice={M.singleCommodity && mdlMaterial?.vwap ? mdlMaterial.vwap : null} fdcLabel={`FDC paid, ${M.displayName} (our purchase data)`} />}
    </div>
  );
}

// "Oct 2026" short + "15 Oct 2026" full, from an ISO date string.
const asOfShort = (iso: string) => { const d = new Date(iso); return isNaN(+d) ? iso : d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }); };
const asOfLong = (iso: string) => { const d = new Date(iso); return isNaN(+d) ? iso : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); };
const SELLER_TYPE_COLOR: Record<string, string> = { maker: FDC.green, trader: FDC.blue, converter: FDC.goldDark, proprietor: FDC.grey };

/** Honest headline: what FDC pays vs the open-market ASK band. Green = fair, amber = headroom.
 *  Marketplace listing price (ex-GST, MOQ-based) — never FDC's negotiated price. */
function MarketAskStrip({ mat, ask, meta }: { mat: MaterialKey; ask: MarketAskMaterial | null; meta: MarketAsks | null }) {
  const [wadMain, wadOther] = useMemo(() => {
    if (!ask) return [null, null] as const;
    const m = ask.note.match(/^([\s\S]*?)(Other items market ask:[\s\S]*)$/i);
    return m ? [m[1].trim(), m[2].trim()] as const : [ask.note, null] as const;
  }, [ask]);
  if (!ask) return null;
  const headroom = ask.tone === 'headroom';
  const accent = headroom ? FDC.goldDark : FDC.green;
  return (
    <Card>
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-[14px] font-bold text-fdc-ink">
          <Tag size={15} style={{ color: accent }} /> You pay vs the market ask <span className="text-[11.5px] font-medium text-fdc-grey">— {ask.benchItem}</span>
        </h3>
        <Badge color={accent}>{headroom ? 'Room to push' : 'Fair'}</Badge>
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl px-3 py-2.5 text-[13px] leading-snug" style={{ background: `${accent}12`, border: `1px solid ${accent}2e` }}>
        <span className="text-fdc-slate">You pay <b className="tnum text-fdc-ink">{ask.fdcPays}</b></span>
        <span className="text-fdc-light">·</span>
        <span className="text-fdc-slate">market ask <b className="tnum text-fdc-ink">{ask.band}</b> <span className="text-fdc-grey">(typ. {ask.typical})</span></span>
        <span className="text-fdc-light">·</span>
        <span className="font-bold" style={{ color: accent }}>{ask.verdict}</span>
      </div>
      <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-snug text-fdc-grey">
        <Info size={12.5} className="mt-0.5 shrink-0" />
        <span>This is the price sellers <b>openly list</b> — before GST, and it changes with order size. A rough guide, <b>not a price FDC has agreed</b>, and these aren't FDC's suppliers. {meta ? <>Source: {meta.source}, as of {asOfLong(meta.asOf)}.</> : null}</span>
      </p>

      {/* packaging → WAD-CHECK amber callout; other materials → soft context note */}
      {mat === 'packaging' ? (
        <div className="mt-2.5 rounded-lg px-3 py-2 text-[11.5px] leading-snug" style={{ background: `${FDC.goldDark}14`, border: `1px solid ${FDC.goldDark}38` }}>
          <span className="flex items-start gap-1.5">
            <ShieldAlert size={14} className="mt-px shrink-0" style={{ color: FDC.goldDark }} />
            <span className="font-semibold" style={{ color: FDC.slate }}>{wadMain}</span>
          </span>
          {wadOther && <p className="mt-1 pl-[20px] text-[11px] text-fdc-grey">{wadOther}</p>}
        </div>
      ) : (
        <p className="mt-2.5 flex items-start gap-1.5 rounded-lg bg-fdc-blue/[0.06] px-3 py-2 text-[11.5px] leading-snug text-fdc-slate">
          <Info size={13} className="mt-0.5 shrink-0 text-fdc-blue" /><span>{ask.note}</span>
        </p>
      )}
    </Card>
  );
}

/** Open-market sellers + their public ASK prices — a leverage list to create competition.
 *  NOT FDC's suppliers, NOT FDC's price, no financials implied. */
function MarketAskSellers({ ask, meta }: { ask: MarketAskMaterial | null; meta: MarketAsks | null }) {
  if (!ask || !ask.sellers.length) return null;
  const cols: Column<MarketAskSeller>[] = [
    { key: 'name', header: 'Seller', render: (s) => (
      <div className="min-w-0">
        <div className="font-semibold text-fdc-slate">{s.name}</div>
        <div className="text-[10.5px] text-fdc-grey">{s.item}</div>
      </div>
    ) },
    { key: 'location', header: 'Location', render: (s) => <span className="text-fdc-grey">{s.location}</span> },
    { key: 'type', header: 'Type', render: (s) => <Pill color={SELLER_TYPE_COLOR[s.type] ?? FDC.grey}>{s.type}</Pill> },
    { key: 'ask', header: 'Market ask', align: 'right', sortable: true, sortValue: (s) => s.askRate, render: (s) => <span className="tnum whitespace-nowrap font-bold text-fdc-ink">{s.askRate}</span> },
    { key: 'link', header: 'Source', align: 'right', render: (s) => s.sourceUrl
      ? <a href={s.sourceUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-fdc-blue underline-offset-2 hover:underline" onClick={(e) => e.stopPropagation()}>view <ExternalLink size={11} /></a>
      : <span className="text-fdc-grey">listed</span> },
  ];
  return (
    <Card pad={false}>
      <div className="px-4 pt-3.5">
        <h3 className="flex items-center gap-1.5 text-[14px] font-bold text-fdc-ink">
          <Store size={15} className="text-fdc-blue" /> Who else sells this — market ask <span className="text-[11.5px] font-medium text-fdc-grey">(leverage list)</span>
        </h3>
        <p className="mt-0.5 text-[12px] leading-snug text-fdc-grey">
          Open-market sellers and the public <b>ASK price</b> they quote for {ask.benchItem}. <b className="text-fdc-slate">Not FDC's suppliers, not FDC's price</b> — a list to create competition. No financials implied.{meta ? <> {meta.source}, as of {asOfLong(meta.asOf)}.</> : null}
        </p>
      </div>
      <div className="px-2 py-2">
        <Table columns={cols} rows={ask.sellers} getKey={(s) => s.name} initialSort={{ key: 'ask', dir: 'asc' }} dense />
      </div>
    </Card>
  );
}

function PriceGap({ sku, M, alts, ask, meta, onNavigate }: { sku: ValueSku | undefined; M: ValueMaterial; alts: AltVendor[]; ask: MarketAskMaterial | null; meta: MarketAsks | null; onNavigate: (n: Nav) => void }) {
  if (!sku) return <Card><p className="text-[12.5px] text-fdc-grey">No comparable prices for this material.</p></Card>;
  const singleSourced = sku.vendors.length < 2;
  const best = sku.bestPrice;
  const worst = Math.max(...sku.vendors.map((x) => x.price));
  const span = worst - best || 1;
  const bars: HBarDatum[] = sku.vendors.map((x) => ({
    key: x.vendorKey,
    label: vendorShort(x.vendor),
    value: x.price,
    color: !x.active ? '#C9C9C9' : x.vendorKey === sku.bestActiveVendorKey ? FDC.green : rampGYR((x.price - best) / span),
    valueLabel: price(x.price, sku.unit),
    sublabel: x.active ? qtyFmt(x.qty, sku.unit) : `last ${x.lastPurchase?.slice(0, 7) ?? '—'} · stale`,
    faded: !x.active,
    note: `${vendorShort(x.vendor)}: ${price(x.price, sku.unit)}${x.gapVsBest > 0 ? `, ₹${x.gapVsBest.toFixed(2)} above the cheapest — about ${fmtSave(x.excess)}/yr extra` : ' — the cheapest you pay'}.${x.active ? '' : ' (stale — not bought recently)'}`,
    tipRows: [
      { label: 'Price', value: price(x.price, sku.unit) },
      { label: 'Volume', value: qtyFmt(x.qty, sku.unit) },
      { label: 'Last bought', value: x.lastPurchase ?? '—' },
      ...(x.gapVsBest > 0 ? [{ label: 'Extra / yr', value: fmtSave(x.excess) }] : []),
    ],
  }));
  const showMarket = M.marketRef && /kg/i.test(M.marketRef.unit) && /kg/i.test(sku.unit);
  const unitWord = sku.unit.toLowerCase() === 'nos' ? 'pieces' : sku.unit.toLowerCase();
  const askMonth = meta ? asOfShort(meta.asOf) : 'Oct 2026';
  const askRef = ask ? (
    <>Market ask ({askMonth}) · {ask.benchItem}: <b className="tnum">{ask.band}</b> <span className="text-fdc-grey">(typ. {ask.typical})</span>. The price sellers openly list — before GST, changes with order size — a rough guide, <b>not FDC's price</b>.</>
  ) : null;
  return (
    <Card>
      <div className="mb-0.5 flex items-start justify-between gap-2">
        <h3 className="text-[14px] font-bold text-fdc-ink">What each supplier charges</h3>
        {singleSourced
          ? <Badge color={FDC.orange}><Globe2 size={11} /> Only one supplier — compare outside</Badge>
          : <Badge color={FDC.green}><GitCompareArrows size={11} /> You already pay less elsewhere</Badge>}
      </div>
      <p className="mb-1.5 text-[12px] leading-snug text-fdc-grey"><span className="font-semibold text-fdc-slate">{sku.desc}</span> · {singleSourced ? "only one supplier on file — there's no second price to compare against, so check it against the market and the options below." : 'green = the cheapest you already pay · grey = you haven’t bought from them lately. Tap a bar to open that supplier.'}</p>
      <p className="mb-3 flex items-start gap-1.5 text-[11px] leading-snug text-fdc-grey">
        <Info size={12.5} className="mt-0.5 shrink-0" />
        <span><b className="text-fdc-slate">How is this worked out?</b> Each price = total ₹ you paid ÷ total {unitWord} you bought over the year (so bigger buys count more), straight from your SAP goods-receipts. The ledger at the bottom is every single line.</span>
      </p>
      <HBars data={bars} format={(n) => price(n, sku.unit)} barSize={28} labelWidth={150} axisTicks={4} onClick={(d) => onNavigate({ tab: 'vendors', vendorKey: d.key })} />

      {/* single-source → external benchmark panel */}
      {singleSourced && (
        <div className="mt-3 space-y-2 rounded-xl border border-fdc-orange/20 bg-fdc-orange/[0.04] p-3">
          <div className="flex items-center gap-1.5 text-[11.5px] font-bold uppercase tracking-wide text-fdc-orange"><Globe2 size={12} /> Compare with the outside market</div>
          {ask ? (
            <p className="text-[12px] leading-snug text-fdc-slate">{askRef}</p>
          ) : M.marketRef ? (
            <p className="text-[12px] leading-snug text-fdc-slate">
              Market reference: <b>{M.marketRef.label}</b> ≈ <b className="tnum">₹{M.marketRef.price}/{M.marketRef.unit.replace('₹/', '')}</b> ({M.marketRef.date.slice(0, 4)}).
              {showMarket ? ' A comparable ₹/kg input/benchmark cost — context only, not FDC’s price.' : ' This is an input cost driver (₹/kg), not a like-for-like price for this item — read it for direction only.'}
            </p>
          ) : <p className="text-[12px] text-fdc-grey">No market reference on file for this material.</p>}
          {alts.length > 0 && (
            <div>
              <p className="mb-1 text-[11.5px] text-fdc-slate">Other sellers you could bring in to get a better price:</p>
              <div className="flex flex-wrap gap-1.5">
                {alts.slice(0, 4).map((a, i) => (
                  <span key={i} className="inline-flex items-center gap-1 rounded-md border border-black/[0.08] bg-white px-2 py-0.5 text-[11px] text-fdc-slate">
                    <b className="text-fdc-ink">{vendorShort(a.name)}</b>
                    {a.metrics?.revenue != null && <span className="text-fdc-grey">· ₹{(a.metrics.revenue / 1e7).toFixed(0)}Cr</span>}
                    {a.status !== 'ok' && <Pill color={FDC.grey}>pending</Pill>}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!singleSourced && ask && (
        <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-fdc-blue/[0.06] px-2.5 py-1.5 text-[11px] leading-snug text-fdc-slate">
          <Info size={13} className="mt-0.5 shrink-0 text-fdc-blue" />
          <span>{askRef}</span>
        </p>
      )}
      {!singleSourced && !ask && showMarket && M.marketRef && (
        <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-fdc-blue/[0.06] px-2.5 py-1.5 text-[11px] leading-snug text-fdc-slate">
          <Info size={13} className="mt-0.5 shrink-0 text-fdc-blue" />
          <span>Market input reference: <b>{M.marketRef.label}</b> ≈ <b className="tnum">₹{M.marketRef.price}/{M.marketRef.unit.replace('₹/', '')}</b> ({M.marketRef.date.slice(0, 4)}). This is an input/benchmark cost — not FDC's price — shown for context only.</span>
        </p>
      )}
      {!singleSourced && !ask && !showMarket && M.marketRef && (
        <p className="mt-2 text-[11px] text-fdc-grey">Market input trend: {M.marketRef.label} ≈ ₹{M.marketRef.price}/{M.marketRef.unit.replace('₹/', '')} — a ₹/kg input, so it isn't overlaid on a per-piece price.</p>
      )}
    </Card>
  );
}

function PlantSpread({ mp }: { mp: MaterialPlants | null }) {
  if (!mp || !mp.plants.length) return <Card><h3 className="flex items-center gap-1.5 text-[14px] font-bold text-fdc-ink"><Building2 size={15} className="text-fdc-green" /> Same material, different plants</h3><p className="mt-2 text-[12.5px] text-fdc-grey">No plant-level price split on file for this material.</p></Card>;
  const prices = mp.plants.filter((p) => p.avgPrice != null);
  const best = Math.min(...prices.map((p) => p.avgPrice as number));
  const worst = Math.max(...prices.map((p) => p.avgPrice as number));
  const span = worst - best || 1;
  const bars: HBarDatum[] = [...prices].sort((a, b) => (a.avgPrice as number) - (b.avgPrice as number)).map((p) => ({
    key: p.plant,
    label: plantShort(p.plantName, p.plant),
    value: p.avgPrice as number,
    color: mp.likeForLike ? ((p.avgPrice as number) === best ? FDC.green : rampGYR(((p.avgPrice as number) - best) / span)) : FDC.blue,
    valueLabel: price(p.avgPrice, mp.unit),
    sublabel: qtyFmt(p.qty, mp.unit),
    tipRows: [
      { label: 'Avg price', value: price(p.avgPrice, mp.unit) },
      { label: 'Volume', value: qtyFmt(p.qty, mp.unit) },
      { label: 'Receipts', value: String(p.receiptCount ?? '—') },
    ],
  }));
  // theoretical saving if the dearest plant's volume matched the cheapest price (like-for-like only)
  const potential = mp.likeForLike && mp.dearestPlant?.avgPrice != null && mp.cheapestPlant?.avgPrice != null
    ? (mp.dearestPlant.avgPrice - mp.cheapestPlant.avgPrice) * (mp.dearestPlant.qty || 0) : 0;
  return (
    <Card>
      <div className="mb-0.5 flex items-start justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-[14px] font-bold text-fdc-ink"><Building2 size={15} className="text-fdc-green" /> Same material, different plants</h3>
        {mp.spread && <Badge color={mp.likeForLike ? FDC.orange : FDC.grey}>{mp.likeForLike ? `${mp.spread.diffPct.toFixed(1)}% gap` : 'different items'}</Badge>}
      </div>
      <p className="mb-3 text-[12px] leading-snug text-fdc-grey">
        {mp.likeForLike
          ? <>The same item, and what each FDC plant paid for it. Cheapest plant in green — this is a real, fair gap.</>
          : <>Each plant buys a different mix of items, so this just shows <b>where the spending sits</b> per plant — not a fair price comparison.</>}
      </p>
      <HBars data={bars} format={(n) => price(n, mp.unit)} barSize={26} labelWidth={130} axisTicks={4} />
      {mp.likeForLike && mp.spread && mp.cheapestPlant && mp.dearestPlant && (
        <p className="mt-2 rounded-lg bg-fdc-green/[0.06] px-2.5 py-1.5 text-[11.5px] leading-snug text-fdc-slate">
          <b>{plantShort(mp.dearestPlant.plantName, mp.dearestPlant.plant)}</b> pays <b className="tnum">{price(mp.dearestPlant.avgPrice, mp.unit)}</b> vs <b>{plantShort(mp.cheapestPlant.plantName, mp.cheapestPlant.plant)}</b> at <b className="tnum">{price(mp.cheapestPlant.avgPrice, mp.unit)}</b> — a <b className="tnum">{mp.spread.diffPct.toFixed(1)}%</b> gap on the exact same material.{potential > 2e4 ? <> If every plant paid the cheapest plant's price, that's about <b className="tnum">{fmtSave(potential)}</b>/yr saved.</> : ''}
        </p>
      )}
    </Card>
  );
}

function PriceTrend({ topSku, color }: { topSku: { desc: string; unit: string; monthly: { month: string; avgPrice: number | null }[] } | null; color: string }) {
  const pts = (topSku?.monthly ?? []).filter((m) => m.avgPrice != null).map((m) => ({ label: monthLabel(m.month), value: m.avgPrice as number }));
  if (!topSku || pts.length < 3) return <Card><h3 className="flex items-center gap-1.5 text-[14px] font-bold text-fdc-ink"><LineChartIcon size={15} className="text-fdc-green" /> Price over the year</h3><p className="mt-2 text-[12.5px] text-fdc-grey">Not enough monthly history to draw a trend.</p></Card>;
  const first = pts[0].value; const last = pts[pts.length - 1].value;
  const chg = first ? ((last - first) / first) * 100 : 0;
  const u = topSku.unit.toLowerCase() === 'nos' ? 'pc' : topSku.unit.toLowerCase();
  return (
    <Card>
      <div className="mb-0.5 flex items-start justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-[14px] font-bold text-fdc-ink"><LineChartIcon size={15} className="text-fdc-green" /> Price over the year</h3>
        <Badge color={chg > 1 ? FDC.red : chg < -1 ? FDC.green : FDC.grey}>{chg > 0 ? '+' : ''}{chg.toFixed(1)}% over the year</Badge>
      </div>
      <p className="mb-2 text-[12px] leading-snug text-fdc-grey">Average ₹/{u} we paid for <span className="font-semibold text-fdc-slate">{topSku.desc}</span> (the biggest item), month by month.</p>
      <LineArea points={pts} color={color} format={(n) => price(n, topSku.unit)} height={200} yAxisFormat={(n) => `₹${n >= 100 ? Math.round(n) : n.toFixed(1)}`} />
    </Card>
  );
}

function MarketReference({ material, marketData, fdcPrice, fdcLabel }: { material: MaterialKey; marketData: AppData['market']; fdcPrice: number | null; fdcLabel: string }) {
  const [open, setOpen] = useState(false);
  if (!marketData) return null;
  const lines = marketData.materials[material]?.lines ?? [];
  if (!lines.length) return null;
  return (
    <Card pad={false}>
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left transition hover:bg-black/[0.02] focus-ring">
        <span className="flex items-center gap-1.5 text-[14px] font-bold text-fdc-ink"><Globe2 size={15} className="text-fdc-blue" /> Our price vs the market <span className="text-[11.5px] font-medium text-fdc-grey">— how it compares to the wider market</span></span>
        <span className="flex items-center gap-1 text-[11.5px] font-semibold text-fdc-grey">{open ? 'Hide' : 'Show'} <ChevronDown size={15} className={`transition ${open ? 'rotate-180' : ''}`} /></span>
      </button>
      {open && (
        <div className="border-t border-black/[0.06] p-4">
          <MarketBenchmark material={material} fdcPrice={fdcPrice} fdcLabel={fdcLabel} marketData={marketData} />
        </div>
      )}
    </Card>
  );
}

function Freshness({ M, onNavigate }: { M: ValueMaterial; onNavigate: (n: Nav) => void }) {
  const fr = M.freshness.filter((f) => f.avgAgeDays != null);
  if (!fr.length) return <Card><p className="text-[12.5px] text-fdc-grey">No manufacture dates on file for this material.</p></Card>;
  return (
    <Card>
      <h3 className="flex items-center gap-1.5 text-[14px] font-bold text-fdc-ink"><Clock size={15} className="text-fdc-orange" /> Who ships old stock</h3>
      <p className="mb-3 text-[12px] leading-snug text-fdc-grey">Average age of stock when it reaches you (lower = fresher). From the manufacture date on every receipt.</p>
      <div className="space-y-1.5">
        {fr.map((f) => {
          const c = GRADE[f.grade ?? 'ok'];
          const w = Math.min(100, ((f.avgAgeDays ?? 0) / Math.max(...fr.map((x) => x.avgAgeDays ?? 0))) * 100);
          return (
            <button key={f.vendorKey} onClick={() => onNavigate({ tab: 'vendors', vendorKey: f.vendorKey })} className="block w-full rounded-lg px-2 py-1 text-left transition hover:bg-black/[0.03] focus-ring">
              <div className="flex items-baseline justify-between text-[12px]">
                <span className="truncate font-medium text-fdc-slate">{vendorShort(f.vendor)}</span>
                <span className="tnum shrink-0"><b style={{ color: c }}>{f.avgAgeDays}d old</b>{f.avgShelfDays != null && <span className="text-fdc-grey"> · {Math.round(f.avgShelfDays / 30)}mo shelf left</span>}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-black/[0.05]"><div className="h-full rounded-full" style={{ width: `${w}%`, background: c }} /></div>
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex gap-3 text-[10.5px] text-fdc-grey">
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: FDC.green }} /> fresh ≤30d</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: FDC.goldDark }} /> 31–90d</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: FDC.red }} /> old &gt;90d</span>
      </div>
    </Card>
  );
}

function SkuList({ M, selectedDesc, onPick }: { M: ValueMaterial; selectedDesc?: string; onPick: (d: string) => void }) {
  const rows = M.skus.filter((s) => s.vendorCount >= 1);
  const cols: Column<ValueSku>[] = [
    { key: 'desc', header: 'Item', sortable: true, sortValue: (s) => s.desc, render: (s) => <span className="font-semibold text-fdc-slate">{s.desc}</span> },
    { key: 'vendors', header: 'Suppliers', align: 'right', sortable: true, sortValue: (s) => s.vendorCount, render: (s) => <span className="tnum">{s.vendorCount}{s.vendorCount < 2 && <span className="ml-1 text-[10px] text-fdc-orange">single</span>}</span> },
    { key: 'spend', header: 'Spend/yr', align: 'right', sortable: true, sortValue: (s) => s.spend, render: (s) => <span className="tnum">{fmtSave(s.spend)}</span> },
    { key: 'best', header: 'Cheapest you pay', align: 'right', sortable: true, sortValue: (s) => s.bestPrice, render: (s) => <span className="tnum text-fdc-green">{price(s.bestPrice, s.unit)} <span className="text-[10px] text-fdc-grey">{vendorShort(s.bestVendor)}</span></span> },
    { key: 'savings', header: 'Save by matching', align: 'right', sortable: true, sortValue: (s) => s.savings, render: (s) => <span className="tnum font-bold" style={{ color: s.savings > 0 ? FDC.orange : FDC.grey }}>{s.savings > 0 ? fmtSave(s.savings) : '—'}</span>, heat: (s) => (s.savings > 0 ? Math.min(1, s.savings / Math.max(...rows.map((x) => x.savings || 1))) : null), heatScale: 'hue', heatColor: FDC.orange },
  ];
  return (
    <Card pad={false}>
      <div className="flex items-center justify-between px-4 pt-3.5">
        <div>
          <h3 className="flex items-center gap-1.5 text-[14px] font-bold text-fdc-ink"><Table2 size={15} className="text-fdc-green" /> Every item, biggest saving first</h3>
          <p className="text-[12px] text-fdc-grey">{rows.length} items · click one to see its supplier prices above.</p>
        </div>
      </div>
      <div className="px-2 py-2">
        <Table columns={cols} rows={rows} getKey={(s) => `${s.matCode}|${s.unit}`} initialSort={{ key: 'savings', dir: 'desc' }} onRowClick={(s) => onPick(s.desc)} activeKey={selectedDesc ? rows.find((r) => r.desc === selectedDesc)?.matCode + '|' + rows.find((r) => r.desc === selectedDesc)?.unit : null} maxHeight={360} dense />
      </div>
    </Card>
  );
}

function Ledger({ rows, onNavigate }: { rows: LedgerRow[]; onNavigate: (n: Nav) => void }) {
  const [vendor, setVendor] = useState('all');
  const [plant, setPlant] = useState('all');
  const [q, setQ] = useState('');
  const vendorOpts: Option<string>[] = [{ value: 'all', label: 'All suppliers' }, ...[...new Map(rows.map((r) => [r.vendorKey, r.vendor])).entries()].map(([k, n]) => ({ value: k, label: vendorShort(n) }))];
  const plantOpts: Option<string>[] = [{ value: 'all', label: 'All plants' }, ...[...new Map(rows.map((r) => [r.plant, r.plantName])).entries()].map(([k, n]) => ({ value: k, label: n || k }))];
  const filtered = useMemo(() => rows.filter((r) => (vendor === 'all' || r.vendorKey === vendor) && (plant === 'all' || r.plant === plant) && (!q || (r.desc + r.po + r.matCode).toLowerCase().includes(q.toLowerCase()))), [rows, vendor, plant, q]);

  const cols: Column<LedgerRow>[] = [
    { key: 'date', header: 'Date', sortable: true, sortValue: (r) => r.date, render: (r) => <span className="tnum whitespace-nowrap text-fdc-slate">{dateLabel(r.date)}</span> },
    { key: 'vendor', header: 'Supplier', render: (r) => <button onClick={() => onNavigate({ tab: 'vendors', vendorKey: r.vendorKey })} className="truncate text-left font-semibold text-fdc-slate underline-offset-2 hover:text-fdc-green hover:underline">{vendorShort(r.vendor)}</button> },
    { key: 'desc', header: 'Item', render: (r) => <span className="text-fdc-grey">{r.desc}</span> },
    { key: 'plant', header: 'Plant', render: (r) => <span className="text-fdc-grey">{(r.plantName || r.plant).replace(/FDC Limited,?/i, '').trim() || r.plant}</span> },
    { key: 'qty', header: 'Qty', align: 'right', sortable: true, sortValue: (r) => r.qty, render: (r) => <span className={`tnum whitespace-nowrap ${r.isReturn ? 'text-fdc-red' : ''}`}>{r.qty.toLocaleString('en-IN')} {r.unit.toLowerCase() === 'nos' ? 'pc' : r.unit.toLowerCase()}</span> },
    { key: 'price', header: '₹/unit', align: 'right', sortable: true, sortValue: (r) => r.price ?? 0, render: (r) => (r.isReturn ? <Pill color={FDC.red}>return</Pill> : <span className="tnum whitespace-nowrap font-semibold">{price(r.price, r.unit)}</span>) },
    { key: 'po', header: 'PO', align: 'right', render: (r) => <span className="tnum text-fdc-grey">{r.po ?? '—'}</span> },
  ];
  return (
    <Card pad={false}>
      <div className="flex flex-wrap items-end justify-between gap-2 px-4 pt-3.5">
        <div className="min-w-0">
          <h3 className="flex items-center gap-1.5 text-[14px] font-bold text-fdc-ink"><Table2 size={15} className="text-fdc-green" /> Every delivery — the proof</h3>
          <p className="text-[12px] text-fdc-grey">{filtered.length.toLocaleString('en-IN')} goods receipts, latest first. This is the raw record behind every number.</p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <Dropdown label="Supplier" value={vendor} options={vendorOpts} onChange={setVendor} width={190} />
          <Dropdown label="Plant" value={plant} options={plantOpts} onChange={setPlant} width={170} />
          <label className="inline-flex items-center gap-1.5 rounded-lg border border-black/[0.12] bg-white px-2.5 py-1.5">
            <Search size={13} className="text-fdc-grey" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find item / PO" className="w-32 bg-transparent text-[12.5px] text-fdc-ink outline-none placeholder:text-fdc-grey" />
          </label>
        </div>
      </div>
      <div className="px-2 py-2">
        <Table columns={cols} rows={filtered.slice(0, 400)} getKey={(r) => `${r.date}-${r.matCode}-${r.po}-${r.amt}-${r.qty}`} initialSort={{ key: 'date', dir: 'desc' }} maxHeight={480} dense />
        {filtered.length > 400 && <p className="px-2 pt-1 text-[10.5px] text-fdc-grey">Showing the latest 400 of {filtered.length.toLocaleString('en-IN')} — filter to narrow.</p>}
      </div>
    </Card>
  );
}
