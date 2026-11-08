import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import type { AdminContext } from '../api/types';
import { getAdminContext } from '../api/auth';
import { supabase } from '../supabase';

interface AuthState {
  session: Session | null;
  context: AdminContext | null;
  loading: boolean;
  setSession: (session: Session | null) => void;
  fetchContext: () => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  context: null,
  loading: true,
  setSession: (session) => {
    set({ session });
    if (session && !get().context) {
      get().fetchContext();
    } else if (!session) {
      set({ context: null, loading: false });
    }
  },
  fetchContext: async () => {
    try {
      const context = await getAdminContext();
      set({ context, loading: false });
    } catch (e) {
      // If fetching context fails (e.g., 401 or 403), sign out
      set({ context: null, loading: false });
      await supabase.auth.signOut();
    }
  },
  logout: async () => {
    await supabase.auth.signOut();
    set({ session: null, context: null });
  }
}));
