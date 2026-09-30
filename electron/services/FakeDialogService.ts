import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import log from 'electron-log';
import { IDialogService, SaveDialogOptions, OpenDialogOptions } from '../../src/application/interfaces/IDialogService';

export class FakeDialogService implements IDialogService {
  public async showSaveDialog(options: SaveDialogOptions): Promise<{ canceled: boolean; filePath?: string }> {
    // Simulate user choosing a destination for E2E tests
    const defaultName = options.defaultPath ? path.basename(options.defaultPath) : 'e2e-backup.db';
    const filePath = path.join(app.getPath('userData'), 'e2e-test-backups', defaultName);

    // Ensure the directory exists
    if (!fs.existsSync(path.dirname(filePath))) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
    }

    return { canceled: false, filePath };
  }

  async showOpenDialog(_options: OpenDialogOptions): Promise<{ canceled: boolean; filePaths: string[] }> {
    const p = path.join(app.getPath('userData'), 'e2e-test-backups', 'mock-restore.db');
    log.info('[FakeDialogService] showOpenDialog called, returning', p);
    const filePaths = [p];
    return { canceled: false, filePaths };
  }
}
