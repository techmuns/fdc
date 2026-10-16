import { useMemo } from 'react';
import { Globe2, Factory, Droplets, Info, ExternalLink, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { MaterialKey, MarketData, MarketSeries } from '../types';
import { Card, CardHeader, Badge } from './ui/Card';
import { HBars, type HBarDatum } from './charts/Bars';
import { LineArea } from './charts/LineArea';
import { Sparkline } from './charts/Sparkline';
import { price, dateLabel, pct } from '../lib/format';

const KIND_COLOR: Record<string, string> = {
  fdc: '#00973D', customs: '#2E7CE4', producer: '#1ABC9C', ask: '#8E44AD', wpi: '#EFAE0E', input: '#F36D06',
};
const KIND_LABEL: Record<string, string> = {
  customs: 'Import/export price', producer: 'Factory price', ask: "Seller's asking price", wpi: 'Govt price index', input: 'Raw-material cost',
};

export function MarketBenchmark({
  material,
  fdcPrice,
  fdcLabel,
  marketData,
}: {
  material: MaterialKey;
  fdcPrice: number | null; // comparable ₹/kg FDC price, or null (e.g. packaging = per-piece)
  fdcLabel: string;
  marketData: MarketData;
}) {
  const block = marketData.materials[material];
  const lines = block?.lines ?? [];
  const grading = block?.grading;
  const fx = marketData.fx;

  const comparable = lines.filter((l) => l.kind !== 'input' && l.unit === '₹/kg');
  const inputs = lines.filter((l) => l.kind === 'input');
  const customsTrend = comparable.find((l) => l.kind === 'customs' && l.points.length > 1);

  // price ladder (₹/kg): FDC + comparable market lines, cheapest first
  const ladder: HBarDatum[] = useMemo(() => {
    const rows: HBarDatum[] = comparable.map((l) => ({
      key: l.key,
      label: l.label.replace(/ — .*/, ''),
      value: l.latest.value,
      color: KIND_COLOR[l.kind],
      valueLabel: price(l.latest.value, 'KG'),
      sublabel: `${KIND_LABEL[l.kind]} · ${dateLabel(l.latest.date)}`,
      note: `${l.grade}. Source: ${l.sourceName}.`,
      tipRows: [
        { label: 'Price', value: price(l.latest.value, 'KG') },
        ...(l.latest.usdPerKg ? [{ label: 'In US$', value: `$${l.latest.usdPerKg}/kg` }] : []),
        { label: 'As of', value: dateLabel(l.latest.date) },
      ],
    }));
    if (fdcPrice != null) {
      rows.push({
        key: 'fdc', label: 'FDC pays (our price)', value: fdcPrice, color: KIND_COLOR.fdc,
        valueLabel: price(fdcPrice, 'KG'), sublabel: fdcLabel,
        note: 'What FDC actually paid, from our own purchase data.',
        tipRows: [{ label: 'FDC price', value: price(fdcPrice, 'KG') }],
      });
    }
    return rows.sort((a, b) => a.value - b.value);
  }, [comparable, fdcPrice, fdcLabel]);

  if (!lines.length) {
    return (
      <Card>
        <CardHeader icon={Globe2} title="Market comparison" subtitle="Live outside prices" accent="#2E7CE4" />
        <p className="text-[13px] text-fdc-grey">No market lines resolved for this material yet.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          icon={Globe2}
          title="Our price vs the market"
          subtitle={fdcPrice != null ? 'Where your price sits against real outside prices (all ₹/kg)' : 'Outside reference prices for this material (FDC buys finished pieces — see note)'}
          accent="#2E7CE4"
          right={grading && <Badge color={grading.tier === 'strong' ? '#00973D' : '#F36D06'}>{grading.tier === 'strong' ? 'good comparison' : 'rough guide'}</Badge>}
        />
        {grading && (
          <div className="mb-3 flex items-start gap-2 rounded-lg bg-fdc-offwhite px-3 py-2 text-[11.5px] leading-snug text-fdc-slate">
            <Info size={14} className="mt-0.5 shrink-0 text-fdc-grey" />
            <span>{grading.note}</span>
          </div>
        )}
        {ladder.length > 0 ? (
          <HBars data={ladder} format={(n) => price(n, 'KG')} labelWidth={180} barSize={26} axisTicks={4} />
        ) : (
          <p className="text-[13px] text-fdc-grey">No ₹/kg comparison lines for this material.</p>
        )}
        {fdcPrice == null && comparable.length > 0 && (
          <p className="mt-3 rounded-lg bg-fdc-blue/[0.06] px-3 py-2 text-[11.5px] leading-snug text-fdc-slate">
            FDC buys finished items priced per piece, so these per-kg lines are a <span className="font-semibold">guide to which way raw-material costs are heading</span> — not a direct price for this item.
          </p>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {customsTrend && (
          <Card>
            <CardHeader icon={Factory} title="Import/export price trend" subtitle={`${customsTrend.grade}`} accent="#2E7CE4" />
            <LineArea
              points={customsTrend.points.map((p) => ({
                label: (p.fxYear || p.date.slice(0, 4)),
                value: p.value,
                tipRows: [{ label: 'Unit value', value: price(p.value, 'KG') }, ...(p.usdPerKg ? [{ label: 'US$', value: `$${p.usdPerKg}/kg` }] : []), ...(p.usdInr ? [{ label: 'FX used', value: `₹${p.usdInr}/$` }] : [])],
                note: 'UN Comtrade trade value ÷ net weight, converted at that year’s average USD→INR.',
              }))}
              color="#2E7CE4"
              format={(n) => price(n, 'KG')}
              height={200}
              yAxisFormat={(n) => `₹${n.toFixed(0)}`}
            />
            <SourceLine name={customsTrend.sourceName} url={customsTrend.sourceUrl} extra={`FX: ${fx.sourceName} (₹${fx.value}/$ ${fx.date ? 'as of ' + dateLabel(fx.date) : ''})`} />
          </Card>
        )}

        <Card>
          <CardHeader icon={Droplets} title="Raw-material cost trend" subtitle="What the raw materials cost — NOT this item’s own price" accent="#F36D06" />
          {inputs.length ? (
            <div className="space-y-3">
              {inputs.map((inp) => <InputRow key={inp.key} s={inp} />)}
            </div>
          ) : (
            <p className="text-[13px] text-fdc-grey">No input lines for this material.</p>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader icon={ExternalLink} title="Sources" subtitle="Every line above is real and traceable" />
        <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
          {lines.map((l) => (
            <a key={l.key} href={l.sourceUrl} target="_blank" rel="noreferrer" className="group flex items-center justify-between gap-2 border-b border-dashed border-black/[0.06] py-1 text-[11.5px]">
              <span className="flex items-center gap-1.5 text-fdc-slate">
                <span className="h-2 w-2 rounded-sm" style={{ background: KIND_COLOR[l.kind] }} />
                <span className="font-medium">{l.label.replace(/ — .*/, '')}</span>
              </span>
              <span className="flex items-center gap-1 text-fdc-grey group-hover:text-fdc-blue">
                {l.sourceName} <ExternalLink size={11} />
              </span>
            </a>
          ))}
        </div>
        <FeedStatus manifest={marketData.manifest} />
      </Card>
    </div>
  );
}

function InputRow({ s }: { s: MarketSeries }) {
  const pts = s.points.map((p) => ({ label: p.date.slice(0, 7), value: p.value }));
  const first = pts[0]?.value;
  const last = pts[pts.length - 1]?.value;
  const chg = first && last ? ((last - first) / first) * 100 : null;
  const fmt = (n: number) => `${s.currency === 'USD' ? '$' : ''}${n.toLocaleString('en-IN')}`;
  return (
    <div className="rounded-xl border border-black/[0.06] p-3">
      <div className="mb-1 flex items-center justify-between">
        <div>
          <div className="text-[12.5px] font-bold text-fdc-ink">{s.label}</div>
          <div className="text-[11px] text-fdc-grey">{s.unit} · {s.sourceName}</div>
        </div>
        <div className="text-right">
          <div className="tnum text-[14px] font-extrabold text-fdc-ink">{fmt(s.latest.value)}</div>
          {chg != null && (
            <div className="flex items-center justify-end gap-0.5 text-[11px] font-semibold" style={{ color: chg > 1 ? '#D91701' : chg < -1 ? '#00973D' : '#707070' }}>
              {chg > 1 ? <TrendingUp size={12} /> : chg < -1 ? <TrendingDown size={12} /> : <Minus size={12} />}
              {chg > 0 ? '+' : ''}{pct(chg, 0)} (3y)
            </div>
          )}
        </div>
      </div>
      <Sparkline points={pts} color="#F36D06" height={40} format={fmt} />
      <p className="mt-1 text-[10.5px] italic leading-snug text-fdc-grey">{s.grade}</p>
    </div>
  );
}

const FEED_LABEL: Record<string, string> = {
  comtrade: 'UN Comtrade (customs unit values)', inputs: 'Input commodities (FRED/World Bank)',
  wpi: 'Govt WPI index (MOSPI)', marketplace: 'Marketplace seller asks (IndiaMART/TradeIndia)', plastemart: 'Plastemart resin prices',
};
function FeedStatus({ manifest }: { manifest: MarketData['manifest'] }) {
  if (!manifest?.length) return null;
  const on = manifest.filter((m) => m.status === 'ok');
  const off = manifest.filter((m) => m.status !== 'ok');
  return (
    <div className="mt-3 border-t border-black/[0.06] pt-2.5 text-[11px] leading-snug">
      <div className="mb-1 font-semibold uppercase tracking-wide text-fdc-grey">Market feeds</div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {on.map((m) => (
          <span key={m.feed} className="inline-flex items-center gap-1 text-fdc-slate">
            <span className="h-1.5 w-1.5 rounded-full bg-fdc-green" /> {FEED_LABEL[m.feed] ?? m.feed}<span className="text-fdc-grey"> · on</span>
          </span>
        ))}
        {off.map((m) => (
          <span key={m.feed} className="inline-flex items-center gap-1 text-fdc-grey" title={m.reason ?? undefined}>
            <span className="h-1.5 w-1.5 rounded-full bg-fdc-light" /> {FEED_LABEL[m.feed] ?? m.feed}<span> · off{m.reason ? ` (${/token|key/i.test(m.reason) ? 'add key to enable' : 'no clean data'})` : ''}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function SourceLine({ name, url, extra }: { name: string; url: string; extra?: string }) {
  return (
    <p className="mt-2 flex flex-wrap items-center gap-x-2 text-[10.5px] text-fdc-grey">
      <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-fdc-blue">
        <ExternalLink size={10} /> {name}
      </a>
      {extra && <span>· {extra}</span>}
    </p>
  );
}
