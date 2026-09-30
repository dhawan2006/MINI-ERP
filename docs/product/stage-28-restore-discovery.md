# Mini POS — Stage 28: Restore Discovery

## Existing Backup Architecture
The Stage 27 backup implementation utilizes the `better-sqlite3` Online Backup API (`db.backup()`). It produces a standalone, completely valid SQLite database file containing all application tables (`products`, `bills`, `bill_items`, `drafts`, `settings`, and `schema_version`). The backup does not rely on a proprietary format or include a separate metadata file; it is the raw database exactly as it existed at the point in time the backup was triggered.

## Restore Semantics
The safest and most conceptually sound restore semantic for V1.1 is **Full Replacement**.
Merging data (e.g., trying to combine products from a backup with sales from the current database) is fraught with edge cases, primary key collisions, and snapshot reconciliation issues. Full replacement provides a clear, undeniable contract to the shop operator: *The application will time-travel back to exactly how it looked when this backup was created.*

## Data-Loss Analysis
The primary risk of a Full Replacement restore is the destruction of data created *after* the backup was taken.
If the current database has sales recorded up to 6 PM, and the operator restores a backup taken at 3 PM, all sales and product modifications between 3 PM and 6 PM are permanently eradicated from the active database. The system must forcefully communicate that restore is a destructive, time-travel operation, not a selective import.

## Pre-Restore Safety Backup
Because human error is inevitable (e.g., selecting a backup from three months ago instead of three hours ago), a **Pre-Restore Safety Backup** is absolutely mandatory. 
Before the active database is replaced, the system must automatically execute the standard backup procedure to a dedicated internal location (e.g., `mini-erp-data/pre-restore-safety-backup-[timestamp].db`). If the operator makes a catastrophic mistake, this safety copy provides an escape hatch to return to the present.

## Active Draft Policy
An active billing draft represents unfinished work in the present. If a restore is executed, the present is overwritten. 
**Policy:** The UI should prohibit initiating a restore while a draft is actively in progress. The operator must be forced to either finalize the bill or explicitly clear the draft before the "Restore" button becomes enabled. This prevents silent destruction of the customer's current checkout session.

## Backup Validation
A file named `.db` is not inherently trustworthy. Before any replacement occurs, the selected backup must be validated via a temporary, read-only SQLite connection:
1. File exists and is > 0 bytes.
2. `PRAGMA integrity_check` passes.
3. Contains all required tables (`products`, `bills`, `bill_items`, `drafts`, `settings`, `schema_version`).
4. Can successfully query `schema_version`.

## Version Compatibility
- **Older Backup -> Newer App:** The system must accept this. The backup will be migrated forward (see Migration Strategy).
- **Newer Backup -> Older App:** The system must explicitly **reject** this. SQLite schemas cannot be safely downgraded. If the backup's `schema_version` is greater than the application's current migration version, the restore must abort with a compatibility error.

## Migration Strategy
The application's existing migration framework is the sole authority on database schemas.
**Strategy:**
1. Copy the selected backup file to a temporary location in the app data directory.
2. Open a standard connection to this temporary file.
3. Run `runMigrations(db)` on the temporary file.
4. Only if migrations succeed, proceed to close the active connection and swap the files.
This guarantees the restored database perfectly matches the application's expected schema before it ever goes live.

## Historical Integrity
Mini POS achieves historical integrity by copying product snapshots into `bill_items` at the moment of finalization. Because a full SQLite database backup captures both `bills` and `bill_items` exactly as they were, historical integrity is natively preserved. Restored bills will look exactly as they did when the backup was taken, unaffected by the current state of products.

## Product State
Products created after the backup timestamp will disappear. Product edits (prices, names, inactive status) made after the backup will revert to their backup state. The operator must be warned that the product catalog will revert.

