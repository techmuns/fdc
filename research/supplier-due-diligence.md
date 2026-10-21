# FDC Supplier Due-Diligence — v2 (deep / investigative)

**What this is:** an equity-research-grade check on the 20 suppliers that appear in a recommendation — capacity, money, risk, quality — in plain words, with a real source behind every fact. Serious findings were verified against primary sources (FDA, CCI, courts). Where an entity couldn't be verified we say so.

> **How to read the risk flags:** 🔴 = a serious, documented red flag worth a real decision · 🟡 = a notable concern to weigh · 🟢 = financially strong / low-risk. Everything here is a *lead to verify before acting*, not a final legal conclusion.

---

## The headline — what the deep dive changed

**Three suppliers carry serious, verified red flags (I checked each against the primary source myself):**

1. 🔴 **Kilitch Healthcare (old-stock supplier) — US FDA caught them fabricating lab data.** FDA Warning Letter, 28 Mar 2024: it is their *"routine practice to fabricate results for samples that were never taken."* On FDA Import Alert 66-40 since Oct 2023; the maker behind the 2023 CVS/Walmart/Target eye-drop recall. For a pharma buyer, fabricated QC data undermines *all* their test paperwork. *(Verified at fda.gov. Caveats: recall had no confirmed injuries and is milder than the deadly EzriCare case; this is the **unlisted** Kilitch Healthcare, not the clean **listed** Kilitch Drugs — a plain Google search shows the wrong, clean company.)*
2. 🔴 **GEEP — your biggest laminate supplier (₹28 Cr/yr) — is a convicted cartelist.** CCI found GEEP guilty (2018) of price-fixing with Panasonic in dry-cell batteries, penalty ~₹9.6 cr; guilt upheld on appeal. "GEEP" is the old Geep batteries/torch brand — laminate is a sideline. *(Verified via CCI order coverage.)*
3. 🔴 **UFlex — chairman convicted in a corruption scandal.** Founder-chairman Ashok Chaturvedi was convicted by a CBI court (2010) in the Noida land-allotment scam and jailed (~4 yrs). *(Verified via Deccan Herald/Tribune. Caveat: the 2023 "₹1,500 cr tax raid" actually collapsed — the tax tribunal quashed the assessments in 2026.)*

**The "ghost" alternatives — resolved using FDC's own SAP purchase registers (in the repo):**
- **Cincorp** (SAP vendor 1000007) — real: 121 goods-receipts of HDPE bottles + PP caps to FDC-Baddi. (The *public registry* match is murky, so pin the exact legal entity from a GST invoice.)
- **Suraj Blow Plast** (vendor 1001339) — real: 38 receipts of amber PET pharma bottles to Aurangabad (~₹4.95/pc). Just has no web footprint.
- **Silk Polypack** (vendor 1000032) — **a single ₹7,775 / 31 kg laminate receipt (27 Mar 2026).** A one-off, not a supplier to move volume to — it should be dropped from "alternatives."

**The pattern:** the suppliers you *overpay* are mostly financially strong (Gujarat Ambuja, Sukhjit, Chemco, TPAC, Huhtamaki) → push price, don't switch. The *risk* sits in two places: (a) the three red-flag names above, and (b) the small "move-to" bottle makers (PIK, Premier, Mars, Suraj) which are real but tiny and unaudited — fine for leverage, not for volume without an on-site audit.

---

## Master risk table

