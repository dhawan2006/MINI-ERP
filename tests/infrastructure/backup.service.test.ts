import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { BackupService } from '../../src/infrastructure/services/BackupService';
import { getDb, initDatabase, closeDatabase } from '../../src/infrastructure/database/connection';
import { ProductRepository } from '../../src/infrastructure/repositories/product.repository';
import Database from 'better-sqlite3';

describe('BackupService', () => {
  let tempDir: string;
  let backupDestination: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'minipos-backup-test-'));
    // Initialize DB in the temp dir
    initDatabase(tempDir);
    
    // Seed some data
    const productRepo = new ProductRepository(getDb());
    productRepo.create({ name: 'Test Product', price_minor: 1500, barcode: '123' });

    backupDestination = path.join(tempDir, 'backup', 'Mini-POS-Backup.db');
    fs.mkdirSync(path.join(tempDir, 'backup'), { recursive: true });
  });

  afterEach(() => {
    closeDatabase();
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('should successfully create and verify a backup', async () => {
    const backupService = BackupService.getInstance();
    
    await backupService.createBackup(backupDestination);
    
    // Verify file exists at final destination
    expect(fs.existsSync(backupDestination)).toBe(true);
    
    // Independently verify backup data
    const verifyDb = new Database(backupDestination, { readonly: true });
    const product = verifyDb.prepare('SELECT * FROM products WHERE barcode = ?').get('123') as any;
    expect(product).toBeDefined();
    expect(product.name).toBe('Test Product');
    const integrityCheckResult = verifyDb.pragma('integrity_check', { simple: true }) as any;
    expect(integrityCheckResult).toBe('ok');
    
    verifyDb.close();
  });

  it('should clean up temp file and throw BACKUP_FAILED if backup fails midway', async () => {
    const backupService = BackupService.getInstance();
    
    // Force the SQLite backup API to throw by giving an invalid path like a directory
    const invalidPath = path.join(tempDir, 'backup');
    
    await expect(backupService.createBackup(invalidPath)).rejects.toThrow('BACKUP_FAILED');
    
    // Check if any .tmp file was left
    const files = fs.readdirSync(path.join(tempDir, 'backup'));
    const tmpFiles = files.filter(f => f.includes('.tmp-'));
    expect(tmpFiles.length).toBe(0); // Should have cleaned up
  });

  it('should throw BACKUP_DATABASE_BUSY if already backing up', async () => {
    const backupService = BackupService.getInstance();
    
    // Start a backup but don't await it yet
    const promise1 = backupService.createBackup(backupDestination);
    
    // Try to start another one immediately
    await expect(backupService.createBackup(path.join(tempDir, 'backup', 'Another.db'))).rejects.toThrow('BACKUP_DATABASE_BUSY');
    
    await promise1;
  });
});
