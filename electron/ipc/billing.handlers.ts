import { ipcMain } from 'electron';
import { BillingService } from '../../src/application/use-cases/BillingService';
import { IpcResponse } from '../../src/shared/ipc-contracts';
import { ActiveBillDTO, FinalizedBillDTO } from '../../src/shared/dto';
import { translateError, mapActiveBillToDTO } from './mappers';
import { validateNonEmptyString, validatePositiveInteger } from './validation';

export function registerBillingHandlers(billingService: BillingService) {
  
  // Helper to wrap service calls safely
  const handleRequest = async (action: () => void): Promise<IpcResponse<ActiveBillDTO>> => {
    try {
      action();
      return {
        success: true,
        data: mapActiveBillToDTO(billingService.currentBill)
      };
    } catch (error) {
      return {
        success: false,
        error: translateError(error)
      };
    }
  };

  ipcMain.handle('billing:loadDraft', async (): Promise<IpcResponse<ActiveBillDTO>> => {
    return handleRequest(() => billingService.loadActiveDraft());
  });

  ipcMain.handle('billing:addProduct', async (_, productId: string): Promise<IpcResponse<ActiveBillDTO>> => {
    return handleRequest(() => {
      validateNonEmptyString(productId, 'productId');
      billingService.addProductById(productId);
    });
  });

  ipcMain.handle('billing:addByBarcode', async (_, barcode: string): Promise<IpcResponse<ActiveBillDTO>> => {
    return handleRequest(() => {
      validateNonEmptyString(barcode, 'barcode');
      billingService.addProductByBarcode(barcode);
    });
  });

  ipcMain.handle('billing:setQuantity', async (_, productId: string, quantity: number): Promise<IpcResponse<ActiveBillDTO>> => {
    return handleRequest(() => {
      validateNonEmptyString(productId, 'productId');
      // domain accepts > 0 quantity
      validatePositiveInteger(quantity, 'quantity');
      billingService.setQuantity(productId, quantity);
    });
  });

  ipcMain.handle('billing:removeItem', async (_, productId: string): Promise<IpcResponse<ActiveBillDTO>> => {
    return handleRequest(() => {
      validateNonEmptyString(productId, 'productId');
      billingService.removeProduct(productId);
    });
  });

  ipcMain.handle('billing:undo', async (): Promise<IpcResponse<ActiveBillDTO>> => {
    return handleRequest(() => billingService.undo());
  });

  ipcMain.handle('billing:clear', async (): Promise<IpcResponse<ActiveBillDTO>> => {
    return handleRequest(() => billingService.clearDraft());
  });

  ipcMain.handle('billing:finalize', async (): Promise<IpcResponse<FinalizedBillDTO>> => {
    try {
      const result = billingService.finalizeBill();
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: translateError(error) };
    }
  });

  ipcMain.handle('billing:hasActiveDraft', async (): Promise<IpcResponse<boolean>> => {
    try {
      const hasDraft = billingService.hasActiveDraft();
      return { success: true, data: hasDraft };
    } catch (err: any) {
      return { success: false, error: { code: 'UNKNOWN_ERROR', message: err.message } };
    }
  });
}