| Supplier | Material | Role | Risk | The one thing to know | Action |
|---|---|---|---|---|---|
| Gujarat Ambuja | Dextrose | overpay | 🟡 | Debt-free #1 maize processor, BUT a 2018 NGT pollution closure + violently cyclical profit | Push price; keep |
| Sukhjit | Dextrose | overpay + pay early | 🟢 | A-rated, clean, blue-chip clients; margin dip cut it A+→A | Cut price **and** stop early pay |
| Sayaji | Dextrose | move-to | 🔴 | Below-IG; **FY25 operating profit was negative**; selling land (₹73 cr) to survive | Small volume only; don't rely |
| Universal Starch | Dextrose | overpay | 🟡 | Went **"non-cooperating"** with its rating agency; bought its dextrose plant at a bank auction | Push price; don't grow reliance |
| GEEP | Laminates | overpay (₹28 Cr) | 🔴 | **Convicted cartelist** (CCI 2018); a battery firm, laminate is a sideline | Push price; don't grow reliance |
| Shrinath Roto Pack | Laminates | move-to | 🟡 | Pharma-grade & real, BUT cash flow cratered ~80%, free cash ₹1.95 cr, foil-plant debt | Second source + lever, dual-source |
| Tetra Pak India | Laminates | pay too soon | 🟡 | Rock-solid, BUT global antitrust record + repatriates ~₹300 cr/yr | Stop early pay; push 30-day terms |
| GLS Films | Laminates | overpay | 🔴 | **Came within one court order of insolvency** (2025–26); rating-shopping; interest-cover <1x | Push price hard; don't rely |
| Huhtamaki | Laminates | overpay | 🟢 | Very strong (AA–, low debt), BUT MD **and** CFO both quit within 3 months | Safe to move volume + push price |
| UFlex | Laminates | overpay | 🔴 | **Chairman convicted** (corruption); heavily indebted (net-debt/EBITDA 4.25x) | Price lever only; don't concentrate |
| Silk Polypack | Laminates | "move-to" | ⚪ | **A one-time ₹7,775 purchase** — not a real supplier | Drop from alternatives |
| Chemco | Bottles | old stock | 🟢 | Strong (A+), pharma clients (Cipla/J&J); "old stock" is their 125-day inventory model | Keep; add a freshness clause |
| Cincorp | Caps/bottles | overpay | 🟡 | Real per SAP (bottles+caps to Baddi); public-registry identity murky | Pin the GST entity; cost breakdown |
| PIK Plastics | Bottles | overpay + move-to | 🟡 | Real Surat proprietorship w/ Vapi factory, but unaudited | Lever now; audit before volume |
| Premier Plastic | Bottles | overpay + move-to | 🟡 | A micro-proprietorship (Jayesh Joshi); weakest pharma fit | Confirm entity; audit before volume |
| Mars Plastics | Bottles | overpay + move-to | 🟡 | Punjab partnership; best pharma product-fit of the small ones | Lever now; audit before volume |
| Berry Global | Bottles | overpay + move-to | 🟢 | Rock-solid parent (Amcor), BUT India arm tiny & loss-making; makes devices not plain bottles | Safe — confirm they make your SKU |
| Suraj Blow Plast | Bottles | move-to | 🟡 | Real per SAP (amber PET to Aurangabad); no web footprint/audit | Lever; audit before bigger volume |
| TPAC | Bottles | overpay | 🟢 | A-rated, Thai-group, BUT leans ~85–90% on a single supplier | Push price w/ resin-cost clause |
| Kilitch Healthcare | Bottles/filled | old stock | 🔴 | **FDA data-fabrication + US import ban**; a pharma CMO, not a bottle maker | Treat as elevated-risk; see above |

---

# Dextrose

## Gujarat Ambuja Exports 🟡 *(overpay ~₹21 Cr)*
- **Strong but cyclical:** India's #1 maize processor (5,000 TPD), net-debt-free, **CARE & CRISIL AA–/Stable** (no downgrades), ~₹950 cr cash. BUT profit is a commodity spread — **Q2 FY26 PAT −45% on +32% revenue**, then a sharp 2026 rebound; 5-yr profit growth is negative.
- **Deep finds:** a 2018 **NGT closure order** at its Sitarganj (Uttarakhand) plant for effluent discharge + a 2020 environmental-compensation order; promoter pay **₹40 cr+ (~11–15% of profit)** vs a **~3% dividend** on a ~₹950 cr cash pile; very low institutional ownership (~4.6%); **shelved its ethanol expansion** because profits disappointed; opened India's first maize-based fermentation (sodium gluconate) plant (Dec 2025).
- **Verdict:** financially low-risk to rely on; push price. The only genuine yellow flags are the Sitarganj pollution history and margin volatility. _Sources: CARE 4-Dec-2025; CRISIL 1-Aug-2025; NGT OA 123/2018._

