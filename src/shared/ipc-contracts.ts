import { ActiveBillDTO, ProductDTO, FinalizedBillDTO, PrintJobDTO, PdfExportResultDTO } from './dto';



export interface IpcError {
  code: string;
  message: string;
  /** Optional structured context — never contains cryptographic internals. */
  details?: Record<string, unknown>;
}


export interface IpcResponse<T> {
  success: boolean;
  data?: T;
  error?: IpcError;
}

export type IpcApi = {
  system: {
    ping: () => Promise<string>;
    factoryReset: () => Promise<IpcResponse<void>>;
  };
  billing: {
    loadDraft: () => Promise<IpcResponse<ActiveBillDTO>>;
    addProduct: (productId: string) => Promise<IpcResponse<ActiveBillDTO>>;
    addByBarcode: (barcode: string) => Promise<IpcResponse<ActiveBillDTO>>;
    setQuantity: (productId: string, quantity: number) => Promise<IpcResponse<ActiveBillDTO>>;
    removeItem: (productId: string) => Promise<IpcResponse<ActiveBillDTO>>;
    undo: () => Promise<IpcResponse<ActiveBillDTO>>;
    clear: () => Promise<IpcResponse<ActiveBillDTO>>;
    finalize: () => Promise<IpcResponse<FinalizedBillDTO>>;
    hasActiveDraft: () => Promise<IpcResponse<boolean>>;
  };
  products: {
    findByBarcode: (barcode: string) => Promise<IpcResponse<ProductDTO | null>>;
    searchActiveByPrefix: (prefix: string) => Promise<IpcResponse<ProductDTO[]>>;
    create: (name: string, priceMinor: number, barcode?: string | null) => Promise<IpcResponse<ProductDTO>>;
    update: (id: string, name?: string, priceMinor?: number, barcode?: string | null) => Promise<IpcResponse<ProductDTO>>;
    setActive: (id: string, isActive: boolean) => Promise<IpcResponse<void>>;
    list: (limit: number, offset: number, includeInactive?: boolean) => Promise<IpcResponse<ProductDTO[]>>;
    search: (term: string, limit: number, includeInactive?: boolean) => Promise<IpcResponse<ProductDTO[]>>;
    deleteAll: () => Promise<IpcResponse<void>>;
  };
  printing: {
    createPrintJob: (billId: number) => Promise<IpcResponse<string>>;
    getJobStatus: (jobId: string) => Promise<IpcResponse<PrintJobDTO>>;
    retryPrintJob: (billId: number) => Promise<IpcResponse<string>>;
  };
  pdf: {
    /** Export a finalized bill to PDF via OS save dialog. */
    exportBill: (billId: number) => Promise<IpcResponse<PdfExportResultDTO>>;
    /** Open a previously exported PDF file in the OS default viewer. */
    openFile: (filePath: string) => Promise<IpcResponse<void>>;
  };
  history: {
    list: (params: { offset: number; limit: number; filters?: { startDate?: number; endDate?: number } }) => Promise<IpcResponse<{ items: any[]; totalCount: number }>>;
    getDetails: (billId: number) => Promise<IpcResponse<any>>;
    searchByBillNumber: (billNumber: number) => Promise<IpcResponse<any | null>>;
  };
  settings: {
    get: () => Promise<IpcResponse<any>>;
    update: (settings: any) => Promise<IpcResponse<any>>;
    testPrint: (draftConfig?: any) => Promise<IpcResponse<any>>;
  };
  backup: {
    export: () => Promise<IpcResponse<{ filePath: string; sizeBytes: number }>>;
  };
  restore: {
    validate: () => Promise<IpcResponse<{ filePath: string, metadata: any }>>;
    execute: (filePath: string) => Promise<IpcResponse<void>>;
  };
  setup: {
    getState: () => Promise<IpcResponse<import('./setup-dto').SetupStateDTO>>;
    saveStoreProfile: (shopName: string) => Promise<IpcResponse<import('./setup-dto').SetupStateDTO>>;
    complete: () => Promise<IpcResponse<import('./setup-dto').SetupStateDTO>>;
  };
};


declare global {
  interface Window {
    api: IpcApi;
  }
}
