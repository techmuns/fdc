/**
 * Negotiation-brief generator — `npm run briefs`.
 *
 * For every vendor that has REAL financials, it assembles only data already in
 * the repo (price gap & potential saving, payment-term gap & cash freed, the
 * vendor's financials + pre-computed negotiation levers, and the available
 * alternates) and asks Claude on AWS Bedrock to write a plain-English,
 * evidence-backed negotiation brief — under a STRICT instruction to use only the
 * numbers provided and never invent a figure. Output is validated JSON.
 *
 * Discipline:
 *  - Gated on the Bedrock secret — with no key it writes an honest "no-key"
 *    state (or rebuilds from committed cache); it NEVER fabricates a brief.
 *  - Cached per vendor on a hash of its inputs, so unchanged data never re-calls
 *    Bedrock (saves tokens). The cache (data/briefs-cache/) is committed.
 *  - Pharma rule: every brief carries the fixed governance line that Procurement,
 *    QA and R&D must approve any vendor/spec change — the AI recommends, not decides.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { converse, bedrockConfigured, bedrockStatus } from './bedrock.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DATA = path.join(ROOT, 'public', 'data');
const CACHE = path.join(ROOT, 'data', 'briefs-cache');
const read = (f) => JSON.parse(readFileSync(path.join(DATA, f), 'utf8'));
const readOpt = (f) => (existsSync(path.join(DATA, f)) ? read(f) : null);

const APPROVAL_NOTE =
  'Recommendation only — any change of vendor, specification or source must be jointly approved by Procurement, QA and R&D before action. This brief informs the decision; it does not make it.';

// ---- formatting (match the cockpit's conventions) ----
const CR = 1e7, L = 1e5;
const money = (n) => (n == null || !isFinite(n) ? null : Math.abs(n) >= CR ? `₹${(n / CR).toFixed(2)} Cr` : Math.abs(n) >= L ? `₹${(n / L).toFixed(2)} L` : `₹${Math.round(n)}`);
const pct = (n, d = 1) => (n == null || !isFinite(n) ? null : `${n.toFixed(d)}%`);
const price = (n, unit) => (n == null || !isFinite(n) ? null : `₹${n.toFixed(2)}/${unit || ''}`.replace(/\/$/, ''));
const fmtMarket = (n, unit) => (n == null || !isFinite(n) ? null : `${n.toFixed(2)} ${unit || ''}`.trim());
const matKeyOf = (materials, displayName) => materials.find((m) => m.displayName === displayName || m.plainName === displayName)?.key || null;
const stableHash = (obj) => crypto.createHash('sha256').update(JSON.stringify(sortKeys(obj))).digest('hex').slice(0, 16);
function sortKeys(x) {
  if (Array.isArray(x)) return x.map(sortKeys);
  if (x && typeof x === 'object') return Object.fromEntries(Object.keys(x).sort().map((k) => [k, sortKeys(x[k])]));
  return x;
}

/** Assemble the REAL input package for one vendor (every field traceable). */
function buildInputs(v, ctx) {
  const { priceGaps, paymentTerms, alternatives, materials, market } = ctx;
  const matKeys = (v.materialsSupplied || []).map((d) => matKeyOf(materials, d)).filter(Boolean);

  // price position per material (material-level + sku-level, from real price-gaps)
  const perMaterial = [];
  let totalExcess = 0;
  for (const mk of matKeys) {
    const g = priceGaps.byMaterial[mk];
    if (!g) continue;
    const ml = (g.vendors || []).find((x) => x.vendorKey === v.vendorKey);
    const skuHits = [];
    for (const s of g.skus || []) for (const sv of s.vendors || []) if (sv.vendorKey === v.vendorKey && sv.excessSpend > 0) skuHits.push({ sku: s.desc, unit: s.unit, ourPrice: price(sv.avgPrice, s.unit), bestPrice: price(s.bestPrice, s.unit), bestVendor: s.bestVendor, gap: pct(sv.gapPct), estAnnualExcess: money(sv.excessSpend), _ex: sv.excessSpend });
    const matExcess = (ml?.excessSpend || 0) + skuHits.reduce((s, h) => s + h._ex, 0);
    totalExcess += matExcess;
    const topSku = skuHits.sort((a, b) => b._ex - a._ex).slice(0, 3).map(({ _ex, ...r }) => r);
    const marketLine = market?.materials?.[mk]?.lines?.find((l) => l.kind === 'customs' || l.kind === 'producer') || null;
    perMaterial.push({
      material: g.displayName, unit: g.unit,
      ourAvgPrice: ml ? price(ml.avgPrice, g.unit) : null,
      bestPriceWePay: g.bestPrice != null ? price(g.bestPrice, g.unit) : null,
      bestVendor: g.bestVendor || null,
      gapVsBest: ml ? pct(ml.gapPct) : null,
      estAnnualExcess: matExcess > 0 ? money(matExcess) : null,
      topSkuGaps: topSku.length ? topSku : null,
      marketLine: marketLine ? { label: marketLine.label, latest: fmtMarket(marketLine.latest?.value ?? marketLine.latest?.usdPerKg, marketLine.unit), source: marketLine.sourceName } : null,
    });
  }

  const pt = (paymentTerms.vendors || []).find((x) => x.vendorKey === v.vendorKey);
  const m = v.metrics || {};
  const probe = v.probe || null;
  const peer = probe?.peer || null;
  const share = m.revenue ? (v.fdcSpend / m.revenue) * 100 : null;

  return {
    vendor: v.name,
    supplierType: v.type,
    materialsSupplied: v.materialsSupplied,
    fdcAnnualSpendWithThem: money(v.fdcSpend),
    pricePosition: { perMaterial, totalEstAnnualExcessVsBestPriceWePay: totalExcess > 0 ? money(totalExcess) : null },
    paymentTerms: pt ? { current: pt.termText, days: pt.termDays, areWorstTerms: pt.worstTerms, workingCapitalFreedIf30Day: money(pt.cashFreed30), workingCapitalFreedIf15DayMore: money(pt.cashFreed15) } : null,
    theirFinancials: {
      source: v.source?.sourceName || null, asOfFinancialYear: v.asOfFy || null,
      creditRating: v.ratingLabel || null, issuerNotCooperating: !!v.issuerNotCooperating,
      probe42FinancialScore: probe?.probeScore?.overall != null ? `${probe.probeScore.overall}/10` : null,
      revenue: money(m.revenue), netMargin: pct(m.netMargin), ebitdaMargin: pct(m.ebitdaMargin),
      returnOnCapital: pct(m.roce), debtToEquity: m.debtToEquity != null ? `${(m.debtToEquity / 100).toFixed(2)}x` : null,
      interestCoverage: m.interestCoverage != null ? `${m.interestCoverage}x` : null,
      lossMaking: !!probe?.lossMaking,
      ourSpendAsShareOfTheirRevenue: pct(share, 2),
      peerMedians: peer ? { netMargin: pct(peer.netMargin), payableDays: peer.payableDays != null ? `${Math.round(peer.payableDays)}d` : null, receivableDays: peer.receivableDays != null ? `${Math.round(peer.receivableDays)}d` : null, cashConversionCycle: peer.ccc != null ? `${Math.round(peer.ccc)}d` : null, returnOnCapital: pct(peer.roce) } : null,
      theirWorkingCapital: probe ? { payableDays: m.payableDays != null ? `${Math.round(m.payableDays)}d` : null, receivableDays: m.receivableDays != null ? `${Math.round(m.receivableDays)}d` : null, cashConversionCycle: m.cashConversionCycle != null ? `${Math.round(m.cashConversionCycle)}d` : null } : null,
      healthScore: v.healthScore ? `${v.healthScore.grade} (${v.healthScore.value}/100)` : null,
      riskFlags: (probe?.flags || []).map((f) => f.label),
      // Phase 4 signals — sharpen the asks
      borrowingCost: probe?.borrowing ? { effectiveRatePct: probe.borrowing.effectiveRatePct != null ? `${probe.borrowing.effectiveRatePct}%` : null, chargeRateRangePct: probe.borrowing.chargeRate ? `${probe.borrowing.chargeRate.minPct}-${probe.borrowing.chargeRate.maxPct}%` : null } : null,
      revenueMix: probe?.revenueMix?.available ? { manufacturedPct: pct(probe.revenueMix.manufacturedPct), tradedPct: pct(probe.revenueMix.tradedPct), exportPct: pct(probe.revenueMix.exportPct), note: (probe.revenueMix.tradedPct ?? 0) >= 50 ? 'Mostly a trader/distributor — price carries a reseller margin' : 'Mostly an own-manufacturer' } : null,
      distressSignal: probe?.analytics?.altman?.z != null ? { altmanZ: probe.analytics.altman.z, zone: probe.analytics.altman.zone } : null,
      freeCashFlowApprox: probe?.analytics?.fcf?.value != null ? money(probe.analytics.fcf.value) : null,
    },
    preComputedNegotiationLevers: (v.levers || []).map((l) => ({ type: l.type, title: l.title, detail: l.detail, evidence: (l.evidence || []).map((e) => `${e.label}: ${e.value}`) })),
    availableAlternates: matKeys.flatMap((mk) => (alternatives?.byMaterial?.[mk] || []).map((a) => ({ name: a.name, role: a.role, type: a.type, secondSourceFor: a.secondSourceFor || null, fit: a.fitNote, health: a.healthScore ? `${a.healthScore.grade} (${a.healthScore.value}/100)` : null, revenue: a.metrics?.revenue != null ? money(a.metrics.revenue) : null }))).slice(0, 8),
  };
}

