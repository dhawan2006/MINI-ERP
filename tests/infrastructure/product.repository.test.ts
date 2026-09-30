import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { initInMemoryDatabase } from '../../src/infrastructure/database/connection';
import { ProductRepository } from '../../src/infrastructure/repositories/product.repository';

describe('Product Repository', () => {
  let db: Database.Database;
  let repo: ProductRepository;

  beforeEach(() => {
    db = initInMemoryDatabase();
    repo = new ProductRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it('creates a product with money in minor units', () => {
    const p = repo.create({
      name: 'Test Product',
      barcode: '12345',
      price_minor: 1599 // 15.99
    });

    expect(p.id).toBeDefined();
    expect(p.name).toBe('Test Product');
    expect(p.priceMinor).toBe(1599);
    expect(p.isActive).toBe(true);
  });

  it('prevents duplicate barcodes', () => {
    repo.create({ name: 'A', barcode: 'DUP', price_minor: 100 });
    expect(() => {
      repo.create({ name: 'B', barcode: 'DUP', price_minor: 200 });
    }).toThrow(/UNIQUE constraint failed: products.barcode/);
  });

  it('finds active products by barcode', () => {
    repo.create({ name: 'A', barcode: 'B1', price_minor: 100 });
    const p = repo.findByBarcode('B1');
    expect(p?.name).toBe('A');
  });

  it('soft deletes products and excludes them from active searches', () => {
    const p = repo.create({ name: 'Soft Delete Me', barcode: 'SD1', price_minor: 500 });
    
    repo.setProductActive(p.id, false);

    const deletedP = repo.getById(p.id);
    expect(deletedP?.isActive).toBe(false);

    const searchRes = repo.searchActiveByPrefix('Soft');
    expect(searchRes).toHaveLength(0);
    
    // Test reactivation
    repo.setProductActive(p.id, true);
    const reactivatedP = repo.getById(p.id);
    expect(reactivatedP?.isActive).toBe(true);
    const searchRes2 = repo.searchActiveByPrefix('Soft');
    expect(searchRes2).toHaveLength(1);
  });

  it('searches active products by prefix', () => {
    repo.create({ name: 'Apple Local', barcode: 'A1', price_minor: 100 });
    repo.create({ name: 'Apple Imported', barcode: 'A2', price_minor: 200 });
    repo.create({ name: 'Banana', barcode: 'B1', price_minor: 50 });
    
    const results = repo.searchActiveByPrefix('Apple');
    expect(results.length).toBe(2);
    
    // Test case insensitivity (SQLite LIKE is case insensitive by default for ASCII)
    const lowerResults = repo.searchActiveByPrefix('apple');
    expect(lowerResults.length).toBe(2);
  });
});
