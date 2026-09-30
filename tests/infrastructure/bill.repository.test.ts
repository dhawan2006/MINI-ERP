import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { initInMemoryDatabase } from '../../src/infrastructure/database/connection';
import { BillRepository } from '../../src/infrastructure/repositories/bill.repository';
import { DraftRepository } from '../../src/infrastructure/repositories/draft.repository';
import { ProductRepository } from '../../src/infrastructure/repositories/product.repository';
import { ActiveBill } from '../../src/domain/entities/ActiveBill';
import { BillItem } from '../../src/domain/entities/BillItem';

describe('Bill Repository & Transactions', () => {
  let db: Database.Database;
  let billRepo: BillRepository;
  let draftRepo: DraftRepository;
  let productRepo: ProductRepository;

  beforeEach(() => {
    db = initInMemoryDatabase();
    draftRepo = new DraftRepository(db);
    billRepo = new BillRepository(db, draftRepo);
    productRepo = new ProductRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it('finalizes a bill transactionally and calculates totals correctly', () => {
    // Stage a draft
    const draftId = 'draft_1';
    draftRepo.saveDraft(draftId, new ActiveBill([]));

    const storeConfig = {
      shopName: 'Test Shop',
      shopAddress: 'Test Address',
      shopPhone: '123'
    };

    const bill = billRepo.persistFinalizedBill(new ActiveBill([
      new BillItem({ productId: 'p1', snapshotName: 'Item A', snapshotPriceMinor: 1000, quantity: 2 }), // 2000
      new BillItem({ productId: 'p2', snapshotName: 'Item B', snapshotPriceMinor: 500, quantity: 1 })   // 500
    ]), storeConfig, draftId);

    expect(bill.id).toBeDefined();
    expect(bill.billNumber).toBe(1001); // First bill
    expect(bill.totalMinor).toBe(2500);

    const items = billRepo.getBillItems(bill.id);
    expect(items.length).toBe(2);
    expect(items[0].line_total_minor).toBe(2000);

    // Verify draft was cleaned up
    expect(draftRepo.loadDraft(draftId)).toBeNull();
  });

  it('preserves historical pricing integrity', () => {
    // 1. Create Product
    const product = productRepo.create({ name: 'Milk', barcode: 'M1', price_minor: 5000 }); // Rs 50.00
    
    const storeConfig = {
      shopName: 'Test Shop',
      shopAddress: 'Test Address',
      shopPhone: '123'
    };

    // 2. Finalize Bill 1 with current price
    const bill1 = billRepo.persistFinalizedBill(new ActiveBill([
      new BillItem({ productId: product.id, snapshotName: product.name, snapshotPriceMinor: product.priceMinor, quantity: 1 })
    ]), storeConfig);

    // 3. Update Product Price
    productRepo.update(product.id, { price_minor: 6000 }); // Rs 60.00

    // 4. Finalize Bill 2 with new price
    const updatedProduct = productRepo.getById(product.id)!;
    const bill2 = billRepo.persistFinalizedBill(new ActiveBill([
      new BillItem({ productId: updatedProduct.id, snapshotName: updatedProduct.name, snapshotPriceMinor: updatedProduct.priceMinor, quantity: 1 })
    ]), storeConfig);

    // 5. Verify Historical Integrity
    const items1 = billRepo.getBillItems(bill1.id);
    expect(items1[0].snapshot_price_minor).toBe(5000); // Old price preserved
    
    const items2 = billRepo.getBillItems(bill2.id);
    expect(items2[0].snapshot_price_minor).toBe(6000); // New price active
  });

  it('rolls back completely if a constraint fails during finalization', () => {
    // Try to finalize with a bad quantity to trigger constraint/app-level error
    try {
      billRepo.persistFinalizedBill(new ActiveBill([
        new BillItem({ productId: 'p1', snapshotName: 'Valid', snapshotPriceMinor: 100, quantity: 1 }),
        new BillItem({ productId: 'p2', snapshotName: 'Invalid', snapshotPriceMinor: 100, quantity: -5 }) // Throws Error
      ]));
    } catch (e) {
      // expected
    }

    // Verify nothing was written to bills or bill_items due to atomic rollback
    const allBills = db.prepare('SELECT * FROM bills').all();
    expect(allBills.length).toBe(0);

    const allItems = db.prepare('SELECT * FROM bill_items').all();
    expect(allItems.length).toBe(0);
  });
});
