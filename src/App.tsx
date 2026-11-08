import { useEffect } from 'react';
import { useBillingStore } from './application/state/billingStore';
import { useNavigationStore } from './application/state/navigationStore';
import { useSetupStore } from './application/state/setupStore';
import { BillingLayout } from './presentation/layouts/BillingLayout';
import { HistoryLayout } from './presentation/layouts/HistoryLayout';
import { SettingsLayout } from './presentation/layouts/SettingsLayout';
import { ProductsLayout } from './presentation/layouts/ProductsLayout';
import { SetupLayout } from './presentation/layouts/SetupLayout';
import { Loader2 } from 'lucide-react';

function App() {
  const loadDraft = useBillingStore(state => state.loadDraft);
  const currentView = useNavigationStore(state => state.currentView);
  const { state: setupState, isInitializing: isSetupInitializing, fetchState: fetchSetupState } = useSetupStore();

  useEffect(() => {
    fetchSetupState();
    loadDraft();
  }, [loadDraft, fetchSetupState]);

  if (isSetupInitializing) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
        <span className="ml-3 text-slate-600">Loading Mini POS...</span>
      </div>
    );
  }

  // Setup orchestration — show setup wizard until completed
  if (setupState?.status !== 'COMPLETED') {
    return <SetupLayout onSetupComplete={() => fetchSetupState()} />;
  }

  return (
    <div className="h-screen flex flex-col">
      {currentView === 'billing'  && <BillingLayout />}
      {currentView === 'history'  && <HistoryLayout />}
      {currentView === 'settings' && <SettingsLayout />}
      {currentView === 'products' && <ProductsLayout />}
    </div>
  );
}

export default App;
