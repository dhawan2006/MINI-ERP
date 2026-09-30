import { ActiveBill } from '../../domain/entities/ActiveBill';
import { StoreConfigDTO } from '../../shared/dto';

export interface PersistedBillItem {
  productId: string;
  snapshotName: string;
  snapshotPriceMinor: number;
  quantity: number;
  lineTotalMinor: number;
}

export interface PersistedBill {
  id: number;
  billNumber: number;
  timestamp: number;
  items: PersistedBillItem[];
  totalMinor: number;
  shopName: string;
  shopAddress: string | null;
  shopPhone: string | null;
}

/** Raw SQLite row returned by getBillById / getBillByNumber */
export interface BillRow {
  id: number;
  bill_number: number;
  finalized_at: number;
  total_minor: number;
  shop_name: string;
  shop_address: string | null;
  shop_phone: string | null;
}

/** Raw SQLite row returned by getBillItems */
export interface BillItemRow {
  product_id: string;
  snapshot_name: string;
  snapshot_price_minor: number;
  quantity: number;
  line_total_minor: number;
}

/** Row shape returned by getHistoryList */
export interface HistoryListRow {
  id: number;
  bill_number: number;
  finalized_at: number;
  total_minor: number;
  item_count: number;
}

export interface IBillRepository {
  persistFinalizedBill(activeBill: ActiveBill, storeConfig: StoreConfigDTO, draftIdToRemove?: string): PersistedBill;
  getBillById(id: number): BillRow | null;
  getBillByNumber(billNumber: number): BillRow | null;
  getBillItems(billId: number): BillItemRow[];
  getHistoryList(offset: number, limit: number, filters?: { startDate?: number; endDate?: number }): { items: HistoryListRow[]; totalCount: number };
  getBillDetails(billId: number): PersistedBill | null;
}
