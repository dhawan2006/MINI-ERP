import { ipcMain, app } from 'electron';
import { RestoreService, RestoreValidationResult } from '../../src/infrastructure/services/RestoreService';
import { IpcResponse } from '../../src/shared/ipc-contracts';
import { IDialogService } from '../../src/application/interfaces/IDialogService';
import { BillingService } from '../../src/application/use-cases/BillingService';
import log from 'electron-log';

export function registerRestoreHandlers(
  restoreService: RestoreService, 
  dialogService: IDialogService,
  billingService: BillingService
) {
  ipcMain.handle('restore:validate', async (): Promise<IpcResponse<{ filePath: string, metadata: RestoreValidationResult }>> => {
    try {
      const { canceled, filePaths } = await dialogService.showOpenDialog({
        title: 'Select Backup Database to Restore',
        filters: [{ name: 'SQLite Database', extensions: ['db'] }],
        properties: ['openFile'],
        buttonLabel: 'Select Backup',
      });

      if (canceled || filePaths.length === 0) {
        return { success: false, error: { code: 'RESTORE_CANCELLED', message: 'Cancelled' } };
      }

      const filePath = filePaths[0];
      const metadata = await restoreService.validateBackup(filePath);

      if (!metadata.isValid) {
        return { success: false, error: { code: 'RESTORE_INVALID_BACKUP', message: metadata.error || 'Invalid backup.' } };
      }
      
      if (metadata.error && metadata.error.includes('RESTORE_INCOMPATIBLE_VERSION')) {
         return { success: false, error: { code: 'RESTORE_INCOMPATIBLE_VERSION', message: metadata.error } };
      }

      return { success: true, data: { filePath, metadata } };
    } catch (err: any) {
      log.error(`[IPC restore:validate] Error: ${err.message}`);
      return { success: false, error: { code: 'RESTORE_INVALID_BACKUP', message: 'An internal error occurred during backup validation.' } };
    }
  });

  ipcMain.handle('restore:execute', async (_, filePath: string): Promise<IpcResponse<void>> => {
    try {
      if (billingService.hasActiveDraft()) {
        return { success: false, error: { code: 'RESTORE_ACTIVE_DRAFT', message: 'An active draft exists. Finish or discard the current bill before restoring a backup.' } };
      }

      await restoreService.executeRestore(filePath);
      
      // Delay restart slightly to allow the UI to receive the success response and show a toast
      setTimeout(() => {
        app.relaunch();
        app.exit();
      }, 1000);

      return { success: true, data: undefined };
    } catch (err: any) {
      log.error(`[IPC restore:execute] Error: ${err.message}`);
      const errMsg = err.message || '';
      let code = 'RESTORE_REPLACEMENT_FAILED';
      let message = errMsg;
      
      if (errMsg.startsWith('RESTORE_')) {
        const parts = errMsg.split(':');
        code = parts[0].trim();
        message = parts.slice(1).join(':').trim() || 'Restore failed.';
      }
      
      return { success: false, error: { code, message } };
    }
  });
}
