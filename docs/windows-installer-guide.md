# Mini POS — Windows Installer & Deployment Guide

## 1. Overview & Architecture

Mini POS for Windows is packaged using **NSIS (Nullsoft Scriptable Install System)** targeting **Windows 10 and Windows 11 (x64)**.

The installer follows production desktop best practices:
- **Per-User Installation (Default / Non-Elevated)**: Installs directly under user scope without prompting for UAC Administrator credentials, preventing permission locks on enterprise/domain-joined endpoints.
- **Strict Data Isolation**: Application program binaries and user application data are stored in completely separate filesystem locations. The SQLite database is **never** installed into or stored within `Program Files` or the application installation directory.
- **Self-Contained & Offline-First**: Contains all required runtime components, web assets, and prebuilt native modules (`better-sqlite3`). No internet connection, remote license server, or Supabase backend is required.

---

## 2. Directory & Path Architecture

| Category | Standard Path | Purpose / Lifecycle |
|---|---|---|
| **Installer Target (Binaries)** | `%LOCALAPPDATA%\Programs\Mini POS\` | Application executable (`Mini POS.exe`), ASAR bundle, prebuilt `.node` binaries, DLLs. Replaced on upgrade; removed on uninstall. |
| **Application Data (Database & Config)** | `%APPDATA%\Mini POS\mini-erp-data\` | SQLite database (`billing.db`), WAL journal (`billing.db-wal`), shared memory (`billing.db-shm`). **Preserved across upgrades and uninstalls.** |
| **Log Files** | `%APPDATA%\Mini POS\logs\` | Rolling application logs (`main.log`) managed by `electron-log`. |
| **Export / Backup Directory** | `%USERPROFILE%\Downloads\` | Default destination for manual database backups and exported receipt PDFs. |
| **Shortcuts** | `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Mini POS.lnk`<br>`%USERPROFILE%\Desktop\Mini POS.lnk` | Launcher shortcuts created during installation. |

> [!IMPORTANT]
> The database path is resolved dynamically at runtime using `app.getPath('userData')`. Under Windows, this resolves to `%APPDATA%\Mini POS`. Even if the user selects a custom installation folder during setup, user data and billing records remain protected in `%APPDATA%`.

---

## 3. End-User Installation Walkthrough

### Step 1: Download & Integrity Verification
1. Download `Mini POS Setup 1.0.0.exe` (or latest release installer).
2. (Recommended) Verify the SHA-256 checksum against `SHA256SUMS.txt` using PowerShell:
   ```powershell
   Get-FileHash -Algorithm SHA256 ".\Mini POS Setup 1.0.0.exe"
   ```

### Step 2: Windows Defender SmartScreen Handling (Unsigned Builds)
For testing and uncertified builds without an EV/OV Authenticode code-signing certificate:
1. Windows Defender SmartScreen displays a blue banner: *"Windows protected your PC: Microsoft Defender SmartScreen prevented an unrecognized app from starting."*
2. Click **"More info"**.
3. Verify that the app name indicates `Mini POS Setup 1.0.0.exe`.
4. Click **"Run anyway"**.
*(Note: Once Authenticode signing is provisioned and reputational trust is built with Microsoft SmartScreen, this prompt will disappear).*

### Step 3: Setup Wizard
1. The NSIS installer starts in user mode (no UAC prompt required).
2. **Installation Directory**: Defaults to `%LOCALAPPDATA%\Programs\Mini POS`. The user may customize this path if desired.
3. **Shortcut Options**: Creates a Start Menu entry and a Desktop shortcut.
4. **Execution**: The installer extracts binary files and creates uninstall hooks in Windows Registry (`Software\Microsoft\Windows\CurrentVersion\Uninstall\com.minipos.app`).
5. **Finish**: Check "Run Mini POS" and click Finish to start the application.

---

## 4. Upgrade Flow & Invariant Preservation

Mini POS supports seamless in-place upgrades:

1. **Keep Existing Data**: When a newer installer (e.g. version 1.1.0) is run, it detects the existing installation.
2. **Binary Replacement**: Old binaries in `%LOCALAPPDATA%\Programs\Mini POS` are replaced with updated files.
3. **Schema Migrations**: When the new version starts, `runMigrations(db)` executes within `connection.ts`:
   - Checks `schema_version` table.
   - Applies pending delta migrations inside an atomic SQLite transaction.
   - Increments schema version without modifying existing bills, items, or store configuration.
4. **No Onboarding Re-run**: Setup service recognizes existing business configuration in `settings` and `products` tables; existing stores bypass the onboarding wizard directly to the POS terminal.

---

## 5. Uninstallation & Data Preservation

Users can uninstall Mini POS via:
- **Windows Settings**: *Settings > Apps > Installed apps > Mini POS > Uninstall*
- **Control Panel**: *Programs and Features > Mini POS > Uninstall*
- **Start Menu**: *Start Menu > Mini POS > Uninstall Mini POS*

### What Uninstallation Does:
- Removes all files in `%LOCALAPPDATA%\Programs\Mini POS\`.
- Removes Start Menu and Desktop shortcuts.
- Deletes uninstaller registry keys.

### What Uninstallation Preserves (By Design):
- Preserves `%APPDATA%\Mini POS\` (all SQLite databases, WAL files, store profile, and historical transactions).
- If the user reinstalls Mini POS at a later date, all business data, inventory, and historical bills remain intact and immediately accessible.

---

## 6. Backup & Recovery Operations on Windows

Mini POS includes built-in database backup and restore routines with specific protections for Windows:

### Exporting Backups:
- The UI triggers `backup:export`.
- Main process uses SQLite Online Backup API (`db.backup(...)`) to dump an atomic snapshot into a temporary file.
- The snapshot undergoes an SQLite `PRAGMA integrity_check` before finalizing.
- `BackupService.ts` moves the verified snapshot to the user's chosen destination. If destination is on a separate drive letter (e.g., `D:\Backups`), the service handles `EXDEV` cross-device semantics via fallback copy-and-unlink.

### Restoring Backups:
- The user selects a `.db` backup file via `restore:validate`.
- Pre-restore validation tests SQLite header, schema integrity, and version compatibility.
- An emergency pre-restore safety backup is created automatically.
- Database connection is closed explicitly to release Windows kernel file locks (`SQLITE_BUSY` / `EBUSY`).
- The live database file is swapped atomically, migrations are applied if restoring an older backup version, and the application re-initializes.

---

## 7. Windows Code Signing & Authenticode Certification

To eliminate Windows SmartScreen warnings in production:
1. Obtain an **Extended Validation (EV)** or **Organization Validation (OV)** Code Signing Certificate from a Microsoft-trusted Certificate Authority (e.g., DigiCert, Sectigo).
2. Configure GitHub Secrets in the deployment pipeline:
   - `WIN_CSC_LINK`: Base64-encoded `.pfx` certificate file.
   - `WIN_CSC_KEY_PASSWORD`: Password protecting the private key.
3. `electron-builder` automatically invokes `signtool.exe` during `npm run package:win:x64` to sign the inner executable (`Mini POS.exe`) and outer installer (`Mini POS Setup.exe`) with RFC 3161 timestamps.
