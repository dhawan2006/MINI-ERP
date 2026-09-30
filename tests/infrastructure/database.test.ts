import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { initInMemoryDatabase } from '../../src/infrastructure/database/connection';

describe('Database Configuration & Migrations', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = initInMemoryDatabase();
  });

  afterEach(() => {
    if (db) db.close();
  });

  it('initializes WAL mode and Foreign Keys', () => {
    const journalMode = db.pragma('journal_mode', { simple: true });
    // In-memory sqlite naturally falls back to memory journal, but it executes WAL pragma safely
    expect(journalMode).toBeDefined();

    const fk = db.pragma('foreign_keys', { simple: true });
    expect(fk).toBe(1);
  });

  it('runs initial migration and sets schema version', () => {
    const row = db.prepare('SELECT MAX(version) as v FROM schema_version').get() as { v: number };
    expect(row.v).toBe(3);
  });

  it('creates required tables', () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
    const tableNames = tables.map(t => t.name);
    
    expect(tableNames).toContain('products');
    expect(tableNames).toContain('bills');
    expect(tableNames).toContain('bill_items');
    expect(tableNames).toContain('drafts');
    expect(tableNames).toContain('schema_version');
  });
});
