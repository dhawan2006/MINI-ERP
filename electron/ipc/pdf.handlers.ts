import { ipcMain, shell } from 'electron';
import { PdfExportService, PdfExportError } from '../../src/infrastructure/pdf/PdfExportService';
import { IpcResponse } from '../../src/shared/ipc-contracts';
import { PdfExportResultDTO } from '../../src/shared/dto';
import { validatePositiveInteger, validateNonEmptyString } from './validation';

export function registerPdfHandlers(pdfExportService: PdfExportService) {
  /**
   * pdf:exportBill
   * Receives only billId — never receives raw financial data from the renderer.
   * Main authoratatively fetches bill from DB, maps to ReceiptData, generates PDF.
   */
  ipcMain.handle('pdf:exportBill', async (_, billId: number): Promise<IpcResponse<PdfExportResultDTO>> => {
    try {
      validatePositiveInteger(billId, 'billId');
      const result = await pdfExportService.exportBill(billId);
      return { success: true, data: { filePath: result.filePath, billNumber: result.billNumber } };
    } catch (err) {
      if (err instanceof PdfExportError) {
        if (err.code === 'PDF_SAVE_CANCELLED') {
          // Normal cancellation — not an error from the user's perspective
          return { success: false, error: { code: 'PDF_SAVE_CANCELLED', message: 'Cancelled' } };
        }
        return { success: false, error: { code: err.code, message: err.message } };
      }
      // Never leak raw error details to renderer
      return { success: false, error: { code: 'PDF_GENERATION_FAILED', message: 'An internal error occurred during PDF export.' } };
    }
  });

  /**
   * pdf:openFile
   * Security: Only allows opening a file that was produced by THIS session's
   * exportBill call. Validated via PdfExportService.isTrustedExport().
   * The path comes from a prior IPC result, not from the renderer arbitrarily.
   */
  ipcMain.handle('pdf:openFile', async (_, filePath: string): Promise<IpcResponse<void>> => {
    try {
      validateNonEmptyString(filePath, 'filePath');
      // Gate: only open files we produced this session
      if (!PdfExportService.isTrustedExport(filePath)) {
        return { success: false, error: { code: 'PDF_OPEN_FAILED', message: 'File not recognised as a trusted export.' } };
      }
      const errMsg = await shell.openPath(filePath);
      if (errMsg) {
        return { success: false, error: { code: 'PDF_OPEN_FAILED', message: errMsg } };
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: { code: 'PDF_OPEN_FAILED', message: 'Failed to open PDF.' } };
    }
  });
}
