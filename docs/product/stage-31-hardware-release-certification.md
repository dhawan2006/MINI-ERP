# Stage 31 — Physical Hardware & Packaged Release Certification

**Date:** 2026-09-20  
**Version:** Mini POS 1.0.0  
**Platform:** macOS Apple Silicon (arm64)  
**Source state:** Post Stage 30 fixes (debug log removed, dynamic `require` replaced, migration `console.error` removed)

---

## 1. Automated Tests (Post Stage 30 Fixes)

These results were produced by the official repository commands immediately before building the release artifact.

### `npm run test` (Vitest — Unit & Integration)

```
Test Files  25 passed (25)
     Tests  108 passed (108)
  Start at  18:58:07
  Duration  12.68s
```

### `npm run test:e2e` (Playwright — End-to-End)

```
Running 26 tests using 4 workers
  26 passed (27.1s)
```

### Summary

| Suite | Files | Tests | Passed | Failed | Skipped |
|---|---|---|---|---|---|
| Unit/Integration (Vitest) | 25 | 108 | 108 | 0 | 0 |
| E2E (Playwright) | 6 | 26 | 26 | 0 | 0 |
| **Total** | **31** | **134** | **134** | **0** | **0** |

**No tests are hidden behind `.skip`, `.only`, or environment guards.** All Restore E2E tests are active and passing.

---

## 2. Production Build

### `npm run build` Output

```
> tsc && vite build
```

- **TypeScript compilation:** 0 errors, 0 warnings
- **Vite renderer build:** 45 modules transformed → `dist/assets/index-BddiQw4T.js` (246.65 kB / 72.66 kB gzip)
- **Vite electron main build:** 246 modules → `dist-electron/main.js` (1,220.99 kB / 532.64 kB gzip)
- **Vite preload build:** 2 modules → `dist-electron/preload.js` (1.97 kB)
- **Duration:** ~13s total
- **Exit code:** 0

> **Build warnings (non-fatal, pre-existing):**
> 1. `vite.config.ts`: ESM-in-CJS warning from Vite 8's `configLoader: 'native'` check — cosmetic only, does not affect output
> 2. `postcss.config.js`: module type warning — resolved at runtime, cosmetic only
> These warnings existed before Stage 31 and are not regression defects.

---

## 3. Packaged Build — Release Candidate

### Build Command

```bash
MINIPOS_ALLOW_SPACES_IN_BUILD_PATH=1 npm run package:mac:arm64
```

**Note on override flag:** The repository's `prebuild-check.js` guard blocks packaging when the project path contains spaces (the current path is `/Users/laksh/Desktop/mini ERP`). The guard's primary concern is `node-gyp` rebuild corruption for cross-compilation targets. In this build, `better-sqlite3` uses prebuilt binaries (`prebuilds/darwin-arm64.node`) — it does **not** invoke `node-gyp` to compile from source. This was verified by confirming `@electron/rebuild` resolves to the prebuild path rather than recompiling. The override is safe for this configuration.

### Artifact Details

| Field | Value |
|---|---|
| Filename | `Mini POS-1.0.0-arm64.dmg` |
| Version | 1.0.0 |
| Architecture | macOS Apple Silicon (arm64) |
| Size | 141 MB |
| Build timestamp | 2026-09-20T19:00:48+0530 |
| SHA-256 | `e754448f21f5a8954f8103c3d9fa783b498a00fea888738f9913691e8455da92` |
| Electron version | 44.2.0 |
| `better-sqlite3` native | `prebuilds/darwin-arm64.node` — Mach-O 64-bit bundle arm64 ✅ |

### Code Signing Status

| Check | Status |
|---|---|
| Developer ID Application signature | ❌ Not present — no valid identity in keychain |
| Team Identifier | `not set` |
| Signature type | `adhoc` (linker-signed) |
| Sealed Resources | `none` |
| Apple Notarization | ❌ Not performed |
| Stapled ticket | ❌ Not stapled |
| Gatekeeper (`spctl --assess`) | ❌ Fails — "code has no resources but signature indicates they must be present" |

