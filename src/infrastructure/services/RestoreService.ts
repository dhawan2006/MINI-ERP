import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import Database from 'better-sqlite3';
import { app } from 'electron';
import { getDb, closeDatabase, initDatabase } from '../database/connection';
import { BackupService } from './BackupService';
import { runMigrations } from '../database/migrations';
import log from 'electron-log';

export interface RestoreValidationResult {
  isValid: boolean;
  schemaVersion?: number;
  timestamp?: number;
  error?: string;
  isOlder?: boolean;
}

export class RestoreService {
  private static instance: RestoreService;
  private isRestoring: boolean = false;

  private constructor() {}

  public static getInstance(): RestoreService {
    if (!RestoreService.instance) {
      RestoreService.instance = new RestoreService();
    }
    return RestoreService.instance;
  }

  public async validateBackup(sourcePath: string): Promise<RestoreValidationResult> {
    log.info(`[RestoreService] Validating backup at ${sourcePath}`);
    
    if (!fs.existsSync(sourcePath)) {
      return { isValid: false, error: 'RESTORE_INVALID_BACKUP: File does not exist.' };
    }
    
    const stat = fs.statSync(sourcePath);
    if (stat.size === 0) {
      return { isValid: false, error: 'RESTORE_INVALID_BACKUP: File is empty.' };
    }

    let verificationDb: Database.Database | null = null;
    try {
      verificationDb = new Database(sourcePath, { readonly: true });
      
      const integrityCheckResult = verificationDb.pragma('integrity_check', { simple: true }) as any;
      if (integrityCheckResult !== 'ok' && integrityCheckResult?.integrity_check !== 'ok') {
        return { isValid: false, error: 'RESTORE_BACKUP_INTEGRITY_FAILED: SQLite integrity check failed.' };
      }

      const baseTables = ['products', 'bills', 'bill_items', 'drafts', 'schema_version'];
      for (const table of baseTables) {
        const stmt = verificationDb.prepare(`SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name=?`);
        const result = stmt.get(table) as { count: number };
        if (result.count === 0) {
          return { isValid: false, error: `RESTORE_INVALID_BACKUP: Missing required table '${table}'.` };
        }
      }

      const schemaVersionRow = verificationDb.prepare('SELECT MAX(version) as version FROM schema_version').get() as { version: number | null };
      const backupSchemaVersion = schemaVersionRow?.version || 0;

      // Check version specific tables
      if (backupSchemaVersion >= 3) {
        const stmt = verificationDb.prepare(`SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name='settings'`);
        const result = stmt.get() as { count: number };
        if (result.count === 0) {
          return { isValid: false, error: `RESTORE_INVALID_BACKUP: Missing required table 'settings'.` };
        }
      }

      const liveDb = getDb();
      const currentSchemaRow = liveDb.prepare('SELECT MAX(version) as version FROM schema_version').get() as { version: number | null };
      const currentSchemaVersion = currentSchemaRow?.version || 0;

      if (backupSchemaVersion > currentSchemaVersion) {
        return { isValid: false, error: 'RESTORE_INCOMPATIBLE_VERSION: Backup is from a newer version of Mini POS.' };
      }

      // Try to get timestamp of backup creation by checking max updated_at across bills or settings
      let lastUpdated = 0;
      try {
        const lastBill = verificationDb.prepare('SELECT MAX(created_at) as max FROM bills').get() as { max: number | null };
        if (lastBill && lastBill.max && lastBill.max > lastUpdated) lastUpdated = lastBill.max;
        const lastSetting = verificationDb.prepare('SELECT MAX(updated_at) as max FROM settings').get() as { max: number | null };
        if (lastSetting && lastSetting.max && lastSetting.max > lastUpdated) lastUpdated = lastSetting.max;
      } catch (e) {
        // Ignored
      }
      
      return { 
        isValid: true, 
        schemaVersion: backupSchemaVersion,
        timestamp: lastUpdated || stat.mtimeMs,
        isOlder: backupSchemaVersion < currentSchemaVersion
      };

    } catch (err: any) {
      return { isValid: false, error: `RESTORE_INVALID_BACKUP: ${err.message}` };
    } finally {
      if (verificationDb) {
        verificationDb.close();
      }
    }
  }

