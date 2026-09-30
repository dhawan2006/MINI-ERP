import { ipcMain } from 'electron';
import { PrintService } from '../../src/infrastructure/printing/PrintService';
import { IpcResponse } from '../../src/shared/ipc-contracts';
import { PrintJobDTO } from '../../src/shared/dto';
import { translateError } from './mappers';
import { validatePositiveInteger, validateString } from './validation';

export function registerPrintingHandlers(printService: PrintService) {
  ipcMain.handle('printing:createPrintJob', async (_, billId: number): Promise<IpcResponse<string>> => {
    try {
      validatePositiveInteger(billId, 'billId');
      const jobId = await printService.createPrintJob(billId);
      return { success: true, data: jobId };
    } catch (error) {
      return { success: false, error: translateError(error) };
    }
  });

  ipcMain.handle('printing:getJobStatus', async (_, jobId: string): Promise<IpcResponse<PrintJobDTO>> => {
    try {
      validateString(jobId, 'jobId');
      const status = printService.getJobStatus(jobId);
      if (!status) throw new Error('Job not found');
      return { success: true, data: status };
    } catch (error) {
      return { success: false, error: translateError(error) };
    }
  });

  ipcMain.handle('printing:retryPrintJob', async (_, billId: number): Promise<IpcResponse<string>> => {
    try {
      validatePositiveInteger(billId, 'billId');
      const jobId = await printService.retryPrintJob(billId);
      return { success: true, data: jobId };
    } catch (error) {
      return { success: false, error: translateError(error) };
    }
  });
}
