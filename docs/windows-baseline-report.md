# Mini POS — Windows Edition: Stage 0 Baseline Report

> **Stage**: 0 — Repository & Environment Baseline  
> **Date**: 2026-11-09  
> **Prepared for**: Windows Edition Compatibility Track  
> **Branch**: `feature/windows-edition`

---

## 1. Repository State

| Field | Value |
|---|---|
| **App Name** | Mini POS |
| **App ID** | `com.minipos.app` |
| **Version** | `1.0.0` |
| **Active Branch** | `feature/windows-edition` |
| **HEAD Commit** | `130153c` |
| **Uncommitted Changes** | None |
| **Working Tree Status** | Clean |

---

## 2. Runtime & Toolchain Versions

| Tool | Version | Notes |
|---|---|---|
| **Node.js** | `v26.3.1` | VERIFIED — matches `.nvmrc` / `engines` field |
| **npm** | `11.16.0` | VERIFIED |
| **Electron** | `44.2.0` | VERIFIED — `package.json` devDependency |
| **electron-builder** | `26.15.3` | VERIFIED — `package.json` devDependency |
| **TypeScript** | Configured via `tsconfig.json` | VERIFIED |
| **Vite** | Used for renderer bundling | VERIFIED |
| **Vitest** | Unit/integration test runner | VERIFIED |
| **Playwright** | End-to-end test runner | VERIFIED |

---

## 3. electron-builder Configuration Summary

**Config file**: `electron-builder.yml`

| Setting | Value |
|---|---|
| `appId` | `com.minipos.app` |
| `productName` | `Mini POS` |
| `asar` | `true` (enabled) |
| `output` | `release/` |
| `icon (mac)` | `build/icon.png` |
| `icon (win)` | _(not set — BLOCKER, see Finding 1)_ |
| `win.target` | `nsis` |
| `files` | Includes `assets/**/*` |
| `directories.output` | `release/` |

> **Note**: No `win.icon`, no `nsis.*` block, no `publish` block, and no code-signing configuration currently exists for Windows.

---

## 4. Native Dependencies Inventory

### 4.1 `better-sqlite3` — v13.0.3

| Field | Value |
|---|---|
| **Package** | `better-sqlite3` |
| **Version** | `13.0.3` |
| **Binding Type** | Node-API (N-API) — ABI-stable |
| **Electron Rebuild Required** | **No** — N-API prebuilds are not tied to Electron ABI |
| **Prebuild Source** | `@mapbox/node-pre-gyp` / prebuild system |
| **Available Prebuilds** | `darwin-arm64`, `darwin-x64`, `linux-arm64`, `linux-x64`, `linuxmusl-arm64`, `linuxmusl-x64`, `win32-arm64`, **`win32-x64`** ✓ |
| **Windows x64 Prebuild** | **Present** |
| **CI Verification Status** | NOT_VERIFIED — must confirm prebuild resolves correctly in GitHub Actions `windows-latest` runner |

### 4.2 Summary Table — All Dependencies

| Package | Version | Native? | Rebuild Needed | Win32 Compatible |
|---|---|---|---|---|
| `better-sqlite3` | 13.0.3 | ✅ Yes (N-API) | ❌ No | ✅ Yes (prebuild) |
| `electron` | 44.2.0 | ✅ Yes (Chromium+Node) | N/A — ships own binary | ✅ Yes |
| `electron-log` | 5.4.4 | ❌ Pure JS | ❌ No | ✅ Yes |
| `pdf-lib` | 1.17.1 | ❌ Pure JS | ❌ No | ✅ Yes |
| `@pdf-lib/fontkit` | 1.1.1 | ❌ Pure JS | ❌ No | ✅ Yes |
| `lucide-react` | — | ❌ Pure JS/TS | ❌ No | ✅ Yes |
| `zustand` | — | ❌ Pure JS/TS | ❌ No | ✅ Yes |
| `react` / `react-dom` | — | ❌ Pure JS/TS | ❌ No | ✅ Yes |

---

## 5. Architecture Overview

### 5.1 Process Model

```
┌─────────────────────────────────────────┐
│           Electron Main Process         │
│  electron/main.ts                       │
│  ├── IPC Handlers (electron/ipc/*.ts)   │
│  │   billing, products, settings,       │
│  │   PDF, backup, restore, printing,    │
│  │   history, setup  (12 handlers)      │
│  ├── better-sqlite3 (userData DB)       │
│  └── electron-log (userData logs)       │
├─────────────────────────────────────────┤
│           Preload Script                │
│  electron/preload.ts                    │
│  contextBridge, contextIsolation: true  │
│  nodeIntegration: false                 │
├─────────────────────────────────────────┤
│           Renderer Process              │
│  React + Vite bundle                   │
│  Communicates via contextBridge IPC     │
└─────────────────────────────────────────┘
```

