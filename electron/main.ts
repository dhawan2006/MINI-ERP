import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { initLogger, logger } from '../src/infrastructure/logging/logger';
import { initDatabase } from '../src/infrastructure/database/connection';
import { ProductRepository } from '../src/infrastructure/repositories/product.repository';
import { DraftRepository } from '../src/infrastructure/repositories/draft.repository';
import { BillRepository } from '../src/infrastructure/repositories/bill.repository';
import { BillingService } from '../src/application/use-cases/BillingService';
import { registerBillingHandlers } from './ipc/billing.handlers';
import { registerProductHandlers } from './ipc/products.handlers';
import { PrintService } from '../src/infrastructure/printing/PrintService';
import { registerPrintingHandlers } from './ipc/printing.handlers';
import { SettingsRepository } from '../src/infrastructure/repositories/settings.repository';
import { SettingsService } from '../src/application/use-cases/SettingsService';
import { ProductService } from '../src/application/use-cases/ProductService';
import { registerSettingsHandlers } from './ipc/settings.handlers';
import { PdfExportService } from '../src/infrastructure/pdf/PdfExportService';
import { registerPdfHandlers } from './ipc/pdf.handlers';
import { HistoryService } from '../src/application/use-cases/HistoryService';
import { registerHistoryHandlers } from './ipc/history.handlers';
import { BackupService } from '../src/infrastructure/services/BackupService';
import { registerBackupHandlers } from './ipc/backup.handlers';
import { RestoreService } from '../src/infrastructure/services/RestoreService';
import { registerRestoreHandlers } from './ipc/restore.handlers';
import { ElectronDialogService } from './services/ElectronDialogService';
import { FakeDialogService } from './services/FakeDialogService';

// Initialize logging and process-level crash handlers
initLogger();
logger.info('Application starting...');

process.on('uncaughtException', (error) => {
  logger.error('FATAL: uncaughtException', error);
  // Perform minimal synchronous cleanup if needed
  if (app.isReady()) {
    app.quit();
  } else {
    process.exit(1);
  }
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('ERROR: unhandledRejection', { reason, promise });
  // We log and observe, but do not blindly terminate unless we know it violates a critical invariant.
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1024,
    height: 768,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(async () => {
  logger.info('App ready, initializing infrastructure...');
  // 1. Initialize SQLite Database Infrastructure
  const userDataPath = app.getPath('userData');
  const db = initDatabase(userDataPath);
  logger.info(`Database initialized at ${userDataPath}`);

  // 2. Instantiate Repositories
  const productRepo = new ProductRepository(db);
  const draftRepo = new DraftRepository(db);
  const billRepo = new BillRepository(db, draftRepo);
  const settingsRepo = new SettingsRepository(db);

  // 3. Instantiate Application Services
  const settingsService = new SettingsService(settingsRepo);
  const productService = new ProductService(productRepo);

  // Setup Service
  const { SetupService } = require('../src/application/use-cases/SetupService');
  const setupService = new SetupService(settingsRepo, productRepo, settingsService);

  // BillingService — operates in standalone desktop mode
  const billingService = new BillingService('terminal-1-draft', productRepo, draftRepo, billRepo, settingsService);

  const printerConfig = settingsService.getPrinterConfig();
  const printService = new PrintService(printerConfig, billRepo);

  // 4. Register IPC Handlers
  registerBillingHandlers(billingService);
  registerProductHandlers(productService);
  registerPrintingHandlers(printService);
  registerSettingsHandlers(settingsService, printService);
  const { registerSetupHandlers } = require('./ipc/setup.handlers');
  registerSetupHandlers(setupService);

  // 5. PDF Export Service
  const fontPath = path.join(app.getAppPath(), 'assets', 'fonts', 'NotoSans-Regular.ttf');
  const pdfPaperWidth: 58 | 80 = (printerConfig.paperWidth === 58 || printerConfig.paperWidth === 80)
    ? printerConfig.paperWidth
    : 80;
  const pdfExportService = new PdfExportService(billRepo, {
    paperWidth: pdfPaperWidth,
    fontPath,
  });
  registerPdfHandlers(pdfExportService);

  // 6. History Service
  const historyService = new HistoryService(billRepo);
  registerHistoryHandlers(historyService);

  // 7. Backup / Restore Services
  const backupService = BackupService.getInstance();
  const restoreService = RestoreService.getInstance();

  const dialogService = !app.isPackaged && process.env.MINIPOS_E2E_TEST === 'true'
    ? new FakeDialogService()
    : new ElectronDialogService();

  registerBackupHandlers(backupService, dialogService);
  registerRestoreHandlers(restoreService, dialogService, billingService);

  // Initialize draft state
  billingService.loadActiveDraft();

  // Create the main application window
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  // System IPC handlers
  ipcMain.handle('system:ping', () => 'pong from main process');

  ipcMain.handle('system:factoryReset', async () => {
    try {
      logger.warn('Executing factory reset...');
      const transaction = db.transaction(() => {
        db.prepare('DELETE FROM bill_items').run();
        db.prepare('DELETE FROM bills').run();
        db.prepare('DELETE FROM products').run();
        db.prepare('DELETE FROM drafts').run();
        db.prepare('DELETE FROM settings').run();
      });
      transaction();

      logger.info('Factory reset complete. Relaunching application.');
      setTimeout(() => {
        app.relaunch();
        app.quit();
      }, 500);

      return { success: true };
    } catch (error: any) {
      logger.error('Factory reset failed', error);
      return { success: false, error: { code: 'FACTORY_RESET_FAILED', message: error.message } };
    }
  });
});

app.on('window-all-closed', () => {
  logger.info('All windows closed, quitting application.');
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  logger.info('Application shutting down.');
});
