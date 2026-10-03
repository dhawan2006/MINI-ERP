import { create } from 'zustand';
import { LicensingStatusDTO } from '../../shared/licensing-dto';

export interface LicensingState {
  status: LicensingStatusDTO | null;
  isInitializing: boolean;
  activationError: string | null;
  isActivating: boolean;

  fetchStatus: () => Promise<void>;
  activate: (licenseKey: string) => Promise<void>;
  setStatus: (dto: LicensingStatusDTO) => void;
  clearError: () => void;
  verifyNow: () => Promise<void>;
}

export const useLicensingStore = create<LicensingState>((set) => ({
  status: null,
  isInitializing: true,
  activationError: null,
  isActivating: false,

  fetchStatus: async () => {
    console.log('[DEBUG] fetchStatus called');
    try {
      const response = await window.api.licensing.getState();
      if (response.success && response.data) {
        console.log("LIC: DONE"); console.log('[DEBUG] fetchStatus DONE SUCCESS');
        set({ status: response.data, isInitializing: false });
      } else {
        console.log('[DEBUG] fetchStatus DONE ERROR');
        set({ status: { state: 'STORAGE_ERROR' }, isInitializing: false });
      }
    } catch (err: any) {
      console.log('[DEBUG] fetchStatus DONE ERROR');
        set({ status: { state: 'STORAGE_ERROR' }, isInitializing: false });
    }
  },

  activate: async (licenseKey: string) => {
    set({ isActivating: true, activationError: null });
    try {
      const response = await window.api.licensing.activate(licenseKey);
      if (response.success && response.data) {
        set({ status: response.data, isActivating: false });
      } else {
        set({
          activationError: response.error?.message || 'Failed to activate',
          isActivating: false
        });
      }
    } catch (err: any) {
      set({
        activationError: err.message || 'An unexpected error occurred',
        isActivating: false
      });
    }
  },

  setStatus: (dto: LicensingStatusDTO) => set({ status: dto, isInitializing: false }),
  clearError: () => set({ activationError: null }),
  verifyNow: async () => {
    try {
      const response = await window.api.licensing.verifyNow();
      if (response.success && response.data) {
        set({ status: response.data });
      }
    } catch (err) {
      console.error('Failed to verify license:', err);
    }
  },
}));

// Setup listener
if (typeof window !== 'undefined' && window.api?.licensing?.onStateChanged) {
  window.api.licensing.onStateChanged((dto) => {
    useLicensingStore.getState().setStatus(dto);
  });
}
