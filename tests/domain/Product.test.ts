import { describe, it, expect } from 'vitest';
import { Product } from '../../src/domain/entities/Product';
import { InvalidProductError, InvalidPriceError } from '../../src/domain/errors';

describe('Product Entity', () => {
  it('creates a valid product', () => {
    const p = new Product({
      id: 'p1',
      name: 'Test',
      barcode: '123',
      priceMinor: 1000,
      isActive: true
    });
    expect(p.id).toBe('p1');
    expect(p.name).toBe('Test');
    expect(p.barcode).toBe('123');
    expect(p.priceMinor).toBe(1000);
    expect(p.isActive).toBe(true);
  });

  it('rejects empty id', () => {
    expect(() => new Product({ id: ' ', name: 'Test', barcode: null, priceMinor: 100, isActive: true })).toThrow(InvalidProductError);
  });

  it('rejects empty name', () => {
    expect(() => new Product({ id: 'p1', name: '  ', barcode: null, priceMinor: 100, isActive: true })).toThrow(InvalidProductError);
  });

  it('rejects negative or fractional price', () => {
    expect(() => new Product({ id: 'p1', name: 'T', barcode: null, priceMinor: -10, isActive: true })).toThrow(InvalidPriceError);
    expect(() => new Product({ id: 'p1', name: 'T', barcode: null, priceMinor: 10.5, isActive: true })).toThrow(InvalidPriceError);
  });
});
