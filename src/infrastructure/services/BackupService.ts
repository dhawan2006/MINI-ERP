import fs from 'fs';
import crypto from 'crypto';
import Database from 'better-sqlite3';
import { getDb } from '../database/connection';
import log from 'electron-log';

export class BackupService {
  private static instance: BackupService;
  private isBackingUp: boolean = false;

  private constructor() {}

  public static getInstance(): BackupService {
    if (!BackupService.instance) {
      BackupService.instance = new BackupService();
    }
    return BackupService.instance;
  }

  public async createBackup(finalDestinationPath: string): Promise<void> {
    if (this.isBackingUp) {
      log.warn('[BackupService] Backup rejected: database is already busy backing up.');
      throw new Error('BACKUP_DATABASE_BUSY');
    }

    const randomSuffix = crypto.randomBytes(4).toString('hex');
    const tempDestinationPath = `${finalDestinationPath}.tmp-${randomSuffix}`;

    this.isBackingUp = true;
    log.info(`[BackupService] Starting backup to temporary location: ${tempDestinationPath}`);

    try {
      // 1. Perform SQLite Online Backup
      const db = getDb();
      await db.backup(tempDestinationPath);

      // 2. Verify the output independently
      this.verifyBackup(tempDestinationPath);

      // 3. Atomic rename to final destination
      // Using fs.renameSync which performs atomic rename on the same filesystem
      fs.renameSync(tempDestinationPath, finalDestinationPath);
      log.info(`[BackupService] Backup completed successfully at: ${finalDestinationPath}`);

    } catch (err: any) {
      log.error(`[BackupService] Backup failed: ${err.message}`);
      
      // Cleanup temp file if it exists
      if (fs.existsSync(tempDestinationPath)) {
        try {
          fs.unlinkSync(tempDestinationPath);
          log.info('[BackupService] Cleaned up temporary backup file.');
        } catch (cleanupErr) {
          log.error(`[BackupService] Failed to clean up temporary backup file: ${String(cleanupErr)}`);
        }
      }

      this.mapAndThrowError(err);
    } finally {
      this.isBackingUp = false;
    }
  }

  private verifyBackup(filePath: string): void {
    log.info(`[BackupService] Verifying backup at ${filePath}`);
    
    let verificationDb: Database.Database | null = null;
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error('BACKUP_VERIFICATION_FAILED: File does not exist after backup.');
      }

      const stat = fs.statSync(filePath);
      if (stat.size === 0) {
        throw new Error('BACKUP_VERIFICATION_FAILED: File is empty.');
      }

      verificationDb = new Database(filePath, { readonly: true });
      
      const integrityCheckResult = verificationDb.pragma('integrity_check', { simple: true }) as any;
      if (integrityCheckResult !== 'ok' && integrityCheckResult?.integrity_check !== 'ok') {
        throw new Error(`SQLite integrity_check failed.`);
      }

      const tables = [
        'products',
        'bills',
        'bill_items',
        'drafts',
        'settings'
      ];
      
      for (const table of tables) {
        const stmt = verificationDb.prepare(`SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name=?`);
        const result = stmt.get(table) as { count: number };
        if (result.count === 0) {
          throw new Error(`BACKUP_VERIFICATION_FAILED: Missing required table '${table}'.`);
        }
      }

      log.info('[BackupService] Verification passed.');
    } catch (err: any) {
      throw new Error(`BACKUP_VERIFICATION_FAILED: ${err.message}`);
    } finally {
      if (verificationDb) {
        verificationDb.close();
      }
    }
  }

  private mapAndThrowError(err: any): never {
    const msg = err.message || String(err);
    const code = err.code || '';

    if (msg.includes('BACKUP_VERIFICATION_FAILED')) {
      throw err;
    }

    if (code === 'EACCES' || code === 'EPERM') {
      throw new Error('BACKUP_PERMISSION_DENIED');
    }

    if (code === 'ENOSPC') {
      throw new Error('BACKUP_DISK_FULL');
    }

    throw new Error('BACKUP_FAILED');
  }
}
