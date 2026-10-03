import { create } from 'zustand';
import { SetupStateDTO } from '../../shared/setup-dto';

interface SetupState {
  state: SetupStateDTO | null;
  isInitializing: boolean;
  error: string | null;
  fetchState: () => Promise<void>;
  saveStoreProfile: (shopName: string) => Promise<boolean>;
  completeSetup: () => Promise<boolean>;
}

export const useSetupStore = create<SetupState>((set) => ({
  state: null,
  isInitializing: true,
  error: null,
  
  fetchState: async () => {
    console.log('[DEBUG] fetchSetupState called');
    try {
      const response = await window.api.setup.getState();
      if (response.success && response.data) {
        set({ state: response.data, error: null });
      } else {
        set({ error: response.error?.message || 'Failed to fetch setup state' });
      }
    } catch (error: any) {
      set({ error: error.message });
    } finally {
      console.log('[DEBUG] fetchSetupState FINALLY');
      set({ isInitializing: false });
    }
  },

  saveStoreProfile: async (shopName: string) => {
    try {
      set({ error: null });
      const response = await window.api.setup.saveStoreProfile(shopName);
      if (response.success && response.data) {
        set({ state: response.data });
        return true;
      }
      set({ error: response.error?.message || 'Failed to save store profile' });
      return false;
    } catch (error: any) {
      set({ error: error.message });
      return false;
    }
  },

  completeSetup: async () => {
    try {
      set({ error: null });
      const response = await window.api.setup.complete();
      if (response.success && response.data) {
        set({ state: response.data });
        return true;
      }
      set({ error: response.error?.message || 'Failed to complete setup' });
      return false;
    } catch (error: any) {
      set({ error: error.message });
      return false;
    }
  }
}));
