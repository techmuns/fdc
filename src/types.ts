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
  receivableDays?: number | null; payableDays?: number | null; inventoryDays?: number | null; cashConversionCycle?: number | null;
  creditRating?: string | null; currentRatio?: number | null;
  pat?: number | null; netWorth?: number | null; interestCoverage?: number | null;
  flags?: { legalCases: number | null; gstDelays: number | null; epfDelays: number | null; charges: number | null };
}

// ---- Phase 2.2: Probe42 (MCA filings) rich profile ----
export interface ProbeYear {
  fy: string | null; year: string; nature: string;
  revenue: number | null; ebitda: number | null; pat: number | null; interest: number | null; depreciation: number | null;
  netMargin: number | null; ebitdaMargin: number | null; grossMargin: number | null;
  roe: number | null; roce: number | null; debtToEquity: number | null; interestCoverage: number | null; currentRatio: number | null;
  receivableDays: number | null; payableDays: number | null; inventoryDays: number | null; ccc: number | null; revenueGrowth: number | null;
  tradeReceivables: number | null; tradePayables: number | null; inventories: number | null; cash: number | null;
  shareCapital: number | null; reservesAndSurplus: number | null; longTermBorrowings: number | null; shortTermBorrowings: number | null;
  totalAssets: number | null; netWorth: number | null; totalDebt: number | null;
  cfOperating: number | null; cfInvesting: number | null; cfFinancing: number | null;
  // Phase 4 — extra P&L / balance-sheet line items (for analytics + composition charts)
  ebit?: number | null; incomeTax?: number | null; otherIncome?: number | null;
  currentAssets?: number | null; currentLiabilities?: number | null;
  netFixedAssets?: number | null; grossFixedAssets?: number | null;
}
export interface ProbePeer {
  year: string; peers: number | null; bizIndustry: string | null; bizSegment: string | null;
  netMargin: number | null; ebitdaMargin: number | null; roce: number | null; roe: number | null;
  receivableDays: number | null; payableDays: number | null; ccc: number | null;
  debtToEquity: number | null; interestCoverage: number | null; currentRatio: number | null;
}
export interface ProbeScore { overall: number | null; growth: number | null; profitability: number | null; liquidity: number | null; solvency: number | null; efficiency: number | null; }
export interface ProbeRating { agency: string | null; grade: string | null; ratingRaw: string | null; outlook: string | null; date: string | null; loanType: string | null; withdrawn: boolean; }
export interface ProbeFlag { label: string; tone: 'risk' | 'watch' | 'ok'; value?: string; }
export interface ProbeCharges { count: number; sumAmount: number | null; topLenders: { name: string; amount: number }[]; }
export interface ProbeLegal { total: number; against: number; severe: number; pending: number; financialDisputes: number; msmeDelays: number; }
// ---- Phase 4 — full-depth Probe42 signals ----
export interface ProbeBorrowing {
  effectiveRatePct: number | null;   // interest expense ÷ total debt, from the filed statements
  chargeRate: { minPct: number; maxPct: number; medianPct: number; count: number } | null;  // from MCA charge filings
  lenders: { name: string | null; amount: number | null; ratePct: number | null; date: string | null; type: string | null }[];
  note: string | null;
}
export interface ProbeRevenueMix {
  available: boolean; fy: string | null;
  manufacturedPct: number | null; tradedPct: number | null; servicesPct: number | null;
  exportPct: number | null; domesticPct: number | null; forexEarningsPct: number | null;
  activity: string | null; note: string | null;
}
export interface ProbeAnalytics {
  dupont: { netMarginPct: number | null; assetTurnover: number | null; equityMultiplier: number | null; roePct: number | null } | null;
  piotroski: { score: number | null; outOf: number; signals: { label: string; pass: boolean | null }[]; note: string } | null;
  altman: { z: number | null; zone: 'safe' | 'grey' | 'distress' | null; model: string; components: { x1: number | null; x2: number | null; x3: number | null; x4: number | null; x5: number | null } } | null;
  fcf: { value: number | null; capex: number | null; deltaWC: number | null; fy: string | null; method: string } | null;
  accruals: { ratioPct: number | null; quality: 'high' | 'moderate' | 'low' | null; note: string } | null;
  operatingLeverage: { dol: number | null; fy: string | null; note: string } | null;
}
export interface ProbeLegalItem { category: string | null; court: string | null; status: string | null; severity: string | null; date: string | null; against: boolean; }
export interface ProbeGroupEntity { name: string | null; cin: string | null; relation: 'holding' | 'subsidiary' | 'associate' | 'joint-venture'; }
export interface ProbeFundraise { date: string | null; instrument: string | null; amountRaised: number | null; securities: number | null; type: string | null; }
export interface ProbeHeadcount { latest: number | null; establishments: number; paymentTimeliness: string | null; band: string | null; }
export interface ProbeOwnership { promoterPct: number | null; directorsHoldingPct: number | null; topHolderPct: number | null; topHolderType: string | null; fy: string | null; }
export interface ProbeProfile {
  vendorKey: string; cin: string | null; legalName: string | null; status: string | null;
  incorporationDate: string | null; registeredAddress: string | null; website: string | null; lastFilingDate: string | null;
  latestFy: string | null; latestYear: string; nature: string; lossMaking: boolean;
  metrics: ProbeYear; series: ProbeYear[]; peer: ProbePeer | null; probeScore: ProbeScore | null; creditRatingProbe: ProbeRating | null;
  keyIndicators: { revenueBand: string | null; profitBand: string | null; employeeBand: string | null };
  flags: ProbeFlag[]; charges: ProbeCharges; legal: ProbeLegal; directors: { name: string; designation: string | null; din: string | null; boards?: number | null }[];
  promoterPct: number | null; source: { sourceName: string; sourceUrl: string; date: string | null };
  // Phase 4 — full-depth signals (all optional; absent → render an honest "not available")
  borrowing?: ProbeBorrowing | null;
  revenueMix?: ProbeRevenueMix | null;
  analytics?: ProbeAnalytics | null;
  ratingHistory?: ProbeRating[];
  issuerNotCooperating?: boolean;
  legalItems?: ProbeLegalItem[];
  financialDisputeItems?: ProbeLegalItem[];
  group?: ProbeGroupEntity[];
  relatedParty?: { fy: string | null; counterparties: number; note: string } | null;
  fundraising?: ProbeFundraise[];
  headcount?: ProbeHeadcount | null;
  ownership?: ProbeOwnership | null;
  industry?: string | null;
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
  vendorKey: string; name: string; type: 'listed' | 'private'; status: 'ok' | 'pending' | 'cin-unresolved' | 'unrated';
  companyName: string | null; symbol: string | null; exchange: string | null; cin: string | null;
  materialsSupplied: string[]; fdcSpend: number; metrics: FinMetrics | null; healthScore: HealthScore | null;
  source: { sourceName: string; sourceUrl: string; date: string | null } | null; note: string | null; levers: Lever[];
  // Phase 2.1 — rating-doc fields (private vendors)
  ratingGrade?: string | null; ratingLabel?: string | null; ratingOutlook?: string | null;
  asOfFy?: string | null; ratingDate?: string | null; issuerNotCooperating?: boolean;
  // Phase 2.2 — Probe42 (MCA filings) is the primary private source when present
  primarySource?: 'listed' | 'probe' | 'rating-doc' | 'none';
  probe?: ProbeProfile | null;
  fallbackSource?: { sourceName: string; sourceUrl: string; date: string | null; ratingLabel?: string | null } | null;
}
export interface VendorFinancials {
  generatedAt: string;
  sources: { listed: string; private: string };
  manifest: { listedResolved: number; privateRated: number; privateUnrated: number; total: number };
  vendors: Record<string, VendorFin>;
}

