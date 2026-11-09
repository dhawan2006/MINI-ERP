# Mini POS — Windows Testing & Quality Assurance Strategy

## 1. Overview & Test Philosophy

Testing Mini POS for Windows requires a multi-tiered validation approach. Because development is performed on macOS Apple Silicon, testing must strictly decouple:
1. **Platform-Independent Logic**: Tested locally and in CI via fast in-memory unit and integration tests.
2. **Packaged Windows Runtime Invariants**: Automated on a native Windows x64 GitHub Actions runner using Playwright and Electron.
3. **Hardware-Dependent POS Integration**: Clearly separated into mockable software interfaces versus physical bench testing.

---

## 2. Test Pyramid & Execution Categories

```
                  ┌──────────────────────────────┐
                  │    Physical Hardware Bench   │  <-- Stage 7 (ESC/POS, USB, thermal cutter)
                  │   (Manual / On-Premise Only) │
                  ├──────────────────────────────┤
                  │   NSIS Installer Acceptance  │  <-- Stage 5 (Silent install, upgrade, uninstall)
                  ├──────────────────────────────┤
                  │   Packaged Windows E2E Tests │  <-- Stage 6 (Playwright + Packaged App)
                  ├──────────────────────────────┤
                  │  Packaged App Smoke Tests    │  <-- Stage 4/5 (scripts/verify-packaged.js)
                  ├──────────────────────────────┤
                  │ Vitest Unit & Integration    │  <-- Stage 1/2 (126 tests: DB, IPC, billing, PDF)
                  └──────────────────────────────┘
```

---

## 3. Test Suites & Commands

### Suite A: Vitest Unit & Integration Tests (Local & CI)
- **Scope**: Core domain calculations, SQLite repositories, transactions, migrations, IPC handlers, PDF generation, ESC/POS byte-level encoding, and backup/restore services.
- **Framework**: Vitest (27 files, 126 tests).
- **Execution Command**:
  ```bash
  npm test
  ```
- **Current Status**: **126 PASSED** (0 failures, executed on macOS Apple Silicon baseline).

### Suite B: Packaged App Fast Smoke Test (`scripts/verify-packaged.js`)
- **Scope**: Launches the actual compiled executable (`release/win-unpacked/Mini POS.exe`), validates Electron main-process boot, verifies `userData` directory resolution, tests SQLite query via IPC, and checks store settings persistence.
- **Framework**: Node.js + Playwright Electron launcher.
- **Execution Command**:
  ```bash
  # Windows CMD / PowerShell:
  set MINIPOS_E2E_TEST=true
  node scripts/verify-packaged.js
  ```

### Suite C: Windows Packaged E2E Suite (`tests/e2e/windows/`)
- **Scope**: Thorough end-to-end automation executing against the packaged Windows binary.
- **Configuration**: `playwright.windows.config.ts`.
- **Test File**: `tests/e2e/windows/packaged-app.windows.spec.ts`.
- **Covered Scenarios**:
  - `system:ping` and process-level health.
  - Native `better-sqlite3` `win32-x64.node` module loading.
  - Verification that the live SQLite database is stored in `%APPDATA%`, never `Program Files`.
  - Fresh-launch onboarding workflow (`setup:getState`, `setup:saveStoreProfile`, `setup:complete`).
  - Cash and UPI bill creation, draft updates, bill finalization, and bill history retrieval.
  - Store profile update and restart persistence.
  - Backup export and restore validation (using headless `FakeDialogService`).
  - Domain error response formatting.
- **Execution Command**:
  ```bash
  npm run test:e2e:windows
  ```

### Suite D: NSIS Installer Acceptance Tests (CI Automated)
- **Scope**: Silent installation, file structure inspection, shortcut creation, uninstaller presence, and user data preservation.
- **Execution Command (PowerShell)**:
  ```powershell
  # 1. Silent install to isolated test directory
  Start-Process -FilePath "release\Mini POS Setup 1.0.0.exe" -ArgumentList "/S", "/D=C:\TestMiniPOS" -Wait
  # 2. Check binary exists
  Test-Path "C:\TestMiniPOS\Mini POS.exe"
  # 3. Check uninstaller exists
  Test-Path "C:\TestMiniPOS\Uninstall Mini POS.exe"
  ```

---

## 4. Stage 5 Lifecycle Acceptance Matrix