/** A rough priority score so the UI leads with the biggest opportunities. */
function priorityScore(v, inputs) {
  let s = Math.log10(Math.max(v.fdcSpend, 1)) * 10;
  const ex = v.levers?.length || 0;
  s += ex * 3;
  if (inputs.paymentTerms?.areWorstTerms) s += 15;
  if ((v.levers || []).some((l) => /single-source/i.test(l.title))) s += 20;
  if (inputs.pricePosition.totalEstAnnualExcessVsBestPriceWePay) s += 12;
  if (inputs.theirFinancials.lossMaking) s += 8;
  return Math.round(s);
}

const SYSTEM = `You are a procurement negotiation analyst for FDC Limited, an Indian pharmaceutical manufacturer. You write short, sharp, buyer-ready negotiation briefs for the purchasing team to take into a supplier meeting.

ABSOLUTE RULES — these override everything else:
1. Use ONLY the numbers and facts in the DATA block below. NEVER invent, estimate, round differently, or infer a price, percentage, amount, date, or fact that is not present in DATA.
2. Every figure you cite MUST appear verbatim in DATA (copy the exact string, e.g. "₹28.31 Cr", "6.57%", "0.57x"). If a number you want is not in DATA, do not use it — rephrase without it.
3. Do NOT use any outside knowledge about this company, its industry, or typical prices. DATA is the whole world.
4. Write plain English a buyer can say out loud. Be specific and concrete; no filler, no hype.
5. Return ONLY a single valid JSON object — no markdown fences, no commentary before or after.

HOW TO SHARPEN THE ASK (use only when the relevant field is present in DATA):
- theirFinancials.borrowingCost → offer faster payment in exchange for a price cut roughly the size of their borrowing rate (paying early is worth that rate to them).
- theirFinancials.revenueMix (mostly traded) → push to the maker's price: their price carries a reseller margin, so benchmark to a manufacturer.
- theirFinancials.distressSignal (grey/distress zone) → lead with supply-security and qualifying a second source, not a hard squeeze that could tip a fragile supplier over.

Output JSON schema (all fields required):
{
  "headline": "one line: the single biggest, most defensible ask",
  "priceAsk": { "summary": "what to ask for on price", "target": "the target/benchmark price or saving, quoting a DATA figure", "basis": "why it's justified, citing the gap / best price we pay / market line" },
  "paymentTermAsk": { "summary": "the payment-terms ask", "cashImpact": "the working-capital figure from DATA, or 'none' if not applicable" },
  "financialLeverage": "2-4 sentences on their financial position (margins vs peers, leverage, rating, our share of their revenue, any risk flags) and what it means for how hard we can push — every number from DATA",
  "evidence": [ { "point": "a claim in plain words", "figure": "the exact DATA figure backing it" } ],
  "alternates": [ { "name": "an alternate supplier from DATA", "why": "why they're a credible second source" } ],
  "risks": [ "a watch-out for us in this negotiation, grounded in DATA" ],
  "suggestedOpeningLine": "one sentence the buyer can open with in the room"
}
Provide 3 to 6 evidence items, up to 3 alternates (only from DATA; [] if none), and 2 to 4 risks.`;

