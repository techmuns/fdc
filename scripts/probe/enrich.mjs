/**
 * Probe42 enrichment — credit-disciplined.
 *
 *   node scripts/probe/enrich.mjs --status          free: survey data availability for all CINs (0 credits)
 *   node scripts/probe/enrich.mjs --live --limit 20 paid: fetch comprehensive for uncached CINs (VPN required)
 *
 * The regular data build (`npm run financials`) only READS the cache — it never
 * triggers a paid call. Cached payloads live in data/probe-cache/{CIN}.json and
 * are committed so credits are spent at most once per company.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasKey, assertVpn, datastatus, comprehensive } from './client.mjs';
import { extractMetrics } from './extract.mjs';
import { PRIVATE_CINS } from './cins.mjs';

const CACHE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data/probe-cache');
const cachePath = (cin) => path.join(CACHE_DIR, `${cin}.json`);

export function readCachedByCin(cin) {
  if (!cin || !existsSync(cachePath(cin))) return null;
  try {
    return JSON.parse(readFileSync(cachePath(cin), 'utf8'));
  } catch {
    return null;
  }
}

/** Build { vendorKey -> {status, cin, metrics|null, source} } purely from cache (free). */
export function readAllCached(cinMap = PRIVATE_CINS) {
  const out = {};
  for (const [vendorKey, cfg] of Object.entries(cinMap)) {
    const cached = readCachedByCin(cfg.cin);
    if (cached?.payload) {
      out[vendorKey] = {
        vendorKey, cin: cfg.cin, companyName: cfg.name, status: 'ok',
        metrics: extractMetrics(cached.payload),
        source: { sourceName: 'Probe42', sourceUrl: 'https://probe42.in', date: cached.fetchedAt?.slice(0, 10) || null },
        note: cfg.caveat || null,
      };
    } else {
      out[vendorKey] = {
        vendorKey, cin: cfg.cin, companyName: cfg.name, status: cfg.cin ? 'pending' : 'cin-unresolved',
        metrics: null,
        source: { sourceName: 'Probe42', sourceUrl: 'https://probe42.in', date: null },
        note: cfg.cin ? 'Add PROBE42_API_KEY_PROD + VPN and run enrich --live to fetch (1 credit).' : 'CIN unresolved — resolve via GSTIN→PAN or MCA first.',
        verify: !!cfg.verify,
      };
    }
  }
  return out;
}

// ---------------- CLI (paid / survey) ----------------
async function cli() {
  const args = process.argv.slice(2);
  const mode = args.includes('--live') ? 'live' : 'status';
  const limArg = args.indexOf('--limit');
  const limit = limArg >= 0 ? parseInt(args[limArg + 1], 10) : 25;
  mkdirSync(CACHE_DIR, { recursive: true });

  if (!hasKey()) {
    console.log('Probe42: no PROBE42_API_KEY_PROD set — nothing to do. (Cache-only reads still work for the dashboard.)');
    const cached = readdirSync(CACHE_DIR).filter((f) => f.endsWith('.json'));
    console.log(`Cached companies on disk: ${cached.length}`);
    return;
  }

  const entries = Object.entries(PRIVATE_CINS).filter(([, c]) => c.cin);

  if (mode === 'status') {
    console.log(`\nProbe42 --status survey (0 credits), ${entries.length} CINs:\n`);
    for (const [key, cfg] of entries) {
      try {
        const ds = await datastatus(cfg.cin);
        const avail = ds?.data?.last_details_updated || ds?.last_details_updated || null;
        console.log(`  ${key.padEnd(30)} ${cfg.cin}  details:${avail ? 'available(' + avail + ')' : 'none'}`);
      } catch (e) {
        console.log(`  ${key.padEnd(30)} ${cfg.cin}  ERROR ${e.message.slice(0, 60)}`);
      }
    }
    return;
  }

  // live: spend credits, VPN-guarded, budgeted, cache-first
  const vpn = await assertVpn();
  console.log(`\nProbe42 --live (VPN ${vpn.skipped ? 'check skipped' : 'ok @ ' + vpn.ip}), budget ${limit} credits\n`);
  let spent = 0;
  for (const [key, cfg] of entries) {
    if (readCachedByCin(cfg.cin)) { console.log(`  ${key}: cached ✓ (no spend)`); continue; }
    if (spent >= limit) { console.log(`  ${key}: budget reached — stop`); break; }
    try {
      const ds = await datastatus(cfg.cin);
      const avail = ds?.data?.last_details_updated || ds?.last_details_updated;
      if (!avail) { console.log(`  ${key}: no details available (free check) — skip`); continue; }
      const payload = await comprehensive(cfg.cin);
      writeFileSync(cachePath(cfg.cin), JSON.stringify({ cin: cfg.cin, vendorKey: key, fetchedAt: new Date().toISOString(), payload }, null, 2));
      spent++;
      console.log(`  ${key}: fetched + cached (credit #${spent})`);
    } catch (e) {
      console.log(`  ${key}: ERROR ${e.message.slice(0, 70)}`);
    }
  }
  console.log(`\nCredits spent this run: ${spent}`);
}

if (import.meta.url === `file://${process.argv[1]}`) cli();
