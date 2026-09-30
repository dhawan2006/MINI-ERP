import { ActiveBillDTO, ProductDTO, FinalizedBillDTO, PrintJobDTO, PdfExportResultDTO } from './dto';
import { LicensingStatusDTO } from './licensing-dto';



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
    searchActiveByPrefix: (prefix: string) => Promise<IpcResponse<ProductDTO[]>>; // Keep for backwards compatibility
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
  licensing: {
    /**
     * Returns the current licensing runtime state as a safe DTO.
     * Main is the authority — this is read-only from the renderer's perspective.
     * IPC failure or Main-side error always returns a non-ACTIVE state.
     */
    getState: () => Promise<IpcResponse<LicensingStatusDTO>>;
    /**
     * Phase 9: Request activation with a user-provided license key.
     * Main performs the crypto protocol and network call.
     */
    activate: (licenseKey: string) => Promise<IpcResponse<LicensingStatusDTO>>;
    /**
     * Phase 11: Request deactivation.
     * Main performs the crypto protocol, deletes local auth, and refreshes state.
     */
    deactivate: () => Promise<IpcResponse<void>>;
    /**
     * Subscribe to state-change events pushed by Main.
     * Callback receives only the safe DTO — never raw authorization data.
     * Returns an unsubscribe function.
     */
    onStateChanged: (callback: (dto: LicensingStatusDTO) => void) => () => void;
  };
};


declare global {
  interface Window {
    api: IpcApi;
  }
}