## Sukhjit Starch & Chemicals 🟢 *(overpay + you pay too soon)*
- A-rated (**CRISIL A/Stable**, downgraded from A+ in Jun 2026 when margin fell below 7%), low debt (D/E ~0.15), 83-yr **Sardana-family** franchise, blue-chip low-concentration clients (Dabur, Nestlé, Mars, Marico). Runs bank limits ~93% full → your early payment is cash they value and you can reclaim. New ₹500 cr Nashik plant announced Sep 2026.
- **Verdict:** safe — pull **both** price and payment-timing levers. _Source: CRISIL 12-Jun-2026._ *(Note: Sukhjit is BSE 524542; earlier briefs had the code/family wrong — corrected.)*

## Sayaji Industries 🔴 *(the suggested dextrose move-to)*
- **Genuinely distressed, not just "weak":** CARE **BB+** (slid from BBB+ over 3 yrs); **FY25 operating profit was NEGATIVE (−₹8.3 cr)**, interest cover "not meaningful"; PAT negative FY24 & FY25. Held together by **promoter cash injections** and **asset sales** — sold Kathwada idle land for **₹73 cr on 19 Oct 2026**. Its gum-arabic JV out-earns the entire parent. FY26 shows a thin, unproven turnaround.
- **Verdict:** viable as a *small* price-lever second source only; **do not move meaningful/sole volume** here until the turnaround proves out. _Source: CARE 25-Nov-2025 & 23-Jun-2026._

## Universal Starch-Chem Allied 🟡 *(overpay)*
- Small (~₹490 cr revenue, ~₹83 cr market cap), founder-family micro-cap. **Deliberately went "issuer not cooperating"** — stopped giving its rating agency information *and* fees — and was downgraded to **BB** for it. Entered the dextrose line in 2023 by buying a **bank-auctioned distressed plant for ₹17 cr**. RED-category effluent unit. Zero dividends despite profits.
- **Verdict:** push price, don't grow reliance; the self-chosen opacity is the flag. _Source: Infomerics 12-May-2025._

---

# Laminates / films

## GEEP Industries 🔴 *(overpay — biggest laminate line, ₹28 Cr)*
- **Convicted cartelist:** CCI found GEEP guilty (order 30 Aug 2018, penalty ~₹9.6 cr) of a bilateral price-fixing cartel with Panasonic in dry-cell batteries; the guilt finding was upheld on appeal (penalty reduced). Panasonic escaped penalty via whistleblower leniency.
- **And it's not really a packaging house:** "GEEP" is the legacy **Geep batteries/torch/LED brand** (Thanawala family); GST shows battery, torch, LED **and** laminate-film lines. Unrated-then-non-cooperating credit history; margins compressed from ~8.6% to ~3%; the group's growth story is LED/EV/smart-meters, **not** laminate. FDC is a named client in CRISIL's rationale (relationship corroborated).
- **Verdict:** push price hard; **don't grow reliance** — laminate is non-core to them, and the cartel conviction + opacity are real reputational/continuity flags for a pharma buyer. _Sources: CCI Case 02/2017 (30-Aug-2018); CRISIL 28-Feb-2023._

## Shrinath Roto Pack 🟡 *(the suggested laminate move-to)*
- Real, decades-old pharma-grade converter (57,540 MTPA; clients **GSK, P&G, Britannia**; live US exports). BUT **BBB+ flatters it:** FY24 revenue dipped, **operating cash flow cratered ~80% (₹83 cr→₹17 cr)**, group free cash just **₹1.95 cr**, TD/GCA ~10x; the credit is hostage to an under-utilised (40–50%), over-budget **aluminium-foil plant** it guarantees; **CRISIL "non-cooperating" (Aug 2024)** right before it switched to CARE.
- **Verdict:** plausible second source + price lever — **dual-source, not sole-source**; verify spare capacity and that the foil-plant debt is under control before any big shift. _Source: CARE 9-Oct-2024._

