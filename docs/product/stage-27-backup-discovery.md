# Stage 27 — Database Backup Discovery

## Existing Persistence Architecture
Mini POS relies on `better-sqlite3` to interface with a local SQLite database stored at `<userDataPath>/mini-erp-data/billing.db`. The system handles schemas and migrations directly upon initialization. Application state is segmented across multiple domain repositories (Products, ActiveDrafts, History, Settings).

## Database Configuration
The application initializes the SQLite connection (`connection.ts`) with the following strict pragmas:
- `journal_mode = WAL` (Write-Ahead Logging for high concurrency).
- `synchronous = NORMAL` (Safe for WAL, improved performance).
- `busy_timeout = 5000` (5-second grace period for lock contention).

## WAL / Backup Implications
Because WAL mode is active, the database exists across three files at runtime: `billing.db`, `billing.db-wal`, and `billing.db-shm`. 
A naive OS-level file copy (`fs.copyFile`) of `billing.db` while the application is running is fundamentally unsafe; it will miss uncheckpointed data in the WAL and likely yield a corrupt backup. 
Instead, the **SQLite Online Backup API** (exposed natively via `better-sqlite3`'s `db.backup()` method) must be used. It captures a perfectly consistent point-in-time snapshot of the database without blocking concurrent reads/writes on the active connection.

## Backup Scope
The backup will represent the **complete application state**, encompassing:
- Finalized billing history (snapshots).
- Product Catalog.
- Settings configuration.
- The single active draft.

## Draft Semantics
Because the draft is actively synchronized to SQLite, the backup will definitively include the active draft exactly as it existed when the export triggered. Operators must understand that restoring this backup later will also resurrect that specific incomplete draft.

## Proposed Backup Mechanism
The renderer will dispatch an IPC command (`backup:export`). The Node `BackupService` will prompt the operator for a destination via Electron's native `dialog.showSaveDialog`. Upon confirmation, the service will execute the `better-sqlite3` asynchronous `backup(destination)` method.

## Backup Format
The backup will be a raw SQLite database file. No proprietary packaging or `.zip` archives will be introduced. This maximizes portability, allows operators to query their data with standard SQLite tools, and keeps restoration extremely straightforward.

## Metadata
The SQLite file inherently contains the schema version within its `pragma user_version`. No additional custom metadata files will be generated for V1.1.

## Destination
Determined by the operator using the native OS Save Dialog. The backup can safely be written to USB drives or network mounts.

## Filename
A deterministic, user-friendly filename utilizing the current timestamp will be offered by default in the dialog:
`Mini-POS-Backup-YYYY-MM-DD-HHMM.db`

## UI Placement
The feature will be located within the **Settings** view under a new "Data Management" or "Backup" section. The main Billing screen will remain completely untouched to preserve checkout efficiency.

## Operator Workflow
1. Navigate to Settings.
2. Click "Export Backup".
3. OS Save Dialog appears.
4. Operator selects destination and clicks Save.
5. Application performs SQLite Backup API export asynchronously.
6. Operator receives a clear success notification with the saved file path.

## Error Handling
Will map errors into the standard structured `IpcResponse` format:
- `BACKUP_CANCELLED`: Operator closed the save dialog.
- `BACKUP_PERMISSION_DENIED`: Destination unwritable.
- `BACKUP_DISK_FULL`: Destination lacks capacity.
- `BACKUP_FAILED`: General SQLite/filesystem failure.

## Atomicity
If the `db.backup()` Promise rejects mid-transfer, the partial, corrupt destination file must be explicitly deleted via `fs.unlink` to ensure operators do not mistake a broken file for a safe backup.

## Backup Verification
The SQLite Online Backup API natively guarantees page-level integrity as it copies. We will not run a secondary `PRAGMA integrity_check` on the exported file by default unless explicitly justified by instability, to avoid doubling the I/O overhead.

## Restore Compatibility Strategy
Restoration is deferred for Stage 27. However, the architectural design explicitly guarantees forward compatibility. Because the backup is a 1:1 SQLite clone, restoring simply involves replacing `billing.db` while the application is fully closed. Migrations will handle older schema versions gracefully upon the next startup.

## Security
No data will be transmitted. Paths are exclusively determined by the secure Electron native dialog bounding out arbitrary injection attacks.

## Privacy
The backup contains all business data (products, sales history, configuration). The UI description text will explicitly remind the operator that the exported file contains sensitive shop data and should be stored securely.

## Large Database Behavior
The SQLite Online Backup API processes pages in chunks, intermittently yielding the lock to allow concurrent billing operations. A 100MB database will export smoothly without freezing the POS renderer. 

## Offline Behavior
100% offline. No cloud APIs, no authentication.

## Testing Plan
- **Unit**: Verify filename generation and error mappings.
- **Integration**: Validate `BackupService` using `better-sqlite3` backup behavior and cleanup-on-failure logic.
- **E2E**: Use Playwright to navigate to Settings, trigger backup (mocking the dialog), and assert success messaging.

## Performance Plan
We will benchmark the `backup()` call on a 10,000+ record database to confirm that it does not freeze simultaneous concurrent reads during checkout.

## Architecture
```text
React (Settings View)
  ↓
window.api.backup (Preload)
  ↓
ipcMain.handle('backup:export')
  ↓
BackupService
  ↓
dialog.showSaveDialog (Electron)
  ↓
db.backup(destination) (better-sqlite3)
```

## Risks
If the destination is a slow network drive, the backup operation might take several seconds. The application must accurately reflect a "Backing up..." loading state so the operator does not close the app prematurely.

## Recommended Implementation Plan
Slice 1 — Node BackupService (SQLite API integration, atomic failure cleanup).
Slice 2 — IPC Handlers & Preload Bridge (incorporating `dialog.showSaveDialog`).
Slice 3 — Settings UI Integration (Backup button, loading state, success/error toasts).
Slice 4 — Automated Testing (Unit, IPC integration, simulated E2E).

## Explicitly Deferred Work
- Cloud backup.
- Automatic scheduled backups.
- In-app "Restore Backup" functionality. 

---

BACKUP FEATURE READY FOR IMPLEMENTATION
