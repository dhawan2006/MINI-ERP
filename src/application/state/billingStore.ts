import { create } from 'zustand';
import { ActiveBillDTO, FinalizedBillDTO, ProductDTO, PrintJobState, PdfExportResultDTO } from '../../shared/dto';

type PdfExportState = 'idle' | 'exporting' | 'saved' | 'failed';

interface BillingState {
  // Authoritative State
  currentBill: ActiveBillDTO | null;
  lastFinalizedBill: FinalizedBillDTO | null;

  // UI / Transient State
  isLoading: boolean;
  isFinalizing: boolean; // Guard against double-finalize
  error: string | null;
  scanError: string | null;
  selectedBillItemId: string | null;
  editingBillItemId: string | null;
  searchText: string;
  searchResults: ProductDTO[];
  searchError: string | null;
  searchSelectedIndex: number | null;
  printJobState: PrintJobState | null;
  printJobError: string | null;

  // PDF Export UI State (ephemeral — not billing state)
  pdfExportState: PdfExportState;
  pdfExportError: string | null;
  lastExportedPdf: PdfExportResultDTO | null;

  // Actions
  loadDraft: () => Promise<void>;
  addProduct: (productId: string) => Promise<void>;
  scanBarcode: (barcode: string) => Promise<void>;
  setQuantity: (productId: string, quantity: number) => Promise<void>;
  removeItem: (productId: string) => Promise<void>;
  undo: () => Promise<void>;
  clear: () => Promise<void>;
  finalize: () => Promise<boolean>;
  triggerPrint: (billId: number) => Promise<void>;
  retryPrint: (billId: number) => Promise<void>;
  pollPrintJob: (jobId: string) => void;
  exportPdf: (billId: number) => Promise<void>;
  openPdf: (filePath: string) => Promise<void>;

  // UI Actions
  setSelectedBillItemId: (id: string | null) => void;
  setEditingBillItemId: (id: string | null) => void;
  setSearchText: (text: string) => void;
  searchProducts: (prefix: string) => Promise<void>;
  clearSearch: () => void;
  setSearchSelectedIndex: (index: number | null) => void;
  moveSearchSelection: (direction: 1 | -1) => void;

  _updateBillState: (response: unknown) => void;
}


