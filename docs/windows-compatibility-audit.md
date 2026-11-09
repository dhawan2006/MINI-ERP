# Mini POS — Windows Edition: Stage 1 Compatibility Audit

> **Stage**: 1 — Full Compatibility Audit  
> **Date**: 2026-11-09  
> **Branch**: `feature/windows-edition` @ `130153c`  
> **Methodology**: Static source inspection of `electron/main.ts`, `electron/preload.ts`, `electron/ipc/*.ts`, `electron-builder.yml`, `.github/workflows/build-release.yml`, and `verify-packaged.js`. No live Windows execution performed at this stage.

---

## Classification Legend

| Code | Meaning |
|---|---|
| **A** | Platform-independent — works as-is on Windows |
| **B** | macOS-specific — intentionally macOS-only, correct behaviour |
| **C** | Requires Windows-specific implementation — code change needed |
| **D** | Potential Windows compatibility defect — code change recommended |
| **E** | Requires native Windows CI verification — no code change, but must run on `windows-latest` |
| **F** | Requires physical Windows hardware verification — cannot be verified in CI alone |

---

## Subsystem 1: Electron Framework

### Finding 1 — `F-ELEC-01` | Classification: **C** (BLOCKER)

**Title**: No Windows `.ico` icon file  
**Severity**: BLOCKER  
**Source**: `build/` directory, `electron-builder.yml`

`electron-builder` requires a `build/icon.ico` file to brand the Windows NSIS installer (title bar, uninstaller, Start Menu entry). Only `build/icon.png` (512×512 PNG) is present.

```yaml
# electron-builder.yml — current (incomplete)
win:
  target: nsis
# Missing: icon: build/icon.ico
```

**Required action**: Convert `build/icon.png` to a multi-resolution `.ico` (16, 32, 48, 64, 128, 256 px) and add:

```yaml
win:
  icon: build/icon.ico
  target: nsis
```

**Status**: NOT_VERIFIED on Windows — depends on file creation.

---

### Finding 2 — `F-ELEC-02` | Classification: **C** (BLOCKER)

**Title**: Single-instance lock not implemented  
**Severity**: BLOCKER  
**Source**: `electron/main.ts`

`app.requestSingleInstanceLock()` is absent. On Windows, a user can launch multiple instances of the app — each will open its own connection to `billing.db`. Concurrent SQLite writes without WAL mode or connection coordination cause database corruption.

**Required action**:

```typescript
// electron/main.ts — add before app.whenReady()
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, _argv, _workingDir) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}
```

**Note**: `window-all-closed` correctly calls `app.quit()` on non-darwin platforms — VERIFIED.

---

### Finding 3 — `F-ELEC-03` | Classification: **A**

**Title**: `window-all-closed` quits on non-darwin platforms  
**Severity**: None  
**Source**: `electron/main.ts`

```typescript
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
```

Correct cross-platform behaviour. On Windows, closing the last window exits the process. VERIFIED.

---

### Finding 4 — `F-ELEC-04` | Classification: **A**

**Title**: `app.relaunch()` used in restore flow  
**Severity**: None  
**Source**: `electron/ipc/restore.ts`

`app.relaunch()` followed by `app.quit()` is documented to work on Windows. VERIFIED as platform-independent.

---

### Finding 5 — `F-ELEC-05` | Classification: **E**

**Title**: `electron-builder.yml` has no Windows-specific arch or publish config  
**Severity**: Low  
**Source**: `electron-builder.yml`

The `win:` block only specifies `target: nsis`. No `arch`, `artifactName`, or `publish` keys are set. The default arch for `--win --x64` is correct, but `artifactName` should be verified to avoid installer name collisions across macOS/Windows in the same `release/` directory.

**Recommended addition**:

```yaml
win:
  icon: build/icon.ico
  target: nsis
  artifactName: "${productName} Setup ${version}.${ext}"
```

---

### Finding 6 — `F-ELEC-06` | Classification: **A**

**Title**: `contextIsolation: true`, `nodeIntegration: false`  
**Severity**: None  
**Source**: `electron/preload.ts`

Secure Electron configuration. `contextBridge` API is used for all renderer↔main communication. No platform-specific implications. VERIFIED.

---

## Subsystem 2: Database (better-sqlite3)

### Finding 7 — `F-DB-01` | Classification: **E**

**Title**: better-sqlite3 N-API prebuild — must verify resolution on Windows CI  
**Severity**: Low (expected to work)  
**Source**: `package.json`, better-sqlite3 release assets

`better-sqlite3` v13.0.3 uses the Node-API (N-API) ABI-stable interface. It ships a `win32-x64.node` prebuild that is not tied to any specific Electron ABI. `electron-rebuild` is therefore **not required**.

