# Mini POS — Windows Edition: Risk Register

> **Stage**: 1 — Compatibility Audit Risk Register  
> **Date**: 2026-11-09  
> **Branch**: `feature/windows-edition` @ `130153c`  
> **Owner**: Windows Edition Compatibility Track

---

## Severity Scale

| Level | Definition |
|---|---|
| **CRITICAL** | Prevents the app from launching or causes data loss |
| **HIGH** | Severe user-facing defect or security/trust issue |
| **MEDIUM** | Functional defect under realistic user conditions |
| **LOW** | Minor annoyance, cosmetic issue, or future-proofing concern |

## Likelihood Scale

| Level | Definition |
|---|---|
| **CERTAIN** | Will occur on every Windows installation without mitigation |
| **LIKELY** | Occurs under common real-world conditions |
| **POSSIBLE** | Occurs under specific but realistic conditions |
| **UNLIKELY** | Occurs only under unusual or edge-case conditions |

---

## Risk Register Table

| Risk ID | Subsystem | Description | Audit Finding | Severity | Likelihood | Priority | Status | Mitigation |
|---|---|---|---|---|---|---|---|---|
| **ICON-001** | Icons / Installer | `build/icon.ico` is missing. `electron-builder` cannot produce a branded NSIS installer; build will fail or fall back to a blank icon | `F-ELEC-01`, `F-ICON-01` | **CRITICAL** | **CERTAIN** | P0 | 🔴 Open | Generate a multi-resolution `.ico` from `build/icon.png` (16, 32, 48, 64, 128, 256 px). Add `win.icon: build/icon.ico` to `electron-builder.yml` |
| **SINGLE-001** | Electron / Database | No `app.requestSingleInstanceLock()`. On Windows a user can open multiple app windows simultaneously, each holding a `better-sqlite3` write connection to `billing.db`, causing silent data corruption | `F-ELEC-02` | **CRITICAL** | **LIKELY** | P0 | 🔴 Open | Implement `requestSingleInstanceLock()` in `electron/main.ts`. Quit the second instance; focus the existing window via `second-instance` event handler |
| **RENAME-001** | Filesystem / Backup | `fs.renameSync` in `BackupService` throws `EXDEV` on Windows when the user selects a backup destination on a different drive letter (e.g., `D:\`) from the temp file on `C:` | `F-FS-01` | **MEDIUM** | **POSSIBLE** | P1 | 🟡 Open | Wrap `renameSync` in try/catch; on `EXDEV` fall back to `fs.copyFileSync` + `fs.unlinkSync`. Add integration test with cross-volume path mock |
| **RENAME-002** | Filesystem / Restore | `fs.promises.rename` used in `RestoreService` rollback path (step 7a). Same `EXDEV` risk if `userData` and system temp are on different volumes | `F-FS-02`, `F-BAK-02` | **MEDIUM** | **UNLIKELY** | P2 | 🟡 Open | Apply cross-volume copy+delete fallback. Ensure `better-sqlite3` `db.close()` is called before any rename to prevent `EBUSY` on Windows |
| **SQLITE-001** | Database / Native | `better-sqlite3` v13.0.3 uses N-API; `win32-x64.node` prebuild exists. Risk: `npm install` on Windows CI falls back to native compilation (requires MSVC) if prebuild download fails | `F-DB-01` | **HIGH** | **UNLIKELY** | P1 | 🟡 Open — needs CI run | Add a CI step to verify prebuild resolution: `node -e "require('better-sqlite3')"`. Pin `npm config set better_sqlite3_binary_host_mirror` if needed |
| **SIGNING-001** | Security / Distribution | Windows NSIS installer is unsigned. Any enterprise policy with Authenticode enforcement will block installation outright | `F-SEC-01` | **HIGH** | **CERTAIN** (enterprise) | P1 | 🔴 Open | Procure an EV or OV code signing certificate. Store as `WIN_CSC_LINK` + `WIN_CSC_KEY_PASSWORD` in GitHub Actions secrets. Configure `electron-builder.yml` `win.certificateFile` |
| **SMARTSCREEN-001** | Security / Distribution | Unsigned binary triggers Windows Defender SmartScreen "Unknown publisher" warning for all consumer users. Users must click through "More info → Run anyway" | `F-SEC-01` | **HIGH** | **CERTAIN** (unsigned) | P1 | 🔴 Open | Same mitigation as `SIGNING-001`. Even a standard OV certificate reduces SmartScreen friction; EV certificate eliminates it immediately |
| **PRINT-USB-001** | Printing / Hardware | `UsbPrinterTransport` is stubbed and throws `NOT_SUPPORTED`. USB receipt printers require WinUSB or libusb native bindings on Windows. This is a known limitation | `F-PRINT-01` | **LOW** | **CERTAIN** (if USB printing required) | P3 | 🔵 Deferred | Acceptable stub for initial release. If USB printing is required: integrate `node-usb` or `node-escpos` with WinUSB backend. Requires `F` (physical hardware) verification |
| **ASAR-001** | PDF / Fonts | `NotoSans-Regular.ttf` is loaded from `app.getAppPath()/assets/fonts/`. In ASAR-packaged builds, `app.getAppPath()` returns the `.asar` path; Electron's ASAR VFS makes this transparent to `fs.readFileSync`, but this must be verified in a real packaged Windows build | `F-PDF-01`, `F-FONT-01` | **MEDIUM** | **UNLIKELY** (ASAR VFS is well-tested) | P2 | 🟡 Open — needs CI smoke test | Add a CI smoke test step that generates a PDF and checks for non-zero file size. If font fails to load, extract `assets/` from ASAR by adding it to `electron-builder.yml` `extraResources` |

---

## Additional Risks Identified

| Risk ID | Subsystem | Description | Audit Finding | Severity | Likelihood | Priority | Status | Mitigation |
|---|---|---|---|---|---|---|---|---|
| **TITLE-001** | CI / Smoke Test | `verify-packaged.js` asserts window title `'Mini Billing System'`. If `index.html` `<title>` says `'Mini POS'` or similar, smoke test fails on every Windows CI run | `F-CI-04` | **LOW** | **POSSIBLE** | P2 | 🟡 Open — verify | Inspect `index.html` `<title>` tag. Update `verify-packaged.js` assertion or the HTML title to match |
| **NSIS-001** | Installer UX | No `nsis:` block in `electron-builder.yml`. Default NSIS config is one-click install with no directory selection, no Start Menu shortcut configuration | `F-ICON-02` | **LOW** | **CERTAIN** | P3 | 🟡 Open | Add `nsis:` block: `oneClick: false`, `allowToChangeInstallationDirectory: true`, `createDesktopShortcut: true`, `createStartMenuShortcut: true` |
| **PLATFORM-001** | Renderer / UX | `navigator.platform` is deprecated. Currently falls through correctly on Windows (non-Mac detection works). No functional defect today, but may break in future Chromium versions | `F-SEC-02` | **LOW** | **UNLIKELY** (near-term) | P3 | 🟡 Open | Replace with `process.platform` exposed via `contextBridge`, or use `navigator.userAgentData.platform` |
| **DBFILELOCK-001** | Database / OS | Windows holds exclusive file locks on open SQLite database files. The restore flow must call `db.close()` before renaming over `billing.db`, or the rename will fail with `EPERM` | `F-BAK-02` | **HIGH** | **LIKELY** (if lock not released) | P1 | 🟡 Open | Audit restore flow to confirm `db.close()` is called in step 5 before the step 6 rename. Add error handling for `EPERM` with a user-facing error message |
| **CI-TCHECK-001** | CI / Build Quality | TypeScript type-check step is absent from CI. Type errors are only caught during the Vite build step within `electron-builder`, making them harder to diagnose | `F-CI-01` | **LOW** | **POSSIBLE** | P2 | 🟡 Open | Add `npx tsc --noEmit` as a dedicated CI step before packaging |
| **CI-TEST-001** | CI / Build Quality | Vitest unit tests are not run on the `windows-latest` CI runner before packaging | `F-CI-02` | **MEDIUM** | **POSSIBLE** | P2 | 🟡 Open | Add `npm test` step in the Windows CI job |
| **SHA256-001** | Distribution | No SHA-256 checksums are generated for release artifacts, making integrity verification impossible for end users | `F-CI-03` | **LOW** | **CERTAIN** | P3 | 🟡 Open | Add PowerShell `Get-FileHash` step in Windows CI job to emit `checksums-windows.csv` |

---

## Priority Summary

| Priority | Count | Risks |
|---|---|---|
| **P0 — BLOCKER** | 2 | `ICON-001`, `SINGLE-001` |
| **P1 — High** | 5 | `SQLITE-001`, `SIGNING-001`, `SMARTSCREEN-001`, `RENAME-001`, `DBFILELOCK-001` |
| **P2 — Medium** | 5 | `RENAME-002`, `ASAR-001`, `TITLE-001`, `CI-TCHECK-001`, `CI-TEST-001` |
| **P3 — Low / Deferred** | 4 | `PRINT-USB-001`, `NSIS-001`, `PLATFORM-001`, `SHA256-001` |

---

## Risk Status Legend

| Icon | Status |
|---|---|
| 🔴 | Open — no mitigation in place |
| 🟡 | Open — mitigation identified, not yet implemented |
| 🟢 | Mitigated — fix implemented and verified |
| 🔵 | Deferred — accepted for current release, tracked for future |

---

## Resolution Checklist

### P0 — Must fix before any Windows release

- [ ] **ICON-001**: Create `build/icon.ico` and configure `electron-builder.yml`
- [ ] **SINGLE-001**: Implement `app.requestSingleInstanceLock()` in `electron/main.ts`

### P1 — Must fix before public distribution

- [ ] **SIGNING-001** / **SMARTSCREEN-001**: Procure code signing certificate and configure CI
- [ ] **DBFILELOCK-001**: Audit `db.close()` call order in restore flow
- [ ] **RENAME-001**: Add cross-volume fallback in `BackupService`
- [ ] **SQLITE-001**: Verify `better-sqlite3` prebuild resolution on `windows-latest` CI runner

### P2 — Fix before stable release

- [ ] **RENAME-002**: Add cross-volume fallback in `RestoreService`
- [ ] **ASAR-001**: Verify PDF generation and font loading in Windows CI smoke test
- [ ] **TITLE-001**: Verify window title assertion in `verify-packaged.js`
- [ ] **CI-TCHECK-001**: Add `tsc --noEmit` step to CI
- [ ] **CI-TEST-001**: Add `npm test` step to Windows CI job

### P3 — Track for future iterations

- [ ] **PRINT-USB-001**: USB printing support (physical hardware required)
- [ ] **NSIS-001**: NSIS installer UX configuration
- [ ] **PLATFORM-001**: Replace deprecated `navigator.platform`
- [ ] **SHA256-001**: Add SHA-256 checksum generation to CI
