# Mini POS — Operational Support & Troubleshooting

## 1. Workstation Diagnostics

Mini POS runs as a standalone desktop application. Issues are typically isolated to hardware peripheral connections, filesystem permissions, or local database locking.

---

## 2. Common Issues & Resolution

### 2.1 Thermal Receipt Printer Not Printing
- **Network Printers (TCP/IP port 9100)**:
  - Verify printer IP address in **Settings** -> **Printer Settings**.
  - Ping the printer IP from terminal: `ping <PRINTER_IP>`.
  - Ensure printer has paper and no paper jam indicator is lit.
  - Test print via **Settings** -> **Test Print**.
- **USB Receipt Printers**:
  - Verify USB cable is firmly connected.
  - Check OS printer list to ensure driver is recognized.
  - If direct ESC/POS USB output fails, switch to **System Print (PDF Dialog)** mode in settings.

### 2.2 Barcode Scanner Not Adding Items
- **Symptom**: Scanner beeps, but item does not appear in cart.
- **Diagnostic Steps**:
  1. Open a text editor (e.g., TextEdit or Notepad) and scan a barcode.
  2. Verify that the scanner transmits digits followed by an Enter / Carriage Return (`CR`) keypress.
  3. If no Enter key is transmitted, configure the hardware scanner to append `CR` / `LF` suffix using the manufacturer's manual.
  4. Ensure product SKU barcode is registered in Mini POS **Products** catalog.

### 2.3 Database Busy or Locked Error (`SQLITE_BUSY`)
- **Cause**: An active database restore operation is in progress or a previous instance of Mini POS did not exit cleanly.
- **Resolution**:
  1. Close all instances of Mini POS.
  2. On macOS: `killall "Mini POS"` or check Activity Monitor.
  3. On Windows: End Task for `Mini POS.exe` in Task Manager.
  4. Check user data folder for stale lock files:
     - Remove `billing.db-journal` if present and unreferenced.
     - Note: `billing.db-wal` and `billing.db-shm` are normal WAL mode files and should **not** be manually deleted while the app is closing.
  5. Relaunch Mini POS.

### 2.4 Corrupted Database Recovery
- **Symptom**: App displays database initialization error on startup.
- **Resolution**:
  1. Open user data directory:
     - macOS: `~/Library/Application Support/Mini POS/mini-erp-data/`
     - Windows: `%APPDATA%\Mini POS\mini-erp-data\`
  2. Copy `billing.db` to a safe location as a precaution.
  3. Navigate to `backups/` subfolder.
  4. Find the most recent healthy backup file (`Mini-POS-Backup-*.db`).
  5. Copy it over `billing.db`.
  6. Relaunch Mini POS.

---

## 3. Application Logs

Mini POS writes structured application logs using `electron-log`:
- **macOS**: `~/Library/Logs/Mini POS/main.log`
- **Windows**: `%USERPROFILE%\AppData\Roaming\Mini POS\logs\main.log`
- **Linux**: `~/.config/Mini POS/logs/main.log`

Inspect `main.log` to review database startup messages, IPC errors, printer adapter outputs, and backup verification results.