```
PUBLIC RELEASE SIGNING NOT COMPLETED
```

The application is fully functional when installed with `xattr -cr` or via right-click → Open (bypassing Gatekeeper). It is not suitable for distribution to users without signing and notarization.

---

## 4. Packaged Application Manual QA

### Automated Electron Verification (via Playwright E2E)

The Playwright E2E suite launches the full Electron process (not a packaged DMG, but the same compiled JS loaded via `electron .`) and exercises:

| Scenario | Result |
|---|---|
| App launch → Billing focused | ✅ PASS |
| Create product → search in billing | ✅ PASS |
| Scan / add / repeated scan / quantity merge | ✅ PASS (10 scanner tests) |
| Finalize bill → new bill | ✅ PASS |
| Printer failure → bill preserved | ✅ PASS |
| Backup via Settings → verified SQLite integrity | ✅ PASS |
| Restore older backup → data replaced | ✅ PASS |
| Restore blocked by active draft | ✅ PASS |

### Manual DMG Install & Launch

**PACKAGED APP QA: Manual install from DMG not executed by automated tooling.**

The browser subagent cannot launch native macOS desktop applications. Manual DMG installation requires the operator to:
1. Open `release/Mini POS-1.0.0-arm64.dmg`
2. Drag `Mini POS.app` to Applications
3. Right-click → Open (to bypass Gatekeeper for unsigned app)
4. Manually step through the billing / product / backup / restore / PDF workflow

**Status: Requires human operator verification.**

---

## 5. Physical Barcode Scanner Validation

```
HARDWARE QA NOT EXECUTED
```

A physical USB keyboard-wedge barcode scanner is not available in this automated build and certification environment.

**What IS verified (automated, synthetic):**
- Keyboard event simulation at 100ms inter-character intervals (simulating a 120Hz scanner)
- Correct product lookup on Enter suffix
- Quantity merging for repeated scans of the same barcode (E2E: `scanner.test.ts` tests A–J, all passing)
- Scanner input during quantity edit, undo, and clear
- Rapid mixed-product scan sequences (10 different products in succession)
- Unknown barcode handling without crash

**What is NOT verified:**
- Physical USB HID connection
- Real scanner model compatibility
- Physical Enter suffix (hardware-generated CR)
- Electrical/timing behavior of a real wedge scanner at full scan rate
- EMI or USB hub behavior

**Scanner model:** Not recorded — no physical device tested.

---

## 6. Physical Thermal Printer Validation

```
HARDWARE QA NOT EXECUTED
```

A physical ESC/POS thermal printer is not available in this automated build environment.

**What IS verified (automated):**
- 58mm and 80mm PDF receipt generation (24 PDF unit tests, all passing)
- ₹ symbol renders correctly (T20, T21 passing)
- Unicode product names render without crash
- Printer failure: bill remains saved, history intact, retry possible (E2E: `printing.test.ts` Scenario C)
- Print architecture: ESC/POS command generation is implemented

**What is NOT verified:**
- Physical ESC/POS device connection (USB/Bluetooth/Serial)
- Actual paper output readability
- 58mm physical alignment
- 80mm physical alignment
- Paper cutting behavior
- Real-world Unicode fallback on thermal printer firmware
- Real failure behavior (paper jam, out of paper, offline)

**Printer model:** Not recorded — no physical device tested.

---

## 7. Real Backup/Restore Disaster Test (Packaged)

**Status: Exercised in E2E against development Electron build; not repeated against DMG.**

The Playwright E2E suite (`restore.test.ts`) covers:
- Restore blocked by active draft (`blocks restore if active draft exists` — ✅ PASS)
- Successful restore replaces DB and restarts app (`successfully executes restore and safely replaces data` — ✅ PASS)

Unit tests additionally cover 9 adversarial safety scenarios including rollback on failure.

**Packaged DMG restore test:** Not executed — requires manual human operator with access to the installed app.

---

## 8. Windows Status

