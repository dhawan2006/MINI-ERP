import { Product } from '../../domain/entities/Product';

export interface IProductRepository {
  getById(id: string): Product | null;
  findByBarcode(barcode: string): Product | null;
  
  create(product: { name: string; price_minor: number; barcode?: string | null }): Product;
  update(id: string, updates: { name?: string; price_minor?: number; barcode?: string | null }): Product | null;
  setProductActive(id: string, isActive: boolean): void;
  
  listProducts(limit: number, offset: number, includeInactive?: boolean): Product[];
  searchProducts(term: string, limit: number, includeInactive?: boolean): Product[];
  searchActiveByPrefix(prefix: string, limit?: number): Product[]; // Deprecated eventually, but keeping for compatibility
  deleteAll(): void;
}
