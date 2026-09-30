import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { BillRepository } from '../../src/infrastructure/repositories/bill.repository';
import { DraftRepository } from '../../src/infrastructure/repositories/draft.repository';
import { ProductRepository } from '../../src/infrastructure/repositories/product.repository';
import { BillingService } from '../../src/application/use-cases/BillingService';
import { ActiveBill } from '../../src/domain/entities/ActiveBill';
import { Product } from '../../src/domain/entities/Product';
import { FakePrinterAdapter } from '../../src/infrastructure/printing/FakePrinterAdapter';
import { PrintService } from '../../src/infrastructure/printing/PrintService';

describe('Stage 11 - Transactions and Printing', () => {
  let db: Database.Database;
  let draftRepo: DraftRepository;
  let billRepo: BillRepository;
  let productRepo: ProductRepository;
  let billingService: BillingService;
  let printerAdapter: FakePrinterAdapter;
  let printService: PrintService;

  beforeEach(() => {
    db = new Database(':memory:');
    
    // Initialize Schema
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

    draftRepo = new DraftRepository(db);
    billRepo = new BillRepository(db, draftRepo);
    productRepo = new ProductRepository(db);

    // We pass PrinterConfig now
    const config = {
      enabled: true,
      transport: 'fake',
      paperWidth: 80,
      charactersPerLine: 48,
      feedLines: 3,
      supportsCut: true
    } as any;
    printService = new PrintService(config, billRepo);
    printerAdapter = (printService as any).printerAdapter;
    printerAdapter.setDelay(10); // Fast for tests

    const mockSettingsService = {
      getStoreConfig: () => ({ shopName: 'Shop', shopAddress: 'Addr', shopPhone: '123' })
    } as any;

    billingService = new BillingService('term-1', productRepo, draftRepo, billRepo, mockSettingsService);

    // Setup basic products
    productRepo.create({ name: 'Apple', price_minor: 100, barcode: '111' });
    productRepo.create({ name: 'Banana', price_minor: 50, barcode: '222' });
  });

  afterEach(() => {
    db.close();
  });

  describe('Finalization Atomicity', () => {
    it('should rollback entirely if item insertion fails', () => {
      billingService.loadActiveDraft();
      billingService.addProductByBarcode('111');
      
      // Inject failure: we will manually break the active bill by tampering with internal state
      // We'll set an invalid quantity that fails DB constraint
      billingService.currentBill.items[0] = { ...billingService.currentBill.items[0], quantity: -1 } as any;

      expect(() => {
        billingService.finalizeBill();
      }).toThrow();

      // Ensure no bill was created
      const bills = db.prepare('SELECT * FROM bills').all();
      expect(bills).toHaveLength(0);

      // Ensure draft is not deleted!
      const draft = draftRepo.loadDraft('term-1');
      expect(draft).not.toBeNull();
    });

    it('should prevent finalizing an empty bill', () => {
      billingService.loadActiveDraft();
      expect(billingService.currentBill.isEmpty).toBe(true);

      expect(() => {
        billingService.finalizeBill();
      }).toThrow(/Cannot finalize an empty bill/);

      const bills = db.prepare('SELECT * FROM bills').all();
      expect(bills).toHaveLength(0);
    });

    it('should generate monotonic strictly increasing bill numbers', () => {
      billingService.loadActiveDraft();
      billingService.addProductByBarcode('111');
      const b1 = billingService.finalizeBill();

      billingService.loadActiveDraft();
      billingService.addProductByBarcode('222');
      const b2 = billingService.finalizeBill();

      expect(b1.billNumber).toBe(1001);
      expect(b2.billNumber).toBe(1002);
    });
  });

  describe('Print Orchestration & Failure Recovery', () => {
    it('should continue if print fails, without breaking the bill', async () => {
      // 1. Finalize
      billingService.loadActiveDraft();
      billingService.addProductByBarcode('111');
      const billDto = billingService.finalizeBill();

      // 2. Simulate Printer Failure
      printerAdapter.setFailureMode(true);

      // 3. Create Print Job
      const jobId = await printService.createPrintJob(billDto.id);
      
      // 4. Wait for it to fail
      await new Promise(r => setTimeout(r, 20));

      const status = printService.getJobStatus(jobId);
      expect(status?.state).toBe('FAILED');
      expect(status?.error).toMatch(/hardware failure/);

      // 5. Verify the bill is still safely in DB
      const dbBill = billRepo.getBillById(billDto.id);
      expect(dbBill).not.toBeNull();
      expect(dbBill?.status).toBe('FINALIZED');
    });

    it('should allow successful retry after a print failure using the same bill id', async () => {
      billingService.loadActiveDraft();
      billingService.addProductByBarcode('111');
      const billDto = billingService.finalizeBill();

      printerAdapter.setFailureMode(true);
      const failedJobId = await printService.createPrintJob(billDto.id);
      
      await new Promise(r => setTimeout(r, 20));
      expect(printService.getJobStatus(failedJobId)?.state).toBe('FAILED');

      // Now printer is fixed
      printerAdapter.setFailureMode(false);
      const retryJobId = await printService.retryPrintJob(billDto.id);

      await new Promise(r => setTimeout(r, 20));
      expect(printService.getJobStatus(retryJobId)?.state).toBe('ACCEPTED');

      // Verify no duplicate bills were created
      const allBills = db.prepare('SELECT * FROM bills').all();
      expect(allBills).toHaveLength(1);
    });
  });
});
