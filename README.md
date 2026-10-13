# FDC Procurement Intelligence Cockpit

A web dashboard for **FDC Limited's** procurement team. Across FDC's highest-spend
bought-in materials, it shows — at a glance — **where we overpay, where payment
terms are weak, and which vendors to negotiate with**. Every number is real and
source-stamped: FDC's own SAP purchase exports plus live external price and
financial feeds. Nothing is estimated, sampled, or fabricated.

> **Phase 1** shipped the data foundation + the cockpit (Overview, Price,
> Payment Terms, Vendors). **Phase 2** adds the *intelligence layer*: live
> market-price benchmarks, real vendor financials & negotiation levers
> (Vendor Health), and benchmarked alternate suppliers (Alternatives).
> **Phase 2.1** makes the *private*-vendor financials real & free: they now
> come from **credit-rating-agency rationale documents** (CRISIL / ICRA /
> CARE / Acuité / Infomerics) — a plain fetch, **zero API keys, zero
> Firecrawl**. Negotiation Briefs (AI) remain scaffolded for Phase 3.

---

## What's inside

| Tab | What it answers |
|---|---|
| **🏠 Overview** | One-glance picture: spend by material, biggest savings, single-source risk, and the top alerts to act on. |
| **💰 Price & Benchmark** | FDC price trend, price gap by supplier, inter-plant differences, item price table — **plus a Market-benchmark view**: our price vs real customs / producer / seller-ask lines and raw-material input trends, each source-stamped. |
| **⏳ Payment Terms** | Where spend sits on payment terms, the cash freed by better terms (+15 / +30 day toggle), and the weakest terms by spend. |
| **🏭 Vendors** | Sortable, colour-coded table of every supplier → click for a full profile (materials, price position, monthly trend, listed-company flag). |
| **❤️ Vendor Health** | Real financials (revenue, margins, leverage, growth) for listed suppliers *and* for rated private suppliers (via their credit-rating rationale), a computed health score with the **credit-rating grade** folded in, a rating badge (grade / outlook / as-of FY / source), and plain-English **negotiation levers** from the numbers. Unrated private suppliers show an honest "financials not public" state — never fabricated. |
| **🔁 Alternatives** | Benchmarked backup suppliers per material with a financial health check and fit note; second-source candidates highlighted for single-source-risk materials. |
| **📝 Negotiation Briefs** | Scaffolded for Phase 3 (AI drafting on top of the levers built in Phase 2). |

Built as a **static SPA** (React + TypeScript + Vite + Tailwind) with a
**dependency-free SVG chart kit** (no chart library). Deploys to **Cloudflare Pages**.

---

## The data pipeline

The four source files live in **`data/raw/`** (original SAP export names kept):

| File (keyword) | Becomes | Unit(s) |
|---|---|---|
| `Vendor_paymentterms.XLSX` | Vendor master → payment terms, country, account group | — |
| `Dextrose_25_26.XLSX` | **Dextrose** (raw material) | KG |
| `PET_25_26.XLSX` | **Rigid plastic packaging** (bottles, caps, preforms, cups) | NOS (pieces) |
| `Laminates.XLSX` | **Laminates** (sachet film + ready-to-drink pouches) | KG + NOS |

Files are identified by **content/keyword**, never a hardcoded filename.

**`scripts/normalize.mjs`** reads them and writes clean JSON to **`public/data/`**.
Audited cleaning rules it applies:

1. Picks the sheet whose header row actually has the needed columns (the Laminates
   data lives on `Sheet2`, not `Sheet1`).
2. Drops each file's embedded **grand-total row** (blank `Posting Date`).
3. **Nets reversals**: movement `102` (Debit/Credit `H`) rows are negative — all
   spend/qty totals sum the signed values, so returns subtract. `101` vs `102`
   counts give a per-vendor **return rate**.
4. **Unit price** = `Amount in LC ÷ Qty`, using only `101` receipts with qty > 0 —
   never across reversals, **never across different units**.
5. Merges duplicate vendor codes into one **canonical vendor** by normalized name
   (e.g. Gujarat Ambuja `1002002 + 1003710`, PIK Plastics `1003376 + 1003248`).
6. Keeps **KG and NOS strictly separate** (laminates mixes film by weight and
   pouches by piece).
7. Unifies Dextrose name variants into one product.
8. Joins payment terms by vendor code (`P042`→30d, `P043`→45d, `P044`→60d,
   `0001`→immediate, `P001`→100% advance).

Output files: `meta.json`, `materials.json`, `vendors.json`, `price-gaps.json`,
`plants.json`, `payment-terms.json`.

A built-in integrity check confirms the signed net of each file reproduces that
file's own embedded total row.

---

## Phase 2 — the intelligence layer

