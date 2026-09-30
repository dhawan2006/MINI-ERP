import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import Database from 'better-sqlite3';
import { app } from 'electron';
import { initDatabase, getDb } from '../../src/infrastructure/database/connection';
import { DraftRepository } from '../../src/infrastructure/repositories/draft.repository';
import { BillRepository } from '../../src/infrastructure/repositories/bill.repository';
import { ProductRepository } from '../../src/infrastructure/repositories/product.repository';
import { BillingService } from '../../src/application/use-cases/BillingService';
import { PdfExportService } from '../../src/infrastructure/pdf/PdfExportService';
import { PdfRenderConfig } from '../../src/infrastructure/pdf/PdfReceiptRenderer';

// Mock dialog and shell for tests
let lastSaveDialogPath = '';
let mockedSaveCancelled = false;

vi.mock('electron', () => {
  return {
    app: {
      getPath: vi.fn((name) => {
        if (name === 'userData') return path.join(process.cwd(), 'tests', 'temp');
        if (name === 'downloads') return path.join(process.cwd(), 'tests', 'temp', 'downloads');
        return process.cwd();
      }),
      getAppPath: vi.fn(() => process.cwd()),
    },
    dialog: {
      showSaveDialog: vi.fn().mockImplementation(async (options) => {
        if (mockedSaveCancelled) {
          return { canceled: true, filePath: '' };
        }
        // Save in tests/temp
        lastSaveDialogPath = path.join(process.cwd(), 'tests', 'temp', `Test-${Date.now()}.pdf`);
        return { canceled: false, filePath: lastSaveDialogPath };
      }),
    },
    shell: {
      openPath: vi.fn().mockResolvedValue(''),
    },
  };
});

describe('PdfExportService Integration', () => {
  const dbPath = ':memory:';
  let billRepo: BillRepository;
  let billingService: BillingService;
  let pdfService: PdfExportService;
  const fontPath = path.join(process.cwd(), 'assets', 'fonts', 'NotoSans-Regular.ttf');

  let finalizedBillId = 0;
  let db: Database.Database;

  beforeAll(async () => {
    // 1. Setup DB
    db = new Database(dbPath);
    db.exec(`
      CREATE TABLE products (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        barcode TEXT UNIQUE,
        price_minor INTEGER NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE drafts (
        id TEXT PRIMARY KEY,
        version INTEGER NOT NULL DEFAULT 1,
        serialized_state TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE bills (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bill_number INTEGER NOT NULL UNIQUE,
        total_minor INTEGER NOT NULL,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        finalized_at INTEGER NOT NULL,
        shop_name TEXT,
        shop_address TEXT,
        shop_phone TEXT
      );
      CREATE TABLE bill_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bill_id INTEGER NOT NULL,
        product_id TEXT NOT NULL,
        snapshot_name TEXT NOT NULL,
        snapshot_price_minor INTEGER NOT NULL,
        quantity INTEGER NOT NULL,
        line_total_minor INTEGER NOT NULL,
        FOREIGN KEY(bill_id) REFERENCES bills(id)
      );
    `);
    
    // 2. Setup repos & services
    const productRepo = new ProductRepository(db);
    const draftRepo = new DraftRepository(db);
    billRepo = new BillRepository(db, draftRepo);
    const mockSettingsService = {
      getStoreConfig: () => ({ shopName: 'Shop', shopAddress: 'Addr', shopPhone: '123' })
    } as any;
    billingService = new BillingService('test-draft-id', productRepo, draftRepo, billRepo, mockSettingsService);

    const config: PdfRenderConfig = { paperWidth: 80, fontPath };
    pdfService = new PdfExportService(billRepo, config);

    // 3. Seed product
    productRepo.create({
      barcode: 'PDF123',
      name: 'Integration PDF Product',
      price_minor: 5000,
    });

    // 4. Create a final bill
    billingService.loadActiveDraft();
    billingService.addProductByBarcode('PDF123');
    billingService.addProductByBarcode('PDF123');
    const currentBill = billingService.finalizeBill();
    expect(currentBill).toBeTruthy();
    finalizedBillId = (currentBill as any).id;

    // Ensure temp dir exists
    const tempDir = path.join(process.cwd(), 'tests', 'temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  });

  afterAll(() => {
    if (db) {
      db.close();
    }
  });

  it('I01 — Exports a valid bill to PDF successfully', async () => {
    mockedSaveCancelled = false;
    const result = await pdfService.exportBill(finalizedBillId);

    expect(result).toBeDefined();
    expect(result.filePath).toBe(lastSaveDialogPath);
    expect(result.billNumber).toBeGreaterThan(0);

    // Verify file exists on disk
    expect(fs.existsSync(lastSaveDialogPath)).toBe(true);

    // Read start of file to verify PDF header
    const fd = fs.openSync(lastSaveDialogPath, 'r');
    const headerBuf = Buffer.alloc(5);
    fs.readSync(fd, headerBuf, 0, 5, 0);
    fs.closeSync(fd);
    expect(headerBuf.toString()).toBe('%PDF-');

    // Clean up file
    fs.unlinkSync(lastSaveDialogPath);
  });

  it('I02 — Handles save cancellation gracefully without erroring', async () => {
    mockedSaveCancelled = true;
    try {
      await pdfService.exportBill(finalizedBillId);
      expect.fail('Should have thrown cancellation error');
    } catch (e: any) {
      expect(e.code).toBe('PDF_SAVE_CANCELLED');
    }
  });

  it('I03 — Fails securely if bill does not exist', async () => {
    mockedSaveCancelled = false;
    try {
      await pdfService.exportBill(99999);
      expect.fail('Should have thrown not found error');
    } catch (e: any) {
      expect(e.code).toBe('PDF_BILL_NOT_FOUND');
    }
  });

  it('I04 — Only opens trusted exported files', async () => {
    mockedSaveCancelled = false;
    const result = await pdfService.exportBill(finalizedBillId);
    const validPath = result.filePath;

    // Opening trusted path succeeds
    expect(PdfExportService.isTrustedExport(validPath)).toBe(true);

    // Opening untrusted path fails
    expect(PdfExportService.isTrustedExport('/etc/passwd')).toBe(false);

    // Clean up
    fs.unlinkSync(validPath);
  });
});
