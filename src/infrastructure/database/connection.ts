import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { runMigrations } from './migrations';

let dbInstance: Database.Database | null = null;

export function initDatabase(userDataPath: string): Database.Database {
  if (dbInstance) return dbInstance;

  const dbDir = path.join(userDataPath, 'mini-erp-data');
  if (!fs.existsSync(dbDir)) {
    try {
      fs.mkdirSync(dbDir, { recursive: true });
    } catch (err: unknown) {
      if (err instanceof Error) {
        const nodeErr = err as NodeJS.ErrnoException;
        if (nodeErr.code === 'EACCES' || nodeErr.code === 'EPERM') {
          throw new Error('DATABASE_PERMISSION_DENIED: Cannot create database directory due to missing permissions. The application cannot start safely.');
        }
        if (nodeErr.code === 'ENOSPC') {
          throw new Error('DATABASE_DISK_FULL: Cannot create database directory because the disk is full. The application cannot start safely.');
        }
      }
      throw new Error(`DATABASE_INIT_FAILED: Cannot create database directory: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const dbPath = path.join(dbDir, 'billing.db');
  const db = new Database(dbPath);

  // Configure Pragmas
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000'); // 5 seconds wait before throwing SQLITE_BUSY

  // Run migrations
  runMigrations(db);

  dbInstance = db;
  return dbInstance;
}

export function getDb(): Database.Database {
  if (!dbInstance) {
    throw new Error('Database has not been initialized. Call initDatabase first.');
  }
  return dbInstance;
}

export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

// For isolated testing
export function initInMemoryDatabase(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return db;
}
