import React, { useEffect, useState, useRef } from 'react';
import { useNavigationStore } from '../../application/state/navigationStore';
import { useSettingsStore } from '../../application/state/settingsStore';
import { AppSettingsDTO, PrinterConfig, StoreConfigDTO } from '../../shared/dto';
import { Input } from '../components/ui/Input';
import { useLicensingStore } from '../../application/state/licensingStore';

export const SettingsLayout: React.FC = () => {
  const navigateTo = useNavigationStore(state => state.navigateTo);
  const { settings, isLoading, error, loadSettings, updateSettings, testPrint } = useSettingsStore();
  const licensingStatus = useLicensingStore(state => state.status);

  const [localSettings, setLocalSettings] = useState<AppSettingsDTO | null>(null);
  const [testPrintError, setTestPrintError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [backupSuccess, setBackupSuccess] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);

  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreMetadata, setRestoreMetadata] = useState<any | null>(null);
  const [restoreFilePath, setRestoreFilePath] = useState<string | null>(null);
  const [restoreConfirmation, setRestoreConfirmation] = useState('');
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const [isResetting, setIsResetting] = useState(false);
  const [resetConfirmation, setResetConfirmation] = useState('');
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState<string | null>(null);
  const [showResetUI, setShowResetUI] = useState(false);

  const [isDeactivating, setIsDeactivating] = useState(false);
  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false);
  const [deactivateError, setDeactivateError] = useState<string | null>(null);

  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const [activeSection, setActiveSection] = useState<'general' | 'printer' | 'licensing' | 'data' | 'about'>('general');
  
  const generalRef = useRef<HTMLDivElement>(null);
  const printerRef = useRef<HTMLDivElement>(null);
  const licensingRef = useRef<HTMLDivElement>(null);
  const dataRef    = useRef<HTMLDivElement>(null);
  const aboutRef   = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadSettings();
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, [loadSettings]);

  useEffect(() => {
    if (settings) {
      setLocalSettings(settings);
    }
  }, [settings]);



  const scrollToSection = (section: 'general' | 'printer' | 'licensing' | 'data' | 'about') => {
    setActiveSection(section);
    let ref: React.RefObject<HTMLDivElement | null> | undefined;
    if (section === 'general') ref = generalRef;
    if (section === 'printer') ref = printerRef;
    if (section === 'licensing') ref = licensingRef;
    if (section === 'data')    ref = dataRef;
    if (section === 'about')   ref = aboutRef;
    if (ref?.current) {
      ref.current.scrollIntoView({ behavior: 'smooth' });
    }
  };



  const handleSave = async () => {
    if (!localSettings) return;
    await updateSettings(localSettings);
    if (!useSettingsStore.getState().error) {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    }
  };

  const handleTestPrint = async () => {
    if (!localSettings) return;
    setTestPrintError(null);
    try {
      await testPrint(localSettings.printer);
    } catch (err: any) {
      setTestPrintError(err.message);
    }
  };

  const handleBackup = async () => {
    setIsBackingUp(true);
    setBackupSuccess(null);
    setBackupError(null);
    try {
      const response = await window.api.backup.export();
      if (response.success && response.data) {
        setBackupSuccess(`Backup created successfully.`);
      } else if (response.error && response.error.code !== 'BACKUP_CANCELLED') {
        setBackupError(response.error.message);
      }
    } catch (err: any) {
      setBackupError('Failed to trigger backup.');
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleRestoreSelect = async () => {
    setRestoreError(null);
    try {
      const response = await window.api.restore.validate();
      if (response.success && response.data) {
        setRestoreFilePath(response.data.filePath);
        setRestoreMetadata(response.data.metadata);
        setRestoreConfirmation('');
      } else if (response.error && response.error.code !== 'RESTORE_CANCELLED') {
        setRestoreError(response.error.message);
      }
    } catch (err: any) {
      setRestoreError('Failed to select restore file.');
    }
  };

  const executeRestore = async () => {
    if (restoreConfirmation !== 'RESTORE' || !restoreFilePath) return;
    setIsRestoring(true);
    setRestoreError(null);
    try {
      const draftResponse = await window.api.billing.hasActiveDraft();
      if (draftResponse.success && draftResponse.data) {
        setRestoreError('An active draft exists. Finish or discard the current bill before restoring a backup.');
        setIsRestoring(false);
        return;
      }
      const response = await window.api.restore.execute(restoreFilePath);
      if (response.success) {
        // App restarts
      } else if (response.error) {
        setRestoreError(response.error.message);
        setIsRestoring(false);
      }
    } catch (err: any) {
      setRestoreError('Failed to execute restore.');
      setIsRestoring(false);
    }
  };

  const handleFactoryReset = async () => {
    if (resetConfirmation !== 'FACTORY_RESET') return;
    setIsResetting(true);
    setResetError(null);
    setResetSuccess(null);
    try {
      const draftResponse = await window.api.billing.hasActiveDraft();
      if (draftResponse.success && draftResponse.data) {
        setResetError('An active draft exists. Finish or discard the current bill before resetting products.');
        setIsResetting(false);
        return;
      }
      const response = await window.api.system.factoryReset();
      if (response.success) {
        setResetSuccess('App data has been wiped. The application will restart in a moment...');
        setShowResetUI(false);
        setResetConfirmation('');
      } else {
        setResetError(response.error?.message || 'Failed to factory reset app.');
      }
    } catch (err: any) {
      setResetError('An unexpected error occurred while resetting app data.');
    } finally {
      setIsResetting(false);
    }
  };

  const handleDeactivate = async () => {
    setIsDeactivating(true);
    setDeactivateError(null);
    try {
      const draftResponse = await window.api.billing.hasActiveDraft();
      if (draftResponse.success && draftResponse.data) {
        setDeactivateError('An active draft exists. Finish or discard the current bill before deactivating.');
        setIsDeactivating(false);
        return;
      }
      const response = await window.api.licensing.deactivate();
      if (!response.success) {
        setDeactivateError(response.error?.message || 'Failed to deactivate license.');
      } else {
        // App will re-render to ActivationScreen automatically via licensing store refresh
        // But we must tell the store to fetch latest status.
        useLicensingStore.getState().fetchStatus();
      }
    } catch (err: any) {
      setDeactivateError('An unexpected error occurred during deactivation.');
    } finally {
      setIsDeactivating(false);
    }
  };

  if (isLoading && !localSettings) {
    return <div className="p-6 flex items-center justify-center h-screen w-screen bg-slate-50">Loading settings...</div>;
  }

  if (!localSettings) {
    return <div className="p-6 flex items-center justify-center h-screen w-screen bg-slate-50 text-red-600 font-bold">Error loading settings: {error}</div>;
  }

  const updateStore = (field: keyof StoreConfigDTO, value: string) => {
    setLocalSettings({ ...localSettings, store: { ...localSettings.store, [field]: value } });
  };

  const updatePrinter = (field: keyof PrinterConfig, value: any) => {
    setLocalSettings({ ...localSettings, printer: { ...localSettings.printer, [field]: value } });
  };

  const formattedDate = currentTime.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const formattedTime = currentTime.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-50 text-slate-900">
      {/* GLOBAL POS HEADER */}
      <header className="flex-none h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between z-20 relative shrink-0">
        <div className="flex items-center gap-3 w-1/3">
          <div className="flex items-center justify-center w-10 h-10 rounded-[10px] bg-indigo-600 text-white shadow-sm">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
          </div>
          <div className="flex flex-col">
            <h1 className="text-xl font-extrabold text-slate-900 leading-none tracking-tight">Mini POS For Harji</h1>
            <span className="text-[11px] font-medium text-slate-500 mt-0.5">Simple. Reliable. For Your Business.</span>
          </div>
        </div>
        
        <div className="flex items-center justify-center absolute left-1/2 -translate-x-1/2 gap-1">
          <button onClick={() => navigateTo('billing')} className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>
            Billing
          </button>
          <button onClick={() => navigateTo('products')} className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"></line><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
            Products
          </button>
          <button onClick={() => navigateTo('history')} className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
            History
          </button>
          <button className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-indigo-700 bg-indigo-50/70 relative group transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
            Settings
            <div className="absolute bottom-0 left-4 right-4 h-[3px] bg-indigo-600 rounded-t-full"></div>
          </button>
        </div>

        <div className="flex items-center justify-end gap-5 w-1/3">
          <div className="flex items-center gap-4">
            {localSettings?.printer?.enabled && (
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500"></div>
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Printer Configured</span>
              </div>
            )}
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

      {/* 3-COLUMN WORKSPACE */}
      <div className="flex-1 flex overflow-hidden p-6 gap-6 max-w-[1600px] mx-auto w-full">
        {/* LEFT NAV */}
        <div className="w-1/5 min-w-[220px] max-w-[280px] flex flex-col gap-2 shrink-0">
          <div className="mb-4">
            <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Settings</h2>
            <p className="text-sm text-slate-500 mt-1 font-medium">Manage your store, printer and application settings.</p>
          </div>
          
          <button 
            onClick={() => scrollToSection('general')}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-colors ${activeSection === 'general' ? 'bg-indigo-50/70 text-indigo-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
          >
            <svg className={`w-5 h-5 shrink-0 ${activeSection === 'general' ? 'text-indigo-600' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path></svg>
            <div>
              <div className="text-sm font-bold">General</div>
              <div className={`text-xs ${activeSection === 'general' ? 'text-indigo-500/80' : 'text-slate-400'}`}>Store information</div>
            </div>
          </button>
          
          <button 
            onClick={() => scrollToSection('printer')}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-colors ${activeSection === 'printer' ? 'bg-indigo-50/70 text-indigo-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
          >
            <svg className={`w-5 h-5 shrink-0 ${activeSection === 'printer' ? 'text-indigo-600' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
            <div>
              <div className="text-sm font-bold">Printer</div>
              <div className={`text-xs ${activeSection === 'printer' ? 'text-indigo-500/80' : 'text-slate-400'}`}>Printer configuration</div>
            </div>
          </button>

          <button 
            onClick={() => scrollToSection('licensing')}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-colors ${activeSection === 'licensing' ? 'bg-indigo-50/70 text-indigo-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
          >
            <svg className={`w-5 h-5 shrink-0 ${activeSection === 'licensing' ? 'text-indigo-600' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
            <div>
              <div className="text-sm font-bold">Licensing</div>
              <div className={`text-xs ${activeSection === 'licensing' ? 'text-indigo-500/80' : 'text-slate-400'}`}>License information</div>
            </div>
          </button>

          <button 
            data-testid="settings-tab-data"
            onClick={() => scrollToSection('data')}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-colors ${activeSection === 'data' ? 'bg-indigo-50/70 text-indigo-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
          >
            <svg className={`w-5 h-5 shrink-0 ${activeSection === 'data' ? 'text-indigo-600' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"></path></svg>
            <div>
              <div className="text-sm font-bold">Data Management</div>
              <div className={`text-xs ${activeSection === 'data' ? 'text-indigo-500/80' : 'text-slate-400'}`}>Backup & restore</div>
            </div>
          </button>



          <button 
            onClick={() => scrollToSection('about')}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-colors ${activeSection === 'about' ? 'bg-indigo-50/70 text-indigo-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
          >
            <svg className={`w-5 h-5 shrink-0 ${activeSection === 'about' ? 'text-indigo-600' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            <div>
              <div className="text-sm font-bold">About</div>
              <div className={`text-xs ${activeSection === 'about' ? 'text-indigo-500/80' : 'text-slate-400'}`}>App information</div>
            </div>
          </button>
        </div>


        {/* CENTER CONTENT */}
        <div className="flex-[55] flex flex-col gap-6 overflow-y-auto px-1 pb-16 hide-scrollbar relative">
          
          {/* GENERAL */}
          <div ref={generalRef} className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8 scroll-mt-6 shrink-0">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path></svg>
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900 tracking-tight">Store Information</h2>
                <p className="text-sm font-medium text-slate-500">Basic information about your store.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <Input
                label="Shop Name"
                type="text" 
                value={localSettings.store.shopName}
                onChange={(e) => updateStore('shopName', e.target.value)}
              />
              <Input
                label="Shop Phone"
                type="text" 
                value={localSettings.store.shopPhone}
                onChange={(e) => updateStore('shopPhone', e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-semibold text-slate-700">Shop Address</label>
              <textarea 
                value={localSettings.store.shopAddress}
                onChange={(e) => updateStore('shopAddress', e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-4 py-3 bg-slate-50 font-medium text-slate-900 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 min-h-[5rem]"
              />
            </div>
          </div>

          {/* PRINTER */}
          <div ref={printerRef} className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8 scroll-mt-6 shrink-0">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900 tracking-tight">Printer Configuration</h2>
                  <p className="text-sm font-medium text-slate-500">Configure your receipt printer settings.</p>
                </div>
              </div>
              
              <div className="flex items-center gap-3 bg-slate-50 px-4 py-2 rounded-xl border border-slate-200 shadow-sm shrink-0">
                <label className="text-sm font-bold text-slate-700 cursor-pointer select-none" htmlFor="printer-enabled-toggle">Enable Printer</label>
                <div className="relative inline-block w-11 mr-1 align-middle select-none transition duration-200 ease-in">
                    <input 
                      type="checkbox" 
                      id="printer-enabled-toggle"
                      checked={localSettings.printer.enabled} 
                      onChange={(e) => updatePrinter('enabled', e.target.checked)} 
                      className="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 border-slate-200 appearance-none cursor-pointer transition-transform duration-200 ease-in-out z-10" 
                      style={{ transform: localSettings.printer.enabled ? 'translateX(100%)' : 'translateX(0)', borderColor: localSettings.printer.enabled ? '#4f46e5' : '#cbd5e1' }}
                    />
                    <label 
                      htmlFor="printer-enabled-toggle"
                      className="toggle-label block overflow-hidden h-6 rounded-full bg-slate-200 cursor-pointer transition-colors duration-200 ease-in-out" 
                      style={{ backgroundColor: localSettings.printer.enabled ? '#818cf8' : '#cbd5e1' }}>
                    </label>
                </div>
              </div>
            </div>

            <div className={`space-y-5 transition-opacity duration-300 ${!localSettings.printer.enabled ? 'opacity-40 pointer-events-none grayscale-[50%]' : ''}`}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-semibold text-slate-700">Transport</label>
                  <select 
                    value={localSettings.printer.transport}
                    onChange={(e) => updatePrinter('transport', e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-4 py-3 bg-slate-50 text-slate-900 font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
                  >
                    <option value="fake">Fake (Console / Debug)</option>
                    <option value="network">Network</option>
                    <option value="usb">USB</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-semibold text-slate-700">Paper Width (mm)</label>
                  <select 
                    value={localSettings.printer.paperWidth}
                    onChange={(e) => updatePrinter('paperWidth', parseInt(e.target.value))}
                    className="w-full border border-slate-200 rounded-lg px-4 py-3 bg-slate-50 text-slate-900 font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
                  >
                    <option value={58}>58mm</option>
                    <option value={80}>80mm</option>
                  </select>
                </div>
              </div>

              {localSettings.printer.transport === 'network' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200 shadow-inner">
                  <Input label="Host IP" type="text" value={localSettings.printer.host || ''} onChange={(e) => updatePrinter('host', e.target.value)} placeholder="e.g. 192.168.1.100" />
                  <Input label="Port" type="number" value={localSettings.printer.port || 9100} onChange={(e) => updatePrinter('port', parseInt(e.target.value))} />
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input label="Characters Per Line" type="number" value={localSettings.printer.charactersPerLine} onChange={(e) => updatePrinter('charactersPerLine', parseInt(e.target.value))} />
                <Input label="Feed Lines" type="number" value={localSettings.printer.feedLines} onChange={(e) => updatePrinter('feedLines', parseInt(e.target.value))} />
              </div>

              <div className="flex items-center gap-3 pt-3 pb-1">
                <div className="relative inline-block w-9 align-middle select-none transition duration-200 ease-in">
                    <input 
                      type="checkbox" 
                      id="printer-cut" 
                      checked={localSettings.printer.supportsCut} 
                      onChange={(e) => updatePrinter('supportsCut', e.target.checked)} 
                      className="toggle-checkbox absolute block w-5 h-5 rounded-full bg-white border-4 border-slate-200 appearance-none cursor-pointer transition-transform duration-200 ease-in-out z-10" 
                      style={{ transform: localSettings.printer.supportsCut ? 'translateX(100%)' : 'translateX(0)', borderColor: localSettings.printer.supportsCut ? '#4f46e5' : '#cbd5e1' }}
                    />
                    <label 
                      htmlFor="printer-cut"
                      className="toggle-label block overflow-hidden h-5 rounded-full bg-slate-200 cursor-pointer transition-colors duration-200 ease-in-out" 
                      style={{ backgroundColor: localSettings.printer.supportsCut ? '#818cf8' : '#cbd5e1' }}>
                    </label>
                </div>
                <div>
                  <label htmlFor="printer-cut" className="text-sm font-bold text-slate-900 cursor-pointer select-none">Supports Auto-Cut</label>
                  <p className="text-xs text-slate-500 font-medium">Automatically cut paper after printing</p>
                </div>
              </div>

              <div className="pt-5 flex items-center justify-between border-t border-slate-100 mt-2">
                <div className="flex-1">
                  {testPrintError && <span className="text-sm font-bold text-red-600 bg-red-50 px-3 py-1.5 rounded-lg border border-red-100">{testPrintError}</span>}
                </div>
                <button 
                  onClick={handleTestPrint}
                  className="px-5 py-2.5 border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-50 transition-colors shadow-sm bg-white flex items-center gap-2 active:scale-95"
                >
                  <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
                  Test Print
                </button>
              </div>
            </div>
          </div>

          {/* LICENSING */}
          <div ref={licensingRef} className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8 scroll-mt-6 shrink-0">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900 tracking-tight">Licensing</h2>
                <p className="text-sm font-medium text-slate-500">View your current license status.</p>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-600">Status</span>
                {licensingStatus?.state === 'ACTIVE' ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                    <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                    Active
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold bg-amber-100 text-amber-800 border border-amber-200">
                    <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                    {licensingStatus?.state || 'Unknown'}
                  </span>
                )}
              </div>
              
              {licensingStatus?.state === 'ACTIVE' && (
                <>
                  <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                    <span className="text-sm font-semibold text-slate-600">License ID</span>
                    <span className="text-sm font-medium font-mono text-slate-900">{licensingStatus.licenseId ? 'XXXX-XXXX-' + licensingStatus.licenseId.split('-').pop() : 'N/A'}</span>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                    <span className="text-sm font-semibold text-slate-600">Valid From</span>
                    <span className="text-sm font-medium text-slate-900">{licensingStatus.validFrom ? new Date(licensingStatus.validFrom).toLocaleDateString() : 'N/A'}</span>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                    <span className="text-sm font-semibold text-slate-600">Valid Until</span>
                    <span className="text-sm font-medium text-slate-900">{licensingStatus.validUntil ? new Date(licensingStatus.validUntil).toLocaleDateString() : 'N/A'}</span>
                  </div>
                  
                  <div className="pt-4 mt-2 border-t border-slate-200">
                    {!showDeactivateConfirm ? (
                      <button 
                        onClick={() => {
                          setShowDeactivateConfirm(true);
                          setDeactivateError(null);
                        }}
                        className="px-4 py-2 border border-red-200 text-red-700 bg-red-50 font-bold rounded-lg hover:bg-red-100 transition-colors shadow-sm text-sm"
                      >
                        Deactivate License...
                      </button>
                    ) : (
                      <div className="bg-red-50 border border-red-200 p-4 rounded-xl">
                        <h4 className="font-bold text-red-800 mb-2">Confirm Deactivation</h4>
                        <p className="text-sm text-red-700 mb-4 font-medium">
                          Deactivating will remove the license from this device and require an active internet connection. You can reuse this license on another device.
                        </p>
                        <div className="flex items-center gap-3">
                          <button 
                            onClick={handleDeactivate}
                            disabled={isDeactivating}
                            className="px-4 py-2 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 active:scale-95 text-sm shadow-sm"
                          >
                            {isDeactivating ? 'Deactivating...' : 'Confirm Deactivate'}
                          </button>
                          <button 
                            onClick={() => setShowDeactivateConfirm(false)}
                            disabled={isDeactivating}
                            className="px-4 py-2 border border-slate-300 text-slate-700 bg-white font-bold rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50 text-sm"
                          >
                            Cancel
                          </button>
                        </div>
                        {deactivateError && <p className="text-sm font-bold text-red-600 mt-3">{deactivateError}</p>}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* DATA MANAGEMENT */}
          <div ref={dataRef} className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8 scroll-mt-6 shrink-0">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-10 h-10 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"></path></svg>
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900 tracking-tight">Data Management</h2>
                <p className="text-sm font-medium text-slate-500">Backup, restore or reset your application data.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* BACKUP */}
              <div className="p-5 border border-slate-200 rounded-xl bg-slate-50 flex flex-col items-center text-center shadow-sm">
                <div className="w-12 h-12 rounded-full bg-slate-200 border border-slate-300 text-slate-600 flex items-center justify-center mb-4">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"></path></svg>
                </div>
                <h3 className="font-bold text-slate-900 mb-1">Backup Database</h3>
                <p className="text-xs text-slate-500 mb-5 flex-1 font-medium leading-relaxed">Create a local copy of your Mini POS data for safekeeping.</p>
                <button 
                  onClick={handleBackup} disabled={isBackingUp}
                  className="w-full px-4 py-2.5 bg-white border border-slate-300 text-slate-700 font-bold rounded-lg shadow-sm hover:bg-slate-100 transition-colors active:scale-95 disabled:opacity-50"
                >
                  {isBackingUp ? 'Backing up...' : 'Backup Database'}
                </button>
                {backupSuccess && <p className="text-xs font-bold text-emerald-600 mt-3 bg-emerald-50 px-2 py-1 rounded w-full">{backupSuccess}</p>}
                {backupError && <p className="text-xs font-bold text-red-600 mt-3 bg-red-50 px-2 py-1 rounded w-full">{backupError}</p>}
              </div>

              {/* RESTORE */}
              <div className="p-5 border border-amber-200 rounded-xl bg-amber-50 flex flex-col items-center text-center relative overflow-hidden shadow-sm">
                <div className="w-12 h-12 rounded-full bg-amber-200 border border-amber-300 text-amber-700 flex items-center justify-center mb-4">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path></svg>
                </div>
                <h3 className="font-bold text-amber-900 mb-1">Restore Database</h3>
                <p className="text-xs text-amber-700 mb-5 flex-1 font-medium leading-relaxed">Replace current data with a previously created backup.</p>
                <button 
                  onClick={handleRestoreSelect} disabled={!!restoreMetadata}
                  className="w-full px-4 py-2.5 bg-white border border-amber-300 text-amber-800 font-bold rounded-lg shadow-sm hover:bg-amber-100 transition-colors active:scale-95 disabled:opacity-50"
                >
                  Restore Database
                </button>
                {restoreError && <p className="text-xs font-bold text-red-600 mt-3 bg-red-50 px-2 py-1 rounded w-full border border-red-100">{restoreError}</p>}
              </div>

              {/* FACTORY RESET */}
              <div className="p-5 border border-red-200 rounded-xl bg-red-50 flex flex-col items-center text-center shadow-sm">
                <div className="w-12 h-12 rounded-full bg-red-200 border border-red-300 text-red-700 flex items-center justify-center mb-4">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                </div>
                <h3 className="font-bold text-red-900 mb-1">Factory Reset</h3>
                <p className="text-xs text-red-700 mb-5 flex-1 font-medium leading-relaxed">Permanently delete all products, history, and settings.</p>
                <button 
                  onClick={() => {
                    setShowResetUI(true);
                    setResetError(null);
                    setResetSuccess(null);
                    setResetConfirmation('');
                  }} 
                  disabled={showResetUI}
                  className="w-full px-4 py-2.5 bg-white border border-red-300 text-red-800 font-bold rounded-lg shadow-sm hover:bg-red-100 transition-colors active:scale-95 disabled:opacity-50"
                >
                  Factory Reset
                </button>
              </div>
            </div>

            {/* RESTORE CONFIRMATION UI */}
            {restoreMetadata && (
              <div className="mt-6 p-6 border-2 border-red-200 bg-red-50 rounded-xl text-red-900 shadow-inner">
                <h4 className="font-bold mb-2 text-red-700 flex items-center gap-2 text-lg">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                  Warning: Destructive Operation
                </h4>
                <p className="text-sm mb-4 font-medium">
                  Restoring this backup will completely overwrite your current Mini POS data. 
                  Any sales made since this backup was created will be permanently lost.
                </p>
                <ul className="text-sm space-y-1 mb-5 opacity-90 list-disc list-inside font-semibold bg-white/70 p-4 rounded-lg border border-red-100">
                  <li>Backup timestamp: {restoreMetadata.timestamp ? new Date(restoreMetadata.timestamp).toLocaleString() : 'Unknown'}</li>
                  <li>Schema version: {restoreMetadata.schemaVersion}</li>
                </ul>

                {restoreMetadata.isOlder && (
                  <p className="text-sm mb-4 font-bold text-amber-700 bg-amber-100 p-3 rounded-lg border border-amber-200">
                    This backup is from an older version of Mini POS and will be migrated automatically.
                  </p>
                )}

                <div className="bg-white p-5 rounded-xl border border-red-200 shadow-sm mt-2">
                  <label className="block text-sm font-semibold mb-3">
                    Type <strong className="text-red-700 font-bold bg-red-50 px-2 py-0.5 rounded border border-red-100 tracking-widest">RESTORE</strong> to confirm
                  </label>
                  <div className="flex gap-3">
                    <input 
                      type="text" 
                      value={restoreConfirmation}
                      onChange={(e) => setRestoreConfirmation(e.target.value)}
                      placeholder="RESTORE"
                      className="flex-1 px-4 py-2.5 border-2 border-red-200 rounded-lg bg-slate-50 text-red-900 font-bold outline-none focus:border-red-500 focus:ring-4 focus:ring-red-500/20 transition-all uppercase"
                      disabled={isRestoring}
                    />
                    <button 
                      onClick={executeRestore}
                      disabled={restoreConfirmation !== 'RESTORE' || isRestoring}
                      className="px-6 py-2.5 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:bg-red-400 active:scale-95 shadow-sm shadow-red-200"
                    >
                      {isRestoring ? 'Restoring...' : 'Confirm Restore'}
                    </button>
                    <button 
                      onClick={() => {
                        setRestoreMetadata(null);
                        setRestoreFilePath(null);
                        setRestoreConfirmation('');
                        setRestoreError(null);
                      }}
                      disabled={isRestoring}
                      className="px-6 py-2.5 border border-slate-300 text-slate-700 font-bold rounded-lg hover:bg-slate-100 transition-colors active:scale-95"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* RESET CONFIRMATION UI */}
            {showResetUI && (
              <div className="mt-6 p-6 border-2 border-red-200 bg-red-50 rounded-xl text-red-900 shadow-inner">
                <h4 className="font-bold mb-2 text-red-700 flex items-center gap-2 text-lg">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                  Warning: Destructive Operation
                </h4>
                <p className="text-sm mb-4 font-medium">
                  This will instantly and permanently delete <strong>everything</strong> from the system (products, finalized bills, history, drafts, and all settings). 
                  The app will restart fresh. This action cannot be undone unless you have a recent backup.
                </p>

                <div className="bg-white p-5 rounded-xl border border-red-200 shadow-sm mt-2">
                  <label className="block text-sm font-semibold mb-3">
                    Type <strong className="text-red-700 font-bold bg-red-50 px-2 py-0.5 rounded border border-red-100 tracking-widest">FACTORY_RESET</strong> to confirm
                  </label>
                  <div className="flex gap-3">
                    <input 
                      type="text" 
                      value={resetConfirmation}
                      onChange={(e) => setResetConfirmation(e.target.value)}
                      placeholder="FACTORY_RESET"
                      className="flex-1 px-4 py-2.5 border-2 border-red-200 rounded-lg bg-slate-50 text-red-900 font-bold outline-none focus:border-red-500 focus:ring-4 focus:ring-red-500/20 transition-all uppercase"
                      disabled={isResetting}
                    />
                    <button 
                      onClick={handleFactoryReset}
                      disabled={resetConfirmation !== 'FACTORY_RESET' || isResetting}
                      className="px-6 py-2.5 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:bg-red-400 active:scale-95 shadow-sm shadow-red-200"
                    >
                      {isResetting ? 'Resetting...' : 'Confirm Reset'}
                    </button>
                    <button 
                      onClick={() => {
                        setShowResetUI(false);
                        setResetConfirmation('');
                        setResetError(null);
                      }}
                      disabled={isResetting}
                      className="px-6 py-2.5 border border-slate-300 text-slate-700 font-bold rounded-lg hover:bg-slate-100 transition-colors active:scale-95"
                    >
                      Cancel
                    </button>
                  </div>
                  {resetError && <p className="text-sm font-bold text-red-600 mt-4 bg-red-50 p-2 rounded border border-red-100">{resetError}</p>}
                  {resetSuccess && <p className="text-sm font-bold text-emerald-600 mt-4 bg-emerald-50 p-2 rounded border border-emerald-100">{resetSuccess}</p>}
                </div>
              </div>
            )}
          </div>



          {/* ABOUT */}
          <div ref={aboutRef} className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8 scroll-mt-6 shrink-0">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900 tracking-tight">About</h2>
                <p className="text-sm font-medium text-slate-500">App information</p>
              </div>
            </div>
            <div className="p-5 bg-slate-50 rounded-xl border border-slate-200 text-sm shadow-inner">
              <div className="flex justify-between py-3 border-b border-slate-200">
                <span className="font-bold text-slate-600">Application</span>
                <span className="font-extrabold text-slate-900">Mini POS</span>
              </div>
              <div className="flex justify-between py-3 border-b border-slate-200">
                <span className="font-bold text-slate-600">Version</span>
                <span className="font-extrabold text-slate-900">1.0.0</span>
              </div>
              <div className="flex justify-between py-3">
                <span className="font-bold text-slate-600">Architecture</span>
                <span className="font-extrabold text-slate-900">Offline Local Storage</span>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT PANEL (HELP + SAVE) */}
        <div className="w-1/4 min-w-[260px] max-w-[320px] shrink-0 flex flex-col gap-6">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col h-full overflow-y-auto hide-scrollbar">
            <div className="flex items-center gap-2 mb-6">
              <svg className="w-5 h-5 text-indigo-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
              <h3 className="font-extrabold text-slate-900 text-lg tracking-tight">Need Help?</h3>
            </div>
            
            <p className="text-sm text-slate-500 font-bold mb-6">Here are some quick tips:</p>
            
            <div className="space-y-6 flex-1">
              <div>
                <h4 className="text-sm font-bold text-slate-900">Store Information</h4>
                <p className="text-xs text-slate-500 mt-1 font-medium leading-relaxed">Set your shop name, address and contact details to appear on receipts.</p>
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900">Printer Configuration</h4>
                <p className="text-xs text-slate-500 mt-1 font-medium leading-relaxed">Configure your receipt printer settings and test printing before finalizing sales.</p>
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900">Data Management</h4>
                <p className="text-xs text-slate-500 mt-1 font-medium leading-relaxed">Create backups regularly. Restore replaces the current database with the selected backup.</p>
              </div>
              <div>
                <h4 className="text-sm font-bold text-red-600">Factory Reset</h4>
                <p className="text-xs text-slate-500 mt-1 font-medium leading-relaxed">This will permanently delete all data. This action cannot be undone.</p>
              </div>
            </div>

            <div className="mt-8 p-5 bg-slate-50 rounded-xl border border-slate-200 shadow-sm">
              <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-2">
                <svg className="w-4 h-4 text-slate-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"></path></svg>
                SQLite Storage
              </h4>
              <p className="text-xs text-slate-500 font-medium leading-relaxed">
                Mini POS stores its core data locally using SQLite for offline operation. Keep a backup to stay safe!
              </p>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 shrink-0 flex flex-col gap-3">
            <button 
              onClick={handleSave} 
              disabled={isLoading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold py-3.5 px-4 rounded-xl shadow-sm shadow-indigo-200 transition-all active:scale-[0.98] disabled:opacity-70 disabled:active:scale-100 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                  Save Settings
                </>
              )}
            </button>
            {saveSuccess && (
              <div className="flex items-center justify-center gap-1.5 text-emerald-700 text-sm font-bold bg-emerald-50 py-2.5 rounded-lg border border-emerald-100">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                Settings saved successfully
              </div>
            )}
            {error && (
              <div className="text-center text-red-700 text-sm font-bold bg-red-50 py-2.5 rounded-lg border border-red-100">
                {error}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