// ---- Phase 2: alternatives ----
export interface AltVendor {
  name: string; type: 'listed' | 'private'; role: string; ticker: string | null; cin: string | null;
  status: 'ok' | 'pending' | 'cin-unresolved'; fitNote: string; secondSourceFor: string | null;
  gradeLabel?: string | null; // honest spec/grade match caveat (e.g. "exact anhydrous grade — pending IP-monograph confirmation")
  companyName: string | null; symbol: string | null; metrics: FinMetrics | null; healthScore: HealthScore | null;
  source: { sourceName: string; sourceUrl: string }; note: string | null;
  // Phase 4 — private alternates now carry their full Probe42 profile (matched by CIN)
  key?: string;
  primarySource?: 'listed' | 'probe' | 'none';
  probe?: ProbeProfile | null;
  ratingLabel?: string | null; ratingGrade?: string | null; asOfFy?: string | null; issuerNotCooperating?: boolean;
  levers?: Lever[];
}
export interface Alternatives {
  generatedAt: string;
  byMaterial: Record<MaterialKey, AltVendor[]>;
  note: string;
}

// ---- Phase 3: AI negotiation briefs (Claude via AWS Bedrock) ----
export interface BriefEvidence { point: string; figure: string; }
export interface BriefAlternate { name: string; why: string; }
export interface Brief {
  vendorKey: string; vendor: string; type: 'listed' | 'private';
  material: string | null; materials: string[]; fdcSpend: number; priorityScore: number;
  headline: string;
  priceAsk: { summary: string; target: string; basis: string };
  paymentTermAsk: { summary: string; cashImpact: string };
  financialLeverage: string;
  evidence: BriefEvidence[];
  alternates: BriefAlternate[];
  risks: string[];
  suggestedOpeningLine: string;
  approvalNote: string;
  generatedBy: string; generatedAt: string;
  sources: { label: string; url: string | null }[];
}
export interface Briefs {
  generatedAt: string; provider: string; region: string;
  status: 'ok' | 'no-key' | 'partial' | 'error';
  modelsConfigured: string[]; note: string | null; count: number;
  briefs: Brief[];
}