Two more pipelines add real external data. Both are built so the **free feeds run
with no secrets**, and credentialed feeds **skip cleanly** (with a reason) until
their secret is set. Every data point stores `{sourceName, sourceUrl, date}`.

### Market prices — `npm run market` → `public/data/market/*.json`

| Feed | Source | Secret | Gives |
|---|---|---|---|
| Customs unit values | **UN Comtrade** (reporter 699 = India, annual) | none (preview) / `COMTRADE_KEY` | ₹/kg for dextrose (export), resins, BOPET/BOPP film, aluminium foil, caps — converted at that year's average USD→INR |
| USD→INR + inputs | **FRED** (`fredgraph.csv`) | none | real USD→INR (DEXINUS) and raw-material **input** lines: maize, crude (Brent), aluminium |
| Producer prices | **Plastemart** scrape | none | PET/HDPE/PP producer list prices (best-effort) |
| Govt WPI index | **MOSPI eSankhyiki** | `MOSPI_TOKEN` | WPI index line (2011-12 = 100) — shown as an index, never a ₹/kg |
| Seller ask prices | **IndiaMART / TradeIndia** via **Firecrawl** | `FIRECRAWL_API_KEY` | marketplace ask ₹/kg per grade |
| Mandi maize | **Agmarknet** (data.gov.in) | `DATA_GOV_IN_API_KEY` | Indian mandi maize input price |

**Honesty rules baked in:** raw-material inputs (maize, crude, aluminium) are shown
as clearly-labelled **INPUT** lines, never as the material's own price; WPI is an
index, never a fabricated ₹/kg; and each material is graded (dextrose & packaging →
*FDC price is the truth, market is corroboration*; laminates → *market is a strong
benchmark*).

### Vendor financials & levers — `npm run financials` → `public/data/vendor-financials.json`, `alternatives.json`

- **Listed** vendors & alternates → real financials now, **free** via the Munshot
  market-data API (revenue, EBITDA/net/operating margins, debt/equity, growth,
  market cap). A transparent **health score** (A–D) is computed from these.
- **Private** vendors → real financials now, **free** from **credit-rating-agency
  rationale documents** (see Phase 2.1 below). **Probe42** (`scripts/probe/`) is
  kept in the codebase but **dormant** behind `PROBE42_API_KEY_PROD` + VPN; if a
  key is ever added, its cached payloads win over the rating-doc figures.
- **Negotiation levers** (`scripts/levers.mjs`) turn real financials + real
  procurement facts (the credit rating itself, our wallet-share of their revenue,
  margins, leverage, single-source risk, weak terms, overpayment, returns) into
  plain-English, evidence-backed opportunity / risk / watch levers.

```bash
npm run market       # market-price feeds → public/data/market/
npm run ratings      # private-vendor financials from rating docs → public/data/rating-financials.json
npm run financials   # merge listed + private → public/data/vendor-financials.json, alternatives.json
npm run data         # normalize + market + ratings + financials, all in one
```

### Phase 2.1 — private-vendor financials from credit-rating docs (free, 0 keys, 0 Firecrawl)

Private suppliers don't file financials publicly, but the **rated** ones have a
credit-rating **rationale** published by the agency — and those PDFs/pages carry a
"Brief Financials" / "Key Financial Indicators" block with real, audited numbers
plus the rating grade itself. `npm run ratings` (`scripts/ratings/`) does a **plain
fetch** of the stored rationale URLs and parses them — **no API key, no Firecrawl,
no credits**:

| Agency | Doc format | Fetch note |
|---|---|---|
| **CRISIL** | HTML | needs a browser `User-Agent` (else 406) |
| **CARE** | PDF | `pdftotext -layout`; financials read from the *Brief Financials* block |
| **ICRA** | PDF | URL uses `?Id=` (capital **I**) + `User-Agent` |
| **Infomerics** | PDF | follow redirects (`-L`) |
| **Acuité** | PDF | `pdftotext -layout` |

The seed list of rated-vendor doc URLs (plus the explicit list of unrated vendor
keys) lives in **`data/raw/masters/rating-docs.json`** — tracked and editable; add
a vendor's rationale URL there and it's picked up on the next run. Values quoted in
**₹ crore** are converted to absolute INR (× 10⁷, to match the listed-vendor scale),
gearing "× times" to the D/E-% convention, and a sanity pass drops implausible
figures. The **rating grade is the dominant component** of the private-vendor health
score. Rated and unrated vendors alike store `{sourceName, sourceUrl, date}`; an
**"Issuer Not Cooperating"** rating is detected and flagged (it makes the numbers
stale/best-available). The merge (`npm run financials`) is **resilient** — a flaky
fetch keeps the last-good entry rather than blanking a vendor.

