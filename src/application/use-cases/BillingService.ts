import { ActiveBill } from '../../domain/entities/ActiveBill';
import { ProductRepository } from '../../infrastructure/repositories/product.repository';
import { DraftRepository } from '../../infrastructure/repositories/draft.repository';
import { IBillRepository } from '../interfaces/IBillRepository';
import { SettingsService } from './SettingsService';
import { ProductNotFoundError } from '../../domain/errors';
import { FinalizedBillDTO } from '../../shared/dto';
import { ReceiptMapper } from '../mappers/ReceiptMapper';

export class BillingService {
  private activeBill: ActiveBill;

  constructor(
    private readonly draftId: string,
    private readonly productRepo: ProductRepository,
    private readonly draftRepo: DraftRepository,
    private readonly billRepo: IBillRepository,
    private readonly settingsService: SettingsService
  ) {
    this.activeBill = new ActiveBill();
  }

  /**
   * Initializes the service by loading an existing draft or starting a fresh one.
   */
  loadActiveDraft(): void {
    const draft = this.draftRepo.loadDraft(this.draftId);
    if (draft) {
      this.activeBill = draft;
    } else {
      this.activeBill = new ActiveBill();
    }
  }

  private saveState(): void {
    this.draftRepo.saveDraft(this.draftId, this.activeBill);
  }

  hasActiveDraft(): boolean {
    return this.activeBill.items.length > 0;
  }

  // Use cases that mutate domain state

  addProductByBarcode(barcode: string): void {
    const product = this.productRepo.findByBarcode(barcode);
    if (!product) {
      throw new ProductNotFoundError(`Product with barcode ${barcode} not found`);
    }
    this.activeBill.addProduct(product);
    this.saveState();
  }

  addProductById(productId: string): void {
    const product = this.productRepo.getById(productId);
    if (!product) {
      throw new ProductNotFoundError(`Product with id ${productId} not found`);
    }
    this.activeBill.addProduct(product);
    this.saveState();
  }

  setQuantity(productId: string, quantity: number): void {
    this.activeBill.setQuantity(productId, quantity);
    this.saveState();
  }

  increaseQuantity(productId: string): void {
    this.activeBill.increaseQuantity(productId);
    this.saveState();
  }

  decreaseQuantity(productId: string): void {
    this.activeBill.decreaseQuantity(productId);
    this.saveState();
  }

  removeProduct(productId: string): void {
    this.activeBill.removeProduct(productId);
    this.saveState();
  }

  undo(): boolean {
    const success = this.activeBill.undo();
    if (success) {
      this.saveState();
    }
    return success;
  }

  clearDraft(): void {
    this.activeBill.clear();
    this.saveState();
  }

  finalizeBill(): FinalizedBillDTO {
    // 1. Domain Validation
    this.activeBill.validateForFinalization();

    // 2. Capture settings snapshot & Persist to infrastructure
    const storeConfig = this.settingsService.getStoreConfig();
    const persistedBill = this.billRepo.persistFinalizedBill(this.activeBill, storeConfig, this.draftId);

    // 3. Clear memory state (only reached if DB commit succeeded)
    this.activeBill = new ActiveBill();

    return {
      id: persistedBill.id,
      billNumber: persistedBill.billNumber,
      totalMinor: persistedBill.totalMinor,
      receipt: ReceiptMapper.toReceiptData(persistedBill)
    };
  }

  // Getters for UI/Zustand layer

  get currentBill(): ActiveBill {
    return this.activeBill;
  }
}
