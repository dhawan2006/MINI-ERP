import { useEffect, useState } from 'react';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { useFocusManager } from '../hooks/useFocusManager';
import { useScannerDetector } from '../hooks/useScannerDetector';
import { BillingWorkspace } from '../components/billing/BillingWorkspace';
import { BillPanel } from '../components/billing/BillPanel';
import { PrintToast } from '../components/billing/PrintToast';
import { useNavigationStore } from '../../application/state/navigationStore';
import { useSettingsStore } from '../../application/state/settingsStore';


export function BillingLayout() {
  const searchInputRef = useFocusManager();
  const navigateTo = useNavigationStore(state => state.navigateTo);
  
  const settings = useSettingsStore(state => state.settings);
  const loadSettings = useSettingsStore(state => state.loadSettings);

  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  useEffect(() => {
    loadSettings();
    const timer = setInterval(() => setCurrentTime(new Date()), 60000); // update every minute
    return () => clearInterval(timer);
  }, [loadSettings]);
  
  // Attach global keyboard shortcuts & focus management
  useKeyboardShortcuts(searchInputRef);
  
  // Attach global scanner detection
  useScannerDetector();

  const formattedDate = currentTime.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const formattedTime = currentTime.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-50">
      {/* Full-width Top Header */}
      <header className="flex-none h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between z-20 relative">
        
        {/* LEFT: Brand */}
        <div className="flex items-center gap-3 w-1/3">
          <div className="flex items-center justify-center w-10 h-10 rounded-[10px] bg-indigo-600 text-white shadow-sm">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
          </div>
          <div className="flex flex-col">
            <h1 className="text-xl font-extrabold text-slate-900 leading-none tracking-tight">Mini POS For Harji</h1>
            <span className="text-[11px] font-medium text-slate-500 mt-0.5">Simple. Reliable. For Your Business.</span>
          </div>
        </div>
        
        {/* CENTER: Navigation */}
        <div className="flex items-center justify-center absolute left-1/2 -translate-x-1/2 gap-1">
          <button className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-indigo-700 bg-indigo-50/70 relative group transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>
            Billing
            <div className="absolute bottom-0 left-4 right-4 h-[3px] bg-indigo-600 rounded-t-full"></div>
          </button>
          
          <button onClick={() => navigateTo('products')} className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"></line><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
            Products
          </button>
          
          <button onClick={() => navigateTo('history')} className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
            History
          </button>
          
          <button onClick={() => navigateTo('settings')} className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
            Settings
          </button>
        </div>

        {/* RIGHT: Status & Identity */}
        <div className="flex items-center justify-end gap-5 w-1/3">
          <div className="flex items-center gap-4">
            {settings?.printer?.enabled && (
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500"></div>
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Printer Configured</span>
              </div>
            )}
            {/* Note: Scanner Active status explicitly omitted as requested by prompt #2 */}
          </div>
          
          <div className="w-px h-6 bg-slate-200 hidden sm:block"></div>
          
          <div className="flex items-center gap-3">
            <div className="flex flex-col items-end">
              <span className="text-xs font-semibold text-slate-700 leading-tight">{formattedDate}</span>
              <span className="text-xs font-medium text-slate-500 leading-tight">{formattedTime}</span>
            </div>
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 font-bold text-xs shadow-sm">
              LD
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden p-5 gap-5 items-stretch">
        {/* Left Pane: Search/Input */}
        <div className="flex-[65] flex flex-col bg-white rounded-2xl shadow-sm border border-slate-200 relative overflow-hidden">
          <BillingWorkspace inputRef={searchInputRef} />
        </div>

        {/* Right Pane: Current Bill */}
        <div className="flex-[35] min-w-[400px] max-w-[480px] flex flex-col bg-white rounded-2xl shadow-sm border border-slate-200 relative overflow-hidden">
          <BillPanel />
        </div>
      </div>

      <PrintToast />
    </div>
  );
}
