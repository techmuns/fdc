// Loads the clean JSON (written by the normalizer) from public/data/.
import { useEffect, useState } from 'react';
import type { AppData, Material, Vendor, PriceGaps, Plants, PaymentTerms, Meta, MarketData, VendorFinancials, Alternatives, Briefs, ValueData, MarketAsks, BackupSuppliers } from '../types';

const base = import.meta.env.BASE_URL || '/';
const url = (f: string) => `${base}data/${f}`.replace(/\/{2,}/g, '/');

export type LoadState =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'ready'; data: AppData };

async function fetchJson<T>(f: string): Promise<T> {
  const res = await fetch(url(f), { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Could not load ${f} (${res.status})`);
  return (await res.json()) as T;
}

// Optional Phase-2 feeds — tolerate absence so the app still loads.
async function fetchOptional<T>(f: string): Promise<T | null> {
  try {
    const res = await fetch(url(f), { cache: 'no-cache' });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export function useAppData(): LoadState {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [meta, materials, vendors, priceGaps, plants, paymentTerms, market, financials, alternatives, briefs, value, marketAsks, backupSuppliers] = await Promise.all([
          fetchJson<Meta>('meta.json'),
          fetchJson<Material[]>('materials.json'),
          fetchJson<Vendor[]>('vendors.json'),
          fetchJson<PriceGaps>('price-gaps.json'),
          fetchJson<Plants>('plants.json'),
          fetchJson<PaymentTerms>('payment-terms.json'),
          fetchOptional<MarketData>('market/market.json'),
          fetchOptional<VendorFinancials>('vendor-financials.json'),
          fetchOptional<Alternatives>('alternatives.json'),
          fetchOptional<Briefs>('briefs.json'),
          fetchJson<ValueData>('value.json'),
          fetchOptional<MarketAsks>('market-asks.json'),
          fetchOptional<BackupSuppliers>('backup-suppliers.json'),
        ]);
        if (!alive) return;
        setState({
          status: 'ready',
          data: { meta, materials, vendors, priceGaps, plants, paymentTerms, market, financials, alternatives, briefs, value, marketAsks, backupSuppliers },
        });
      } catch (e) {
        if (!alive) return;
        setState({ status: 'error', error: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return state;
}

// Convenience selectors
export const materialByKey = (d: AppData, key: string): Material | undefined =>
  d.materials.find((m) => m.key === key);

export const vendorByKey = (d: AppData, key: string): Vendor | undefined =>
  d.vendors.find((v) => v.key === key);
