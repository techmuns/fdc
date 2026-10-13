# FDC Procurement Intelligence Cockpit — Phase 1

A web dashboard for **FDC Limited's** procurement team. Across FDC's highest-spend
bought-in materials, it shows — at a glance — **where we overpay, where payment
terms are weak, and which vendors to negotiate with**. Every number is computed
from FDC's own SAP purchase exports; nothing is estimated or sampled.

> **Phase 1 = the data foundation + the cockpit.** Later phases (Vendor Health,
> Alternatives, Negotiation Briefs) are scaffolded as tabs and build on this.

---

## What's inside

| Tab | What it answers |
|---|---|
| **🏠 Overview** | One-glance picture: spend by material, biggest savings, single-source risk, and the top alerts to act on. |
| **💰 Price & Benchmark** | Per-material (and per-item) price trend, price gap by supplier, inter-plant price differences, and a full item price table. |
| **⏳ Payment Terms** | Where spend sits on payment terms, the cash freed by better terms (+15 / +30 day toggle), and the weakest terms by spend. |
| **🏭 Vendors** | Sortable, colour-coded table of every supplier → click for a full profile (materials, price position, monthly trend, listed-company flag). |
| **Vendor Health · Alternatives · Negotiation Briefs** | Scaffolded "coming next phase" screens. |

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
data/raw/                 real SAP exports (original names) + vendor master
scripts/normalize.mjs     data pipeline → public/data/*.json
public/
  fdc-logo.png            FDC logo
  _redirects              SPA routing for Cloudflare Pages
  data/*.json             generated clean data
src/
  lib/        format.ts, brand.ts, data.ts (loader), chartMath.ts
  components/
    charts/   dependency-free SVG kit: Bars, Columns, Donut, LineArea, StackedBar
    ui/       Card, Table, Tabs, Controls (Dropdown/Segmented/Toggle)
    Header.tsx, ComingSoon.tsx
  tabs/       Overview, PriceBenchmark, PaymentTermsTab, Vendors
  types.ts    TypeScript types mirroring the clean JSON
```

---

## Ground rules honoured

- **Only real data** — every figure is traceable to the source files; no mock,
  estimate, or placeholder values.
- **Units are never mixed** — KG and NOS are kept apart in every price and total.
- **Visual & table-first** — charts and colour-coded tables, plain language, no jargon.
- **FDC-branded** — FDC green/gold/orange palette, Rubik font, consistent per-material
  and per-vendor colours.
