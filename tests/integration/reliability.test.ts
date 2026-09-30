import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/infrastructure/database/migrations';
import { BillRepository } from '../../src/infrastructure/repositories/bill.repository';
import { DraftRepository } from '../../src/infrastructure/repositories/draft.repository';
import { ProductRepository } from '../../src/infrastructure/repositories/product.repository';
import { BillingService } from '../../src/application/use-cases/BillingService';
import { SettingsService } from '../../src/application/use-cases/SettingsService';
import { SettingsRepository } from '../../src/infrastructure/repositories/settings.repository';
import { ActiveBill } from '../../src/domain/entities/ActiveBill';
import { BillItem } from '../../src/domain/entities/BillItem';
import { StoreConfigDTO } from '../../src/shared/dto';

describe('Stage 16 Reliability - Fault Injection', () => {
  let db: Database.Database;
  let draftRepo: DraftRepository;
  let billRepo: BillRepository;
  let productRepo: ProductRepository;
  let settingsRepo: SettingsRepository;
  let settingsService: SettingsService;
  let billingService: BillingService;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    runMigrations(db);

    draftRepo = new DraftRepository(db);
    billRepo = new BillRepository(db, draftRepo);
    productRepo = new ProductRepository(db);
    settingsRepo = new SettingsRepository(db);
    settingsService = new SettingsService(settingsRepo);
    billingService = new BillingService('terminal-1', productRepo, draftRepo, billRepo, settingsService);

    // Setup initial product
    const now = Date.now();
    db.prepare('INSERT INTO products (id, barcode, name, price_minor, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run('p1', '111', 'Test Product', 500, now, now);
  });

  afterEach(() => {
    db.close();
    vi.restoreAllMocks();
  });

  it('rolls back the entire finalization transaction if insertion fails halfway', () => {
    const activeBill = new ActiveBill([
      new BillItem({ productId: 'p1', snapshotName: 'Test Product', snapshotPriceMinor: 500, quantity: 2 })
    ]);
    
    // Save draft initially to simulate real workflow
    draftRepo.saveDraft('terminal-1', activeBill);

    const storeConfig: StoreConfigDTO = { shopName: 'Shop', shopAddress: '', shopPhone: '' };

    // Inject a fault into SQLite by mocking the db.prepare specifically for bill_items
    const originalPrepare = db.prepare.bind(db);
    vi.spyOn(db, 'prepare').mockImplementation((sql: string) => {
      if (sql.includes('INSERT INTO bill_items')) {
        throw new Error('SIMULATED_SQLITE_ERROR');
      }
      return originalPrepare(sql);
    });

    // Attempt finalization
    expect(() => {
      billRepo.persistFinalizedBill(activeBill, storeConfig, 'terminal-1');
    }).toThrow('SIMULATED_SQLITE_ERROR');

    // VERIFICATION 1: Bill was not partially created
    const billsCount = db.prepare('SELECT COUNT(*) as count FROM bills').get() as { count: number };
    expect(billsCount.count).toBe(0);

    // VERIFICATION 2: Draft was NOT deleted (since transaction rolled back)
    const draft = draftRepo.loadDraft('terminal-1');
    expect(draft).not.toBeNull();
    expect(draft?.items.length).toBe(1);
    expect(draft?.items[0].productId).toBe('p1');
  });

  it('gracefully handles corrupted draft JSON on load', () => {
    const now = Date.now();
    // Manually insert corrupted JSON
    db.prepare('INSERT INTO drafts (id, version, serialized_state, updated_at) VALUES (?, 1, ?, ?)').run('terminal-1', 'INVALID{JSON', now);

    // It should not throw, it should just return null (empty draft)
    const draft = draftRepo.loadDraft('terminal-1');
    expect(draft).toBeNull();
  });
});
