import { useState } from 'react';
import { LayoutDashboard, Layers, Factory, Globe2, Wallet, AlertTriangle, Loader2 } from 'lucide-react';
import { useAppData } from './lib/data';
import { Header } from './components/Header';
import { Tabs, type TabDef } from './components/ui/Tabs';
import MoneyOverview from './tabs/MoneyOverview';
import MaterialTab from './tabs/MaterialTab';
import VendorsTab from './tabs/VendorsTab';
import BackupSuppliersTab from './tabs/BackupSuppliersTab';
import CreditTermsTab from './tabs/CreditTermsTab';
import { dateLabel } from './lib/format';
import type { MaterialKey } from './types';

export type Nav =
  | { tab: 'overview' }
  | { tab: 'material'; material?: MaterialKey; skuDesc?: string; vendorKey?: string }
  | { tab: 'vendors'; vendorKey?: string }
  | { tab: 'credit'; vendorKey?: string }
  | { tab: 'backup'; materialKey?: string };

type TabKey = Nav['tab'];

const TABS: TabDef<TabKey>[] = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'material', label: 'Material', icon: Layers },
  { key: 'vendors', label: 'Vendors', icon: Factory },
  { key: 'credit', label: 'Credit & terms', icon: Wallet },
  { key: 'backup', label: 'Backup suppliers', icon: Globe2 },
];

export default function App() {
  const [nav, setNav] = useState<Nav>({ tab: 'overview' });
  const state = useAppData();

  return (
    <div className="min-h-screen bg-fdc-offwhite">
      <Header meta={state.status === 'ready' ? state.data.meta : undefined} />

      <div className="mx-auto max-w-[1240px] px-4 sm:px-6">
        <div className="sticky top-[57px] z-30 -mx-4 border-b border-black/[0.06] bg-fdc-offwhite/95 px-4 pt-1.5 backdrop-blur sm:-mx-6 sm:px-6">
          <Tabs tabs={TABS} active={nav.tab} onChange={(k) => setNav(k === 'overview' ? { tab: 'overview' } : k === 'material' ? { tab: 'material' } : k === 'vendors' ? { tab: 'vendors' } : k === 'credit' ? { tab: 'credit' } : { tab: 'backup' })} />
        </div>

        <main className="py-5">
          {state.status === 'loading' && <LoadingState />}
          {state.status === 'error' && <ErrorState message={state.error} />}
          {state.status === 'ready' && (
            <>
              {nav.tab === 'overview' && <MoneyOverview data={state.data} onNavigate={setNav} />}
              {nav.tab === 'material' && <MaterialTab data={state.data} nav={nav} onNavigate={setNav} />}
              {nav.tab === 'vendors' && <VendorsTab data={state.data} nav={nav} onNavigate={setNav} />}
              {nav.tab === 'credit' && <CreditTermsTab data={state.data} nav={nav} onNavigate={setNav} />}
              {nav.tab === 'backup' && <BackupSuppliersTab data={state.data} nav={nav} />}
            </>
          )}
        </main>
      </div>

      {state.status === 'ready' && <Footer generatedAt={state.data.meta.generatedAt} sources={state.data.meta.sources.map((s) => s.file)} />}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="grid place-items-center py-28 text-center">
      <Loader2 className="mb-3 animate-spin text-fdc-green" size={32} />
      <p className="text-[13px] font-medium text-fdc-grey">Loading FDC purchase data…</p>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-fdc-red/20 bg-fdc-red/[0.04] p-6 text-center">
      <AlertTriangle className="mx-auto mb-2 text-fdc-red" size={28} />
      <h3 className="text-[15px] font-bold text-fdc-ink">Couldn’t load the data</h3>
      <p className="mt-1 text-[13px] text-fdc-grey">{message}</p>
      <p className="mt-3 text-[12px] text-fdc-grey">
        Run <code className="rounded bg-black/5 px-1.5 py-0.5 font-mono text-[11px]">npm run normalize</code> to
        regenerate <code className="font-mono text-[11px]">public/data/</code>, then reload.
      </p>
    </div>
  );
}

function Footer({ generatedAt, sources }: { generatedAt: string; sources: string[] }) {
  return (
    <footer className="mx-auto max-w-[1240px] px-4 pb-8 pt-2 sm:px-6">
      <div className="rounded-xl border border-black/[0.06] bg-white/60 px-4 py-3 text-[11px] leading-relaxed text-fdc-grey">
        <span className="font-semibold text-fdc-slate">100% real data.</span> Every figure is computed live from FDC’s
        own SAP exports — no estimates or placeholders. Sources:{' '}
        <span className="font-medium">{sources.join(', ')}</span>. Data refreshed {dateLabel(generatedAt.slice(0, 10))}.
        Prices use goods-receipt lines only; totals net off returns; units are never mixed; market lines are input references, never FDC’s price.
      </div>
    </footer>
  );
}