```
NOT VALIDATED
```

`electron-builder.yml` contains Windows/NSIS configuration. No Windows artifact has been built or tested. No Windows validation has been performed at any stage.

---

## 9. Signing Status

```
PUBLIC RELEASE SIGNING NOT COMPLETED
```

| Requirement | Status |
|---|---|
| Apple Developer Program membership | Not confirmed |
| Developer ID Application certificate | Not available in keychain |
| Apple Notarization (notarytool) | Not performed |
| Stapled ticket | Not present |
| Gatekeeper-approved for first-party users | ❌ |

The artifact can be installed by a technically capable operator using `xattr -cr "Mini POS.app"` or the right-click bypass. It is not suitable for general distribution without signing.

---

## 10. Known Limitations (Evidence-Backed)

| # | Limitation | Impact |
|---|---|---|
| 1 | No Apple code signing or notarization | Gatekeeper warning on first launch; requires user to explicitly bypass |
| 2 | Project path contains spaces | Prevents standard `package:mac:arm64` without env override; no functional impact on prebuilt native modules |
| 3 | Restore `filePath` round-trips through renderer | Re-validation in `executeRestore` mitigates; low risk for local trusted context |
| 4 | Bill number sequence resets to restored dataset max after restore | Intentional for offline POS; documented |
| 5 | No automatic backup reminder | Operator must manually create backups |
| 6 | Vite config ESM/CJS warning | Non-functional, cosmetic; upstream Vite 8 behavior |
| 7 | `FakeDialogService.showOpenDialog` has a `console.log` | Only reachable when `MINIPOS_E2E_TEST=true`; does not affect production |
| 8 | Windows not built or tested | Windows deployment not validated |

---

## 11. Build Verification Summary

| Step | Command | Result |
|---|---|---|
| Unit/Integration tests | `npm run test` | ✅ 108/108 passed |
| E2E tests | `npm run test:e2e` | ✅ 26/26 passed |
| TypeScript compilation | `tsc` (part of build) | ✅ 0 errors |
| Renderer build | `vite build` | ✅ Succeeded |
| Electron package | `electron-builder --mac --arm64` | ✅ Succeeded |
| Native module (arm64) | `better-sqlite3/prebuilds/darwin-arm64.node` | ✅ Mach-O 64-bit bundle arm64 |
| Code signing | Developer ID Application | ❌ Not available |
| Notarization | Apple notarytool | ❌ Not performed |

---

## 12. Final Decision

```
V1 RELEASE BLOCKED — HARDWARE VALIDATION
```

**Software verdict:** All software criteria are fully met.
- 134/134 automated tests passing (0 failed, 0 skipped)
- Architecture boundaries intact
- Fresh release artifact built from post-Stage 30 source
- Native SQLite module confirmed correct for arm64
- All restore/backup/billing/PDF/product features verified by automated tests

**Blockers:**

| Blocker | Category | Required to unblock |
|---|---|---|
| Physical barcode scanner not tested | Hardware | Test with real USB keyboard-wedge scanner; record model + behavior |
| Physical thermal printer not tested | Hardware | Test with real ESC/POS printer; record model + paper widths verified |
| Manual packaged DMG QA not completed | Packaged App | Human operator installs DMG and runs billing → backup → restore workflow |
| Apple code signing not completed | Signing | Obtain Developer ID Application certificate; run `notarytool`; staple ticket |

**Path to `V1 SOFTWARE RELEASE READY WITH KNOWN LIMITATIONS`:**

Once the operator:
1. Connects a physical barcode scanner and confirms scan behavior
2. Connects a physical thermal printer and confirms receipt output
3. Installs and runs the DMG manually through the core workflow
4. Documents which hardware models were verified

The release status can be upgraded to:
```
V1 SOFTWARE RELEASE READY WITH KNOWN LIMITATIONS
```
with limitations being: Windows not validated; Apple signing not completed (operator distribution only).

If signing is completed as well, the status becomes:
```
V1 SOFTWARE RELEASE READY
```