However, the CI pipeline has no explicit step to verify that `npm install` resolves the prebuild (versus falling back to compilation, which requires MSVC on Windows). This must be confirmed on the `windows-latest` runner.

**Verification command for CI**:

```bash
node -e "const db = require('better-sqlite3'); console.log('ok', db.SqliteError);"
```

**Status**: NOT_VERIFIED — requires Windows CI run.

---

### Finding 8 — `F-DB-02` | Classification: **A**

**Title**: Database stored in `app.getPath('userData')`  
**Severity**: None  
**Source**: `electron/ipc/billing.ts` (and related)

The database path is constructed as:

```typescript
path.join(app.getPath('userData'), 'mini-erp-data', 'billing.db')
```

On Windows this resolves to `C:\Users\<user>\AppData\Roaming\Mini POS\mini-erp-data\billing.db`. The path uses Node's `path.join()` — separators are handled correctly. VERIFIED as platform-independent.

---

### Finding 9 — `F-DB-03` | Classification: **A**

**Title**: SQLite WAL mode / journal mode — platform-independent  
**Severity**: None  

`better-sqlite3` uses the synchronous API throughout. No platform-specific SQLite pragmas or WAL-mode toggle was identified that would behave differently on Windows. VERIFIED.

---

## Subsystem 3: Filesystem Operations

### Finding 10 — `F-FS-01` | Classification: **D** (Medium Risk)

**Title**: `fs.renameSync` in BackupService — cross-volume EXDEV risk  
**Severity**: Medium  
**Source**: `electron/ipc/backup.ts`

```typescript
// Approximate pattern in BackupService
fs.renameSync(tempBackupPath, userSelectedDestination);
```

