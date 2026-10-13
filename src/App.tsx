import { useState } from 'react';
import {
  Home,
  Wallet,
  Hourglass,
  Factory,
  HeartPulse,
  Repeat2,
  FileText,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { useAppData } from './lib/data';
import { Header } from './components/Header';
import { Tabs, type TabDef } from './components/ui/Tabs';
import { ComingSoon } from './components/ComingSoon';
import Overview from './tabs/Overview';
import PriceBenchmark from './tabs/PriceBenchmark';
import PaymentTermsTab from './tabs/PaymentTermsTab';
import Vendors from './tabs/Vendors';
import { dateLabel } from './lib/format';

type TabKey =
  | 'overview'
  | 'price'
  | 'payment'
  | 'vendors'
  | 'health'
  | 'alternatives'
  | 'briefs';

const TABS: TabDef<TabKey>[] = [
  { key: 'overview', label: 'Overview', icon: Home },
  { key: 'price', label: 'Price & Benchmark', icon: Wallet },
  { key: 'payment', label: 'Payment Terms', icon: Hourglass },
  { key: 'vendors', label: 'Vendors', icon: Factory },
  { key: 'health', label: 'Vendor Health', icon: HeartPulse, soon: true },
  { key: 'alternatives', label: 'Alternatives', icon: Repeat2, soon: true },
  { key: 'briefs', label: 'Negotiation Briefs', icon: FileText, soon: true },
];

export default function App() {
  const [tab, setTab] = useState<TabKey>('overview');
  const state = useAppData();

  return (
    <div className="min-h-screen bg-fdc-offwhite">
      <Header meta={state.status === 'ready' ? state.data.meta : undefined} />

      <div className="mx-auto max-w-[1240px] px-4 sm:px-6">
        {/* tab bar */}
        <div className="sticky top-[57px] z-30 -mx-4 border-b border-black/[0.06] bg-fdc-offwhite/95 px-4 pt-1.5 backdrop-blur sm:-mx-6 sm:px-6">
          <Tabs tabs={TABS} active={tab} onChange={setTab} />
        </div>

        <main className="py-5">
          {state.status === 'loading' && <LoadingState />}
          {state.status === 'error' && <ErrorState message={state.error} />}
          {state.status === 'ready' && (
            <>
              {tab === 'overview' && <Overview data={state.data} onNavigate={(t) => setTab(t as TabKey)} />}
              {tab === 'price' && <PriceBenchmark data={state.data} />}
              {tab === 'payment' && <PaymentTermsTab data={state.data} />}
              {tab === 'vendors' && <Vendors data={state.data} />}
              {tab === 'health' && (
                <ComingSoon
                  icon={HeartPulse}
                  title="Vendor Health"
                  blurb="Financial strength and supply-risk scores for every vendor — so a price win never comes from a supplier about to wobble."
                  features={[
                    { heading: 'Financials', detail: 'Revenue, margins & leverage for listed vendors (already flagged in the Vendors tab).' },
                    { heading: 'Supply risk', detail: 'Single-source exposure, return rates and delivery reliability combined into one score.' },
                    { heading: 'Watchlist', detail: 'Automatic alerts when a key supplier’s risk changes.' },
                  ]}
                />
              )}
              {tab === 'alternatives' && (
                <ComingSoon
                  icon={Repeat2}
                  title="Alternatives"
                  blurb="For every item we overpay on, a shortlist of credible alternate suppliers and what switching could save."
                  features={[
                    { heading: 'Live market price', detail: 'Benchmark each material against current market and index prices.' },
                    { heading: 'Qualified alternates', detail: 'Approved and new vendors who can supply the same SKU.' },
                    { heading: 'Switch impact', detail: 'Modelled saving and risk of moving volume to a cheaper source.' },
                  ]}
                />
              )}
              {tab === 'briefs' && (
                <ComingSoon
                  icon={FileText}
                  title="Negotiation Briefs"
                  blurb="One-click, AI-written negotiation packs per vendor — the asks, the leverage, and the numbers to quote in the room."
                  features={[
                    { heading: 'Target price', detail: 'The best-price-matched ask, grounded in what we already pay others.' },
                    { heading: 'Leverage points', detail: 'Volume, payment terms and single-source risk turned into bargaining chips.' },
                    { heading: 'Ready to send', detail: 'A shareable brief the buyer takes straight into the negotiation.' },
                  ]}
                />
              )}
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
        <span className="font-semibold text-fdc-slate">100% real data.</span> Every figure is computed from FDC’s
        own SAP exports — no estimates or placeholders. Sources:{' '}
        <span className="font-medium">{sources.join(', ')}</span>. Data refreshed {dateLabel(generatedAt.slice(0, 10))}.
        Prices use goods-receipt lines only; totals net off returns; units are never mixed.
      </div>
    </footer>
  );
}
