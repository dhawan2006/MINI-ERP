import { app, BrowserWindow, ipcMain, powerMonitor } from 'electron';
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
// Licensing — Phase 7
import { NativeDeviceIdentityAdapter } from './native/NativeDeviceIdentityAdapter';
import { LocalAuthorizationStore } from '../src/infrastructure/licensing/LocalAuthorizationStore';
import { AuthorizationVerifier } from '../server/licensing/src/crypto/AuthorizationVerifier';
import { LicensingService } from '../src/application/use-cases/LicensingService';
import { LicensingRuntimeService } from './licensing/LicensingRuntimeService';
import { LicensingLifecycleService } from "./licensing/LicensingLifecycleService";
import { registerLicensingHandlers } from './ipc/licensing.handlers';
// Phase 8
import { LicensingBillingGate } from './licensing/LicensingBillingGate';
// Phase 9
import { LicensingClient } from './licensing/LicensingClient';



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
  
  // Phase 8: BillingService is created now but the licensing gate is wired in
  // after licensingRuntime.initialize() below (licensing subsystem must be
  // initialized before the gate can be used).
  const billingService = new BillingService('terminal-1-draft', productRepo, draftRepo, billRepo, settingsService);

  const printerConfig = settingsService.getPrinterConfig();
  const printService = new PrintService(printerConfig, billRepo);

  // 4. Register IPC Handlers
  registerBillingHandlers(billingService);
  registerProductHandlers(productService);
  registerPrintingHandlers(printService);
  registerSettingsHandlers(settingsService, printService);

  // 5. PDF Export Service
  // Font path: resolved relative to the electron/ directory so it works in
  // both development (project root) and packaged builds.
  const fontPath = path.join(app.getAppPath(), 'assets', 'fonts', 'NotoSans-Regular.ttf');
  const pdfPaperWidth: 58 | 80 = (printerConfig.paperWidth === 58 || printerConfig.paperWidth === 80)
    ? printerConfig.paperWidth
    : 80; // safe default when printer not configured
  const pdfExportService = new PdfExportService(billRepo, {
    paperWidth: pdfPaperWidth,
    fontPath,
  });
  registerPdfHandlers(pdfExportService);

  // 6. History Service
  const historyService = new HistoryService(billRepo);
  registerHistoryHandlers(historyService);

  // 7. Backup Service
  const backupService = BackupService.getInstance();
  const restoreService = RestoreService.getInstance();

  const dialogService = process.env.MINIPOS_E2E_TEST === 'true' 
    ? new FakeDialogService() 
    : new ElectronDialogService();

  
  registerBackupHandlers(backupService, dialogService);
  registerRestoreHandlers(restoreService, dialogService, billingService);



  // Initialize printing hardware listeners internally (wait until UI requests it to send it, but warm up the app layer)
  billingService.loadActiveDraft();


  // === LICENSING SUBSYSTEM (Phase 7) ===
  // Must initialize BEFORE the BrowserWindow is created.
  // This guarantees the renderer never starts in an ambiguous state.
  // SEC-RT-003: IPC failure during startup cannot produce ACTIVE.
  const isTestMode = process.env.MINIPOS_E2E_TEST === 'true';
  
  let identityAdapter;
  if (isTestMode) {
    const { FakeDeviceIdentityProvider } = await import('./native/FakeDeviceIdentityProvider');
    identityAdapter = new FakeDeviceIdentityProvider();
  } else {
    identityAdapter = new NativeDeviceIdentityAdapter();
  }
  
  // SEC-RT-XXX: Identity provider must be explicitly initialized before use
  await identityAdapter.initialize();

  // The AuthorizationVerifier must be loaded with the trusted server public key(s).
  // In production, the key is embedded in the application bundle.
  // In testing/development, it starts empty (no keys registered → all verification fails → NOT_ACTIVATED).
  const authVerifier = new AuthorizationVerifier();
  const SERVER_PUBLIC_KEY_PEM = import.meta.env.VITE_LICENSING_SERVER_PUBLIC_KEY || process.env.LICENSING_SERVER_PUBLIC_KEY;
  const SERVER_KEY_ID = import.meta.env.VITE_LICENSING_SERVER_KEY_ID || process.env.LICENSING_SERVER_KEY_ID || 'qa-key-1';
  if (SERVER_PUBLIC_KEY_PEM) {
    // GitHub Secrets or Vite sometimes inject literal '\n' characters or wrap strings in extra quotes.
    // We sanitize the key so crypto.createPublicKey receives a valid PEM string.
    let cleanPem = SERVER_PUBLIC_KEY_PEM;
    if (cleanPem.startsWith('"') && cleanPem.endsWith('"')) {
      try {
        cleanPem = JSON.parse(cleanPem);
      } catch {
        cleanPem = cleanPem.slice(1, -1);
      }
    }
    cleanPem = cleanPem.replace(/\\n/g, '\n');
    
    authVerifier.registerTrustedKey(SERVER_KEY_ID, cleanPem);
    logger.info('LicensingRuntime: Server public key loaded.');
  } else {
    logger.warn('LicensingRuntime: No server public key configured. All authorizations will fail verification.');
  }

  const authStore = new LocalAuthorizationStore(userDataPath);
  const licensingService = new LicensingService(authStore, authVerifier, identityAdapter);
  
  if (isTestMode) {
    // E2E tests now use a valid test authorization.json seeded via test-entry.js.
    // Licensing authority remains perfectly intact; no production bypass exists here.
  }
  
  const LICENSING_SERVER_URL = import.meta.env.VITE_LICENSING_SERVER_URL || process.env.LICENSING_SERVER_URL || 'http://localhost:3456';
  const licensingClient = new LicensingClient(LICENSING_SERVER_URL);
  
  const licensingRuntime = new LicensingRuntimeService(licensingService, identityAdapter, licensingClient);
  const licensingLifecycle = new LicensingLifecycleService(licensingClient, identityAdapter, authStore);

  // Initialize licensing BEFORE creating window — fail closed if anything throws.
  await licensingRuntime.initialize();
  logger.info('LicensingRuntime: Initialization complete.');

  // Phase 8: Wire the billing enforcement gate now that the runtime is live.
  // BillingService.finalizeBill() will call gate.assertBillingPermitted() on
  // every finalization attempt. The decision is derived fresh each time.
  // SEC-BILL-001: Only Main-process authorization can permit finalization.
  const billingGate = new LicensingBillingGate(licensingRuntime);
  billingService.setBillingAuth(billingGate);
  logger.info('LicensingRuntime: Billing enforcement gate armed.');

  // Register narrow IPC: renderer can only getState(), never set it.
  registerLicensingHandlers(licensingRuntime, licensingLifecycle);

  // Resume-from-sleep hook: recompute authorization when machine wakes.
  // No network call — purely local re-evaluation (SEC-RT-009).
  powerMonitor.on('resume', async () => {
    logger.info('LicensingRuntime: System resume detected. Revalidating authorization...');
    await licensingRuntime.refreshAfterResume();
  });

  // Cleanup on quit
  app.on('will-quit', () => {
    licensingRuntime.dispose();
    if (!isTestMode && 'dispose' in identityAdapter) {
      (identityAdapter as NativeDeviceIdentityAdapter).dispose();
    }
  });
  // === END LICENSING SUBSYSTEM ===

  // Create Window
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  // Setup primitive IPC handlers
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
      }, 500); // Small delay to allow IPC response to return
      
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
