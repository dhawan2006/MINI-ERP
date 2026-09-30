import { describe, it, expect } from 'vitest';
import { ActiveBill } from '../../src/domain/entities/ActiveBill';
import { Product } from '../../src/domain/entities/Product';

describe('Domain Performance Benchmarks', () => {
  it('handles 1000 item additions efficiently', () => {
    const bill = new ActiveBill();
    const product = new Product({ id: 'p1', name: 'Test', barcode: '123', priceMinor: 100, isActive: true });

    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      bill.addProduct(new Product({ id: `p${i}`, name: 'Test', barcode: '123', priceMinor: 100, isActive: true }));
    }
    const duration = performance.now() - start;

    console.log(`[Benchmark] 1000 domain item additions: ${duration.toFixed(2)}ms`);
    expect(duration).toBeLessThan(50); // Should be very fast in-memory array ops
  });

  it('handles 1000 rapid duplicate merges efficiently', () => {
    const bill = new ActiveBill();
    const product = new Product({ id: 'p1', name: 'Test', barcode: '123', priceMinor: 100, isActive: true });

    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      bill.addProduct(product); // Merges into same line 1000 times
    }
    const duration = performance.now() - start;

    console.log(`[Benchmark] 1000 duplicate product merges: ${duration.toFixed(2)}ms`);
    expect(duration).toBeLessThan(20);
    expect(bill.items.length).toBe(1);
    expect(bill.items[0].quantity).toBe(1000);
  });

  it('performs total calculation on 1000 items instantly', () => {
    const bill = new ActiveBill();
    for (let i = 0; i < 1000; i++) {
      bill.addProduct(new Product({ id: `p${i}`, name: 'Test', barcode: '123', priceMinor: 100, isActive: true }));
    }

    const start = performance.now();
    const total = bill.totalMinor;
    const duration = performance.now() - start;

    console.log(`[Benchmark] Total calculation of 1000 items: ${duration.toFixed(2)}ms`);
    expect(duration).toBeLessThan(5);
  });
});
