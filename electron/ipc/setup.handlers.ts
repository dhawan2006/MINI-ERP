import { ipcMain } from 'electron';
import { SetupService } from '../../src/application/use-cases/SetupService';
import { IpcResponse } from '../../src/shared/ipc-contracts';
import { SetupStateDTO } from '../../src/shared/setup-dto';
import log from 'electron-log';

export function registerSetupHandlers(setupService: SetupService) {
  ipcMain.handle('setup:getState', async (): Promise<IpcResponse<SetupStateDTO>> => {
    try {
      const state = setupService.getState();
      return { success: true, data: state };
    } catch (error: any) {
      log.error('[IPC setup:getState] Failed:', error);
      return { success: false, error: { code: 'SETUP_GET_FAILED', message: error.message } };
    }
  });

  ipcMain.handle('setup:saveStoreProfile', async (_, shopName: string): Promise<IpcResponse<SetupStateDTO>> => {
    try {
      const state = setupService.saveStoreProfile(shopName);
      return { success: true, data: state };
    } catch (error: any) {
      log.error('[IPC setup:saveStoreProfile] Failed:', error);
      return { success: false, error: { code: 'SETUP_SAVE_PROFILE_FAILED', message: error.message } };
    }
  });

  ipcMain.handle('setup:complete', async (): Promise<IpcResponse<SetupStateDTO>> => {
    try {
      const state = setupService.complete();
      return { success: true, data: state };
    } catch (error: any) {
      log.error('[IPC setup:complete] Failed:', error);
      return { success: false, error: { code: 'SETUP_COMPLETE_FAILED', message: error.message } };
    }
  });
}
