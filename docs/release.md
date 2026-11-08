# Mini POS — Release & Packaging Guide

## 1. Overview

Mini POS packages into native platform binaries using **`electron-builder`**. The desktop installer bundles the pre-compiled React renderer, the Electron main process, native SQLite bindings (`better-sqlite3`), and application icons.

---

## 2. Supported Platforms & Architectures

| Target Platform | Architecture | Installer Format | NPM Packaging Script |
| :--- | :--- | :--- | :--- |
| **macOS** | Apple Silicon (`arm64`) | DMG (`.dmg`) | `npm run package:mac:arm64` |
| **macOS** | Intel (`x64`) | DMG (`.dmg`) | `npm run package:mac:x64` |
| **macOS** | Universal (`arm64` + `x64`) | DMG (`.dmg`) | `npm run package:mac:universal` |
| **Windows** | Windows (`x64`) | NSIS (`.exe`) | `npm run package:win:x64` |

---

## 3. Packaging Pipeline

Before compiling, the packaging pipeline executes `scripts/prebuild-check.js` to ensure the repository path contains no spaces (which can cause `node-gyp` native module rebuild failures).

```bash
# Example: Package macOS Apple Silicon installer
npm run package:mac:arm64
```

### Steps Executed:
1. `node scripts/prebuild-check.js`: Verifies working directory cleanliness.
2. `npm run build`: Compiles TypeScript and runs `vite build` for both renderer and electron processes.
3. `electron-builder`: Bundles the output into native installers inside `release/`.

---

## 4. Packaging Configuration (`electron-builder.yml`)

```yaml
appId: com.minipos.app
productName: Mini POS
directories:
  output: release
files:
  - dist/**/*
  - dist-electron/**/*
  - package.json
  - assets/**/*
mac:
  target:
    - target: dmg
      arch:
        - arm64
        - x64
win:
  target:
    - target: nsis
      arch:
        - x64
```

---

## 5. Code Signing & Notarization

- **Development / Local Artifacts**: Local builds produce unsigned or ad-hoc self-signed binaries.
- **macOS Production Releases**:
  - Requires Apple Developer ID Application certificate.
  - Requires Hardened Runtime enabled (`hardenedRuntime: true`).
  - Requires notarization via Apple notary service (`xcrun notarytool`).
- **Windows Production Releases**:
  - Requires an EV / Standard Code Signing Certificate.
  - Signed via `signtool.exe`.