  public async executeRestore(sourcePath: string): Promise<void> {
    if (this.isRestoring) {
      throw new Error('RESTORE_IN_PROGRESS: Another restore is currently running.');
    }

    log.info(`[RestoreService] Starting restore execution from ${sourcePath}`);
    this.isRestoring = true;

    const userDataPath = app.getPath('userData');
    const dbDir = path.join(userDataPath, 'mini-erp-data');
    const liveDbPath = path.join(dbDir, 'billing.db');

    const randomSuffix = crypto.randomBytes(4).toString('hex');
    const tempWorkingPath = path.join(dbDir, `temp-restore-${randomSuffix}.db`);
    
    // Safety backup names
    const pad = (n: number) => String(n).padStart(2, '0');
    const now = new Date();
    const safetyBackupName = `Mini-POS-Safety-Backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}-${pad(now.getMinutes())}-${randomSuffix}.db`;
    const safetyBackupPath = path.join(dbDir, safetyBackupName);
    const rollbackPath = path.join(dbDir, `billing-rollback-${randomSuffix}.db`);

    try {
      // 1. Initial re-validation of source
      const validation = await this.validateBackup(sourcePath);
      if (!validation.isValid) {
        throw new Error(validation.error);
      }

      // 2. Create mandatory pre-restore safety backup
      log.info(`[RestoreService] Creating pre-restore safety backup at ${safetyBackupPath}`);
      try {
        await BackupService.getInstance().createBackup(safetyBackupPath);
      } catch (err: any) {
        throw new Error(`RESTORE_SAFETY_BACKUP_FAILED: Could not create safety backup. ${err.message}`);
      }

      // 3. Prepare temporary working copy
      log.info(`[RestoreService] Preparing temporary restore database at ${tempWorkingPath}`);
      fs.copyFileSync(sourcePath, tempWorkingPath);

      // 4. Migrate temp copy if older
      if (validation.isOlder) {
        log.info(`[RestoreService] Backup schema is older. Running migrations on temporary copy.`);
        let tempDb: Database.Database | null = null;
        try {
          tempDb = new Database(tempWorkingPath);
          runMigrations(tempDb);
        } catch (err: any) {
          throw new Error(`RESTORE_MIGRATION_FAILED: Failed to migrate older backup. ${err.message}`);
        } finally {
          if (tempDb) tempDb.close();
        }
      }

      // 5. Final validation of migrated temp copy
      const tempValidation = await this.validateBackup(tempWorkingPath);
      if (!tempValidation.isValid || tempValidation.isOlder) {
         throw new Error(`RESTORE_VERIFICATION_FAILED: Migrated database failed validation.`);
      }

      // 6. Close active database
      log.info(`[RestoreService] Closing active database connection.`);
      try {
        closeDatabase();
      } catch (err: any) {
        throw new Error(`RESTORE_DATABASE_CLOSE_FAILED: ${err.message}`);
      }

      // 7. Atomic filesystem replacement
      log.info(`[RestoreService] Performing database replacement.`);
      try {
        // Move current aside for rollback
        fs.renameSync(liveDbPath, rollbackPath);
        
        // Remove WAL/SHM of current DB if they exist to prevent corruption
        if (fs.existsSync(`${liveDbPath}-wal`)) fs.unlinkSync(`${liveDbPath}-wal`);
        if (fs.existsSync(`${liveDbPath}-shm`)) fs.unlinkSync(`${liveDbPath}-shm`);

        // Move prepared DB into place
        fs.renameSync(tempWorkingPath, liveDbPath);
      } catch (err: any) {
        // EMERGENCY ROLLBACK
        log.error(`[RestoreService] Replacement failed. Attempting rollback! ${err.message}`);
        this.attemptRollback(liveDbPath, rollbackPath);
        throw new Error(`RESTORE_REPLACEMENT_FAILED: ${err.message}`);
      }

      // 8. Reopen and verify final state
      log.info(`[RestoreService] Reopening restored database.`);
      try {
        initDatabase(userDataPath);
        const finalValidation = await this.validateBackup(liveDbPath);
        if (!finalValidation.isValid) {
          throw new Error('Database reopened but validation failed.');
        }
      } catch (err: any) {
        log.error(`[RestoreService] Reopen/verify failed. Attempting rollback! ${err.message}`);
        closeDatabase();
        this.attemptRollback(liveDbPath, rollbackPath);
        initDatabase(userDataPath);
        throw new Error(`RESTORE_VERIFICATION_FAILED: ${err.message}`);
      }

      log.info(`[RestoreService] Restore completely successful. Scheduling restart.`);
      
      // We will let the handler invoke app.relaunch() and app.exit() after returning success to the renderer, 
      // or we can do it right here (better to let IPC handler do it so UI can show success message for 1s).
      
    } catch (err: any) {
      log.error(`[RestoreService] Execute failed: ${err.message}`);
      throw err;
    } finally {
      // Cleanup temp working path if it still exists (e.g. if failed before replacement)
      if (fs.existsSync(tempWorkingPath)) {
        try { fs.unlinkSync(tempWorkingPath); } catch (e) {}
      }
      this.isRestoring = false;
    }
  }

  private attemptRollback(liveDbPath: string, rollbackPath: string) {
    try {
      if (fs.existsSync(rollbackPath)) {
        log.info(`[RestoreService] Rolling back: replacing active DB with rollback DB.`);
        if (fs.existsSync(liveDbPath)) {
          fs.unlinkSync(liveDbPath);
        }
        if (fs.existsSync(`${liveDbPath}-wal`)) fs.unlinkSync(`${liveDbPath}-wal`);
        if (fs.existsSync(`${liveDbPath}-shm`)) fs.unlinkSync(`${liveDbPath}-shm`);
        fs.renameSync(rollbackPath, liveDbPath);
      } else {
        log.error(`[RestoreService] Rollback DB not found!`);
      }
    } catch (err: any) {
      log.error(`[RestoreService] FATAL: Rollback failed! ${err.message}`);
      throw new Error(`RESTORE_ROLLBACK_FAILED: ${err.message}`);
    }
  }
}