## Tetra Pak India 🟡 *(you pay too soon)*
- Rock-solid MNC (Chakan = largest Tetra Pak plant outside Sweden); India entity ~₹4,500 cr revenue, profitable. **It finances its own customers** (credit/leasing) → no basis to make you pay early. Deeper: the group carries **two of the largest antitrust fines in EU and Chinese history** (for tying packaging to machines — its core model), and the India arm **repatriates ~₹300 cr/yr** to Sweden; straw-ban/recyclability-claim ESG exposure.
- **Verdict:** stop paying early; push 30-day terms. _Sources: company filings; FoodNavigator (SAIC fine 2013)._

## GLS Films 🔴 *(overpay)*
- **Came within one court order of insolvency:** a creditor got GLS admitted to bankruptcy (NCLAT, Feb 2025, calling its defence a "moonshine defence"); the **Supreme Court reversed it (2026)**. **Rating-shopping in plain sight** — two agencies (Brickwork, CARE) went "non-cooperating" after **FY24 accounts disclosed debt-servicing delays**, then a third (Infomerics) graded it two notches higher. Combined group **didn't cover its interest in FY24** (interest-cover 0.86x, gearing 5.64x); flagship revenue −23%.
- **Verdict:** big capacity & good clients, but financially fragile and opaque — push price hard, **don't increase reliance**. _Sources: SC 2026 INSC 344; Infomerics 4-Jun-2025; CARE 3-Sep-2024._

## Huhtamaki India 🟢 *(overpay)*
- Very strong (**CRISIL AA–**, near-zero debt, >₹400 cr cash, Finnish parent), pharma-grade, 90-yr history. Watch-items: **MD and CFO both resigned within 3 months** (late 2025, new MD Jan 2026); sold Thane land to Phoenix Mall for ₹429 cr; closing a small Baddi unit. Flat revenue = negotiating room.
- **Verdict:** safe to move volume + push price; monitor the leadership reset. _Source: CRISIL 12-Aug-2026._

## UFlex 🔴 *(overpay)*
- India's largest flexible-packaging firm — capable and large, BUT: **founder-chairman Ashok Chaturvedi was convicted (2010 Noida land scam) and jailed**; heavily indebted (**net-debt/EBITDA 4.25x**, CRISIL outlook cut to **Negative**); thin ~2% margins; trades at ~0.4x book. The 2023 income-tax raids were real but the **assessments were quashed at tribunal (2026)** — more smoke than fire.
- **Verdict:** use as a price benchmark only; **don't concentrate volume**; the governance (chairman conviction) + leverage are the flags. _Sources: CRISIL 6-Aug-2026; Deccan Herald/Tribune (2010 conviction); ITAT (2026)._

## Silk Polypack ⚪ *(listed as a "move-to")*
- **Not a real supplier:** FDC's SAP shows **one** receipt ever — 31 kg of laminate for **₹7,775** (27 Mar 2026). No web/registry footprint because there's nothing there.
- **Verdict:** remove from "alternatives" entirely.

---

# Rigid plastic (bottles / caps / jars)

## Chemco Plastic Industries 🟢 *(old stock)*
- Strong (**CRISIL A+**), revenue ₹939 cr FY25, pharma clients (**Cipla, J&J**), built a **>1-billion-bottle/yr food-grade rPET plant** (₹125 cr), absorbed 38-yr-old Gaurav Containers (FY24). "Old stock" = their deliberate ~125-day inventory model, not distress. A **₹1,500 cr IPO is talked about but has no DRHP on file yet.**
- **Verdict:** keep; add a "freshest-first / max-age-at-dispatch" clause for ORS shelf life. _Source: CRISIL 1-Sep-2025._

