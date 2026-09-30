import { describe, it, expect } from 'vitest';
import { BillItem } from '../../src/domain/entities/BillItem';
import { InvalidQuantityError, InvalidPriceError } from '../../src/domain/errors';

describe('BillItem Entity', () => {
  it('creates a valid bill item and calculates total correctly', () => {
    const item = new BillItem({
      productId: 'p1',
      snapshotName: 'Item',
      snapshotPriceMinor: 1599, // 15.99
      quantity: 3
    });
    expect(item.lineTotalMinor).toBe(4797); // 47.97
  });

  it('rejects negative or zero quantity', () => {
    expect(() => new BillItem({ productId: 'p1', snapshotName: 'A', snapshotPriceMinor: 100, quantity: 0 })).toThrow(InvalidQuantityError);
    expect(() => new BillItem({ productId: 'p1', snapshotName: 'A', snapshotPriceMinor: 100, quantity: -5 })).toThrow(InvalidQuantityError);
  });

  it('rejects non-integer quantity', () => {
    expect(() => new BillItem({ productId: 'p1', snapshotName: 'A', snapshotPriceMinor: 100, quantity: 1.5 })).toThrow(InvalidQuantityError);
  });

  it('returns a new instance with updated quantity', () => {
    const item = new BillItem({ productId: 'p1', snapshotName: 'A', snapshotPriceMinor: 100, quantity: 1 });
    const updated = item.withQuantity(5);
    expect(updated.quantity).toBe(5);
    expect(item.quantity).toBe(1); // Immutability
  });
});
