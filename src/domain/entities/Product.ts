import { InvalidProductError, InvalidPriceError } from '../errors';

export interface IProductData {
  id: string;
  name: string;
  barcode: string | null;
  priceMinor: number;
  isActive: boolean;
}

export class Product {
  readonly id: string;
  readonly name: string;
  readonly barcode: string | null;
  readonly priceMinor: number;
  readonly isActive: boolean;

  constructor(data: IProductData) {
    if (!data.id.trim()) {
      throw new InvalidProductError('Product ID cannot be empty');
    }
    if (!data.name.trim()) {
      throw new InvalidProductError('Product name cannot be empty');
    }
    if (!Number.isInteger(data.priceMinor) || data.priceMinor < 0) {
      throw new InvalidPriceError('Product price must be a non-negative integer (minor units)');
    }

    this.id = data.id;
    this.name = data.name.trim();
    this.barcode = data.barcode ? data.barcode.trim() : null;
    this.priceMinor = data.priceMinor;
    this.isActive = data.isActive;
  }
}