## TPAC Packaging India 🟢 *(overpay)*
- A-rated (**ICRA A/Stable**), Thai-Plaspac-backed, ~₹822 cr revenue, pharma-capable. Watch-items: **PAT fell ~31%** even as revenue rose; **leans ~85–90% on a single supplier** (ICRA flags this). A brand-new separate "TPAC India Pvt Ltd" entity appeared in 2025 (restructuring — watch).
- **Verdict:** push price with a resin-cost clause; safe to keep/grow. _Source: ICRA 27-Mar-2026._

## Berry Global India 🟢 *(overpay + a suggested move-to)*
- Parent is now **Amcor** (~$13bn, investment-grade BBB) after the Apr-2025 acquisition — rock-solid. BUT the **India legal entity is tiny and loss-making** (<₹1 cr revenue FY23, ~₹11.6 cr FY24), and its Bangalore site makes **drug-delivery devices (inhalers/droppers)**, maybe not your plain ORS bottles. Amcor is mid-restructuring (US plant closures so far).
- **Verdict:** safe to move to on parent strength — **first confirm the India plant makes your exact bottle SKU**. _Source: S&P (May 2025)._

## Cincorp 🟡 *(overpay)* · Suraj Blow Plast 🟡 *(move-to)* — resolved via FDC SAP
- **Cincorp** is a **real** FDC supplier (SAP vendor 1000007): 121 receipts of HDPE bottles + PP caps to Baddi — it matches cincorp.co.in's product profile. The public-registry "Cincorp International Ltd" (Delhi, chemicals classification) is a murky match, so **pin the exact legal entity from a GST invoice** and get a cost breakdown (possible middleman markup).
- **Suraj Blow Plast** is also **real** (vendor 1001339): 38 receipts of amber PET pharma bottles to Aurangabad at ~₹4.95/pc — it simply has no web footprint.
- **Verdict (both):** genuine small suppliers — use overpay data as leverage; **audit before moving bigger volume**.

## PIK Plastics / Premier Plastic / Mars Plastics 🟡 *(overpay + move-to)* — identities cracked
- All three now pinned to exact GST numbers & proprietors (PIK = Paresh Khasakia, Surat, real Vapi factory; Premier = Jayesh Joshi, Vasai; Mars = Bansal partnership, Samana, best pharma product-fit). **None files public audited accounts** (two proprietorships, one partnership). Mars ≳ PIK ≫ Premier on pharma-bottle readiness.
- **Verdict (all three):** fine for price leverage now; **do not move volume without an on-site audit + ISO 15378/GMP, food-grade resin data, PCB consent, and audited financials.**

## Kilitch Healthcare India 🔴 *(old stock)*
- **The red flag of the whole set.** FDA Warning Letter (28 Mar 2024) found **fabricated QC data** ("routine practice to fabricate results for samples that were never taken"), insanitary aseptic conditions, DEG/EG sampling failures; on **Import Alert 66-40** since Oct 2023; the maker behind the 2023 US store-brand eye-drop recall. A pharma **CMO** (likely supplies FDC filled/finished goods, not empty bottles). Formerly "NBZ Pharma." FY25 profit −44%, borrowings +5,534% (post-ban shock). **Distinct from the clean listed Kilitch Drugs.**
- **Verdict:** treat as **elevated-risk** — fabricated QC data undermines trust in all their release paperwork (directly relevant to the 211-day-old stock). Require their FDA remediation/CAPA evidence and re-qualify, or move the business. _Verified: fda.gov Warning Letter 320-24-29._

---

*Every serious finding above (Kilitch FDA, GEEP cartel, UFlex chairman) was checked against the primary source. Agent-gathered facts cite rating agencies, courts, and established press. The "ghost" resolutions use FDC's own SAP purchase registers. Items that couldn't be verified are flagged, not guessed.*
