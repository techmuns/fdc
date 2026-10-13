/**
 * Market-price feed configuration. Every line is tagged with:
 *   kind   — 'customs' | 'producer' | 'ask' | 'wpi' | 'input'
 *   grade  — honest description of exactly what is priced
 * so the UI can label raw-material INPUT lines separately from the material's
 * own price, and mark corroboration vs a strong market signal.
 */

export const MATERIALS = ['dextrose', 'packaging', 'laminates'];

// How much the market line should be trusted vs FDC's own paid price.
// 'primary-fdc' → FDC price is the truth, market is secondary corroboration.
// 'strong'      → market line is a meaningful external benchmark.
export const GRADING = {
  dextrose: { tier: 'primary-fdc', note: "Dextrose grade & contracts are specific to FDC — our paid price is the truth; customs & input lines are context only." },
  packaging: { tier: 'primary-fdc', note: "Each packaging item is bespoke (mould, neck, decoration) — our paid price is the truth; resin & customs lines show the input trend." },
  laminates: { tier: 'strong', note: "Laminate film tracks BOPET/BOPP/foil substrate closely — the market lines are a meaningful benchmark for negotiation." },
};

// UN Comtrade (India reporter = 699). partner 0 = World aggregate.
// Each line lists candidate HS codes; the fetcher uses the first that returns data.
export const COMTRADE_REPORTER = 699;
export const COMTRADE_YEARS = [2024, 2023, 2022, 2021, 2020, 2019];

export const COMTRADE_LINES = [
  { material: 'dextrose', key: 'customs-dextrose', flow: 'X', codes: ['170230'],
    label: 'Dextrose — India export unit value', grade: 'Glucose/dextrose, customs export unit value (HS 1702.30)' },

  { material: 'packaging', key: 'resin-hdpe', flow: 'M', codes: ['390120'],
    label: 'HDPE resin — import unit value', grade: 'HDPE polymer in primary form (HS 3901.20)' },
  { material: 'packaging', key: 'resin-pp', flow: 'M', codes: ['390210'],
    label: 'PP resin — import unit value', grade: 'Polypropylene in primary form (HS 3902.10)' },
  { material: 'packaging', key: 'resin-pet', flow: 'M', codes: ['390769', '390760', '390761', '390710'],
    label: 'PET resin — import unit value', grade: 'PET polymer in primary form (HS 3907.6x)' },
  { material: 'packaging', key: 'caps', flow: 'M', codes: ['392350'],
    label: 'Caps & closures — import unit value', grade: 'Stoppers/caps/closures of plastics (HS 3923.50)' },

  { material: 'laminates', key: 'film-bopet', flow: 'M', codes: ['392062', '392069', '392063'],
    label: 'BOPET film — import unit value', grade: 'Polyester (PET) film (HS 3920.62)' },
  { material: 'laminates', key: 'film-bopp', flow: 'M', codes: ['392020'],
    label: 'BOPP film — import unit value', grade: 'Propylene polymer film (HS 3920.20)' },
  { material: 'laminates', key: 'foil-plain', flow: 'M', codes: ['760711'],
    label: 'Aluminium foil (plain) — import unit value', grade: 'Aluminium foil, not backed, ≤0.2mm (HS 7607.11)' },
  { material: 'laminates', key: 'foil-backed', flow: 'M', codes: ['760720'],
    label: 'Aluminium foil (backed) — import unit value', grade: 'Aluminium foil, backed (HS 7607.20)' },
];

// Raw-material INPUT lines — real, free, via FRED. NEVER shown as the material's own price.
export const INPUT_LINES = [
  { material: 'dextrose', key: 'input-maize', fredId: 'PMAIZMTUSDM', unit: 'USD/tonne',
    label: 'Maize (global price)', note: 'The corn/maize dextrose is milled from — an INPUT, not dextrose itself.' },
  { material: 'packaging', key: 'input-crude', fredId: 'POILBREUSDM', unit: 'USD/barrel',
    label: 'Crude oil (Brent)', note: 'Upstream feedstock for plastics — an INPUT, not the plastic.' },
  { material: 'laminates', key: 'input-aluminium', fredId: 'PALUMUSDM', unit: 'USD/tonne',
    label: 'Aluminium (global price)', note: 'Metal that foil is rolled from — an INPUT, not foil.' },
  { material: 'laminates', key: 'input-crude', fredId: 'POILBREUSDM', unit: 'USD/barrel',
    label: 'Crude oil (Brent)', note: 'Upstream feedstock for BOPET/BOPP film — an INPUT, not film.' },
];

export const FX = {
  fredId: 'DEXINUS',
  sourceName: 'FRED — U.S./India FX (DEXINUS)',
  sourceUrl: 'https://fred.stlouisfed.org/series/DEXINUS',
};

export const COMTRADE_SOURCE = {
  name: 'UN Comtrade',
  url: (code, flow) => `https://comtradeplus.un.org/TradeFlow?Reporters=699&Partners=0&Commodities=${code}&Flows=${flow === 'X' ? 'X' : 'M'}`,
};
