import Database from 'better-sqlite3';

const MIGRATIONS = [
  {
    version: 1,
    name: 'initial-schema',
    sql: `
      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        barcode TEXT UNIQUE,
        name TEXT NOT NULL,
        price_minor INTEGER NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
      CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active);

      CREATE TABLE IF NOT EXISTS bills (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bill_number INTEGER UNIQUE NOT NULL,
        total_minor INTEGER NOT NULL,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        finalized_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS bill_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bill_id INTEGER NOT NULL,
        product_id TEXT NOT NULL,
        snapshot_name TEXT NOT NULL,
        snapshot_price_minor INTEGER NOT NULL,
        quantity INTEGER NOT NULL,
        line_total_minor INTEGER NOT NULL,
        FOREIGN KEY (bill_id) REFERENCES bills(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_bill_items_bill_id ON bill_items(bill_id);

      CREATE TABLE IF NOT EXISTS drafts (
        id TEXT PRIMARY KEY,
        version INTEGER NOT NULL DEFAULT 1,
        serialized_state TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `
  },
  {
    version: 2,
    name: 'history-indexes',
    sql: `
      CREATE INDEX IF NOT EXISTS idx_bills_finalized_at ON bills(finalized_at DESC);
    `
  },
  {
    version: 3,
    name: 'settings-and-receipt-snapshots',
    sql: `
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );

      ALTER TABLE bills ADD COLUMN shop_name TEXT;
      ALTER TABLE bills ADD COLUMN shop_address TEXT;
      ALTER TABLE bills ADD COLUMN shop_phone TEXT;
    `
  }
];

export function runMigrations(db: Database.Database) {
  // Ensure schema_version table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      migrated_at INTEGER NOT NULL
    );
  `);

  const currentVersionRow = db.prepare('SELECT MAX(version) as version FROM schema_version').get() as { version: number | null };
  const currentVersion = currentVersionRow?.version || 0;

  for (const migration of MIGRATIONS) {
    if (migration.version > currentVersion) {
      const transaction = db.transaction(() => {
        db.exec(migration.sql);
        db.prepare('INSERT INTO schema_version (version, migrated_at) VALUES (?, ?)').run(migration.version, Date.now());
      });

      try {
        transaction();
      } catch (err: any) {
        throw new Error(`Database migration failed at version ${migration.version} (${migration.name}): ${err.message}`);
      }
    }
  }
}
