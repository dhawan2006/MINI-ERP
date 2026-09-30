import { InvalidQuantityError, InvalidPriceError } from '../errors';

export interface IBillItemData {
  productId: string;
  snapshotName: string;
  snapshotPriceMinor: number;
  quantity: number;
}

export class BillItem {
  readonly productId: string;
  readonly snapshotName: string;
  readonly snapshotPriceMinor: number;
  readonly quantity: number;

  constructor(data: IBillItemData) {
    if (!Number.isInteger(data.quantity) || data.quantity <= 0) {
      throw new InvalidQuantityError('Quantity must be an integer strictly greater than zero');
    }
    if (!Number.isInteger(data.snapshotPriceMinor) || data.snapshotPriceMinor < 0) {
      throw new InvalidPriceError('Snapshot price must be a non-negative integer (minor units)');
    }

    this.productId = data.productId;
    this.snapshotName = data.snapshotName;
    this.snapshotPriceMinor = data.snapshotPriceMinor;
    this.quantity = data.quantity;
  }

  get lineTotalMinor(): number {
    return this.snapshotPriceMinor * this.quantity;
  }

  withQuantity(newQuantity: number): BillItem {
    return new BillItem({
      productId: this.productId,
      snapshotName: this.snapshotName,
      snapshotPriceMinor: this.snapshotPriceMinor,
      quantity: newQuantity
    });
  }
}
