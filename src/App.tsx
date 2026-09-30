import { useEffect } from 'react';
import { useBillingStore } from './application/state/billingStore';
import { useNavigationStore } from './application/state/navigationStore';
import { useLicensingStore } from './application/state/licensingStore';
import { BillingLayout } from './presentation/layouts/BillingLayout';
import { HistoryLayout } from './presentation/layouts/HistoryLayout';
import { SettingsLayout } from './presentation/layouts/SettingsLayout';
import { ProductsLayout } from './presentation/layouts/ProductsLayout';
import { ActivationScreen } from './presentation/components/licensing/ActivationScreen';
import { LicensingBanner } from './presentation/components/licensing/LicensingBanner';
import { Loader2 } from 'lucide-react';

function App() {
  const loadDraft = useBillingStore(state => state.loadDraft);
  const currentView = useNavigationStore(state => state.currentView);
  const { status, isInitializing, fetchStatus } = useLicensingStore();

  useEffect(() => {
    fetchStatus();
    loadDraft();
  }, [loadDraft, fetchStatus]);

  if (isInitializing) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
        <span className="ml-3 text-slate-600">Loading Mini POS...</span>
      </div>
    );
  }

  if (status?.state !== 'ACTIVE') {
    return <ActivationScreen />;
  }

  return (
    <div className="h-screen flex flex-col">
      <LicensingBanner />
      {currentView === 'billing'  && <BillingLayout />}
      {currentView === 'history'  && <HistoryLayout />}
      {currentView === 'settings' && <SettingsLayout />}
      {currentView === 'products' && <ProductsLayout />}
    </div>
  );
}

export default App;
