// Types mirror the clean JSON written by scripts/normalize.mjs into public/data/.

export type MaterialKey = 'dextrose' | 'packaging' | 'laminates';

export interface UnitTotal {
  unit: string;
  netSpend: number;
  netQty: number;
  vwap: number | null;
  receiptCount: number;
  reversalCount: number;
}

export interface MonthPoint {
  month: string; // YYYY-MM
  qty: number;
  spend: number;
  avgPrice: number | null;
}

export interface Sku {
  desc: string;
  unit: string;
  qty: number;
  spend: number;
  recQty: number;
  avgPrice: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  vendorCount: number;
}

export interface SkuMonthly {
  desc: string;
  unit: string;
  spend: number;
  avgPrice: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  vendorCount: number;
  monthly: MonthPoint[];
}

export interface MaterialVendorRow {
  vendorKey: string;
  vendor: string;
  color: string;
  unit: string;
  qty: number;
  spend: number;
  avgPrice: number | null;
  multiUnit: boolean;
}

export interface PlantRow {
  plant: string;
  plantName: string;
  unit: string;
  qty: number;
  spend: number;
  avgPrice: number | null;
  receiptCount?: number;
}

export interface Material {
  key: MaterialKey;
  displayName: string;
  plainName: string;
  category: string;
  color: string;
  singleCommodity: boolean;
  units: string[];
  primaryUnit: string;
  totalNetSpend: number;
  totalNetQty: number;
  vwap: number | null;
  receiptCount: number;
  reversalCount: number;
  reversalRatePct: number;
  skuCount: number;
  vendorCount: number;
  plantCount: number;
  unitTotals: UnitTotal[];
  monthly: MonthPoint[];
  monthlySpendAll: { month: string; spend: number }[];
  skus: Sku[];
  topSkuMonthly: SkuMonthly[];
  vendors: MaterialVendorRow[];
  plants: PlantRow[];
}

export interface VendorPerMaterial {
  materialKey: MaterialKey;
  material: string;
  unit: string;
  netSpend: number;
  netQty: number;
  avgPrice: number | null;
  receiptCount: number;
  reversalCount: number;
}

export interface Vendor {
  key: string;
  name: string;
  monthly: { month: string; spend: number; qty: number }[];
  underlyingCodes: string[];
  accGrp: string;
  accGrpLabel: string;
  country: string;
  pmtTermCode: string;
  termCategory: 'advance' | 'immediate' | 'net' | 'unknown';
  termDays: number | null;
  termRank: number;
  termText: string;
  worstTerms: boolean;
  materialsSupplied: string[];
  materialKeys: MaterialKey[];
  primaryUnit: string;
  totalNetSpend: number;
  totalNetQty: number;
  blendedAvgPrice: number | null;
  multiUnit: boolean;
  unitTotals: UnitTotal[];
  receiptCount: number;
  reversalCount: number;
  reversalRatePct: number;
  isListed: boolean;
  listing: { exchange: string; ticker: string } | null;
  color: string;
  perMaterial: VendorPerMaterial[];
}

export interface GapVendorRow {
  vendorKey: string;
  vendor: string;
  color: string;
  avgPrice: number;
  recQty: number;
  spend: number;
  gapVsBest: number;
  gapPct: number;
  excessSpend: number;
}

export interface SkuGap {
  desc: string;
  unit: string;
  bestPrice: number;
  bestVendorKey: string;
  bestVendor: string;
  worstPrice: number;
  vendorCount: number;
  vendors: GapVendorRow[];
  potentialSaving: number;
}

export interface MaterialGap {
  materialKey: MaterialKey;
  displayName: string;
  level: 'material' | 'sku';
  unit: string;
  singleCommodity: boolean;
  bestPrice?: number;
  bestVendorKey?: string;
  bestVendor?: string;
  worstPrice?: number;
  vendorCount?: number;
  vendors?: GapVendorRow[];
  potentialSaving?: number;
  headlineSaving: number;
  skuComparable: number;
  skuTotal: number;
  skus: SkuGap[];
}

export interface PriceGaps {
  byMaterial: Record<MaterialKey, MaterialGap>;
}

export interface MaterialPlants {
  materialKey: MaterialKey;
  displayName: string;
  unit: string;
  likeForLike: boolean;
  plantCount: number;
  cheapestPlant: PlantRow | null;
  dearestPlant: PlantRow | null;
  spread: { min: number; max: number; diff: number; diffPct: number } | null;
  plants: PlantRow[];
}

export interface Plants {
  byMaterial: Record<MaterialKey, MaterialPlants>;
}

export interface PtVendor {
  vendorKey: string;
  vendor: string;
  color: string;
  termCategory: Vendor['termCategory'];
  termDays: number | null;
  termRank: number;
  termText: string;
  worstTerms: boolean;
  totalSpend: number;
  materials: string[];
  cashFreed15: number;
  cashFreed30: number;
}

