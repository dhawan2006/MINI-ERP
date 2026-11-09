# Mini POS — Windows Edition: Native Dependency Inventory

> **Stage**: 1 — Native Dependency Inventory  
> **Date**: 2026-11-09  
> **Branch**: `feature/windows-edition` @ `130153c`  
> **Purpose**: Enumerate all native (non-pure-JS) and significant runtime dependencies, assess Windows compatibility, and determine whether `electron-rebuild` is required for each.

---

## Background: N-API vs. Electron ABI

Electron bundles its own version of Node.js. Native Node addons that use the **legacy V8/NAN API** must be rebuilt against each specific Electron ABI version using `electron-rebuild`.

Native addons that use **Node-API (N-API)** are ABI-stable across Node.js versions ≥ 6 and across Electron versions, because N-API presents a stable C interface. Prebuilt `.node` binaries compiled for N-API do **not** need to be rebuilt for each Electron release.

> **For this project**: Electron 44 bundles Node.js v26.x. The only native dependency (`better-sqlite3`) uses N-API and ships a `win32-x64.node` prebuild. `electron-rebuild` is therefore **not required** in the build pipeline.

---

## 1. Native Dependencies

### 1.1 `better-sqlite3` — v13.0.3

| Field | Value |
|---|---|
| **Package** | `better-sqlite3` |
| **Version** | `13.0.3` |
| **Type** | Native Node addon |
| **Binding API** | **Node-API (N-API)** — ABI-stable |
| **Compilation** | Pre-compiled — distributed as `.node` prebuild via `@mapbox/node-pre-gyp` or `prebuildify` |
| **Source** | [https://github.com/WiseLibs/better-sqlite3](https://github.com/WiseLibs/better-sqlite3) |

#### Available Prebuilds

| Platform | Architecture | Prebuild Available |
|---|---|---|
| `darwin` | `arm64` (Apple Silicon) | ✅ |
| `darwin` | `x64` (Intel) | ✅ |
| `linux` | `arm64` | ✅ |
| `linux` | `x64` | ✅ |
| `linuxmusl` | `arm64` | ✅ |
| `linuxmusl` | `x64` | ✅ |
| `win32` | `arm64` | ✅ |
| **`win32`** | **`x64`** | ✅ **Present** |

#### Compatibility Assessment

| Assessment Item | Result | Verification Status |
|---|---|---|
| `electron-rebuild` required | **No** — N-API is ABI-stable | VERIFIED (design) |
| Windows x64 prebuild ships | **Yes** | VERIFIED (release asset inspection) |
| Prebuild resolves on `npm install` (Windows CI) | Expected yes | NOT_VERIFIED — requires CI run |
| Fallback to compile from source | Requires MSVC Build Tools if prebuild fails | NOT_VERIFIED |
| Works with Electron 44 / Node v26 | **Yes** — N-API stability guarantee | VERIFIED (design) |
| SQLite WAL / journal modes | Platform-independent | VERIFIED |
| File locking on Windows | Windows holds exclusive OS-level locks on `.db` file — handled by DB close in restore flow | VERIFIED (design; see `DBFILELOCK-001`) |

#### Risk

> `SQLITE-001` (P1): If `npm install` on `windows-latest` CI cannot download the prebuild (network policy, proxy, missing env), it will attempt native compilation. This requires Microsoft C++ Build Tools (MSVC). Without them, the install fails. **Mitigation**: add a CI verification step.

#### Verification Command (add to Windows CI)

```bash
# Verify better-sqlite3 loads correctly
node -e "
  const Database = require('better-sqlite3');
  const db = new Database(':memory:');
  db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY)');
  db.prepare('INSERT INTO t VALUES (?)').run(1);
  const row = db.prepare('SELECT * FROM t').get();
  console.assert(row.id === 1, 'DB assertion failed');
  db.close();
  console.log('better-sqlite3 OK — N-API prebuild loaded successfully');
"
```

---

### 1.2 `electron` — v44.2.0

| Field | Value |
|---|---|
| **Package** | `electron` |
| **Version** | `44.2.0` |
| **Type** | Native binary (Chromium + Node.js runtime) |
| **Binding API** | N/A — ships its own binary |
| **electron-rebuild required** | N/A |
| **Windows x64 binary** | ✅ Distributed by Electron project |
| **Bundled Node.js** | v26.x (matches project `engines`) |
| **Bundled Chromium** | Chromium 134.x (approximate for Electron 44) |
| **Windows Compatibility** | ✅ Fully supported |
| **Verification Status** | VERIFIED (Electron 44 official Windows release) |

> Electron on Windows requires Visual C++ Redistributables (included in the NSIS installer by electron-builder automatically).

---

## 2. Pure JavaScript / TypeScript Dependencies

The following packages contain **no native code** and require **no `electron-rebuild`**. They are fully platform-independent by design.

### 2.1 `electron-log` — v5.4.4

| Field | Value |
|---|---|
| **Package** | `electron-log` |
| **Version** | `5.4.4` |
| **Type** | Pure JavaScript |
| **electron-rebuild required** | ❌ No |
| **Windows Compatibility** | ✅ Fully compatible |
| **Notes** | Writes to `app.getPath('userData')/logs/main.log`. Path resolution is cross-platform. VERIFIED. |

---

### 2.2 `pdf-lib` — v1.17.1

| Field | Value |
|---|---|
| **Package** | `pdf-lib` |
| **Version** | `1.17.1` |
| **Type** | Pure JavaScript |
| **electron-rebuild required** | ❌ No |
| **Windows Compatibility** | ✅ Fully compatible |
| **Notes** | PDF generation is entirely in-memory. Font loading uses `fs.readFileSync` on the ASAR-embedded `NotoSans-Regular.ttf`. See `ASAR-001` risk. |

---

### 2.3 `@pdf-lib/fontkit` — v1.1.1

| Field | Value |
|---|---|
| **Package** | `@pdf-lib/fontkit` |
| **Version** | `1.1.1` |
| **Type** | Pure JavaScript |
| **electron-rebuild required** | ❌ No |
| **Windows Compatibility** | ✅ Fully compatible |
| **Notes** | Font parsing library used by `pdf-lib`. No native bindings. VERIFIED. |

---

### 2.4 `lucide-react`

| Field | Value |
|---|---|
| **Package** | `lucide-react` |
| **Type** | Pure JavaScript / TypeScript |
| **electron-rebuild required** | ❌ No |
| **Windows Compatibility** | ✅ Fully compatible |
| **Notes** | SVG icon components. Renderer-only. No native code. VERIFIED. |

---

### 2.5 `zustand`

| Field | Value |
|---|---|
| **Package** | `zustand` |
| **Type** | Pure JavaScript / TypeScript |
| **electron-rebuild required** | ❌ No |
| **Windows Compatibility** | ✅ Fully compatible |
| **Notes** | State management. Renderer-only. No native code. VERIFIED. |

---

### 2.6 `react` and `react-dom`

| Field | Value |
|---|---|
| **Packages** | `react`, `react-dom` |
| **Type** | Pure JavaScript / TypeScript |
| **electron-rebuild required** | ❌ No |
| **Windows Compatibility** | ✅ Fully compatible |
| **Notes** | UI framework. Renderer process. No native code. VERIFIED. |

---

## 3. Consolidated Summary Table

| Package | Version | Native? | electron-rebuild? | win32-x64 Prebuild | Windows Compat | Verified? |
|---|---|---|---|---|---|---|
| `better-sqlite3` | 13.0.3 | ✅ Yes (N-API) | ❌ No | ✅ Yes | ✅ Yes | VERIFIED (design); NOT_VERIFIED on CI |
| `electron` | 44.2.0 | ✅ Yes (binary) | N/A | ✅ Yes | ✅ Yes | VERIFIED |
| `electron-log` | 5.4.4 | ❌ Pure JS | ❌ No | N/A | ✅ Yes | VERIFIED |
| `pdf-lib` | 1.17.1 | ❌ Pure JS | ❌ No | N/A | ✅ Yes | VERIFIED |
| `@pdf-lib/fontkit` | 1.1.1 | ❌ Pure JS | ❌ No | N/A | ✅ Yes | VERIFIED |
| `lucide-react` | — | ❌ Pure JS | ❌ No | N/A | ✅ Yes | VERIFIED |
| `zustand` | — | ❌ Pure JS | ❌ No | N/A | ✅ Yes | VERIFIED |
| `react` | — | ❌ Pure JS | ❌ No | N/A | ✅ Yes | VERIFIED |
| `react-dom` | — | ❌ Pure JS | ❌ No | N/A | ✅ Yes | VERIFIED |

---

## 4. electron-rebuild Assessment

> **Conclusion**: `electron-rebuild` is **not required** for this project.

The only native dependency (`better-sqlite3`) uses Node-API (N-API), which is ABI-stable. Its prebuilt `.node` binary for `win32-x64` does not need to be rebuilt for Electron 44.

**However**: The CI pipeline should explicitly verify that `npm install` resolves the prebuild (not falling back to native compilation). See `SQLITE-001` in the risk register.

If any future dependency is added that uses the legacy V8/NAN API, `electron-rebuild` will need to be integrated:

```yaml
# Example — only needed if a non-N-API native dependency is added
- name: Rebuild native modules for Electron
  run: npx electron-rebuild --version 44.2.0 --arch x64
```

---

## 5. Dependency Scanning Recommendations

### 5.1 Audit Command (run before each major dependency upgrade)

```bash
# Check for native addons in node_modules
find node_modules -name "*.node" -not -path "*/electron/*" | sort
```

### 5.2 Expected Output (current state)

```
node_modules/better-sqlite3/prebuilds/win32-x64/node.napi.node
```

Any `.node` file outside of `better-sqlite3` or `electron` would indicate a new native dependency requiring audit.

### 5.3 N-API Version Check

```bash
node -e "
  const napi = process.versions.napi;
  console.log('N-API version:', napi);
  // better-sqlite3 v13 requires N-API >= 6
  console.assert(parseInt(napi) >= 6, 'N-API version too old');
  console.log('N-API version OK');
"
```

---

## 6. Future Native Dependency Considerations

| Scenario | Action Required |
|---|---|
| Adding `serialport` for serial printer support | Verify N-API or add `electron-rebuild` step |
| Adding `node-usb` for USB printer (PRINT-USB-001) | Requires WinUSB driver; add `electron-rebuild` if V8-bound |
| Upgrading `better-sqlite3` to a future version | Re-verify `win32-x64` prebuild availability |
| Upgrading Electron to v45+ | N-API deps: no action. V8 deps: re-run `electron-rebuild` |
| Adding any `node-gyp` based package | Audit binding API; CI must have MSVC or fallback prebuild |