## Bill Numbering
Mini POS determines the next bill number using `SELECT MAX(bill_number)`. 
If a backup from 3 PM (latest bill #95) is restored over a 6 PM database (latest bill #102), the next generated bill will be #96. 
While this creates duplicate physical receipt numbers in the real world for that day, it is the mathematically correct behavior for a time-travel restore. Introducing a separate persistent sequence counter outside the database would violate the atomic nature of the snapshot. This behavior is acceptable but must be understood by the operator.

## Settings
The `settings` table will revert to its state at the time of the backup. If the operator changed the shop name or thermal printer IP address at 4 PM, restoring a 3 PM backup will revert those settings. This is expected behavior for a full database replacement.

## Printer/PDF/History
The restore process is purely a data replacement operation. It will not interact with the thermal printer network transport, nor will it trigger reprint queues. Post-restore, the History view will accurately reflect the restored database, and PDF generation will work seamlessly against the restored snapshot data.

## Atomic Replacement
The safest filesystem lifecycle for restore is:
1. Operator selects file via dialog.
2. System copies file to `temp_restore.db`.
3. System validates `temp_restore.db`.
4. System runs migrations on `temp_restore.db`.
5. System creates `pre-restore-safety-backup.db` from the current live database.
6. System closes the active `billing.db` connection.
7. System uses `fs.renameSync` to atomically overwrite `billing.db` with `temp_restore.db`.
8. System instructs the Electron application to **restart** (relaunch the application processes to guarantee all in-memory Zustand UI state and Backend Services are cleanly re-initialized).

## Failure Recovery
- **Validation/Migration Failure:** The `temp_restore.db` is deleted. The active database is never touched. The user is notified.
- **Pre-Restore Backup Failure:** The restore aborts. The user is notified.
- **Active Connection Close Failure:** The restore aborts. `temp_restore.db` is deleted.
- **Atomic Rename Failure:** This is the critical danger zone. If `fs.renameSync` fails midway, the system must immediately attempt to rename `pre-restore-safety-backup.db` back to `billing.db` and trigger an emergency application restart.

## Operator UX
Restore is a high-risk action.
1. The "Restore Database" button should be distinctly separated from Backup.
2. Upon selecting a valid backup, a modal must appear displaying the backup's timestamp.
3. The warning must explicitly state: **"This will completely overwrite your current sales, products, and settings with the data from this backup. Any sales made since this backup will be lost."**
4. To proceed, the operator must type a confirmation word (e.g., "RESTORE") into a text input.

## Security
The backup file chosen by the operator is an arbitrary file from the host OS. 
- It must not be treated as executable code. 
- Validation must strictly use read-only SQLite connections. 
- The filename/extension must not be trusted; only the internal SQLite signature and `PRAGMA integrity_check` matter.

## Disaster Recovery Scenarios
A guided UI Restore solves:
- Operator accidentally deleted or modified product data.
- Operator messed up settings.
- Application requires reverting to yesterday's known-good state.
- Minor database corruption (assuming the app can still open enough to access Settings).

If the computer is destroyed or the application cannot launch at all, the operator will still need to manually place the backup file into the `mini-erp-data` folder before installing/launching the app. A UI Restore feature does not replace the need for standard manual recovery documentation.

## Manual vs UI Restore
- **Manual Restore:** Requires teaching operators to find `~/Library/Application Support/Mini POS/mini-erp-data/`, delete `-wal` and `-shm` files, and paste `billing.db`. This is highly error-prone, risks WAL corruption, and creates friction.
- **UI Restore:** Safely orchestrates WAL closure, migrations, validations, and app restarts.
**Recommendation:** Implement the UI Restore. It aligns with the "Zero Unnecessary Friction" philosophy and protects the operator from WAL-locking mistakes.

## Large Database Behavior
Node's synchronous file system operations (`fs.copyFileSync`, `fs.renameSync`) will block the main thread. For a 1GB database, this might take a few seconds. The UI must display an un-dismissable "Restoring Database... Please wait" overlay to prevent interaction during the blocking operations.

## Testing Strategy
- **Unit (Main Process):** `RestoreService` logic testing validation passes/fails, version rejections, and state machine transitions.
- **Integration:** Triggering the full replacement on an in-memory or temp disk database and validating that the schema migrated and data swapped.
- **E2E:** Playwright clicking through the Settings UI, using a `FakeRestoreDialogService` to provide a valid backup file, typing "RESTORE", and verifying the app restarts with the new data.

## Recommended Architecture
- `RestoreService.ts` in Main process.
- `restore:validate` and `restore:execute` IPC handlers.
- `app.relaunch()` and `app.exit()` triggered after a successful execute.
- A new `PreRestoreBackupService` or integration with the existing `BackupService`.

## Recommended Implementation Slices
1. **Core Service & Validation:** Build `RestoreService` capable of copying, validating, and migrating an external SQLite file.
2. **Safety & Replacement:** Add the pre-restore backup step and the atomic file replacement logic.
3. **IPC & Relaunch:** Wire up the IPC handlers and the Electron application restart command.
4. **UX & React:** Build the highly guarded Restore modal, validation feedback, and confirmation challenge.

## Risks
- **File Locks:** If a background process (like an anti-virus) locks the temporary backup file, `fs.renameSync` could fail. The fallback to the safety backup must be robust.
- **App Relaunch Reliability:** Electron's `app.relaunch()` behaves slightly differently in packaged vs. dev modes. It must be tested thoroughly in the packaged macOS build.

## Explicitly Deferred Work
- Selective Restore (importing only products or only bills).
- Cloud backup/restore orchestration.
- Scheduled automatic safety backups independent of manual restore.

---

## Final Recommendation

RESTORE FEATURE READY FOR IMPLEMENTATION
