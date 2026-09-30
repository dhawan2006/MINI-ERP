import { describe, it, expect, beforeEach } from 'vitest';
import { ActiveBill } from '../../src/domain/entities/ActiveBill';
import { Product } from '../../src/domain/entities/Product';
import { InactiveProductError, EmptyBillError } from '../../src/domain/errors';

describe('ActiveBill Entity', () => {
  let bill: ActiveBill;
  let pA: Product;
  let pB: Product;
  let inactiveP: Product;

  beforeEach(() => {
    bill = new ActiveBill();
    pA = new Product({ id: 'pA', name: 'Product A', barcode: 'A', priceMinor: 100, isActive: true });
    pB = new Product({ id: 'pB', name: 'Product B', barcode: 'B', priceMinor: 250, isActive: true });
    inactiveP = new Product({ id: 'pI', name: 'Inactive', barcode: 'I', priceMinor: 50, isActive: false });
  });

  it('adds products and calculates total', () => {
    bill.addProduct(pA); // 100
    bill.addProduct(pB); // 250
    expect(bill.items.length).toBe(2);
    expect(bill.totalMinor).toBe(350);
  });

  it('rejects inactive products', () => {
    expect(() => bill.addProduct(inactiveP)).toThrow(InactiveProductError);
  });

  it('merges identical products by ID and increases quantity', () => {
    bill.addProduct(pA);
    bill.addProduct(pA);
    expect(bill.items.length).toBe(1);
    expect(bill.items[0].quantity).toBe(2);
    expect(bill.totalMinor).toBe(200);
  });

  it('allows quantity manipulation', () => {
    bill.addProduct(pA);
    bill.setQuantity('pA', 5);
    expect(bill.items[0].quantity).toBe(5);
    expect(bill.totalMinor).toBe(500);

    bill.decreaseQuantity('pA');
    expect(bill.items[0].quantity).toBe(4);

    // Setting to 0 removes it
    bill.setQuantity('pA', 0);
    expect(bill.items.length).toBe(0);
  });

  it('undos the previous mutation accurately', () => {
    bill.addProduct(pA); // history: []
    expect(bill.items.length).toBe(1);

    bill.addProduct(pB); // history: [[pA]]
    expect(bill.items.length).toBe(2);

    bill.undo(); // pops history, restores [pA]
    expect(bill.items.length).toBe(1);
    expect(bill.items[0].productId).toBe('pA');

    bill.setQuantity('pA', 10); // history: [[pA x 1]]
    expect(bill.items[0].quantity).toBe(10);
    
    bill.undo();
    expect(bill.items[0].quantity).toBe(1);
  });

  it('preserves historical snapshot if product price changes later', () => {
    bill.addProduct(pA);
    // Even if pA is updated somewhere else, the bill item snapshot remains frozen.
    const snapshotPrice = bill.items[0].snapshotPriceMinor;
    
    const updatedProductA = new Product({ ...pA, priceMinor: 9999 });
    // Merging duplicate again
    bill.addProduct(updatedProductA);
    
    // The snapshot price should STILL be the original 100!
    // Domain Rule: "subsequent product price changes must not mutate the existing bill item"
    // Wait, my implementation `withQuantity` just updates quantity and preserves old snapshot!
    expect(bill.items[0].snapshotPriceMinor).toBe(100);
    expect(bill.items[0].quantity).toBe(2);
    expect(bill.totalMinor).toBe(200);
  });

  it('rejects finalization if empty', () => {
    expect(() => bill.validateForFinalization()).toThrow(EmptyBillError);
  });
});
