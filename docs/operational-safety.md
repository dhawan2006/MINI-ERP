# Mini Billing System: Operational Safety & Troubleshooting

This document outlines how to diagnose and recover from critical failures in the Mini Billing System.

## 1. Log Files (electron-log)

The application uses `electron-log` to capture all critical events, SQLite failures, and IPC validation errors.
Logs are automatically rotated when they reach 5MB. A maximum of 5 log files are kept.

### Log Locations

*   **Windows**: `%USERPROFILE%\AppData\Roaming\mini-erp\logs\main.log`
*   **macOS**: `~/Library/Logs/mini-erp/main.log`
*   **Linux**: `~/.config/mini-erp/logs/main.log`

If the application crashes silently, immediately check `main.log` for FATAL or ERROR entries at the bottom of the file.

## 2. Draft Recovery

The application features an automatic offline-first draft recovery system.
As items are added to a bill, the exact state of the bill is serialized as JSON and written to the `drafts` table in the SQLite database (using WAL mode for safety).

*   **If the application crashes mid-bill:** Simply restart the application. The draft will be loaded automatically and the cashier can continue exactly where they left off.
*   **If the draft JSON becomes corrupted:** The application will safely log the corruption in `main.log` and initialize a fresh, empty bill. It will not crash on boot.

## 3. Database Corruption & Finalization Safety

All bill finalizations are protected by SQLite transactions (`db.transaction`).

*   If the computer loses power or the application crashes *during* finalization, the entire transaction rolls back.
*   The draft is NOT deleted until the finalization is securely committed to disk.
*   Therefore, it is impossible for a bill to "disappear" without being saved.

If the `database.sqlite` file becomes fundamentally corrupted (e.g., due to catastrophic disk failure):
1.  Navigate to the `userData` folder (parent of the `logs` folder).
2.  Locate `database.sqlite`, `database.sqlite-shm`, and `database.sqlite-wal`.
3.  Backup these files if you want to attempt professional SQLite recovery.
4.  Delete them to allow the application to generate a fresh, empty database on the next boot.

## 4. Printer Failures

If thermal printing fails:
1.  The bill has already been finalized and is safe in the database.
2.  Navigate to the **History** tab (`F3`).
3.  Locate the bill (it will be the most recent one).
4.  Press **Enter** to open details, and press `P` to Reprint.
5.  If thermal printing continues to fail, use the **Export PDF** (`E`) option to generate a PDF receipt which can be printed via the standard system dialog.

## 5. UI Error Boundaries

If a rare bug causes the React UI to crash, the screen will not go blank white.
An Error Boundary will display a safe recovery screen.
Click **Reload Application**. Your underlying data and drafts are safe in the database.
