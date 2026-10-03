import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { SetupService } from '../src/application/use-cases/SetupService';
import { SettingsRepository } from '../src/infrastructure/repositories/settings.repository';
import { ProductRepository } from '../src/infrastructure/repositories/product.repository';
import { SettingsService } from '../src/application/use-cases/SettingsService';

describe('SetupService', () => {
  let db: Database.Database;
  let settingsRepo: SettingsRepository;
  let productRepo: ProductRepository;
  let settingsService: SettingsService;
  let setupService: SetupService;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE products (
        id TEXT PRIMARY KEY,
        barcode TEXT UNIQUE,
        name TEXT NOT NULL,
        price_minor INTEGER NOT NULL,
        is_active INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);

    settingsRepo = new SettingsRepository(db);
    productRepo = new ProductRepository(db);
    settingsService = new SettingsService(settingsRepo);
    setupService = new SetupService(settingsRepo, productRepo, settingsService);
  });

  it('1. Fresh setup returns NOT_STARTED', () => {
    expect(setupService.getState().status).toBe('NOT_STARTED');
  });

  it('2. Valid store name persists', () => {
    setupService.saveStoreProfile('My New Store');
    expect(setupService.getState().status).toBe('IN_PROGRESS');
    expect(settingsService.getStoreConfig().shopName).toBe('My New Store');
  });

  it('3. Empty store name rejected', () => {
    expect(() => setupService.saveStoreProfile('')).toThrow('Store name cannot be empty.');
  });

  it('4. Whitespace-only store name rejected', () => {
    expect(() => setupService.saveStoreProfile('   ')).toThrow('Store name cannot be empty.');
  });

  it('5. Overlong store name rejected', () => {
    const longName = 'A'.repeat(51);
    expect(() => setupService.saveStoreProfile(longName)).toThrow('Store name is too long.');
  });

  it('6. Unicode store name handled safely', () => {
    const unicodeName = 'Café de Paris \u2728';
    setupService.saveStoreProfile(unicodeName);
    expect(settingsService.getStoreConfig().shopName).toBe(unicodeName);
  });

  it('7. Setup completion persists', () => {
    setupService.saveStoreProfile('Store');
    setupService.complete();
    expect(setupService.getState().status).toBe('COMPLETED');
    
    // Re-initialize to check persistence
    const newService = new SetupService(settingsRepo, productRepo, settingsService);
    expect(newService.getState().status).toBe('COMPLETED');
  });

  it('8. Completion is idempotent', () => {
    setupService.complete();
    expect(setupService.getState().status).toBe('COMPLETED');
    setupService.complete();
    expect(setupService.getState().status).toBe('COMPLETED');
  });

  it('9. Interrupted setup resumes', () => {
    setupService.saveStoreProfile('Saved Name');
    
    // Simulate restart
    const newService = new SetupService(settingsRepo, productRepo, settingsService);
    expect(newService.getState().status).toBe('IN_PROGRESS');
    expect(settingsService.getStoreConfig().shopName).toBe('Saved Name');
  });

  it('10. Corrupt setup state fails safely', () => {
    // Manually insert corrupted JSON
    db.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('app_setup', 'invalid json', 0)").run();
    
    // settingsRepo.get should return null on catch, falling back to NOT_STARTED (or migration check)
    // Since it's a fresh DB, migration check returns NOT_STARTED.
    expect(setupService.getState().status).toBe('NOT_STARTED');
  });

  it('11. Existing installation compatibility path works - via settings', () => {
    // Simulate existing settings (prior to setup)
    settingsRepo.set('app_settings', { store: { shopName: 'Old Store' }, printer: {} });
    
    const newService = new SetupService(settingsRepo, productRepo, settingsService);
    expect(newService.getState().status).toBe('COMPLETED');
  });

  it('11b. Existing installation compatibility path works - via products', () => {
    // Simulate existing product
    productRepo.create({ name: 'Old Product', price_minor: 100, barcode: null });
    
    const newService = new SetupService(settingsRepo, productRepo, settingsService);
    expect(newService.getState().status).toBe('COMPLETED');
  });
});
