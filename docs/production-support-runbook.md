# Mini POS — Production Support & Diagnostics Runbook

**Document Version:** 1.0.0  
**Effective Date:** November 8, 2026  
**Audience:** POS Support Engineers, IT Administrators, Store Operations  
**Architecture:** Standalone Desktop POS  

---

## 1. Diagnostics Philosophy & Privacy Standards

Mini POS is designed to provide comprehensive diagnostic logs while strictly protecting customer privacy and financial data.

### Strict Redaction & Privacy Invariants
Under no circumstances should support personnel ask for or log:
- **Financial Account Numbers / Card PANs:** Mini POS does not integrate directly with credit card magstripe/EMV readers; card terminals operate externally.
- **Authentication Credentials:** The desktop POS has no licensing server accounts, passwords, or cloud tokens.
- **Customer Personal Data:** Customer names or contact details must not be captured in diagnostic log files.

---

## 2. Diagnostic Log Storage & Collection

Mini POS uses an automated rotating log file mechanism (`electron-log`) with a maximum file size of 5 MB and single-generation backup rotation.

### Log File Paths by Platform

| Operating System | Standard Log Path |
| :--- | :--- |
| **macOS (Packaged)** | `~/Library/Application Support/mini-erp/logs/main.log` |
| **macOS (Development)** | `~/Library/Application Support/Electron/logs/main.log` |
| **Windows (Packaged)** | `%APPDATA%\mini-erp\logs\main.log` |
| **Linux (Packaged)** | `~/.config/mini-erp/logs/main.log` |

### Database File Paths

| Operating System | SQLite Database Directory |
| :--- | :--- |
| **macOS** | `~/Library/Application Support/mini-erp/mini-erp-data/billing.db` |
| **Windows** | `%APPDATA%\mini-erp\mini-erp-data\billing.db` |

### How to Collect Diagnostics for Support

#### On macOS:
1. Open **Finder**.
2. Press `Cmd+Shift+G` and paste:
   ```
   ~/Library/Application Support/mini-erp/logs/
   ```
3. Copy `main.log` (and `main.old.log` if present).
4. Run the pre-share sanitization filter:
   ```bash
   grep -v -E "Authorization|Bearer|password" ~/Library/Application\ Support/mini-erp/logs/main.log > ~/Desktop/minipos-sanitized.log
   ```
5. Attach `minipos-sanitized.log` to the internal support ticket.

---

## 3. Incident Triage Procedures

### A. Billing Failures & Cart Freezes
- **Symptoms:** Cashier clicks "Finalize Bill" or scans an item, but the UI remains unresponsive or shows an error toast.
- **Root Cause Check:**
  1. Inspect `main.log` for `[BillingService]` errors.
  2. Check for active draft conflicts or negative price calculations.
- **Resolution:**
  1. Click **Clear Bill** (`Escape` key) to reset the in-memory cart.
  2. If the cart remains locked, press `Cmd+R` (or `Ctrl+R`) to reload the renderer interface. Active drafts are automatically rehydrated from the SQLite `drafts` table.

---

### B. Database Errors (`SQLITE_BUSY`, Disk Full)
- **Symptoms:** Error dialog: `DATABASE_DISK_FULL`, `DATABASE_PERMISSION_DENIED`, or `SQLITE_BUSY`.
- **Diagnostic Triage:**
  - `DATABASE_DISK_FULL`: Check free space on the host disk (`df -h`). SQLite WAL checkpointing requires at least 50 MB of free storage.
  - `SQLITE_BUSY`: Another external tool (e.g. SQLite viewer or antivirus scanner) has placed an exclusive lock on `billing.db`.
- **Resolution:**
  1. Free at least 1 GB of disk space on the system drive.
  2. Close any external database viewing tools or backup scripts accessing `billing.db`.
  3. Restart Mini POS. The 5,000 ms busy timeout will allow transient locks to clear.

---

### C. Thermal Receipt Printer Connection Problems
- **Symptoms:** Bill finalizes on screen, but receipt does not print; toast message: *"Printer connection failed, bill remains saved"*.
- **Diagnostic Triage:**
  1. Check `main.log` for `[PrintService]` entries.
  2. Verify physical USB connection:
     ```bash
     # macOS:
     system_profiler SPUSBDataType | grep -i "printer\|pos"
     ```
  3. Verify network printer IP address and port 9100 reachability:
     ```bash
     nc -zv <PRINTER_IP> 9100
     ```
- **Resolution:**
  1. Check paper roll and close printer cover firmly.
  2. Re-plug USB cable or power cycle the thermal printer.
  3. Mini POS guarantees that **bills are already committed to SQLite** even if printing fails. Navigate to **History** (`Cmd+H`), select the invoice, and click **Reprint Receipt**.

---

### D. Backup & Restore Failures
- **Symptoms:** "Backup rejected: database is already busy" or "Restore failed: SQLite integrity check failed".
- **Diagnostic Triage:**
  - Backup Busy: Another backup operation was triggered before the previous one finished writing to disk.
  - Corrupt Source File: The backup file being restored has a broken SQLite header or missing core tables.
- **Resolution:**
  1. Wait 10 seconds for active disk writes to finish, then retry **Create Backup**.
  2. For restore failures, Mini POS **never modifies the active database** if the incoming backup fails `PRAGMA integrity_check`. Furthermore, an automatic pre-restore safety snapshot (`Mini-POS-Safety-Backup-*.db`) is created prior to any file replacement.

---

### E. Emergency Factory Reset
If the application data becomes unrecoverable or a test setup needs to be cleared:
1. Navigate to **Settings** > **Data Management**.
2. Click **Factory Reset** and confirm the destructive action.
3. Mini POS will cleanly terminate database handles, remove `billing.db`, `billing.db-wal`, `billing.db-shm`, and restart into the initial onboarding wizard.

