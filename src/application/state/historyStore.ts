import { create } from 'zustand';
import { BillHistoryListItemDTO, BillHistoryDetailDTO } from '../../shared/dto';

export type DateFilterOption = 'ALL_TIME' | 'TODAY' | 'YESTERDAY' | 'LAST_7_DAYS';

interface HistoryState {
  list: BillHistoryListItemDTO[];
  totalCount: number;
  loadingList: boolean;

  selectedBillId: number | null;
  selectedBillDetail: BillHistoryDetailDTO | null;
  loadingDetail: boolean;

  // Search & Filter state
  searchBillNumber: string;
  dateFilter: DateFilterOption;

  // Pagination state
  currentPage: number;
  pageSize: number;

  // Transient action errors
  actionError: string | null;

  // Actions
  setSearchBillNumber: (num: string) => void;
  setDateFilter: (filter: DateFilterOption) => void;
  setPage: (page: number) => void;
  loadHistory: () => Promise<void>;
  selectBill: (billId: number | null) => Promise<void>;
  reprintSelected: () => Promise<void>;
  exportSelectedPdf: () => Promise<void>;
  clearActionError: () => void;
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  list: [],
  totalCount: 0,
  loadingList: false,

  selectedBillId: null,
  selectedBillDetail: null,
  loadingDetail: false,

  searchBillNumber: '',
  dateFilter: 'TODAY',
  currentPage: 1,
  pageSize: 15,
  actionError: null,

  setSearchBillNumber: (num: string) => {
    set({ searchBillNumber: num, currentPage: 1 });
    get().loadHistory();
  },

  setDateFilter: (filter: DateFilterOption) => {
    set({ dateFilter: filter, currentPage: 1 });
    get().loadHistory();
  },
  
  setPage: (page: number) => {
    set({ currentPage: page });
    get().loadHistory();
  },

  loadHistory: async () => {
    set({ loadingList: true });
    try {
      const state = get();
      
      // Handle exact bill number search first
      if (state.searchBillNumber.trim()) {
        const num = parseInt(state.searchBillNumber.trim(), 10);
        if (!isNaN(num)) {
          const res = await window.api.history.searchByBillNumber(num);
          if (res.success && res.data) {
            set({ 
              list: [{
                id: res.data.id,
                billNumber: res.data.billNumber,
                timestamp: res.data.timestamp,
                totalMinor: res.data.totalMinor,
                itemCount: res.data.items.length
              }],
              totalCount: 1,
              loadingList: false
            });
            return;
          } else {
            set({ list: [], totalCount: 0, loadingList: false });
            return;
          }
        }
      }

      // Default load with pagination & date filter
      const offset = (state.currentPage - 1) * state.pageSize;
      const limit = state.pageSize;
      
      let startDate: number | undefined = undefined;
      let endDate: number | undefined = undefined;
      
      const now = new Date();
      if (state.dateFilter === 'TODAY') {
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        startDate = start.getTime();
        endDate = start.getTime() + 86400000;
      } else if (state.dateFilter === 'YESTERDAY') {
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        startDate = start.getTime();
        endDate = start.getTime() + 86400000;
      } else if (state.dateFilter === 'LAST_7_DAYS') {
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
        startDate = start.getTime();
        endDate = now.getTime(); // up to now
      }

      const res = await window.api.history.list({ 
        offset, 
        limit, 
        filters: startDate !== undefined && endDate !== undefined ? { startDate, endDate } : undefined 
      });
      
      if (res.success && res.data) {
        set({ list: res.data.items, totalCount: res.data.totalCount });
      }
    } finally {
      set({ loadingList: false });
    }
  },

  selectBill: async (billId: number | null) => {
    if (billId === null) {
      set({ selectedBillId: null, selectedBillDetail: null });
      return;
    }

    set({ selectedBillId: billId, loadingDetail: true });
    try {
      const res = await window.api.history.getDetails(billId);
      if (res.success && res.data) {
        set({ selectedBillDetail: res.data });
      } else {
        set({ selectedBillDetail: null });
      }
    } finally {
      set({ loadingDetail: false });
    }
  },

  reprintSelected: async () => {
    const detail = get().selectedBillDetail;
    if (!detail) return;
    set({ actionError: null });
    try {
      const res = await window.api.printing.createPrintJob(detail.id);
      if (!res.success) {
        set({ actionError: res.error?.message || 'Reprint failed' });
      }
    } catch (e: unknown) {
      set({ actionError: e instanceof Error ? e.message : 'Reprint failed' });
    }
  },

  exportSelectedPdf: async () => {
    const detail = get().selectedBillDetail;
    if (!detail) return;
    set({ actionError: null });
    try {
      const res = await window.api.pdf.exportBill(detail.id);
      if (res.success && res.data?.filePath) {
        await window.api.pdf.openFile(res.data.filePath);
      } else if (res.error?.code !== 'PDF_SAVE_CANCELLED') {
        // Cancelled is not an error — user pressed Cancel in the dialog
        set({ actionError: res.error?.message || 'PDF export failed' });
      }
    } catch (e: unknown) {
      set({ actionError: e instanceof Error ? e.message : 'PDF export failed' });
    }
  },

  clearActionError: () => set({ actionError: null }),
}));
