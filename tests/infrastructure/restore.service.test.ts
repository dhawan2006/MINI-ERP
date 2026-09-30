import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import Database from 'better-sqlite3';
import { BackupService } from '../../src/infrastructure/services/BackupService';
import { RestoreService } from '../../src/infrastructure/services/RestoreService';
import { initDatabase, closeDatabase } from '../../src/infrastructure/database/connection';
import { runMigrations } from '../../src/infrastructure/database/migrations';
import { app } from 'electron';

// Mock electron app
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/tmp/minipos-test-user-data'),
  },
  ipcMain: { handle: vi.fn(), on: vi.fn() }
}));

// Mock BackupService
vi.mock('../../src/infrastructure/services/BackupService', () => {
  return {
    BackupService: {
      getInstance: () => ({
        createBackup: vi.fn().mockResolvedValue(true)
      })
    }
  };
});

describe('RestoreService', () => {
  const userDataPath = '/tmp/minipos-test-user-data';
  const dbDir = path.join(userDataPath, 'mini-erp-data');
  const liveDbPath = path.join(dbDir, 'billing.db');
  let restoreService: RestoreService;
  
  beforeEach(() => {
    if (fs.existsSync(userDataPath)) {
      fs.rmSync(userDataPath, { recursive: true, force: true });
    }
    fs.mkdirSync(dbDir, { recursive: true });
    initDatabase(userDataPath);
    restoreService = RestoreService.getInstance();
  });

  afterEach(() => {
    closeDatabase();
    if (fs.existsSync(userDataPath)) {
      fs.rmSync(userDataPath, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  function createMockBackup(filePath: string, version: number = 3) {
    const db = new Database(filePath);
    
    // Actually run migrations only up to the requested version
    db.exec(`
      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY,
        migrated_at INTEGER NOT NULL
      );
    `);

    // V1
    if (version >= 1) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, barcode TEXT UNIQUE, name TEXT NOT NULL, price_minor INTEGER NOT NULL, is_active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS bills (id INTEGER PRIMARY KEY AUTOINCREMENT, bill_number INTEGER UNIQUE NOT NULL, total_minor INTEGER NOT NULL, status TEXT NOT NULL, created_at INTEGER NOT NULL, finalized_at INTEGER);
        CREATE TABLE IF NOT EXISTS bill_items (id INTEGER PRIMARY KEY AUTOINCREMENT, bill_id INTEGER NOT NULL, product_id TEXT NOT NULL, snapshot_name TEXT NOT NULL, snapshot_price_minor INTEGER NOT NULL, quantity INTEGER NOT NULL, line_total_minor INTEGER NOT NULL, FOREIGN KEY (bill_id) REFERENCES bills(id) ON DELETE CASCADE);
        CREATE TABLE IF NOT EXISTS drafts (id TEXT PRIMARY KEY, version INTEGER NOT NULL DEFAULT 1, serialized_state TEXT NOT NULL, updated_at INTEGER NOT NULL);
      `);
      db.prepare('INSERT INTO schema_version (version, migrated_at) VALUES (?, ?)').run(1, Date.now());
    }

    // V2
    if (version >= 2) {
      db.exec(`CREATE INDEX IF NOT EXISTS idx_bills_finalized_at ON bills(finalized_at DESC);`);
      db.prepare('INSERT INTO schema_version (version, migrated_at) VALUES (?, ?)').run(2, Date.now());
    }

    // V3
    if (version >= 3) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);
        ALTER TABLE bills ADD COLUMN shop_name TEXT;
        ALTER TABLE bills ADD COLUMN shop_address TEXT;
        ALTER TABLE bills ADD COLUMN shop_phone TEXT;
      `);
      db.prepare('INSERT INTO schema_version (version, migrated_at) VALUES (?, ?)').run(3, Date.now());
    }
    
    // Future version
    if (version > 3) {
      db.prepare('INSERT INTO schema_version (version, migrated_at) VALUES (?, ?)').run(version, Date.now());
    }

    db.close();
  }

  it('validates a correct backup', async () => {
    const backupPath = path.join(dbDir, 'test-backup.db');
    createMockBackup(backupPath);

    const validation = await restoreService.validateBackup(backupPath);
    expect(validation.isValid).toBe(true);
    expect(validation.schemaVersion).toBe(3);
    expect(validation.isOlder).toBe(false);
  });

  it('rejects an empty backup', async () => {
    const backupPath = path.join(dbDir, 'test-backup-empty.db');
    fs.writeFileSync(backupPath, '');

    const validation = await restoreService.validateBackup(backupPath);
    expect(validation.isValid).toBe(false);
    expect(validation.error).toContain('RESTORE_INVALID_BACKUP: File is empty');
  });

  it('rejects a corrupted backup', async () => {
    const backupPath = path.join(dbDir, 'test-backup-corrupt.db');
    fs.writeFileSync(backupPath, 'not a sqlite database file this is just some string');

    const validation = await restoreService.validateBackup(backupPath);
    expect(validation.isValid).toBe(false);
    expect(validation.error).toContain('RESTORE_INVALID_BACKUP: file is not a database');
  });

  it('rejects backup missing required tables', async () => {
    const backupPath = path.join(dbDir, 'test-backup-missing-tables.db');
    const db = new Database(backupPath);
    db.prepare('CREATE TABLE something (id TEXT)').run();
    db.close();

    const validation = await restoreService.validateBackup(backupPath);
    expect(validation.isValid).toBe(false);
    expect(validation.error).toContain('Missing required table');
  });

  it('rejects backup with newer schema version', async () => {
    const backupPath = path.join(dbDir, 'test-backup-newer.db');
    createMockBackup(backupPath, 999); // Future version

    const validation = await restoreService.validateBackup(backupPath);
    expect(validation.isValid).toBe(false);
    expect(validation.error).toContain('RESTORE_INCOMPATIBLE_VERSION');
  });

  it('allows backup with older schema version', async () => {
    const backupPath = path.join(dbDir, 'test-backup-older.db');
    createMockBackup(backupPath, 1);

    const validation = await restoreService.validateBackup(backupPath);
    expect(validation.isValid).toBe(true);
    expect(validation.isOlder).toBe(true);
  });

  it('executes a full restore successfully', async () => {
    const backupPath = path.join(dbDir, 'test-backup-execute.db');
    createMockBackup(backupPath);

    await expect(restoreService.executeRestore(backupPath)).resolves.toBeUndefined();

    // Verify it got restored (the new active DB is readable and functional)
    const liveDb = new Database(liveDbPath, { readonly: true });
    expect(liveDb.prepare('SELECT count(*) as c FROM schema_version').get()).toBeDefined();
    liveDb.close();
  });

  it('fails safely and rolls back if replacement fails', async () => {
    const backupPath = path.join(dbDir, 'test-backup-execute.db');
    createMockBackup(backupPath);

    // Mock renameSync to fail on the SECOND call (moving temp to live)
    const originalRenameSync = fs.renameSync;
    let callCount = 0;
    vi.spyOn(fs, 'renameSync').mockImplementation((oldPath, newPath) => {
      callCount++;
      if (callCount === 2) { // 1st is live->rollback, 2nd is temp->live
        throw new Error('Simulated filesystem error');
      }
      return originalRenameSync(oldPath, newPath);
    });

    await expect(restoreService.executeRestore(backupPath)).rejects.toThrow(/RESTORE_REPLACEMENT_FAILED/);

    // Live DB should have been restored by rollback logic
    expect(fs.existsSync(liveDbPath)).toBe(true);
  });

  it('migrates older schemas automatically during execution', async () => {
    const backupPath = path.join(dbDir, 'test-backup-older-exec.db');
    createMockBackup(backupPath, 1); // Schema v1

    await expect(restoreService.executeRestore(backupPath)).resolves.toBeUndefined();

    // After restore, the live DB should be migrated to the latest version (v3)
    const liveDb = new Database(liveDbPath, { readonly: true });
    const row = liveDb.prepare('SELECT MAX(version) as version FROM schema_version').get() as any;
    expect(row.version).toBe(3);
    liveDb.close();
  });

  it('aborts and keeps original database if safety backup fails', async () => {
    const backupPath = path.join(dbDir, 'test-backup-exec-safety-fail.db');
    createMockBackup(backupPath);
    
    // Original DB has some known data
    const liveDb = new Database(liveDbPath);
    liveDb.exec('CREATE TABLE IF NOT EXISTS test_original (id INTEGER); INSERT INTO test_original VALUES (42);');
    liveDb.close();

    
    BackupService.getInstance = vi.fn().mockReturnValueOnce({ createBackup: vi.fn().mockRejectedValueOnce(new Error('Simulated backup error')) }).mockReturnValue({ createBackup: vi.fn().mockResolvedValue(true) });

    await expect(restoreService.executeRestore(backupPath)).rejects.toThrow(/RESTORE_SAFETY_BACKUP_FAILED/);

    // Verify original DB is untouched
    const checkDb = new Database(liveDbPath, { readonly: true });
    expect(checkDb.prepare('SELECT id FROM test_original').get().id).toBe(42);
    checkDb.close();
  });

  it('rolls back completely if the replaced database fails reopening/verification', async () => {
    const backupPath = path.join(dbDir, 'test-backup-exec-reopen-fail.db');
    createMockBackup(backupPath);
    
    // Original DB has some known data
    const liveDb = new Database(liveDbPath);
    liveDb.exec('CREATE TABLE IF NOT EXISTS test_original (id INTEGER); INSERT INTO test_original VALUES (42);');
    liveDb.close();

    // Mock validateBackup to pass initially, but fail when validating the final live path
    const originalValidate = restoreService.validateBackup.bind(restoreService);
    vi.spyOn(restoreService, 'validateBackup').mockImplementation(async (checkPath) => {
      if (checkPath === liveDbPath) {
         return { isValid: false, error: 'Simulated post-replacement verification failure' };
      }
      return originalValidate(checkPath);
    });

    await expect(restoreService.executeRestore(backupPath)).rejects.toThrow(/RESTORE_VERIFICATION_FAILED/);

    // Live DB should have been restored by rollback logic
    expect(fs.existsSync(liveDbPath)).toBe(true);
    const checkDb = new Database(liveDbPath, { readonly: true });
    expect(checkDb.prepare('SELECT id FROM test_original').get().id).toBe(42);
    checkDb.close();
  });
});
