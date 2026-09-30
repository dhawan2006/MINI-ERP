export interface ProductDTO {
  id: string;
  name: string;
  barcode: string | null;
  priceMinor: number;
  isActive: boolean;
}

export interface BillItemDTO {
  productId: string;
  snapshotName: string;
  snapshotPriceMinor: number;
  quantity: number;
  lineTotalMinor: number;
}

export interface ActiveBillDTO {
  items: BillItemDTO[];
  totalMinor: number;
  isEmpty: boolean;
}

export interface FinalizedBillDTO {
  id: number;
  billNumber: number;
  totalMinor: number;
  receipt: ReceiptData; // Added for V1 Receipt reproduction
}

export interface ReceiptItemData {
  snapshotName: string;
  snapshotPriceMinor: number;
  quantity: number;
  lineTotalMinor: number;
}

export interface ReceiptData {
  billId: number;
  billNumber: number;
  timestamp: number;
  items: ReceiptItemData[];
  totalMinor: number;
  shopName: string;
  shopAddress?: string;
  shopPhone?: string;
}

export type PrintJobState = 'QUEUED' | 'PRINTING' | 'ACCEPTED' | 'FAILED';

export interface PrintJobDTO {
  jobId: string;
  billId: number;
  state: PrintJobState;
  createdAt: number;
  error?: string;
}

export interface PdfExportResultDTO {
  /** Absolute path of the saved PDF file. */
  filePath: string;
  /** Human-readable bill number for UI confirmation message. */
  billNumber: number;
}

export interface BillHistoryListItemDTO {
  id: number;
  billNumber: number;
  timestamp: number;
  totalMinor: number;
  itemCount: number;
}

export interface BillHistoryDetailDTO {
  id: number;
  billNumber: number;
  timestamp: number;
  totalMinor: number;
  shopName: string;
  shopAddress?: string;
  shopPhone?: string;
  items: ReceiptItemData[];
}

export interface PrinterConfig {
  enabled: boolean;
  transport: "network" | "usb" | "fake";
  host?: string;
  port?: number;
  deviceId?: string;
  paperWidth: 58 | 80;
  charactersPerLine: number;
  supportsCut: boolean;
  feedLines: number;
  encoding: string;
}

export interface StoreConfigDTO {
  shopName: string;
  shopAddress: string;
  shopPhone: string;
}

export interface AppSettingsDTO {
  store: StoreConfigDTO;
  printer: PrinterConfig;
}


