# Database Architecture Overview

The Mini Billing System uses `better-sqlite3` strictly hosted within the Electron Main Process.

## Connection Lifecycle
- **Initialization**: `initDatabase(userDataPath)` resolves the safe application data directory (`app.getPath('userData')`), creates the folder if missing, and establishes the connection.
- **Location**: The database is stored in `mini-erp-data/billing.db` within the OS-specific user data directory (e.g., `~/Library/Application Support/mini-erp` on macOS).
- **Pragmas**:
  - `journal_mode = WAL`: Ensures reader/writer concurrency and prevents `SQLITE_BUSY` errors during draft saves.
  - `synchronous = NORMAL`: Safely trades guaranteed physical power-loss durability for immense speed. In the event of catastrophic OS crash or power loss, the last fraction of a second of draft writes might be lost, but the database will *not* corrupt.
  - `foreign_keys = ON`: Enforced at connection time.

## Migrations
Migrations are strictly ordered and statically embedded in the source code as arrays of SQL strings to avoid runtime asset resolution issues in the packaged Electron app. They are executed transactionally.

## Data Types
- **Money**: All monetary values are strictly `INTEGER` minor units (paise). ₹15.99 = `1599`. No floating-point math is allowed in the persistence layer.
- **Timestamps**: All timestamps are `INTEGER` milliseconds since epoch (`Date.now()`).

## Isolation
The React renderer has zero direct access to the database. It must communicate exclusively through typed IPC calls that invoke higher-level Repository or Application Application services.