export const useBillingStore = create<BillingState>((set, get) => ({
  currentBill: null,
  lastFinalizedBill: null,
  isLoading: false,
  isFinalizing: false,
  error: null,
  scanError: null,
  selectedBillItemId: null,
  editingBillItemId: null,
  searchText: '',
  searchResults: [],
  searchError: null,
  searchSelectedIndex: null,
  printJobState: null,
  printJobError: null,
  pdfExportState: 'idle',
  pdfExportError: null,
  lastExportedPdf: null,

  // Helper to maintain selection if item still exists
  _updateBillState: (response: unknown) => {
    const res = response as { success: boolean; data?: ActiveBillDTO; error?: { message: string } };
    if (res.success && res.data) {
      const newBill = res.data;
      // Check if selected item still exists
      const currentSelected = get().selectedBillItemId;
      const stillExists = newBill.items.some(item => item.productId === currentSelected);

      set({
        currentBill: newBill,
        isLoading: false,
        selectedBillItemId: stillExists ? currentSelected : null,
        error: null,
        scanError: null
      });
    } else {
      set({ error: res.error?.message || 'Unknown error', isLoading: false });
    }
  },

  loadDraft: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await window.api.billing.loadDraft();
      get()._updateBillState(response);
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },

  addProduct: async (productId: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await window.api.billing.addProduct(productId);
      get()._updateBillState(response);
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },

  scanBarcode: async (barcode: string) => {
    set({ isLoading: true, scanError: null });
    try {
      const response = await window.api.billing.addByBarcode(barcode);
      if (response.success && response.data) {
        get()._updateBillState(response);
        set({ searchText: '', searchResults: [], searchError: null, searchSelectedIndex: null });
      } else {
        set({ 
          scanError: response.error?.message || 'Unknown barcode', 
          isLoading: false 
        });
        setTimeout(() => {
          if (get().scanError) set({ scanError: null });
        }, 3000);
      }
    } catch (err: any) {
      set({ scanError: err.message, isLoading: false });
    }
  },

  setQuantity: async (productId: string, quantity: number) => {
    set({ isLoading: true, error: null });
    try {
      const response = await window.api.billing.setQuantity(productId, quantity);
      get()._updateBillState(response);
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },

  removeItem: async (productId: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await window.api.billing.removeItem(productId);
      get()._updateBillState(response);
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },

  undo: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await window.api.billing.undo();
      get()._updateBillState(response);
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },

  clear: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await window.api.billing.clear();
      get()._updateBillState(response);
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },

  finalize: async () => {
    // Guard: prevent duplicate finalization from double-click or rapid keyboard
    if (get().isFinalizing) return false;
    set({ isLoading: true, isFinalizing: true, error: null });
    try {
      const response = await window.api.billing.finalize();
      if (response.success && response.data) {
        const finalizedBill = response.data;
        set({
          lastFinalizedBill: finalizedBill,
          currentBill: { items: [], totalMinor: 0, isEmpty: true },
          selectedBillItemId: null,
          isLoading: false,
          isFinalizing: false
        });

        // Fire and forget printing asynchronously. We don't block the UI.
        get().triggerPrint(finalizedBill.id);

        return true;
      } else {
        set({ error: response.error?.message || 'Finalization failed', isLoading: false, isFinalizing: false });
        return false;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'IPC Finalization failed';
      set({ error: msg, isLoading: false, isFinalizing: false });
      return false;
    }
  },

  triggerPrint: async (billId: number) => {
    // We intentionally don't set isLoading here since we don't want to block the user.
    try {
      const response = await window.api.printing.createPrintJob(billId);
      if (response.success && response.data) {
        const jobId = response.data;
        set({ printJobState: 'PRINTING', printJobError: null });
        get().pollPrintJob(jobId);
      } else {
        set({ printJobState: 'FAILED', printJobError: response.error?.message || 'Failed to start print' });
      }
    } catch (err: any) {
      set({ printJobState: 'FAILED', printJobError: err.message || 'Print IPC failed' });
    }
  },

  retryPrint: async (billId: number) => {
    set({ printJobState: 'PRINTING', printJobError: null });
    try {
      const response = await window.api.printing.retryPrintJob(billId);
      if (response.success && response.data) {
        get().pollPrintJob(response.data);
      } else {
        set({ printJobState: 'FAILED', printJobError: response.error?.message || 'Failed to retry print' });
      }
    } catch (err: any) {
      set({ printJobState: 'FAILED', printJobError: err.message || 'Print retry IPC failed' });
    }
  },

  pollPrintJob: (jobId: string) => {
    // Poll every 500ms until ACCEPTED or FAILED, with a 30s hard timeout
    let cancelled = false;
    const MAX_POLLS = 60; // 30 seconds at 500ms
    let pollCount = 0;

    const checkStatus = async () => {
      if (cancelled) return;
      if (pollCount++ >= MAX_POLLS) {
        set({ printJobState: 'FAILED', printJobError: 'Print job timed out' });
        return;
      }
      try {
        const res = await window.api.printing.getJobStatus(jobId);
        if (cancelled) return;
        if (res.success && res.data) {
          if (res.data.state === 'ACCEPTED') {
            set({ printJobState: 'ACCEPTED', printJobError: null });
            // Auto-clear after 3s
            setTimeout(() => {
              if (!cancelled && get().printJobState === 'ACCEPTED') {
                set({ printJobState: null });
              }
            }, 3000);
          } else if (res.data.state === 'FAILED') {
            set({ printJobState: 'FAILED', printJobError: res.data.error || 'Print failed' });
          } else {
            // Still QUEUED or PRINTING — keep polling
            setTimeout(checkStatus, 500);
          }
        }
      } catch {
        // IPC failure — stop polling, mark failed
        if (!cancelled) set({ printJobState: 'FAILED', printJobError: 'Print status check failed' });
      }
    };
    setTimeout(checkStatus, 500);
  },

  setSelectedBillItemId: (id: string | null) => set({ selectedBillItemId: id }),
  
  setEditingBillItemId: (id: string | null) => set({ editingBillItemId: id }),
  
  setSearchText: (text: string) => set({ searchText: text }),

  searchProducts: async (prefix: string) => {
    if (!prefix.trim()) {
      set({ searchResults: [], searchError: null });
      return;
    }
    
    // Check barcode first (exact match)
    const exactResponse = await window.api.products.findByBarcode(prefix);
    if (exactResponse.success && exactResponse.data) {
      set({ searchResults: [exactResponse.data], searchError: null });
      return;
    }

    // Fallback to name search
    const searchResponse = await window.api.products.searchActiveByPrefix(prefix);
    if (searchResponse.success && searchResponse.data) {
      if (searchResponse.data.length === 0) {
        set({ searchResults: [], searchError: 'No products found.' });
      } else {
        set({ searchResults: searchResponse.data, searchError: null });
      }
    } else {
      set({ searchError: searchResponse.error?.message || 'Search failed', searchResults: [] });
    }
  },

  clearSearch: () => set({ searchText: '', searchResults: [], searchError: null, searchSelectedIndex: null }),

  setSearchSelectedIndex: (index: number | null) => set({ searchSelectedIndex: index }),

  moveSearchSelection: (direction: 1 | -1) => {
    const { searchResults, searchSelectedIndex } = get();
    if (searchResults.length === 0) return;
    
    if (searchSelectedIndex === null) {
      set({ searchSelectedIndex: direction === 1 ? 0 : searchResults.length - 1 });
    } else {
      let newIndex = searchSelectedIndex + direction;
      if (newIndex < 0) newIndex = 0;
      if (newIndex >= searchResults.length) newIndex = searchResults.length - 1;
      set({ searchSelectedIndex: newIndex });
    }
  },

  exportPdf: async (billId: number) => {
    set({ pdfExportState: 'exporting', pdfExportError: null, lastExportedPdf: null });
    const response = await window.api.pdf.exportBill(billId);
    if (response.success && response.data) {
      set({ pdfExportState: 'saved', lastExportedPdf: response.data });
      // Auto-reset after 10s so toast doesn't linger
      setTimeout(() => {
        if (get().pdfExportState === 'saved') set({ pdfExportState: 'idle', lastExportedPdf: null });
      }, 10000);
    } else if (response.error?.code === 'PDF_SAVE_CANCELLED') {
      // User pressed Cancel — not an error, just reset silently
      set({ pdfExportState: 'idle' });
    } else {
      set({ pdfExportState: 'failed', pdfExportError: response.error?.message || 'PDF export failed' });
    }
  },

  openPdf: async (filePath: string) => {
    await window.api.pdf.openFile(filePath);
    // Errors from openFile are best-effort; don't interrupt cashier workflow
  },
}));