| Lifecycle Stage | Verification Method | Expected Result | Status |
|---|---|---|---|
| **Fresh Installation** | CI Automated + Manual Windows VM | Installs to `%LOCALAPPDATA%\Programs\Mini POS`. Creates shortcuts. First launch triggers store setup onboarding. | Automated in CI (`windows-release.yml`) |
| **SQLite Initialization** | CI Automated (`verify-packaged.js`) | Creates `%APPDATA%\Mini POS\mini-erp-data\billing.db`. Enables WAL mode. Creates all tables and indexes. | Automated in CI |
| **Existing Installation** | Playwright E2E (`setup.e2e.spec.ts`) | App detects existing SQLite database with store settings and products; skips onboarding directly to POS billing screen. | Automated in CI / local |
| **In-Place Upgrade** | CI Acceptance Script | New installer replaces files in `%LOCALAPPDATA%`. Existing `billing.db` is migrated forward without loss of transactions. | Automated in CI |
| **Backup Creation** | Vitest + E2E (`backup.test.ts`) | Atomic snapshot created via SQLite online backup API; checksum and table verification pass; handles cross-volume moves. | Automated in Vitest & E2E |
| **Restore Execution** | Vitest + E2E (`restore.test.ts`) | Pre-restore safety backup created; live DB closed; atomic file swap executed; database reopened successfully. | Automated in Vitest & E2E |
| **Uninstallation** | NSIS Silent Uninstall (`Uninstall Mini POS.exe /S`) | Program files in `%LOCALAPPDATA%` and shortcuts deleted. **`%APPDATA%\Mini POS\billing.db` preserved.** | Automated in CI |

---

## 5. Stage 7: Hardware & Peripheral Readiness

Software automation cannot replace physical bench verification for retail hardware. The testing boundary is strictly codified below:

### Software Layer (Automated Without Physical Hardware):
- **PDF Generation**: Verified via unit tests (`PdfReceiptRenderer.test.ts`) and Playwright. Produces valid PDF documents formatted for 58mm/80mm roll widths with embedded Noto Sans font.
- **ESC/POS Command Stream**: Verified via `EscPosReceiptRenderer.test.ts`. Asserts correct byte streams for character formatting, line feeds, alignment, barcode printing, and cut commands (`GS V 66 0`).
- **Network Transport**: Verified via `NetworkPrinterTransport.test.ts` using mock TCP socket listeners (`net.createServer`). Validates error handling for connection timeouts (`PRINTER_TIMEOUT`) and connection refused (`PRINTER_CONNECTION_FAILED`).
- **Printer Configuration UI**: Verified via `SettingsService.test.ts` and settings IPC handlers.

### Bench Testing Required (Requires Physical Hardware):
The following items **must be manually certified** before marketing hardware compatibility:

| Peripheral | Test Requirement | Equipment Needed |
|---|---|---|
| **USB Thermal Printer** | Plug-and-play USB vendor/product ID binding on Windows 10/11. Verification that WinUSB or direct COM port mapping transmits ESC/POS raw bytes without driver buffering. | Physical USB POS printer (e.g. Epson TM-T82, TVS RP3200, Posiflex) |
| **Windows Printer Spooler** | Interaction with Windows Print Spooler (`winspool.drv`) if generic text-only driver is used instead of raw TCP socket. | Windows test laptop with installed vendor print drivers |
| **Physical Paper Cutters** | Validating partial vs. full paper cut commands (`GS V`) across different manufacturer cutter mechanisms. | Hardware receipt roll |
| **Cash Drawer Kick** | Validating pulse output pin voltage (`ESC p m t1 t2`) triggered through printer RJ12 port upon bill finalization. | RJ12-connected cash drawer |
| **USB Barcode Scanners** | Validating keyboard-wedge input parsing under Windows keyboard layout (timing, enter suffix `\r\n` handling via `useScannerDetector`). | Handheld USB 1D/2D barcode reader |

> [!CAUTION]
> Do **not** mark USB printer support as "certified" in release documentation until physical testing on a real Windows PC with a physical thermal printer is completed. The codebase explicitly stubs `UsbPrinterTransport` with `PRINTER_UNSUPPORTED` for this reason.

---

## 6. macOS Regression Guarantee

The cross-platform hardening introduced for Windows compatibility has been verified to cause **zero regression** on macOS:

1. **Single-Instance Locking**: `app.requestSingleInstanceLock()` is standard Electron API supported identically across macOS and Windows.
2. **Cross-Volume Rename Handling**: The `EXDEV` fallback in `BackupService.ts` executes standard `fs.renameSync` on macOS (which succeeds atomically within APFS volumes) while gracefully handling cross-volume mounts if an external disk is used.
3. **Multi-Platform Packaging**: macOS build scripts (`npm run package:mac:arm64`, `npm run package:mac:x64`) remain completely untouched and produce functional `.dmg` artifacts.
4. **Test Suite**: All 126 Vitest tests execute and pass identically on macOS Apple Silicon.
