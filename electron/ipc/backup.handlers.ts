import { ipcMain, app } from 'electron';
import path from 'path';
import fs from 'fs';
import { BackupService } from '../../src/infrastructure/services/BackupService';
import { IpcResponse } from '../../src/shared/ipc-contracts';
import { IDialogService } from '../../src/application/interfaces/IDialogService';

export function registerBackupHandlers(backupService: BackupService, dialogService: IDialogService) {
  ipcMain.handle('backup:export', async (): Promise<IpcResponse<{ filePath: string; sizeBytes: number }>> => {
    try {
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const filename = `Mini-POS-Backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}-${pad(now.getMinutes())}.db`;
      const defaultPath = path.join(app.getPath('downloads'), filename);

      const { canceled, filePath } = await dialogService.showSaveDialog({
        title: 'Export Database Backup',
        defaultPath,
        filters: [{ name: 'SQLite Database', extensions: ['db'] }],
        buttonLabel: 'Save Backup',
      });

      if (canceled || !filePath) {
        return { success: false, error: { code: 'BACKUP_CANCELLED', message: 'Cancelled' } };
      }

      await backupService.createBackup(filePath);

      const sizeBytes = fs.statSync(filePath).size;

      return { success: true, data: { filePath, sizeBytes } };

    } catch (err: any) {
      const errMsg = err.message || '';
      if (errMsg.startsWith('BACKUP_')) {
        const parts = errMsg.split(':');
        const code = parts[0].trim();
        const message = parts.slice(1).join(':').trim() || 'Backup failed.';
        return { success: false, error: { code, message } };
      }
      return { success: false, error: { code: 'BACKUP_FAILED', message: 'An internal error occurred during backup export.' } };
    }
  });
}
