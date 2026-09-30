import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { initInMemoryDatabase } from '../../src/infrastructure/database/connection';
import { ProductRepository } from '../../src/infrastructure/repositories/product.repository';
import { BillRepository } from '../../src/infrastructure/repositories/bill.repository';
import { ActiveBill } from '../../src/domain/entities/ActiveBill';
import { BillItem } from '../../src/domain/entities/BillItem';
import { DraftRepository } from '../../src/infrastructure/repositories/draft.repository';

describe('Performance Benchmarks', () => {
  let db: Database.Database;
  let productRepo: ProductRepository;
  let billRepo: BillRepository;
  let draftRepo: DraftRepository;

  beforeAll(() => {
    db = initInMemoryDatabase();
    productRepo = new ProductRepository(db);
    draftRepo = new DraftRepository(db);
    billRepo = new BillRepository(db, draftRepo);
  });

  afterAll(() => {
    db.close();
  });

  it('inserts 10,000 products efficiently', () => {
    const start = performance.now();
    
    // Use transaction for batch insert
    const insertMany = db.transaction(() => {
      for (let i = 0; i < 10000; i++) {
        productRepo.create({
          name: `Product ${i}`,
          barcode: `BC${i}`,
          price_minor: 1000 + i
        });
      }
    });

    insertMany();
    const duration = performance.now() - start;
    
    // 10,000 inserts in an in-memory SQLite DB using a transaction should easily be < 500ms
    console.log(`[Benchmark] 10,000 product inserts: ${duration.toFixed(2)}ms`);
    expect(duration).toBeLessThan(1000); 
  });

  it('performs prefix search over 10,000 products', () => {
    const start = performance.now();
    const results = productRepo.searchActiveByPrefix('Product 999');
    const duration = performance.now() - start;

    console.log(`[Benchmark] Prefix search (10,000 products): ${duration.toFixed(2)}ms`);
    // Indexed prefix search should be < 5ms
    expect(duration).toBeLessThan(20);
    expect(results.length).toBeGreaterThan(0);
  });

  it('finalizes a 10-item bill efficiently', () => {
    // Stage draft
    draftRepo.saveDraft('draft_perf', new ActiveBill([]));

    const items = Array.from({ length: 10 }).map((_, i) => ({
      product_id: `p${i}`,
      snapshot_name: `Item ${i}`,
      snapshot_price_minor: 100 * i,
      quantity: 2
    }));

    const start = performance.now();
    billRepo.persistFinalizedBill(new ActiveBill(
      items.map(i => new BillItem({
        productId: i.product_id,
        snapshotName: i.snapshot_name,
        snapshotPriceMinor: i.snapshot_price_minor,
        quantity: i.quantity
      }))
    ), 'draft_perf');
    const duration = performance.now() - start;

    console.log(`[Benchmark] 10-item bill finalization: ${duration.toFixed(2)}ms`);
    // Should easily be < 20ms
    expect(duration).toBeLessThan(20);
  });
});
