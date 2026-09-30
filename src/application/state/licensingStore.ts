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
}

export const useLicensingStore = create<LicensingState>((set) => ({
  status: null,
  isInitializing: true,
  activationError: null,
  isActivating: false,

  fetchStatus: async () => {
    try {
      const response = await window.api.licensing.getState();
      if (response.success && response.data) {
        set({ status: response.data, isInitializing: false });
      } else {
        set({ status: { state: 'STORAGE_ERROR' }, isInitializing: false });
      }
    } catch (err: any) {
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
}));

// Setup listener
if (typeof window !== 'undefined' && window.api?.licensing?.onStateChanged) {
  window.api.licensing.onStateChanged((dto) => {
    useLicensingStore.getState().setStatus(dto);
  });
}
