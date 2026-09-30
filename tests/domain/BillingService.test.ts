import { describe, it, expect, vi } from 'vitest';
import { BillingService } from '../../src/application/use-cases/BillingService';
import { Product } from '../../src/domain/entities/Product';
import { IProductRepository } from '../../src/application/interfaces/IProductRepository';
import { IDraftRepository } from '../../src/application/interfaces/IDraftRepository';
import { IBillRepository } from '../../src/application/interfaces/IBillRepository';

describe('BillingService Use Cases', () => {
  it('coordinates domain state and draft persistence', () => {
    const mockProductRepo = {
      findByBarcode: vi.fn((barcode: string) => {
        if (barcode === '123') return new Product({ id: 'p1', name: 'Mock', barcode: '123', priceMinor: 100, isActive: true });
        return null;
      }),
      getById: vi.fn(),
      searchActiveByPrefix: vi.fn()
    } as IProductRepository;

    const mockDraftRepo = {
      saveDraft: vi.fn(),
      loadDraft: vi.fn(() => null),
      deleteDraft: vi.fn()
    } as IDraftRepository;

    const mockBillRepo = {
      persistFinalizedBill: vi.fn(() => ({ id: 1, billNumber: 1001, totalMinor: 100, timestamp: Date.now(), items: [] }))
    } as IBillRepository;

    const mockSettingsService = {
      getStoreConfig: vi.fn(() => ({
        shopName: 'Mock Shop',
        shopAddress: 'Mock Address',
        shopPhone: '123'
      }))
    } as any;

    const service = new BillingService('test_draft', mockProductRepo, mockDraftRepo, mockBillRepo, mockSettingsService);
    service.loadActiveDraft();

    expect(service.currentBill.isEmpty).toBe(true);

    // Add product
    service.addProductByBarcode('123');
    expect(service.currentBill.items.length).toBe(1);
    expect(mockDraftRepo.saveDraft).toHaveBeenCalledTimes(1);

    // Undo
    service.undo();
    expect(service.currentBill.isEmpty).toBe(true);
    expect(mockDraftRepo.saveDraft).toHaveBeenCalledTimes(2);

    // Finalize
    service.addProductByBarcode('123');
    const result = service.finalizeBill();
    expect(result.billNumber).toBe(1001);
    expect(mockBillRepo.persistFinalizedBill).toHaveBeenCalled();
    
    // Memory state should be cleared after finalize
    expect(service.currentBill.isEmpty).toBe(true);
  });
});
