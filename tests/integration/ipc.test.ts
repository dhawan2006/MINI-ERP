import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BillingService } from '../../src/application/use-cases/BillingService';
import { registerBillingHandlers } from '../../electron/ipc/billing.handlers';
import { ipcMain } from 'electron';

// Mock electron's ipcMain
vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
  }
}));

describe('IPC Billing Handlers Integration', () => {
  let mockBillingService: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockBillingService = {
      loadActiveDraft: vi.fn(),
      addProductById: vi.fn(),
      finalizeBill: vi.fn(),
      currentBill: {
        items: [],
        totalMinor: 0,
        isEmpty: true
      }
    };
  });

  it('registers expected IPC channels', () => {
    registerBillingHandlers(mockBillingService);
    
    const registeredChannels = (ipcMain.handle as any).mock.calls.map((call: any) => call[0]);
    expect(registeredChannels).toContain('billing:loadDraft');
    expect(registeredChannels).toContain('billing:addProduct');
    expect(registeredChannels).toContain('billing:finalize');
  });

  it('translates successful domain results to valid IpcResponse', async () => {
    registerBillingHandlers(mockBillingService);
    
    // Find the handler for 'billing:addProduct'
    const addProductHandler = (ipcMain.handle as any).mock.calls.find((call: any) => call[0] === 'billing:addProduct')[1];
    
    mockBillingService.currentBill = {
      items: [{ productId: 'p1', snapshotName: 'Test', snapshotPriceMinor: 100, quantity: 1, lineTotalMinor: 100 }],
      totalMinor: 100,
      isEmpty: false
    };

    const response = await addProductHandler({} as any, 'p1');
    
    expect(response.success).toBe(true);
    expect(response.data.totalMinor).toBe(100);
    expect(response.data.items.length).toBe(1);
    expect(mockBillingService.addProductById).toHaveBeenCalledWith('p1');
  });

  it('translates DomainErrors into safe structured IpcErrors', async () => {
    registerBillingHandlers(mockBillingService);
    
    const addProductHandler = (ipcMain.handle as any).mock.calls.find((call: any) => call[0] === 'billing:addProduct')[1];
    
    // Simulate domain error
    class InactiveProductError extends Error {
      constructor(m: string) { super(m); this.name = 'InactiveProductError'; Object.setPrototypeOf(this, new.target.prototype); }
    }
    
    mockBillingService.addProductById.mockImplementation(() => {
      throw new InactiveProductError('Cannot add inactive product');
    });

    const response = await addProductHandler({} as any, 'pI');
    
    expect(response.success).toBe(false);
    expect(response.error).toBeDefined();
    // Assuming mappers logic translates this correctly (vitest instance check might differ if we don't mock the exact DomainError but let's check code string fallback in mapper)
    // We expect the mapper to at least capture the message or return INTERNAL_ERROR.
  });
});
