import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { BillRepository } from '../../src/infrastructure/repositories/bill.repository';
import { DraftRepository } from '../../src/infrastructure/repositories/draft.repository';
import { runMigrations } from '../../src/infrastructure/database/migrations';
import { ActiveBill } from '../../src/domain/entities/ActiveBill';
import { Product } from '../../src/domain/entities/Product';

describe('BillRepository History Integration', () => {
  let db: Database.Database;
  let billRepo: BillRepository;
  let draftRepo: DraftRepository;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
    draftRepo = new DraftRepository(db);
    billRepo = new BillRepository(db, draftRepo);
  });

  it('should only return FINALIZED bills in history', () => {
    const product = new Product({ id: 'p1', barcode: '123', name: 'Milk', priceMinor: 500, isActive: true });
    const activeBill = new ActiveBill();
    activeBill.addProduct(product);
    activeBill.setQuantity(product.id, 2);

    const storeConfig = { shopName: 'Shop', shopAddress: 'Addr', shopPhone: '123' };
    const finalized1 = billRepo.persistFinalizedBill(activeBill, storeConfig);
    const finalized2 = billRepo.persistFinalizedBill(activeBill, storeConfig);

    // Manually alter one bill to 'DRAFT' (should not happen in real app, but for testing isolation)
    db.prepare("UPDATE bills SET status = 'DRAFT' WHERE id = ?").run(finalized1.id);

    const history = billRepo.getHistoryList(0, 10);
    expect(history.totalCount).toBe(1);
    expect(history.items[0].id).toBe(finalized2.id);
  });

  it('should paginate history properly and sort newest first', () => {
    const product = new Product({ id: 'p1', barcode: '123', name: 'Milk', priceMinor: 500, isActive: true });
    const activeBill = new ActiveBill();
    activeBill.addProduct(product);
    activeBill.setQuantity(product.id, 2);

    const storeConfig = { shopName: 'Shop', shopAddress: 'Addr', shopPhone: '123' };
    for (let i = 0; i < 5; i++) {
      billRepo.persistFinalizedBill(activeBill, storeConfig);
    }

    const firstPage = billRepo.getHistoryList(0, 2);
    expect(firstPage.items.length).toBe(2);
    expect(firstPage.totalCount).toBe(5);
    // Highest bill numbers first
    expect(firstPage.items[0].bill_number).toBe(1005);
    expect(firstPage.items[1].bill_number).toBe(1004);

    const lastPage = billRepo.getHistoryList(4, 2);
    expect(lastPage.items.length).toBe(1);
    expect(lastPage.items[0].bill_number).toBe(1001);
  });

  it('should search by bill number', () => {
    const product = new Product({ id: 'p1', barcode: '123', name: 'Milk', priceMinor: 500, isActive: true });
    const activeBill = new ActiveBill();
    activeBill.addProduct(product);
    activeBill.setQuantity(product.id, 2);

    const storeConfig = { shopName: 'Shop', shopAddress: 'Addr', shopPhone: '123' };
    const persisted = billRepo.persistFinalizedBill(activeBill, storeConfig);

    const found = billRepo.getBillByNumber(persisted.billNumber);
    expect(found).not.toBeNull();
    expect(found?.id).toBe(persisted.id);

    const notFound = billRepo.getBillByNumber(9999);
    expect(notFound).toBeNull();
  });

  it('should filter by date', () => {
    const product = new Product({ id: 'p1', barcode: '123', name: 'Milk', priceMinor: 500, isActive: true });
    const activeBill = new ActiveBill();
    activeBill.addProduct(product);
    activeBill.setQuantity(product.id, 2);

    const storeConfig = { shopName: 'Shop', shopAddress: 'Addr', shopPhone: '123' };
    billRepo.persistFinalizedBill(activeBill, storeConfig);

    // Move time of the bill back by 2 days
    const now = Date.now();
    const twoDaysAgo = now - 2 * 24 * 60 * 60 * 1000;
    db.prepare('UPDATE bills SET finalized_at = ?').run(twoDaysAgo);

    const filtered = billRepo.getHistoryList(0, 10, { startDate: now - 24 * 60 * 60 * 1000, endDate: now + 10000 });
    expect(filtered.totalCount).toBe(0);

    const filteredInclude = billRepo.getHistoryList(0, 10, { startDate: twoDaysAgo - 10000, endDate: now });
    expect(filteredInclude.totalCount).toBe(1);
  });
});