// ---- Phase 5 — the VALUE layer (money + the three unused SAP fields) ----
export interface ValueVendorPrice {
  vendorKey: string; vendor: string; color: string; price: number; qty: number; spend: number;
  lastPurchase: string | null; active: boolean; gapVsBest: number; excess: number;
}
export interface ValueSku {
  desc: string; rawDesc?: string; matCode: string; unit: string; spend: number; qty: number; vendorCount: number;
  bestVendorKey: string; bestVendor: string; bestPrice: number;
  bestActiveVendorKey: string | null; bestActiveVendor: string | null; bestActivePrice: number | null;
  savings: number; vendors: ValueVendorPrice[];
}
export interface ValueFreshness { vendorKey: string; vendor: string; color: string; avgAgeDays: number | null; avgShelfDays: number | null; grade: 'fresh' | 'ok' | 'old' | null; receipts: number; }
export interface ValueMarketRef { price: number; unit: string; label: string; grade: string | null; source: string; date: string; strong: boolean; }
export interface ValueMaterial {
  key: MaterialKey; displayName: string; plainName: string; color: string; singleCommodity: boolean;
  marketRef: ValueMarketRef | null; skus: ValueSku[]; freshness: ValueFreshness[];
  savings: number; spend: number; unit: string | null;
}
export interface ValueAction {
  rank: number; key: string; kind: 'price' | 'terms' | 'freshness'; saving: number; savingLabel: string;
  material: string; vendorKey?: string; action: string; why: string;
  isCash?: boolean; isLeverage?: boolean;
  proof: { tab: 'material' | 'vendors'; material?: string; skuDesc?: string; vendorKey?: string }; risk: string | null;
}
export interface CashFreed { vendorKey: string; name: string; spend: number; termText: string | null; termCategory: string; cashFreed: number; }
export interface ValueVendorOrders { materialKey: string; poCount: number; lineCount: number; avgOrderQty: number | null; deliveriesPerPo: number | null; }
export interface ValueVendorRecency { materialKey: string; lastPurchase: string | null; daysSince: number | null; active: boolean; }
export interface ValueVendorFreshness { materialKey: string; avgAgeDays: number | null; avgShelfDays: number | null; grade: 'fresh' | 'ok' | 'old' | null; }
export interface ValueVendor {
  vendorKey: string; name: string; color: string; spend: number;
  termText: string | null; termDays: number | null; termCategory: string;
  materialKeys: string[]; freshnessByMaterial: ValueVendorFreshness[]; orders: ValueVendorOrders[]; recency: ValueVendorRecency[];
}
export interface LedgerRow {
  date: string; material: string; matCode: string; desc: string; vendorKey: string; vendor: string;
  plant: string; plantName: string; qty: number; unit: string; price: number | null; amt: number; po: string | null; mvt: string; isReturn: boolean;
}
export interface ValueData {
  generatedAt: string; currency: string; dateRange: { from: string | null; to: string | null }; activeWindowDays: number;
  headline: { totalSavings: number; costSavings: number; cashFreed: number; cashFreedBy: CashFreed[]; note: string };
  savingsByMaterial: { materialKey: MaterialKey; displayName: string; color: string; savings: number }[];
  actions: ValueAction[];
  materials: Record<string, ValueMaterial>;
  vendors: Record<string, ValueVendor>;
  ledger: LedgerRow[];
  counts: { ledgerRows: number; skus: number; vendors: number };
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
  briefs: Briefs | null;
  value: ValueData | null;
}
