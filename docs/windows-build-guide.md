# Windows Build Guide — Mini POS

> **Branch:** `feature/windows-edition`  
> **Last updated:** 2026-11-09

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Quick Start](#2-quick-start)
3. [Step-by-Step Build Process](#3-step-by-step-build-process)
4. [electron-builder Configuration](#4-electron-builder-configuration)
5. [Native Module Notes](#5-native-module-notes)
6. [Output Artifacts](#6-output-artifacts)
7. [Troubleshooting](#7-troubleshooting)

---

## 1. Prerequisites

### Required Toolchain

| Tool | Minimum Version | Notes |
|------|----------------|-------|
| Node.js | **22.x** | Use `.nvmrc` or `nvm use 22` |
| npm | **10.x** | Ships with Node 22 |
| Git | Any recent | For checkout and version tagging |

### Platform Notes

- **Windows builds from macOS** are fully supported via cross-compilation. `electron-builder` downloads the Windows toolchain (wine is NOT required for NSIS packaging on macOS; electron-builder ships its own NSIS binary for macOS CI).
- **For testing native modules on Windows:** A GitHub Actions `windows-latest` runner is the recommended environment. Cross-compiled builds should not be "run" locally on macOS — they must be tested on Windows.
- **ICO generation** requires `jimp`, which is already listed in `devDependencies`. It is installed automatically by `npm ci`.

### No Additional Setup Required

- `better-sqlite3` v13.0.3 uses N-API prebuilt binaries. The `win32-x64` prebuild is bundled at install time — no `electron-rebuild`, no Visual Studio Build Tools, no Python needed.
- Wine is **not** needed on macOS to build the Windows installer.

---

## 2. Quick Start

```bash
# 1. Switch to the Windows edition branch
git checkout feature/windows-edition

# 2. Install dependencies (clean install)
npm ci

# 3. Build the Windows x64 installer
npm run package:win:x64

# Output → release/Mini POS Setup 1.0.0.exe
```

The `package:win:x64` script automatically:
1. Regenerates `build/icon.ico` from `build/icon.png`
2. Runs the prebuild path-safety check
3. Compiles TypeScript + Vite assets
4. Packages the NSIS installer via `electron-builder`

---

## 3. Step-by-Step Build Process

### Step 1 — Generate the Windows ICO

```bash
node scripts/generate-icons.mjs
```

- **Input:** `build/icon.png` (512 × 512 px, 32-bit RGBA)
- **Output:** `build/icon.ico` — multi-resolution ICO containing 7 sizes:

  | Size | Usage |
  |------|-------|
  | 16 × 16 | Explorer small icons, taskbar (small) |
  | 24 × 24 | Windows explorer details pane |
  | 32 × 32 | Explorer large icons, taskbar standard |
  | 48 × 48 | Desktop icon (medium) |
  | 64 × 64 | Desktop icon (large) |
  | 128 × 128 | High-DPI desktop shortcut |
  | 256 × 256 | Windows Vista+ jumbo icon, Store |

- All frames are stored as **PNG-compressed frames inside ICO** (Windows Vista+), which is fully supported by all modern Windows versions and reduces file size compared to raw BMP frames.
- The script uses `jimp` only (pure JS) — no native imaging libraries needed.

> **Why not just use a PNG?** `electron-builder` requires a `.ico` file on Windows. Providing only a PNG causes the build to fall back to a default Electron icon.

### Step 2 — Run the Prebuild Safety Check

```bash
node scripts/prebuild-check.js
```

- Validates that the absolute path to the project root **contains no spaces**.
- `electron-builder` and NSIS have known issues with paths containing spaces on some configurations.
- Exits with code 1 and an actionable error message if a space is detected.

### Step 3 — TypeScript + Vite Compile

```bash
npm run build
```

- Runs `tsc --noEmit` for type-checking, then `vite build` for the renderer bundle.
- Output: `dist/` (renderer assets) + compiled `electron/` JS.
- Expected result: **zero TypeScript errors** (confirmed clean as of 2026-11-09).

### Step 4 — Package the NSIS Installer

```bash
npx electron-builder --win --x64 -p never
```

| Flag | Meaning |
|------|---------|
| `--win` | Target Windows platform |
| `--x64` | 64-bit architecture only |
| `-p never` | Do not publish; write artifacts to disk only |

- Downloads the win32-x64 Electron binary (cached in `~/.cache/electron` after first run).
- Packs app files into an ASAR archive.
- Invokes NSIS to produce the installer EXE.
- Expected build time: **2–5 minutes** on a modern laptop (first run slower due to Electron binary download).

---

## 4. electron-builder Configuration

The full configuration lives in [`electron-builder.yml`](../electron-builder.yml). Key sections explained:

### `appId` and `productName`

```yaml
appId: com.minipos.app
productName: Mini POS
```

- `appId` is used as the Windows registry key base and the NSIS uninstaller identifier.
- `productName` is used in the Start Menu folder and Add/Remove Programs entry.

### `win` block

```yaml
win:
  icon: build/icon.ico
  publisherName: "Mini POS"
  requestedExecutionLevel: asInvoker
  target:
    - target: nsis
      arch:
        - x64
```

| Field | Value | Reason |
|-------|-------|--------|
| `icon` | `build/icon.ico` | Explicit ICO path; never falls back to PNG |
| `publisherName` | `"Mini POS"` | Shown in installer dialogs and UAC prompts |
| `requestedExecutionLevel` | `asInvoker` | No UAC elevation required; runs as the invoking user |
| `target.arch` | `[x64]` | Build only x64; no ia32 or arm64 for now |

> **`asInvoker` is intentional.** The app writes data to `%APPDATA%`, not `Program Files`. Elevation is never required during normal operation.

### `nsis` block

```yaml
nsis:
  oneClick: false
  allowDirectoryChange: true
  perMachine: false
  installerIcon: build/icon.ico
  uninstallerIcon: build/icon.ico
  createDesktopShortcut: true
  createStartMenuShortcut: true
  shortcutName: "Mini POS"
```

| Field | Value | Effect |
|-------|-------|--------|
| `oneClick` | `false` | Shows the install wizard (location picker, etc.) |
| `allowDirectoryChange` | `true` | User can pick a custom install directory |
| `perMachine` | `false` | Per-user install into `%LOCALAPPDATA%\Programs` — no admin rights needed |
| `createDesktopShortcut` | `true` | Desktop shortcut created on install |
| `createStartMenuShortcut` | `true` | Start Menu entry created under `Mini POS` folder |

### `files` and `asarUnpack`

```yaml
files:
  - "dist/**"
  - "electron/**"
  - "assets/**"
  - "package.json"
asarUnpack:
  - "node_modules/better-sqlite3/**"
```

- `better-sqlite3` must be unpacked from ASAR because it loads a native `.node` binary that cannot be `require()`d from inside an ASAR archive.
- All other files are packed into the ASAR for security and load-time efficiency.

---

## 5. Native Module Notes

### better-sqlite3 v13.0.3

`better-sqlite3` v13 switched to **N-API** (Node-API), which provides ABI stability across Node.js and Electron versions without recompilation.

| Property | Detail |
|----------|--------|
| ABI surface | N-API (stable across Electron versions) |
| Prebuild for win32-x64 | ✅ Ships in the npm package as `prebuilds/win32-x64/better_sqlite3.node` |
| Requires `electron-rebuild`? | **No** |
| Requires Visual Studio on the build machine? | **No** |
| Packed into ASAR? | **No** — `asarUnpack` extracts it to the app's unpacked directory |

When `electron-builder` packages the app, it:
1. Copies `node_modules/better-sqlite3/prebuilds/win32-x64/better_sqlite3.node` into the app.
2. The main process `require`s it from the unpacked path at runtime.
3. Electron loads it as a native module via N-API — no path magic needed.

### No Other Native Modules

All other dependencies are pure JavaScript or pure TypeScript. `electron-log`, `jimp`, `archiver`, `pdfkit`, and all domain modules have zero native code.

---

## 6. Output Artifacts

After a successful `npm run package:win:x64`:

```
release/
├── Mini POS Setup 1.0.0.exe     ← NSIS installer (distribute this)
├── Mini POS Setup 1.0.0.exe.sha512  ← Checksum file
└── win-unpacked/                ← Unpacked application directory
    ├── Mini POS.exe             ← Main executable (for smoke testing)
    ├── resources/
    │   ├── app.asar             ← Packed JS/assets
    │   └── app.asar.unpacked/   ← Native modules (better-sqlite3)
    └── ...                      ← Electron runtime files
```

### Using `win-unpacked` for Smoke Testing

The `win-unpacked` directory can be zipped and transferred to a Windows machine for quick smoke testing without running the installer:

```powershell
# On Windows (PowerShell) — no install needed
.\release\win-unpacked\"Mini POS.exe"
```

This is how the CI pipeline's Playwright E2E tests run: they launch `win-unpacked/Mini POS.exe` directly.

---

## 7. Troubleshooting

### `Error: EXDEV: cross-device link not permitted`

**Symptom:** Backup or restore fails with EXDEV during `renameSync`.  
**Root cause:** `fs.renameSync` cannot move files across filesystem boundaries (e.g., temp directory on a different volume).  
**Status:** ✅ **Fixed** in `src/infrastructure/services/BackupService.ts`. The fix catches EXDEV and falls back to `copyFileSync` + `unlinkSync`.

---

### `Error: icon.ico not found` or default Electron icon in installer

**Symptom:** The built installer shows the default Electron icon.  
**Root cause:** `build/icon.ico` was missing or not committed.  
**Fix:**

```bash
npm run generate:icons
# Then re-run the build
npm run package:win:x64
```

**Status:** ✅ **Fixed** — `package:win:x64` runs icon generation automatically.

---

### `Error: path contains spaces`

**Symptom:** `prebuild-check.js` exits with error; or NSIS fails mid-build with a cryptic path error.  
**Root cause:** The absolute path to the project root contains a space (e.g., `My Projects/mini-erp`).  
**Fix:** Move or clone the repository to a path with no spaces (e.g., `~/projects/mini-erp`).

---

### `better-sqlite3` loads wrong binary on Windows

**Symptom:** App crashes on Windows with `Error: The specified module could not be found` or similar.  
**Likely cause:** `asarUnpack` is misconfigured, or the prebuild for `win32-x64` is missing.  
**Fix:**

```bash
# Verify the prebuild exists after npm ci:
ls node_modules/better-sqlite3/prebuilds/win32-x64/
# Should show: better_sqlite3.node
```

If missing, run `npm ci` again on a clean `node_modules`. Do **not** run `electron-rebuild`.

---

### Cross-compilation: NSIS build fails on macOS

**Symptom:** `electron-builder` fails when trying to invoke NSIS on macOS.  
**Root cause:** Some older versions of `electron-builder` had issues finding the macOS NSIS binary.  
**Fix:** Ensure `electron-builder` is at **26.15.3** (the version pinned in `package.json`). Update with:

```bash
npm install --save-dev electron-builder@26.15.3
```

---

### `npm run package:win:x64` fails on Node.js < 22

**Symptom:** Syntax error or `require is not defined` during icon generation.  
**Root cause:** `scripts/generate-icons.mjs` uses ESM syntax requiring Node 22+.  
**Fix:** Upgrade Node.js.

```bash
nvm install 22
nvm use 22
node --version  # Should print v22.x.x
```