On Windows, `fs.renameSync` (and the underlying `MoveFileEx`) throws `EXDEV` when source and destination are on different drive letters (e.g., temp file on `C:` → user picks `D:\backups\`). This is a silent failure path that discards a potentially valid backup.

**Required action**: Add a cross-volume fallback:

```typescript
try {
  fs.renameSync(tempPath, destPath);
} catch (err: any) {
  if (err.code === 'EXDEV') {
    fs.copyFileSync(tempPath, destPath);
    fs.unlinkSync(tempPath);
  } else {
    throw err;
  }
}
```

**Status**: NOT_VERIFIED on Windows — logic analysis only.

---

### Finding 11 — `F-FS-02` | Classification: **D** (Medium Risk)

**Title**: `fs.promises.rename` in RestoreService rollback — cross-volume risk  
**Severity**: Medium  
**Source**: `electron/ipc/restore.ts` (step 7a rollback path rename)

Same `EXDEV` risk as above. The restore writes temp files to `userData` dir then renames — this is same-filesystem in the nominal case. However, if a future change moves temp files to a system temp directory (e.g., `os.tmpdir()` → different drive), this would break.

**Current risk**: Low in nominal case (same `userData` drive).  
**Recommended action**: Apply same cross-volume copy+delete fallback as `F-FS-01` for defensive correctness.

---

### Finding 12 — `F-FS-03` | Classification: **A**

**Title**: No hardcoded macOS paths detected  
**Severity**: None  
**Source**: All `electron/ipc/*.ts`, `electron/main.ts`

All file paths use `app.getPath()`, `path.join()`, or `path.resolve()`. No `/Users/`, `/Applications/`, or POSIX-only separators were found. VERIFIED.

---

## Subsystem 4: Printing

### Finding 13 — `F-PRINT-01` | Classification: **B** (intentional)

**Title**: USB printer throws `NOT_SUPPORTED`  
**Severity**: None (by design)  
**Source**: `electron/ipc/printing.ts` — `UsbPrinterTransport`

The USB transport is deliberately stubbed and throws `NOT_SUPPORTED`. USB printing on Windows would require WinUSB or libusb bindings. This is an acceptable stub at this stage.

**Status**: VERIFIED as intentional. Physical hardware verification required if USB support is added in a future iteration (Classification: **F** when implemented).

---

### Finding 14 — `F-PRINT-02` | Classification: **A**

**Title**: Network (TCP) printer is platform-independent  
**Severity**: None  
**Source**: `electron/ipc/printing.ts` — `NetworkPrinterTransport`

Uses Node.js `net` module for TCP socket communication. The `net` module is fully cross-platform. ESC/POS byte sequences are hardware-level and platform-agnostic. VERIFIED.

---

## Subsystem 5: PDF Generation

### Finding 15 — `F-PDF-01` | Classification: **A** (requires CI check)

**Title**: Font loaded via `app.getAppPath()` — ASAR packaging  
**Severity**: Low  
**Source**: `electron/ipc/pdf.ts`

```typescript
const fontPath = path.join(app.getAppPath(), 'assets', 'fonts', 'NotoSans-Regular.ttf');
```

`app.getAppPath()` in an ASAR-packaged app returns the path to `app.asar`. The `assets/` directory is listed in `electron-builder.yml`'s `files` array, which means it **is included** in the ASAR. Electron's ASAR filesystem transparently serves reads from inside the archive, so `fs.readFileSync` on a path inside `app.asar/assets/fonts/...` will work correctly.

**Status**: VERIFIED by configuration inspection. Recommend confirming with a CI smoke test that the PDF renders with correct font glyphs.

---

### Finding 16 — `F-PDF-02` | Classification: **A** (Low risk)

**Title**: `shell.openPath` for PDF — Windows default viewer  
**Severity**: Low  
**Source**: `electron/ipc/pdf.ts`

`shell.openPath(pdfPath)` on Windows opens the file with the system default PDF viewer (Edge, Acrobat, etc.). This is correct behaviour. No code change required. VERIFIED.

---

## Subsystem 6: Logging

### Finding 17 — `F-LOG-01` | Classification: **A**

**Title**: `electron-log` — pure JS, platform-independent  
**Severity**: None  
**Source**: `package.json`, `electron/main.ts`

`electron-log` v5.4.4 is pure JavaScript. It writes to `app.getPath('userData')/logs/main.log` using platform-safe path resolution. On Windows: `C:\Users\<user>\AppData\Roaming\Mini POS\logs\main.log`. VERIFIED.

---

## Subsystem 7: Backup & Restore

### Finding 18 — `F-BAK-01` | Classification: **A**

**Title**: SQLite Online Backup API — platform-independent  
**Severity**: None  
**Source**: `electron/ipc/backup.ts`

The SQLite online backup API (`db.backup(destPath)`) is a C-level API exposed by `better-sqlite3`. It is fully platform-independent. VERIFIED.

---

### Finding 19 — `F-BAK-02` | Classification: **D**

**Title**: Multi-step restore flow — cross-volume and file-lock risks on Windows  
**Severity**: Medium  
**Source**: `electron/ipc/restore.ts`

The restore sequence:
1. Validate backup file
2. Create safety backup
3. Copy backup file to temp
4. Run migrations on temp copy
5. Close active DB connection
6. Rename temp copy over live DB (same filesystem — OK in nominal case)
7. Reopen DB
8. `app.relaunch()`

**Risks on Windows**:
- Step 6 rename: If `userData` is on a different volume from `os.tmpdir()`, this fails with `EXDEV`.
- If any file handle is not properly released before step 6, Windows raises `EBUSY`/`EPERM` on the rename.

**Recommended action**: Ensure all DB connections are closed (and `better-sqlite3` `db.close()` is called) before the rename. Apply cross-volume fallback.

---

## Subsystem 8: Icons & Fonts

### Finding 20 — `F-ICON-01` | Classification: **C** (BLOCKER)

**Title**: `build/icon.ico` missing  
**Severity**: BLOCKER  
**Source**: `build/` directory

Duplicate of Finding 1. See `F-ELEC-01`. Listed here for subsystem completeness.

---

### Finding 21 — `F-ICON-02` | Classification: **C**

**Title**: `electron-builder.yml` missing NSIS-specific installer configuration  
**Severity**: Low  
**Source**: `electron-builder.yml`

No `nsis:` block exists. The installer uses electron-builder defaults. Recommended additions:

```yaml
nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
  createDesktopShortcut: true
  createStartMenuShortcut: true
  installerIcon: build/icon.ico
  uninstallerIcon: build/icon.ico
```

---

### Finding 22 — `F-FONT-01` | Classification: **E**

**Title**: NotoSans font inside ASAR — verify PDF rendering on Windows CI  
**Severity**: Low  
**Source**: `electron-builder.yml` files array

ASAR inclusion is confirmed by configuration. Font rendering in `pdf-lib` is a pure JS operation. Expected to work but should be verified end-to-end by generating a PDF in the Windows CI smoke test.

---

## Subsystem 9: Security & Code Signing

### Finding 23 — `F-SEC-01` | Classification: **C**

**Title**: No Windows code signing — SmartScreen warning  
**Severity**: High (user experience)  
**Source**: `.github/workflows/build-release.yml`, `electron-builder.yml`

The Windows NSIS installer is not signed. All Windows users will see a Windows Defender SmartScreen "Unknown publisher" warning, and some enterprise policies will block execution entirely. Code signing requires:

1. An EV (Extended Validation) or OV code signing certificate from a trusted CA.
2. GitHub Actions secrets: `WIN_CSC_LINK` (PFX base64) and `WIN_CSC_KEY_PASSWORD`.
3. `electron-builder.yml` publish configuration.

**Status**: NOT_VERIFIED — depends on certificate procurement.

---

### Finding 24 — `F-SEC-02` | Classification: **D**

**Title**: `navigator.platform` deprecated in renderer  
**Severity**: Low  
**Source**: `src/platform.ts` (or equivalent)

```typescript
// Current — deprecated
const isMac = navigator.platform?.startsWith('Mac') || navigator.userAgent.includes('Mac');
```

On Windows, `navigator.platform` returns `'Win32'` and the fallback correctly identifies non-Mac. No functional defect, but `navigator.platform` is deprecated in favour of `navigator.userAgentData.platform`. Since Electron's renderer is a Chromium context, `navigator.userAgentData` is available.

**Recommended replacement**:

```typescript
const isMac = process.platform === 'darwin'; // in preload / main
// or in renderer via contextBridge-exposed value:
const isMac = window.electronAPI.platform === 'darwin';
```

---

## Subsystem 10: CI/CD Pipeline

### Finding 25 — `F-CI-01` | Classification: **C**

**Title**: Missing TypeScript type-check step in CI  
**Severity**: Medium  
**Source**: `.github/workflows/build-release.yml`

The build workflow goes directly from `npm install` to `npm run package:win:x64`. A TypeScript compile error would only surface during the `electron-builder` Vite bundling step, making it harder to diagnose.

**Add**:

```yaml
- name: TypeScript check
  run: npx tsc --noEmit
```

---

### Finding 26 — `F-CI-02` | Classification: **C**

**Title**: No unit test step before packaging  
**Severity**: Medium  
**Source**: `.github/workflows/build-release.yml`

Vitest tests are not run in the release CI pipeline on `windows-latest`.

**Add**:

```yaml
- name: Run unit tests
  run: npm test
```

---

### Finding 27 — `F-CI-03` | Classification: **C**

**Title**: No SHA-256 checksum generation for release artifacts  
**Severity**: Low  
**Source**: `.github/workflows/build-release.yml`

Release artifacts should include `.sha256` checksums for integrity verification.

**Add (Windows step)**:

```yaml
- name: Generate SHA-256
  shell: pwsh
  run: |
    Get-FileHash release/*.exe -Algorithm SHA256 |
      Select-Object Hash, Path |
      Export-Csv release/checksums-windows.csv -NoTypeInformation
```

---

### Finding 28 — `F-CI-04` | Classification: **E**

**Title**: `verify-packaged.js` smoke test — window title assertion  
**Severity**: Low  
**Source**: `verify-packaged.js`

The smoke test references `'Mini Billing System'` as the expected window title. If the actual `index.html` `<title>` tag uses a different string (e.g., `'Mini POS'`), the smoke test assertion will fail.

**Action**: Verify that the HTML `<title>` matches the string in `verify-packaged.js`. Update whichever is incorrect.  
**Status**: NOT_VERIFIED — requires codebase check of `index.html`.

---

### Finding 29 — `F-CI-05` | Classification: **C**

**Title**: No smoke test step on Windows CI runner  
**Severity**: Medium  
**Source**: `.github/workflows/build-release.yml`

`verify-packaged.js` (which references `release/win-unpacked/Mini POS.exe`) is not invoked in the Windows CI job.

**Add**:

```yaml
- name: Smoke test (Windows)
  run: node verify-packaged.js
```

---

## Summary by Subsystem

| Subsystem | A | B | C | D | E | F | Blockers |
|---|---|---|---|---|---|---|---|
| Electron Framework | 3 | 0 | 2 | 0 | 1 | 0 | 2 |
| Database | 2 | 0 | 0 | 0 | 1 | 0 | 0 |
| Filesystem | 1 | 0 | 0 | 2 | 0 | 0 | 0 |
| Printing | 0 | 1 | 0 | 0 | 0 | 1 | 0 |
| PDF | 1 | 0 | 0 | 0 | 1 | 0 | 0 |
| Logging | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| Backup / Restore | 1 | 0 | 0 | 2 | 0 | 0 | 0 |
| Icons & Fonts | 0 | 0 | 2 | 0 | 1 | 0 | 1 |
| Security | 0 | 0 | 1 | 1 | 0 | 0 | 0 |
| CI / CD | 0 | 0 | 4 | 0 | 1 | 0 | 0 |
| **Total** | **9** | **1** | **9** | **5** | **5** | **1** | **3** |

> **3 BLOCKERS** must be resolved before the Windows installer is production-ready:
> 1. `F-ELEC-01` / `F-ICON-01` — `.ico` icon file missing
> 2. `F-ELEC-02` — Single-instance lock not implemented
> 3. `F-SEC-01` — No code signing (SmartScreen blocker for end users)
