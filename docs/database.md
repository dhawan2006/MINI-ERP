# Mini POS — Database Architecture

## 1. Engine & Configuration

Mini POS uses **SQLite** through the high-performance native library **`better-sqlite3`**.

### Location of Database File
The primary database file is named `billing.db` and is placed within the platform user data directory:
- **macOS**: `~/Library/Application Support/Mini POS/mini-erp-data/billing.db`
- **Windows**: `%APPDATA%\Mini POS\mini-erp-data\billing.db`
- **Linux**: `~/.config/Mini POS/mini-erp-data/billing.db`

### Pragmas & Concurrency
The database connection (`src/infrastructure/database/connection.ts`) initializes SQLite with the following pragmas:
```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
```
- **Write-Ahead Logging (WAL)**: Allows concurrent readers to execute without blocking writers, providing high responsiveness for cashier UI interactions.
- **Foreign Keys**: Enforced at the engine level to guarantee referential integrity.
- **Busy Timeout**: 5000ms backoff before throwing busy errors during heavy operations.

---

## 2. Database Schema

Schema migrations are executed automatically on application startup by `runMigrations` in `src/infrastructure/database/migrations.ts`.

### Table: `products`
Stores inventory and catalog items.
```sql
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  barcode TEXT UNIQUE,
  price_minor INTEGER NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active);
```

### Table: `bills`
Stores finalized customer sales transactions.
```sql
CREATE TABLE IF NOT EXISTS bills (
  id TEXT PRIMARY KEY,
  bill_number INTEGER NOT NULL UNIQUE,
  subtotal_minor INTEGER NOT NULL,
  discount_minor INTEGER NOT NULL DEFAULT 0,
  total_minor INTEGER NOT NULL,
  payment_method TEXT NOT NULL CHECK(payment_method IN ('CASH', 'UPI')),
  cashier_note TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bills_created_at ON bills(created_at);
CREATE INDEX IF NOT EXISTS idx_bills_number ON bills(bill_number);
```

### Table: `bill_items`
Stores the snapshot of products included in a finalized bill.
```sql
CREATE TABLE IF NOT EXISTS bill_items (
  id TEXT PRIMARY KEY,
  bill_id TEXT NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  product_barcode TEXT,
  price_minor INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  line_total_minor INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bill_items_bill_id ON bill_items(bill_id);
```

### Table: `draft_bills`
Stores active cart drafts to prevent data loss across restarts or crashes.
```sql
CREATE TABLE IF NOT EXISTS draft_bills (
  id TEXT PRIMARY KEY,
  items_json TEXT NOT NULL,
  discount_minor INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
```

### Table: `settings`
Key-value storage for application configuration, store profile, and printer settings.
```sql
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
```

---

## 3. Repositories

Database access is abstracted into typed repositories:
- `ProductRepository`: Handles catalog queries, prefix searches, barcode lookups, and product CRUD.
- `BillRepository`: Executes atomic billing transactions: inserts the bill, batch-inserts bill items, and deletes active drafts in a single transaction.
- `DraftRepository`: Reads and writes active cashier cart state.
- `SettingsRepository`: Manages store profile, printer connection details, and onboarding state.
