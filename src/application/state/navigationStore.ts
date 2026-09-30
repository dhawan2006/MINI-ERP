import { create } from 'zustand';

export type View = 'billing' | 'history' | 'settings' | 'products';

interface NavigationState {
  currentView: View;
  navigateTo: (view: View) => void;
}

export const useNavigationStore = create<NavigationState>((set) => ({
  currentView: 'billing',
  navigateTo: (view) => set({ currentView: view }),
}));

// Setup global keyboard shortcut
export function setupNavigationShortcuts() {
  window.addEventListener('keydown', (e) => {
    // Cmd/Ctrl + H -> History
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'h') {
      e.preventDefault();
      useNavigationStore.getState().navigateTo('history');
    }
    // Cmd/Ctrl + B -> Billing
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
      e.preventDefault();
      useNavigationStore.getState().navigateTo('billing');
    }
    // Cmd/Ctrl + , -> Settings
    if ((e.metaKey || e.ctrlKey) && e.key === ',') {
      e.preventDefault();
      useNavigationStore.getState().navigateTo('settings');
    }
    // Cmd/Ctrl + P -> Products
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'p') {
      e.preventDefault();
      useNavigationStore.getState().navigateTo('products');
    }
  });
}