### 5.2 Data Storage Paths

| Resource | Path |
|---|---|
| **Database** | `app.getPath('userData')/mini-erp-data/billing.db` |
| **Logs** | `app.getPath('userData')/logs/main.log` |
| **Font** | `app.getAppPath()/assets/fonts/NotoSans-Regular.ttf` |

> **Windows `userData` path**: `C:\Users\<username>\AppData\Roaming\Mini POS\`  
> **Windows `appData` path**: `C:\Users\<username>\AppData\Roaming\`

### 5.3 IPC Handler Inventory

| Handler File | Responsibilities |
|---|---|
| `billing.ts` | Invoice creation, retrieval, deletion |
| `products.ts` | Product CRUD |
| `settings.ts` | App settings persistence |
| `pdf.ts` | PDF generation, file open |
| `backup.ts` | SQLite backup export |
| `restore.ts` | Backup import, DB migration, app relaunch |
| `printing.ts` | ESC/POS via TCP network or USB stub |
| `history.ts` | Transaction history queries |
| `setup.ts` | First-run / onboarding setup |
| _(3 more)_ | — |

---

## 6. Current macOS Build Pipeline

### 6.1 `package.json` Build Scripts

| Script | Command |
|---|---|
| `package:mac:arm64` | `electron-builder --mac --arm64` |
| `package:mac:x64` | `electron-builder --mac --x64` |
| `package:mac:universal` | `electron-builder --mac --universal` |
| `package:win:x64` | `electron-builder --win --x64` |

### 6.2 Build Icon

| File | Status |
|---|---|
| `build/icon.png` | ✅ Present (512×512 PNG) |
| `build/icon.ico` | ❌ **MISSING — required for Windows NSIS** |

---

## 7. Existing Test Commands

| Test Type | Runner | Command |
|---|---|---|
| **Unit / Integration** | Vitest | `npm test` / `npm run test:unit` |
| **End-to-End** | Playwright | `npm run test:e2e` |
| **Packaged smoke test** | Custom (`verify-packaged.js`) | `node verify-packaged.js` |

> **Gap**: The CI pipeline does not currently run unit tests or TypeScript checks before packaging. Smoke test references `release/win-unpacked/Mini POS.exe`.

---

## 8. Current Release Artifacts

| Artifact | Platform | Format | Output Path |
|---|---|---|---|
| `Mini POS-1.0.0-arm64.dmg` | macOS arm64 | DMG | `release/` |
| `Mini POS-1.0.0.dmg` | macOS x64 | DMG | `release/` |
| `Mini POS-1.0.0-universal.dmg` | macOS universal | DMG | `release/` |
| `Mini POS Setup 1.0.0.exe` | Windows x64 | NSIS | `release/` |
| `win-unpacked/` | Windows x64 | Unpacked | `release/win-unpacked/` |

> **Note**: Windows artifacts exist in CI output but are **not code-signed** and will trigger Windows Defender SmartScreen warnings for end users.

---

## 9. CI/CD — `.github/workflows/build-release.yml`

### 9.1 Current Matrix

| Runner | Platform | Artifact |
|---|---|---|
| `macos-latest` | macOS (Apple Silicon + Intel) | `.dmg` files |
| `windows-latest` | Windows x64 | NSIS `.exe` |

### 9.2 Trigger

```yaml
on:
  push:
    tags:
      - 'v*'
```

### 9.3 Gaps Identified

| Gap | Severity |
|---|---|
| No TypeScript type-check step before build | Medium |
| No unit test step before packaging | Medium |
| No `electron-rebuild` step (not needed but should be explicitly confirmed) | Low |
| No SHA-256 checksum generation for release artifacts | Low |
| No Windows code-signing configuration | High |
| No smoke test execution on Windows runner | Medium |

---

## 10. Branch Strategy

| Branch | Purpose |
|---|---|
| `main` / `master` | Production releases (macOS) |
| `feature/windows-edition` | **Active** — Windows compatibility work |

> The `feature/windows-edition` branch already exists and is the correct working branch. All Windows-related changes (`.ico` icon, single-instance lock, cross-volume rename fallbacks, CI hardening) should be committed here and merged to `main` once verified.

---

## 11. Summary: Readiness Assessment

| Category | Status |
|---|---|
| Node.js / Electron versions confirmed | ✅ |
| macOS build pipeline functional | ✅ |
| Windows build script exists | ✅ |
| CI matrix includes `windows-latest` | ✅ |
| Native module has Windows x64 prebuild | ✅ |
| Windows `.ico` icon present | ❌ BLOCKER |
| Single-instance lock implemented | ❌ BLOCKER |
| Code signing configured | ❌ (SmartScreen risk) |
| Cross-volume rename handled | ⚠️ Medium risk |

> Proceed to Stage 1 (Compatibility Audit) to enumerate all findings by subsystem.