export interface PaymentTerms {
  totalSpend: number;
  weightedAvgTermDays: number | null;
  cashFreed15Total: number;
  cashFreed30Total: number;
  worstBySpend: PtVendor[];
  byCategory: { category: string; count: number; spend: number }[];
  vendors: PtVendor[];
}

export interface SourceMeta {
  file: string;
  sheet: string;
  material: MaterialKey;
  materialName: string;
  rows: number;
  droppedTotalRows: number;
  embeddedTotalValue: number;
  netSpend: number;
  matchesEmbeddedTotal: boolean;
  dateRange: { from: string; to: string };
}

export interface Meta {
  app: string;
  phase: string;
  generatedAt: string;
  currency: string;
  dateRange: { from: string; to: string };
  vendorMasterFile: string;
  vendorMasterRows: number;
  canonicalVendorCount: number;
  sources: SourceMeta[];
  totals: { netSpend: number; byMaterial: Record<MaterialKey, number> };
  materialMeta: { key: MaterialKey; displayName: string; plainName: string; category: string; color: string }[];
  notes: string[];
}

// ---- Phase 2: market prices ----
export interface MarketPoint {
  date: string;
  value: number;
  usdPerKg?: number;
  usdInr?: number;
  fxYear?: string;
  min?: number;
  max?: number;
  listings?: number;
}
export type MarketKind = 'customs' | 'producer' | 'ask' | 'wpi' | 'input';
export interface MarketSeries {
  material: MaterialKey;
  key: string;
  kind: MarketKind;
  label: string;
  grade: string;
  hsCode?: string;
  flow?: string;
  unit: string;
  currency: string | null;
  points: MarketPoint[];
  latest: MarketPoint;
  sourceName: string;
  sourceUrl: string;
  fxNote?: string;
}
export interface MarketData {
  generatedAt: string;
  fx: { value: number | null; date: string | null; annual: Record<string, number>; sourceName: string; sourceUrl: string };
  materials: Record<MaterialKey, { grading: { tier: string; note: string }; lines: MarketSeries[] }>;
  manifest: { feed: string; status: string; seriesCount: number; reason: string | null }[];
  notes: string[];
}

// ---- Phase 2: vendor financials ----
export interface FinMetrics {
  revenue: number | null; ebitda: number | null; marketCap: number | null; totalDebt: number | null;
  ebitdaMargin: number | null; netMargin: number | null; grossMargin: number | null; operatingMargin: number | null;
  debtToEquity: number | null; revenueGrowth: number | null; earningsGrowth: number | null;
  pe: number | null; evEbitda: number | null; dividendYield: number | null; currentPrice: number | null;
  yearlyChange: number | null; employees: number | null; roce: number | null; roe: number | null;
  receivableDays?: number | null; payableDays?: number | null; cashConversionCycle?: number | null;
  creditRating?: string | null;
  flags?: { legalCases: number | null; gstDelays: number | null; epfDelays: number | null; charges: number | null };
}
export interface HealthScore {
  value: number; grade: string;
  components: { label: string; raw: number | null; score: number; weight: number }[];
  note: string;
}
export interface Lever {
  type: 'opportunity' | 'risk' | 'watch';
  title: string;
  detail: string;
  evidence: { label: string; value: string }[];
}
export interface VendorFin {
  vendorKey: string; name: string; type: 'listed' | 'private'; status: 'ok' | 'pending' | 'cin-unresolved';
  companyName: string | null; symbol: string | null; exchange: string | null; cin: string | null;
  materialsSupplied: string[]; fdcSpend: number; metrics: FinMetrics | null; healthScore: HealthScore | null;
  source: { sourceName: string; sourceUrl: string; date: string | null } | null; note: string | null; levers: Lever[];
}
export interface VendorFinancials {
  generatedAt: string;
  sources: { listed: string; private: string };
  manifest: { listedResolved: number; privateCached: number; privatePending: number; total: number };
  vendors: Record<string, VendorFin>;
}

// ---- Phase 2: alternatives ----
export interface AltVendor {
  name: string; type: 'listed' | 'private'; role: string; ticker: string | null; cin: string | null;
  status: 'ok' | 'pending' | 'cin-unresolved'; fitNote: string; secondSourceFor: string | null;
  companyName: string | null; symbol: string | null; metrics: FinMetrics | null; healthScore: HealthScore | null;
  source: { sourceName: string; sourceUrl: string }; note: string | null;
}
export interface Alternatives {
  generatedAt: string;
  byMaterial: Record<MaterialKey, AltVendor[]>;
  note: string;
}

export interface AppData {
  meta: Meta;
  materials: Material[];
  vendors: Vendor[];
  priceGaps: PriceGaps;
  plants: Plants;
  paymentTerms: PaymentTerms;
  market: MarketData | null;
  financials: VendorFinancials | null;
  alternatives: Alternatives | null;
}