function buildPrompt(inputs) {
  return `DATA (the only facts you may use):\n\n${JSON.stringify(inputs, null, 2)}\n\nWrite the negotiation brief for ${inputs.vendor} as a single JSON object following the schema exactly. Remember: every figure must be copied verbatim from DATA.`;
}

const REQUIRED = ['headline', 'priceAsk', 'paymentTermAsk', 'financialLeverage', 'evidence', 'alternates', 'risks', 'suggestedOpeningLine'];
function parseAndValidate(text) {
  let t = text.trim();
  // tolerate a ```json fence if a model adds one despite instructions
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) t = t.slice(a, b + 1);
  const obj = JSON.parse(t); // throws → caller re-asks
  for (const k of REQUIRED) if (!(k in obj)) throw new Error(`missing field: ${k}`);
  if (!Array.isArray(obj.evidence) || !Array.isArray(obj.alternates) || !Array.isArray(obj.risks)) throw new Error('evidence/alternates/risks must be arrays');
  return obj;
}

async function generateOne(inputs) {
  const user = buildPrompt(inputs);
  let res = await converse({ system: SYSTEM, user, maxTokens: 2048, label: `brief:${inputs.vendor}` });
  try {
    return { brief: parseAndValidate(res.text), modelId: res.modelId, usage: res.usage };
  } catch (e1) {
    // one re-ask on malformed JSON
    const retryUser = `${user}\n\nYour previous reply was not valid JSON matching the schema (${e1.message}). Return ONLY the JSON object, nothing else.`;
    res = await converse({ system: SYSTEM, user: retryUser, maxTokens: 2048, label: `brief:${inputs.vendor}:retry` });
    return { brief: parseAndValidate(res.text), modelId: res.modelId, usage: res.usage };
  }
}

