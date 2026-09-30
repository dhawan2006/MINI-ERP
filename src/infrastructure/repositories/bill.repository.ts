import Database from 'better-sqlite3';
import { DraftRepository } from './draft.repository';
import { IBillRepository, PersistedBill, BillRow, BillItemRow, HistoryListRow } from '../../application/interfaces/IBillRepository';
import { ActiveBill } from '../../domain/entities/ActiveBill';
import { StoreConfigDTO } from '../../shared/dto';

/** Full DB row including internal status/audit fields */
interface FullBillRow extends BillRow {
  status: string;
  created_at: number;
}

/** Full DB row for bill_items including primary key */
interface FullBillItemRow extends BillItemRow {
  id: number;
  bill_id: number;
}

/** Row returned by getHistoryList query (includes item_count from subquery) */
interface HistoryQueryRow extends FullBillRow {
  item_count: number;
}

export class BillRepository implements IBillRepository {
  constructor(private db: Database.Database, private draftRepo: DraftRepository) {}

  persistFinalizedBill(activeBill: ActiveBill, storeConfig: StoreConfigDTO, draftIdToRemove?: string): PersistedBill {
    if (activeBill.isEmpty) {
      throw new Error('Cannot finalize bill without items');
    }

    const transaction = this.db.transaction(() => {
      // Generate strictly monotonic bill_number
      const row = this.db.prepare('SELECT MAX(bill_number) as maxNumber FROM bills').get() as { maxNumber: number | null };
      const billNumber = (row.maxNumber || 1000) + 1; // start at 1001

      // Calculate total
      const totalMinor = activeBill.totalMinor;
      const now = Date.now();

      // Insert Bill
      const insertBillInfo = this.db.prepare(
        `INSERT INTO bills (bill_number, total_minor, status, created_at, finalized_at, shop_name, shop_address, shop_phone)
         VALUES (?, ?, 'FINALIZED', ?, ?, ?, ?, ?)`
      ).run(billNumber, totalMinor, now, now, storeConfig.shopName, storeConfig.shopAddress, storeConfig.shopPhone);

      const billId = insertBillInfo.lastInsertRowid as number;

      // Insert Bill Items
      const insertItemStmt = this.db.prepare(
        `INSERT INTO bill_items (bill_id, product_id, snapshot_name, snapshot_price_minor, quantity, line_total_minor)
         VALUES (?, ?, ?, ?, ?, ?)`
      );

      for (const item of activeBill.items) {
        if (item.quantity <= 0) throw new Error('Quantity must be greater than 0');
        insertItemStmt.run(billId, item.productId, item.snapshotName, item.snapshotPriceMinor, item.quantity, item.lineTotalMinor);
      }

      // Cleanup Draft if specified
      if (draftIdToRemove) {
        this.draftRepo.deleteDraft(draftIdToRemove);
      }

      const persistedItems = activeBill.items.map(item => ({
        productId: item.productId,
        snapshotName: item.snapshotName,
        snapshotPriceMinor: item.snapshotPriceMinor,
        quantity: item.quantity,
        lineTotalMinor: item.lineTotalMinor
      }));

      return {
        id: billId,
        billNumber,
        timestamp: now,
        items: persistedItems,
        totalMinor,
        shopName: storeConfig.shopName,
        shopAddress: storeConfig.shopAddress || null,
        shopPhone: storeConfig.shopPhone || null
      };
    });

    return transaction();
  }

  getBillById(id: number): BillRow | null {
    const row = this.db.prepare("SELECT * FROM bills WHERE id = ? AND status = 'FINALIZED'").get(id) as FullBillRow | undefined;
    return row || null;
  }

  getBillByNumber(billNumber: number): BillRow | null {
    const row = this.db.prepare("SELECT * FROM bills WHERE bill_number = ? AND status = 'FINALIZED'").get(billNumber) as FullBillRow | undefined;
    return row || null;
  }

  getBillItems(billId: number): BillItemRow[] {
    return this.db.prepare('SELECT * FROM bill_items WHERE bill_id = ? ORDER BY id ASC').all(billId) as FullBillItemRow[];
  }

  getHistoryList(offset: number, limit: number, filters?: { startDate?: number; endDate?: number }): { items: HistoryListRow[]; totalCount: number } {
    let sql = "SELECT b.id, b.bill_number, b.finalized_at, b.total_minor, (SELECT COUNT(id) FROM bill_items WHERE bill_id = b.id) as item_count FROM bills b WHERE b.status = 'FINALIZED'";
    let countSql = "SELECT COUNT(id) as total FROM bills WHERE status = 'FINALIZED'";
    const params: (number)[] = [];
    const countParams: (number)[] = [];

    if (filters?.startDate !== undefined && filters?.endDate !== undefined) {
      sql += " AND b.finalized_at >= ? AND b.finalized_at < ?";
      countSql += " AND finalized_at >= ? AND finalized_at < ?";
      params.push(filters.startDate, filters.endDate);
      countParams.push(filters.startDate, filters.endDate);
    }

    sql += " ORDER BY b.finalized_at DESC, b.bill_number DESC LIMIT ? OFFSET ?";
    params.push(limit, offset);

    const items = this.db.prepare(sql).all(...params) as HistoryQueryRow[];
    const totalRow = this.db.prepare(countSql).get(...countParams) as { total: number };

    return { items, totalCount: totalRow.total };
  }

  getBillDetails(billId: number): PersistedBill | null {
    const billRow = this.getBillById(billId);
    if (!billRow) return null;

    const itemRows = this.getBillItems(billId);
    return {
      id: billRow.id,
      billNumber: billRow.bill_number,
      timestamp: billRow.finalized_at,
      totalMinor: billRow.total_minor,
      shopName: billRow.shop_name,
      shopAddress: billRow.shop_address,
      shopPhone: billRow.shop_phone,
      items: itemRows.map(item => ({
        productId: item.product_id,
        snapshotName: item.snapshot_name,
        snapshotPriceMinor: item.snapshot_price_minor,
        quantity: item.quantity,
        lineTotalMinor: item.line_total_minor
      }))
    };
  }
}
