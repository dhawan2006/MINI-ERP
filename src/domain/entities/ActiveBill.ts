import { BillItem } from './BillItem';
import { Product } from './Product';
import { InactiveProductError, EmptyBillError, ProductNotFoundError } from '../errors';

const MAX_UNDO_DEPTH = 50;

export class ActiveBill {
  private _items: BillItem[] = [];
  private _history: BillItem[][] = [];

  constructor(initialItems: BillItem[] = []) {
    this._items = [...initialItems];
  }

  get items(): readonly BillItem[] {
    return this._items;
  }

  get totalMinor(): number {
    return this._items.reduce((sum, item) => sum + item.lineTotalMinor, 0);
  }

  get isEmpty(): boolean {
    return this._items.length === 0;
  }

  private saveHistoryState() {
    this._history.push([...this._items]);
    if (this._history.length > MAX_UNDO_DEPTH) {
      this._history.shift(); // remove oldest
    }
  }

  addProduct(product: Product): void {
    if (!product.isActive) {
      throw new InactiveProductError(`Cannot add inactive product: ${product.name}`);
    }

    this.saveHistoryState();

    const existingIndex = this._items.findIndex(item => item.productId === product.id);
    
    if (existingIndex >= 0) {
      const existing = this._items[existingIndex];
      // Merge quantity. Existing snapshot price and name remain untouched.
      this._items[existingIndex] = existing.withQuantity(existing.quantity + 1);
    } else {
      this._items.push(new BillItem({
        productId: product.id,
        snapshotName: product.name,
        snapshotPriceMinor: product.priceMinor,
        quantity: 1
      }));
    }
  }

  setQuantity(productId: string, quantity: number): void {
    const existingIndex = this._items.findIndex(item => item.productId === productId);
    if (existingIndex === -1) {
      throw new ProductNotFoundError(`Product not found in bill: ${productId}`);
    }

    this.saveHistoryState();

    if (quantity <= 0) {
      // Remove item entirely if quantity is set to 0
      this._items.splice(existingIndex, 1);
    } else {
      this._items[existingIndex] = this._items[existingIndex].withQuantity(quantity);
    }
  }

  increaseQuantity(productId: string): void {
    const existingIndex = this._items.findIndex(item => item.productId === productId);
    if (existingIndex === -1) {
      throw new ProductNotFoundError(`Product not found in bill: ${productId}`);
    }
    const currentQty = this._items[existingIndex].quantity;
    this.setQuantity(productId, currentQty + 1);
  }

  decreaseQuantity(productId: string): void {
    const existingIndex = this._items.findIndex(item => item.productId === productId);
    if (existingIndex === -1) {
      throw new ProductNotFoundError(`Product not found in bill: ${productId}`);
    }
    const currentQty = this._items[existingIndex].quantity;
    this.setQuantity(productId, currentQty - 1); // Will remove if it hits 0
  }

  removeProduct(productId: string): void {
    const existingIndex = this._items.findIndex(item => item.productId === productId);
    if (existingIndex === -1) {
      throw new ProductNotFoundError(`Product not found in bill: ${productId}`);
    }

    this.saveHistoryState();
    this._items.splice(existingIndex, 1);
  }

  clear(): void {
    if (this._items.length === 0) return; // Nothing to clear
    this.saveHistoryState();
    this._items = [];
  }

  undo(): boolean {
    if (this._history.length === 0) {
      return false; // Nothing to undo
    }
    const previousState = this._history.pop()!;
    this._items = [...previousState];
    return true;
  }

  validateForFinalization(): void {
    if (this.isEmpty) {
      throw new EmptyBillError('Cannot finalize an empty bill');
    }
    // Items are self-validating via BillItem constructor, so if they exist, they are valid.
  }
}
