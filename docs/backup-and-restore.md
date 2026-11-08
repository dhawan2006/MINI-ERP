# Mini POS — Local Backup & Disaster Recovery Policy

## 1. Overview

Mini POS manages all retail business operations through a local SQLite database (`billing.db`). Because the application operates standalone without cloud synchronization, robust local backup and recovery mechanisms are essential to prevent data loss resulting from hardware failure, accidental file deletion, or OS corruption.

---

## 2. Backup Mechanisms

### 2.1 Automated Snapshots (`BackupService.ts`)
- **Trigger**: Mini POS automatically generates verified SQLite database backups during daily operations and immediately before performing any database restore operation.
- **Location**: `<UserData>/mini-erp-data/backups/Mini-POS-Backup-YYYY-MM-DD-HH-mm.db`
- **Integrity Validation**: Every backup is verified using `PRAGMA integrity_check` before confirmation. If the integrity check fails, the temporary file is deleted and an error is logged.
- **Retention**: Mini POS retains the last 30 daily backup snapshots automatically, pruning older backups to conserve disk space.

### 2.2 Manual Backups
- Cashiers and store administrators can trigger an immediate backup via the UI:
  1. Open **Settings** -> **Database Management**.
  2. Click **Create Backup Now**.
  3. The system generates an atomic copy, verifies its schema, and confirms success with timestamp and file size.
- Backups can also be exported to external storage (e.g., USB drive) for off-site disaster recovery.

---

## 3. Database Restoration Architecture

Restoring a database replaces the current live database with a verified backup file.

```
┌─────────────────────────────────────────────────────────────┐
│                 Restore Workflow Execution                  │
├─────────────────────────────────────────────────────────────┤
│ 1. Acquire global Restore Mutex Lock                        │
│ 2. Check for active unfinalized customer drafts             │
│    (Blocks restore if active draft exists to prevent loss)   │
│ 3. Validate candidate backup file:                          │
│    - File exists & size > 0                                 │
│    - SQLite header check & PRAGMA integrity_check           │
│    - Required tables check (products, bills, settings)      │
│ 4. Take emergency pre-restore snapshot of current DB        │
│ 5. Close active SQLite connection pool                      │
│ 6. Atomically replace billing.db with backup file           │
│ 7. Re-initialize database connection & run migrations       │
│ 8. Release Restore Mutex Lock & notify UI to reload state   │
└─────────────────────────────────────────────────────────────┘
```

### Safety Protections
- **Draft Conflict Guard**: If an unfinalized draft is in progress, the restore request is rejected with `ACTIVE_DRAFT_EXISTS` to prevent cashiers from losing active cart items.
- **Pre-Restore Rollback Snapshot**: Before replacing `billing.db`, a rollback snapshot is created at `billing.db.pre-restore-<timestamp>`. If the file swap or re-initialization fails, the system rolls back to this snapshot immediately.
- **Concurrency Lock**: All IPC handlers check the restore lock before executing read/write queries. If a restore is in progress, IPC requests return a locked status.

---

## 4. Manual Disaster Recovery Procedure

If the workstation OS fails or the application cannot launch:
1. Locate the latest backup file in the backups directory:
   - macOS: `~/Library/Application Support/Mini POS/mini-erp-data/backups/`
   - Windows: `%APPDATA%\Mini POS\mini-erp-data\backups\`
2. Install Mini POS on the replacement computer.
3. Launch Mini POS once to generate the directory structure.
4. Close Mini POS.
5. Copy the verified `.db` backup file to `<UserData>/mini-erp-data/billing.db`.
6. Relaunch Mini POS. The schema migrations run automatically and restore all products, invoices, and settings.
