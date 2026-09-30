import Database from 'better-sqlite3';
import crypto from 'crypto';
import { IProductRepository } from '../../application/interfaces/IProductRepository';
import { Product as DomainProduct } from '../../domain/entities/Product';

export interface ProductRow {
  id: string;
  barcode: string | null;
  name: string;
  price_minor: number;
  is_active: number;
  created_at: number;
  updated_at: number;
}

export class ProductRepository implements IProductRepository {
  constructor(private db: Database.Database) {}

  private mapToDomain(row: ProductRow): DomainProduct {
    return new DomainProduct({
      id: row.id,
      name: row.name,
      barcode: row.barcode,
      priceMinor: row.price_minor,
      isActive: row.is_active === 1
    });
  }

  create(product: Omit<ProductRow, 'id' | 'created_at' | 'updated_at' | 'is_active'>): DomainProduct {
    const id = crypto.randomUUID();
    const now = Date.now();
    
    // Normalize barcode to null if empty string to allow UNIQUE constraint to work on nulls
    // SQLite treats NULLs as distinct for UNIQUE constraint.
    const barcode = product.barcode ? product.barcode.trim() : null;

    this.db.prepare(
      `INSERT INTO products (id, barcode, name, price_minor, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, barcode, product.name.trim(), product.price_minor, 1, now, now);

    return this.getById(id)!;
  }

  getById(id: string): DomainProduct | null {
    const row = this.db.prepare('SELECT * FROM products WHERE id = ?').get(id) as ProductRow | undefined;
    return row ? this.mapToDomain(row) : null;
  }

  findByBarcode(barcode: string): DomainProduct | null {
    if (!barcode.trim()) return null;
    const row = this.db.prepare('SELECT * FROM products WHERE barcode = ? AND is_active = 1').get(barcode.trim()) as ProductRow | undefined;
    return row ? this.mapToDomain(row) : null;
  }

  update(id: string, updates: Partial<Pick<ProductRow, 'name' | 'price_minor' | 'barcode'>>): DomainProduct | null {
    const currentDomainProduct = this.getById(id);
    if (!currentDomainProduct) return null;

    const newName = updates.name !== undefined ? updates.name.trim() : currentDomainProduct.name;
    const newPrice = updates.price_minor !== undefined ? updates.price_minor : currentDomainProduct.priceMinor;
    let newBarcode = updates.barcode !== undefined ? updates.barcode : currentDomainProduct.barcode;
    if (typeof newBarcode === 'string') newBarcode = newBarcode.trim() || null;

    this.db.prepare(
      'UPDATE products SET name = ?, price_minor = ?, barcode = ?, updated_at = ? WHERE id = ?'
    ).run(newName, newPrice, newBarcode, Date.now(), id);

    return this.getById(id);
  }

  setProductActive(id: string, isActive: boolean): void {
    this.db.prepare('UPDATE products SET is_active = ?, updated_at = ? WHERE id = ?').run(isActive ? 1 : 0, Date.now(), id);
  }

  searchActiveByPrefix(prefix: string, limit: number = 20): DomainProduct[] {
    const term = `${prefix.trim()}%`;
    const rows = this.db.prepare(
      'SELECT * FROM products WHERE is_active = 1 AND name LIKE ? ORDER BY name ASC LIMIT ?'
    ).all(term, limit) as ProductRow[];
    return rows.map(r => this.mapToDomain(r));
  }

  listProducts(limit: number, offset: number, includeInactive: boolean = false): DomainProduct[] {
    const query = includeInactive 
      ? 'SELECT * FROM products ORDER BY name ASC LIMIT ? OFFSET ?'
      : 'SELECT * FROM products WHERE is_active = 1 ORDER BY name ASC LIMIT ? OFFSET ?';
    
    const rows = this.db.prepare(query).all(limit, offset) as ProductRow[];
    return rows.map(r => this.mapToDomain(r));
  }

  searchProducts(term: string, limit: number, includeInactive: boolean = false): DomainProduct[] {
    const searchTerm = `%${term.trim()}%`;
    const query = includeInactive
      ? 'SELECT * FROM products WHERE name LIKE ? OR barcode LIKE ? ORDER BY name ASC LIMIT ?'
      : 'SELECT * FROM products WHERE is_active = 1 AND (name LIKE ? OR barcode LIKE ?) ORDER BY name ASC LIMIT ?';
    
    const rows = this.db.prepare(query).all(searchTerm, searchTerm, limit) as ProductRow[];
    return rows.map(r => this.mapToDomain(r));
  }

  deleteAll(): void {
    this.db.prepare('DELETE FROM products').run();
  }
}