function sourcesFor(v) {
  const out = [];
  if (v.source?.sourceName) out.push({ label: v.source.sourceName, url: v.source.sourceUrl || null });
  if (v.fallbackSource?.sourceName) out.push({ label: `Cross-check: ${v.fallbackSource.sourceName}`, url: v.fallbackSource.sourceUrl || null });
  out.push({ label: 'FDC SAP purchase exports (Phase-1 price & terms)', url: null });
  return out;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const only = (process.argv.find((a) => a.startsWith('--vendor=')) || '').split('=')[1] || null;

  const vendors = read('vendors.json');
  const materials = read('materials.json');
  const priceGaps = read('price-gaps.json');
  const paymentTerms = read('payment-terms.json');
  const fin = readOpt('vendor-financials.json');
  const alternatives = readOpt('alternatives.json');
  const market = readOpt('market/market.json');
  if (!fin) { console.error('No vendor-financials.json — run `npm run financials` first.'); process.exit(1); }
  const ctx = { priceGaps, paymentTerms, alternatives, materials, market };
  if (!existsSync(CACHE)) mkdirSync(CACHE, { recursive: true });

  // targets: vendors with REAL financials (listed Munshot or private Probe42/rating-doc)
  let targets = vendors
    .map((v) => fin.vendors[v.key])
    .filter((v) => v && v.status === 'ok' && v.metrics)
    .filter((v) => !only || v.vendorKey === only);

  const status = bedrockStatus();
  const built = targets.map((v) => { const inputs = buildInputs(v, ctx); return { v, inputs, hash: stableHash(inputs), score: priorityScore(v, inputs) }; });

  if (dryRun) {
    for (const b of built) { console.log(`\n================ ${b.v.name}  [hash ${b.hash} · priority ${b.score}] ================`); console.log(buildPrompt(b.inputs)); }
    console.log(`\n(dry-run: ${built.length} vendors assembled — no Bedrock calls. Bedrock ${bedrockConfigured() ? 'IS' : 'is NOT'} configured${status.reason ? ` — ${status.reason}` : ''}.)`);
    return;
  }

  const briefs = [];
  let freshCalls = 0, cacheHits = 0, failures = 0;
  const log = [];
  for (const b of built) {
    const cacheFile = path.join(CACHE, `${b.v.vendorKey}.json`);
    const cached = existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, 'utf8')) : null;
    let entry = cached && cached.inputHash === b.hash ? cached : null;
    if (entry) { cacheHits++; log.push(`  ⟳ ${b.v.vendorKey} — cached (inputs unchanged)`); }
    else if (bedrockConfigured()) {
      try {
        const { brief, modelId, usage } = await generateOne(b.inputs);
        entry = { inputHash: b.hash, brief, generatedBy: modelId, generatedAt: new Date().toISOString().slice(0, 10), usage };
        writeFileSync(cacheFile, JSON.stringify(entry, null, 2));
        freshCalls++; log.push(`  ✓ ${b.v.vendorKey} — generated via ${modelId}`);
      } catch (e) { failures++; log.push(`  ✗ ${b.v.vendorKey} — ${e.message.slice(0, 120)}`); continue; }
    } else { log.push(`  • ${b.v.vendorKey} — skipped (no Bedrock key, no cache)`); continue; }

    briefs.push({
      vendorKey: b.v.vendorKey, vendor: b.v.name, type: b.v.type,
      material: b.v.materialsSupplied?.[0] || null, materials: b.v.materialsSupplied || [],
      fdcSpend: b.v.fdcSpend, priorityScore: b.score,
      ...entry.brief, approvalNote: APPROVAL_NOTE,
      generatedBy: entry.generatedBy, generatedAt: entry.generatedAt,
      sources: sourcesFor(b.v),
    });
  }
  briefs.sort((a, b) => b.priorityScore - a.priorityScore);

  const outStatus = briefs.length === 0 ? 'no-key' : failures > 0 || briefs.length < built.length ? 'partial' : 'ok';
  const note = briefs.length === 0
    ? `No briefs yet — ${status.reason || 'Bedrock not configured'}. Add the Bedrock key (and model IDs) and re-run to generate.`
    : outStatus === 'partial' ? `${briefs.length}/${built.length} briefs available; ${built.length - briefs.length} pending/failed.` : null;

  writeFileSync(path.join(DATA, 'briefs.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    provider: 'AWS Bedrock (Converse API)', region: status.region,
    status: outStatus, modelsConfigured: status.models, note,
    count: briefs.length, briefs,
  }, null, 2));

  console.log(`\n▶ Negotiation briefs (Claude via AWS Bedrock)\n${log.join('\n') || '  (no targets)'}`);
  console.log(`\n✓ briefs.json — ${briefs.length} briefs (${freshCalls} fresh, ${cacheHits} cached, ${failures} failed) · status ${outStatus}\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
