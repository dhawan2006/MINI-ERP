import { describe, it, expect, beforeAll } from 'vitest';
import Database from 'better-sqlite3';
import { BillRepository } from '../../src/infrastructure/repositories/bill.repository';
import { DraftRepository } from '../../src/infrastructure/repositories/draft.repository';
import { runMigrations } from '../../src/infrastructure/database/migrations';
import { ActiveBill } from '../../src/domain/entities/ActiveBill';
import { Product } from '../../src/domain/entities/Product';

describe('History Performance Benchmarks', () => {
  let db: Database.Database;
  let billRepo: BillRepository;

  beforeAll(() => {
    db = new Database(':memory:');
    runMigrations(db);
    const draftRepo = new DraftRepository(db);
    billRepo = new BillRepository(db, draftRepo);

    // Seed 10,000 bills
    const product = new Product({ id: 'p1', barcode: '123', name: 'PerfItem', priceMinor: 100, isActive: true });
    
    db.exec('BEGIN TRANSACTION');
    for (let i = 0; i < 10000; i++) {
      const activeBill = new ActiveBill();
      activeBill.addProduct(product);
      const storeConfig = { shopName: 'Shop', shopAddress: 'Addr', shopPhone: '123' };
      billRepo.persistFinalizedBill(activeBill, storeConfig);
    }
    db.exec('COMMIT');
  });

  it('retrieves the first page of 50 bills over 10,000 records quickly', () => {
    const start = performance.now();
    const result = billRepo.getHistoryList(0, 50);
    const end = performance.now();
    const duration = end - start;

    console.log(`[Benchmark] getHistoryList (first 50 of 10,000): ${duration.toFixed(2)}ms`);
    expect(result.items.length).toBe(50);
    expect(result.totalCount).toBe(10000);
    expect(duration).toBeLessThan(100); // Should be very fast with indexes
  });

  it('retrieves page offset 5000 quickly', () => {
    const start = performance.now();
    const result = billRepo.getHistoryList(5000, 50);
    const end = performance.now();
    const duration = end - start;

    console.log(`[Benchmark] getHistoryList (offset 5000): ${duration.toFixed(2)}ms`);
    expect(result.items.length).toBe(50);
    expect(duration).toBeLessThan(100);
  });
});
