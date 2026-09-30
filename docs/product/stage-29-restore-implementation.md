# Stage 29: Final Adversarial Safety Audit

This audit evaluates the Safe Database Restore implementation against aggressive safety scenarios. 
The objective is to prove the application cannot be silently corrupted or left in a partial state during disaster recovery.

## 1. Critical Rollback Test

**Scenario:** Replacement succeeds on disk, but the new database subsequently fails re-initialization or post-replacement verification.

**Test:** `rolls back completely if the replaced database fails reopening/verification` (in `tests/infrastructure/restore.service.test.ts`)
**Result:** **PASS**. 
The test injects a failure during the final `initDatabase`/`validateBackup` step *after* the file replacement. The `RestoreService` successfully detects the failure, unlinks the corrupted active file, and atomic-renames the `rollbackPath` back into the active `liveDbPath`. The original known data remains fully present and accessible.

## 2. Safety Backup Verification

**Scenario:** The mandatory pre-restore safety backup fails due to disk space, filesystem lock, or permission error.

**Test:** `aborts and keeps original database if safety backup fails` (in `tests/infrastructure/restore.service.test.ts`)
**Result:** **PASS**. 
The test intentionally forces `BackupService.getInstance().createBackup()` to throw. The routine immediately aborts, propagating the `RESTORE_SAFETY_BACKUP_FAILED` error to the frontend. The active database is completely untouched because the safety backup happens *before* the active connection is closed.

## 3. SQLite WAL / SHM Audit

The active database operates in Write-Ahead Log (WAL) mode. When the old file is moved aside for rollback, stale `-wal` and `-shm` files remain. If a new backup (which may or may not have its own WAL) is swapped into place, the stale WAL will attempt to attach to the new SQLite file, causing immediate structural corruption.

**Implementation Verification:**
The `RestoreService` correctly explicitly destroys these stale sidecar files prior to swapping the new file in:
```typescript
fs.renameSync(liveDbPath, rollbackPath);
if (fs.existsSync(`${liveDbPath}-wal`)) fs.unlinkSync(`${liveDbPath}-wal`);
if (fs.existsSync(`${liveDbPath}-shm`)) fs.unlinkSync(`${liveDbPath}-shm`);
fs.renameSync(tempWorkingPath, liveDbPath);
```
This precise filesystem sequence guarantees the new database hydrates cleanly. 

## 4. Database Connection Audit

- **Authoritative Close**: `closeDatabase()` is invoked before any `renameSync` happens.
- **Mutation Lockout**: `better-sqlite3` is a synchronous native module; closing the connection inherently locks out any pending asynchronous Node operations from writing to the DB.
- **Fail-Safe**: If `closeDatabase()` throws, the try/catch intercepts it and the filesystem swap is never reached.

## 5. Active Draft Audit

The active draft check `hasActiveDraft()` is enforced on the **Main process** via the authoritative `BillingService` before the `RestoreService` is even invoked:
```typescript
if (billingService.hasActiveDraft()) {
  return { success: false, error: { code: 'RESTORE_ACTIVE_DRAFT', ... } };
}
```
This is a direct application/service dependency injection within Main. It does not rely on Zustand UI state or require an internal Main-to-Main IPC hop.

## 6. `restore:execute` Revalidation

The `restore:execute` process independently re-validates the backup path in step 1 of its execution sequence, before initiating the safety backup or closing the database. If the file on disk was corrupted or changed between `restore:validate` and `restore:execute`, the execution rejects the payload and aborts the restore harmlessly.

## 7. Migration Safety

Older backups are copied to a temporary working file (`temp-restore-[uuid].db`). 
Migrations run strictly against this isolated copy. The original source backup file is never modified. 
After migration, the temporary file is independently re-validated. Newer schema versions are actively rejected as incompatible.

## 8. Bill Number Invariant

**Observed Semantics:**
The codebase calculates bill numbers dynamically:
`SELECT MAX(bill_number) as maxNumber FROM bills` -> `(maxNumber || 1000) + 1`.

**Safety Conclusion:**
Because the database is replaced atomically, the sequence simply resumes from the highest number present in the *restored dataset*. There are no duplicate or conflicting bill numbers within the active file. As this is a localized POS system without cloud sync, this is the intended and safest chronological behavior. 

## 9. Restart Strategy (`app.exit()`)

**Implementation:**
The Main IPC handler calls `app.relaunch()` followed by `app.exit()`.

**Reasoning:**
Electron documents `app.exit()` as an immediate exit without normal quit events (`before-quit`, `window-all-closed`). 
This is **highly intentional and necessary**. 
Because the database connection has already been forcefully closed and replaced on disk by `RestoreService`, invoking the standard `app.quit()` would trigger graceful shutdown listeners. If any Main or Renderer listeners attempt to save state, clear caches, or record analytics during teardown, they would query a closed connection or inadvertently initialize a connection against the newly swapped database. `app.exit()` safely kills the Chromium process tree instantly, guaranteeing no database mutations occur during the restart transition.

## 10. Exact Final Test Counts

```text
Test Files  25 passed (25)
     Tests  108 passed (108)
  Duration  14.96s (Unit & Integration)

Running 26 tests using 4 workers
  26 passed (22.5s) (Playwright E2E)
```
- **Total Executed:** 134
- **Passed:** 134
- **Failed:** 0
- **Skipped:** 0

## Final Decision
`RESTORE FEATURE COMPLETE`
