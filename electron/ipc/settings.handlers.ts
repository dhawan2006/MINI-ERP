import { ipcMain } from 'electron';
import { SettingsService } from '../../src/application/use-cases/SettingsService';
import { PrintService } from '../../src/infrastructure/printing/PrintService';
import { AppSettingsDTO, PrinterConfig } from '../../src/shared/dto';
import { IpcResponse } from '../../src/shared/ipc-contracts';
import { validateObject, validateBoolean, validateString, validatePositiveInteger, validateNumber } from './validation';

function validatePrinterConfig(config: unknown): void {
  const c = config as Record<string, unknown>;
  validateObject(c, 'PrinterConfig');
  validateBoolean(c.enabled, 'PrinterConfig.enabled');
  validateString(c.transport, 'PrinterConfig.transport');
  if (c.transport !== 'fake' && c.transport !== 'network' && c.transport !== 'usb') {
    throw new Error('Invalid transport type');
  }
  if (c.transport === 'network') {
    validateString(c.host, 'PrinterConfig.host');
    validatePositiveInteger(c.port, 'PrinterConfig.port');
  }
  validatePositiveInteger(c.paperWidth, 'PrinterConfig.paperWidth');
  validatePositiveInteger(c.charactersPerLine, 'PrinterConfig.charactersPerLine');
  validateBoolean(c.supportsCut, 'PrinterConfig.supportsCut');
  validateNumber(c.feedLines, 'PrinterConfig.feedLines');
  validateString(c.encoding, 'PrinterConfig.encoding');
}

function validateAppSettings(settings: unknown): void {
  const s = settings as Record<string, unknown>;
  validateObject(s, 'AppSettingsDTO');
  validateObject(s.store, 'AppSettingsDTO.store');
  const store = s.store as Record<string, unknown>;
  validateString(store.shopName, 'store.shopName');
  validateString(store.shopAddress, 'store.shopAddress');
  validateString(store.shopPhone, 'store.shopPhone');
  validatePrinterConfig(s.printer);
}

export function registerSettingsHandlers(settingsService: SettingsService, printService: PrintService) {
  ipcMain.handle('settings:get', async (): Promise<IpcResponse<AppSettingsDTO>> => {
    try {
      const settings = settingsService.getSettings();
      return { success: true, data: settings };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to get settings';
      return { success: false, error: { code: 'SETTINGS_GET_FAILED', message: msg } };
    }
  });

  ipcMain.handle('settings:update', async (_, settings: AppSettingsDTO): Promise<IpcResponse<AppSettingsDTO>> => {
    try {
      validateAppSettings(settings);
      const updatedSettings = settingsService.updateSettings(settings);
      printService.updateConfig(updatedSettings.printer);
      return { success: true, data: updatedSettings };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to update settings';
      return { success: false, error: { code: 'SETTINGS_UPDATE_FAILED', message: msg } };
    }
  });

  ipcMain.handle('settings:testPrint', async (_, draftConfig: PrinterConfig): Promise<IpcResponse<void>> => {
    try {
      validatePrinterConfig(draftConfig);
      await printService.executeTestPrint(draftConfig);
      return { success: true };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Test print failed';
      return { success: false, error: { code: 'TEST_PRINT_FAILED', message: msg } };
    }
  });
}