> Re-discovering *new* rationale URLs is manual (the agencies' on-site search is
> WAF-blocked), but re-fetching the stored URLs — which is what matters when an
> agency republishes with fresh financials — is fully automated (see the monthly
> workflow below).

### Probe42 (private financials) — run on demand

```bash
node scripts/probe/enrich.mjs --status          # free: survey data availability (0 credits)
node scripts/probe/enrich.mjs --live --limit 20 # paid: fetch comprehensive (VPN required)
```

In CI, the **Probe42 private financials** GitHub Action connects the VPN, verifies
the exit IP matches `VPN_EXPECTED_EXIT_IP` (hard-abort otherwise), runs the fetch,
and commits the cache. A separate **Probe42 VPN check** workflow prints the
before/after exit IP (0 credits) to help you capture that IP.

---

## Run it locally

```bash
npm install          # install dependencies
npm run normalize    # build clean JSON in public/data/ from data/raw/
npm run dev          # start the dev server (http://localhost:5173)
```

### Build for production

```bash
npm run build        # type-checks and outputs the static site to dist/
npm run preview      # preview the production build locally
```

### Refresh the data

When FDC exports new SAP data, drop the new files into `data/raw/` (keep the
name keywords), then:

```bash
npm run normalize    # regenerates public/data/ from the new exports
```

Commit the updated `data/raw/` and `public/data/`, push, and the deploy below
publishes the refresh automatically.

---

## Deploy — Cloudflare Pages (already connected)

This repository is **connected to Cloudflare Pages via the GitHub integration**,
so deployment is already automatic — set up once, then hands-off forever:

- Every pull request gets a **preview deployment** (the *Cloudflare Pages* check
  on the PR links straight to it).
- Merging to **`main`** publishes to **production**.

No manual deploys and no GitHub secrets to manage. The site is a plain static
build with `public/_redirects` handling SPA routing. Cloudflare build settings:

- **Build command:** `npm run build` — or `npm run normalize && npm run build`
  to regenerate the clean data as part of the build
- **Build output directory:** `dist`

To refresh the data, follow **[Refresh the data](#refresh-the-data)** above, then
push — Cloudflare redeploys automatically.

---

## Project structure

```
data/raw/                 real SAP exports + vendor master
  masters/alt-vendors.json   seed of alternate suppliers (tracked, editable)
  masters/rating-docs.json   seed of rated-vendor rationale URLs + unrated keys (tracked, editable)
data/probe-cache/         committed Probe42 payloads (pay a credit once; dormant)
scripts/
  normalize.mjs           SAP → public/data/*.json
  lib/        http.mjs (curl-based), fred.mjs
  market/     config · comtrade · fred-inputs · plastemart · wpi · marketplace · index
  ratings/    fetch.mjs (plain HTML/PDF, 0 keys) · parse.mjs (per-agency) · index.mjs
  financials/ munshot.mjs · index.mjs   (listed financials + merge orchestrator)
  probe/      client · extract · enrich · cins   (Probe42, dormant behind its secret)
  levers.mjs  negotiation-lever engine
public/
  fdc-logo.png · _redirects
  data/*.json             Phase-1 clean data
  data/market/*.json      market prices + manifest
  data/rating-financials.json   private-vendor financials from rating docs
  data/vendor-financials.json · data/alternatives.json
src/
  lib/        format · brand · data (loader) · chartMath
  components/charts/  Bars · Columns · Donut · LineArea · StackedBar · Sparkline
  components/ui/      Card · Table · Tabs · Controls
  components/  Header · ComingSoon · MarketBenchmark
  tabs/       Overview · PriceBenchmark · PaymentTermsTab · Vendors · VendorHealth · Alternatives
  types.ts
.github/workflows/
  data-refresh.yml         daily: refresh market + financials, commit JSON
  ratings-refresh.yml      monthly: re-fetch rating docs (free, 0 keys), commit JSON
  probe42-refresh.yml      manual: VPN-gated Probe42 fetch (paid, budgeted; dormant)
  probe42-vpn-check.yml    manual: print exit IP before/after VPN (0 credits)
```

Deployment stays automatic (Cloudflare Pages Git integration). The
`data-refresh` workflow commits fresh data daily, which triggers a redeploy —
so the market and financial numbers stay current with no manual steps.

---

## Ground rules honoured

- **Only real data** — every figure is traceable to the source files; no mock,
  estimate, or placeholder values.
- **Units are never mixed** — KG and NOS are kept apart in every price and total.
- **Visual & table-first** — charts and colour-coded tables, plain language, no jargon.
- **FDC-branded** — FDC green/gold/orange palette, Rubik font, consistent per-material
  and per-vendor colours.
