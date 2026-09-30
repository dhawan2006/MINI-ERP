# Stage 27: Safe Database Backup & Export Implementation

## Overview
This document summarizes the completion of Stage 27, which introduces a safe, operator-friendly way to back up Mini POS application data using the SQLite Online Backup API.

## Implementation Details

### Architecture
- **Settings UI**: Added a "Backup Database" button under a new Data Management section in `SettingsLayout.tsx`.
- **Preload & IPC**: Added a `backup:export` IPC channel to invoke the backup sequence securely without giving the renderer access to Node APIs.
- **Dialog Orchestration**: The native OS save dialog (`dialog.showSaveDialog`) is triggered on the Main process via `ElectronDialogService` to prompt the operator for a final destination file path.
- **Backup Service**: 
  - Creates a temporary file in the same directory as the chosen destination using a randomized suffix (e.g. `Mini-POS-Backup-YYYY-MM-DD.tmp-825220c7`).
  - Uses `better-sqlite3` `db.backup()` API for an atomic, consistent point-in-time snapshot, avoiding WAL/SHM file locking issues.
  - Verifies the integrity of the backup using a read-only connection and `PRAGMA integrity_check(simple=true)`, plus checking for required tables (`products`, `bills`, `bill_items`, `drafts`, `settings`).
  - Performs an atomic `fs.renameSync` to rename the `.tmp` file to the final destination upon successful verification.
  - Ensures clean-up of temporary files upon any failure.

### Testing & Hardening
- **Unit Testing**: `tests/infrastructure/backup.service.test.ts` validates the backup behavior, failure recovery, temp file cleanup, and concurrent execution prevention (yielding `BACKUP_DATABASE_BUSY`).
- **E2E Testing**: `tests/e2e/backup.test.ts` triggers the UI flow, utilizing a `FakeDialogService` injected at the composition root during E2E test runs (`MINIPOS_E2E_TEST=true`). This prevents native dialogs from hanging Playwright.
- Both test suites pass, verifying that the backup pipeline reliably generates trustworthy copies of the `mini-erp` application data without disrupting ongoing usage.
