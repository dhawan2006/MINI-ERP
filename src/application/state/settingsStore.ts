import { create } from 'zustand';
import { AppSettingsDTO, PrinterConfig } from '../../shared/dto';

interface SettingsState {
  settings: AppSettingsDTO | null;
  isLoading: boolean;
  error: string | null;
  loadSettings: () => Promise<void>;
  updateSettings: (settings: AppSettingsDTO) => Promise<void>;
  testPrint: (draftConfig: PrinterConfig) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: null,
  isLoading: false,
  error: null,

  loadSettings: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await window.api.settings.get();
      if (response.success && response.data) {
        set({ settings: response.data, isLoading: false });
      } else {
        set({ error: response.error?.message || 'Failed to load settings', isLoading: false });
      }
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },

  updateSettings: async (settings: AppSettingsDTO) => {
    set({ isLoading: true, error: null });
    try {
      const response = await window.api.settings.update(settings);
      if (response.success && response.data) {
        set({ settings: response.data, isLoading: false });
      } else {
        set({ error: response.error?.message || 'Failed to update settings', isLoading: false });
      }
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },

  testPrint: async (draftConfig: PrinterConfig) => {
    try {
      const response = await window.api.settings.testPrint(draftConfig);
      if (!response.success) {
        throw new Error(response.error?.message || 'Test print failed');
      }
    } catch (err: any) {
      throw err;
    }
  }
}));
