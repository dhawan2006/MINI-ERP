import { ipcMain } from 'electron';
import { HistoryService } from '../../src/application/use-cases/HistoryService';
import { IpcResponse } from '../../src/shared/ipc-contracts';
import { BillHistoryListItemDTO, BillHistoryDetailDTO } from '../../src/shared/dto';
import { validatePositiveInteger, validateNonNegativeInteger, validateObject } from './validation';

export function registerHistoryHandlers(historyService: HistoryService) {
  ipcMain.handle('history:list', async (_, params: { offset: number; limit: number; filters?: { startDate?: number; endDate?: number } }): Promise<IpcResponse<{ items: BillHistoryListItemDTO[]; totalCount: number }>> => {
    try {
      validateObject(params, 'params');
      validateNonNegativeInteger(params.offset, 'offset');
      validatePositiveInteger(params.limit, 'limit');
      if (params.filters) {
        validateObject(params.filters, 'filters');
        if (params.filters.startDate !== undefined) validatePositiveInteger(params.filters.startDate, 'startDate');
        if (params.filters.endDate !== undefined) validatePositiveInteger(params.filters.endDate, 'endDate');
      }
      const data = await historyService.getHistoryList(params.offset, params.limit, params.filters);
      return { success: true, data };
    } catch (err: any) {
      return { success: false, error: { code: 'HISTORY_LIST_ERROR', message: err.message || 'Failed to fetch history list' } };
    }
  });

  ipcMain.handle('history:getDetails', async (_, billId: number): Promise<IpcResponse<BillHistoryDetailDTO>> => {
    try {
      validatePositiveInteger(billId, 'billId');
      const data = await historyService.getBillDetails(billId);
      if (!data) return { success: false, error: { code: 'NOT_FOUND', message: 'Bill not found' } };
      return { success: true, data };
    } catch (err: any) {
      return { success: false, error: { code: 'HISTORY_DETAILS_ERROR', message: err.message || 'Failed to fetch bill details' } };
    }
  });

  ipcMain.handle('history:searchByBillNumber', async (_, billNumber: number): Promise<IpcResponse<BillHistoryDetailDTO | null>> => {
    try {
      validatePositiveInteger(billNumber, 'billNumber');
      const data = await historyService.searchByBillNumber(billNumber);
      return { success: true, data };
    } catch (err: any) {
      return { success: false, error: { code: 'HISTORY_SEARCH_ERROR', message: err.message || 'Failed to search bill' } };
    }
  });
}
