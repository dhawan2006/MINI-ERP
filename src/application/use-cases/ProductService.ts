import { IProductRepository } from '../interfaces/IProductRepository';
import { Product } from '../../domain/entities/Product';
import { DuplicateBarcodeError, ProductNotFoundError, ProductUpdateFailedError } from '../../domain/errors';

export class ProductService {
  constructor(private productRepository: IProductRepository) {}

  public createProduct(name: string, priceMinor: number, barcode?: string | null): Product {
    // Validate barcode uniqueness if provided
    if (barcode && barcode.trim()) {
      const existing = this.productRepository.findByBarcode(barcode.trim());
      if (existing) {
        throw new DuplicateBarcodeError('A product with this barcode already exists.');
      }
    }

    // The Product entity will validate name and price during instantiation in the repository
    return this.productRepository.create({ name, price_minor: priceMinor, barcode });
  }

  public updateProduct(id: string, name?: string, priceMinor?: number, barcode?: string | null): Product {
    const existingProduct = this.productRepository.getById(id);
    if (!existingProduct) {
      throw new ProductNotFoundError('Product not found.');
    }

    // Validate barcode uniqueness if barcode is changing
    if (barcode !== undefined && barcode !== null && barcode.trim() !== '') {
      const existingBarcodeOwner = this.productRepository.findByBarcode(barcode.trim());
      if (existingBarcodeOwner && existingBarcodeOwner.id !== id) {
        throw new DuplicateBarcodeError('A product with this barcode already exists.');
      }
    }

    const updated = this.productRepository.update(id, {
      name,
      price_minor: priceMinor,
      barcode: barcode === '' ? null : barcode
    });

    if (!updated) {
      throw new ProductUpdateFailedError('Failed to update product.');
    }
    
    return updated;
  }

  public setProductActive(id: string, isActive: boolean): void {
    const existing = this.productRepository.getById(id);
    if (!existing) {
      throw new ProductNotFoundError('Product not found.');
    }
    this.productRepository.setProductActive(id, isActive);
  }

  public getProduct(id: string): Product {
    const product = this.productRepository.getById(id);
    if (!product) {
      throw new ProductNotFoundError('Product not found.');
    }
    return product;
  }

  public listProducts(limit: number, offset: number, includeInactive: boolean = false): Product[] {
    return this.productRepository.listProducts(limit, offset, includeInactive);
  }

  public searchProducts(term: string, limit: number, includeInactive: boolean = false): Product[] {
    return this.productRepository.searchProducts(term, limit, includeInactive);
  }

  public deleteAllProducts(): void {
    this.productRepository.deleteAll();
  }
}
