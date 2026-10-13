# Probe42 cache

Paid Probe42 `comprehensive-details` payloads are cached here as `{CIN}.json`,
one file per company. They are committed so a credit is spent **at most once** per
company — `npm run financials` and CI only read this cache, never pay.

Populate it by running the `Probe42 private financials` GitHub Action (or
`node scripts/probe/enrich.mjs --live --limit N` with the key + VPN set).
