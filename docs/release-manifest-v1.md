# Mini POS — Release Manifest v1.0.0

**Generated:** 2026-09-29T19:10:00+05:30
**Status:** PRE-RELEASE (Signing & Hardware QA Pending)

---

## Application

| Field | Value |
|-------|-------|
| Product Name | Mini POS |
| Version | 1.0.0 |
| Platform | macOS |
| Architecture (build host) | arm64 |
| Electron Version | 44.2.0 |
| Node Version | 26.3.x |
| macOS Build Host | macOS 26.3 (Build 25D125) |

---

## Development Build Artifacts

These are the output of `npm run build` — the Vite/Electron build prior to packaging.

| Artifact | SHA-256 | Size |
|----------|---------|------|
| `dist-electron/main.js` | `10ff4bc4042829f9e69c2b20d9c5792f7259540cf3ccb3f69108d5d15106964e` | 1.2 MB |
| `dist-electron/preload.js` | `23bec3b48020ab4fa57eada93bbd635cbffadf7eba18af453094ac37f81a6694` | 2.4 KB |

---

## Packaged Release Artifact

**Status: NOT_GENERATED**

The following packaging commands are available:

```bash
npm run package:mac:arm64       # Apple Silicon
npm run package:mac:x64         # Intel
npm run package:mac:universal   # Universal Binary
```

These commands were not executed because:
- A valid Apple Developer ID Application certificate is not provisioned in this environment.
- `electron-builder` requires `CSC_LINK` and `CSC_KEY_PASSWORD` environment variables for signed builds.

Unsigned packaging is intentionally not performed — an unsigned DMG must not be represented as a release artifact.

Checksums for packaged DMG, `.app` bundle, and their SHA-256 will be recorded here after signing and notarization are completed on a provisioned CI/CD host.

---

## Security

| Item | Status |
|------|--------|
| Code Signing | NOT_VERIFIED — Apple Developer ID certificate not provisioned |
| Notarization | NOT_VERIFIED — Requires signed artifact |
| Gatekeeper Acceptance | NOT_VERIFIED — Requires notarized artifact |
| Hardened Runtime Entitlements | Configured in `electron-builder.yml` |
| Signing Key Identifier (client trust anchor) | Provisioned at build time from `LICENSING_SERVER_KEY_ID` |

---

## Server

| Item | Status |
|------|--------|
| Production Endpoint | NOT_VERIFIED — Production server not deployed |
| Schema Version | Defined by migrations 001–004 |
| Migration Runner | Implemented and tested |

---

## Validation Summary

| Category | Result |
|----------|--------|
| A. Automated Software Tests | PASS — 282/282 tests, 35 files |
| B. CI Security Gates | PASS — 12/12 gates, 0 FAIL |
| C. Production Build | PASS — `npm run build` clean |
| D. Artifact Security Inspection | PASS — 6 PASS, 2 WARN, 0 FAIL |
| E. Packaged App QA | NOT_VERIFIED — packaging inherently blocked locally |
| F. Barcode Scanner QA | NOT_VERIFIED — physical hardware not present |
| G. Thermal Printer QA | NOT_VERIFIED — physical hardware not present |
| H. Secure Enclave QA | NOT_VERIFIED — requires physical hardware test |
| I. Production Server | NOT_VERIFIED — infrastructure not provisioned |
| J. Code Signing | NOT_VERIFIED — certificate not provisioned |
| K. Notarization | NOT_VERIFIED — requires signed artifact |
| L. Gatekeeper | NOT_VERIFIED — requires notarized artifact |
| M. Clean-Machine Install | NOT_VERIFIED — requires packaged artifact |
| N. Upgrade Test | NOT_VERIFIED — requires packaged artifact |
| O. Backup/Restore QA | NOT_VERIFIED — requires active cloud production DB |

---

## Security Invariants (Phases 0–14)

All 15 Phase 12 invariants confirmed by automated testing.

Phase 13 invariants 16–22 not yet verifiable from software testing alone:

| # | Invariant | Status |
|---|-----------|--------|
| 16 | Packaged release behaves consistently with tested source | NOT_VERIFIED (packaging not run) |
| 17 | Physical scanner cannot bypass billing authorization | NOT_VERIFIED (no hardware) |
| 18 | Printer failure cannot destroy a finalized sale | NOT_VERIFIED (no hardware) |
| 19 | Real packaged build cannot gain ACTIVE state via renderer | NOT_VERIFIED (packaging not run) |
| 20 | Unsigned/unnotarized QA artifacts not represented as release | CONFIRMED — this document classifies correctly |
| 21 | Production signing credentials never enter client package | CONFIRMED — artifact inspection PASS |
| 22 | Database restore does not restore licensing authority | CONFIRMED — by architecture; restore only affects SQLite billing DB |

Phase 14 invariants evaluated against production realities:

| # | Invariant | Status |
|---|-----------|--------|
| 23 | Production server does not depend on developer's local machine. | NOT_VERIFIED (no cloud environment) |
| 24 | Production PostgreSQL is isolated from QA/test databases. | NOT_VERIFIED (no live cloud DB) |
| 25 | Production private signing key never enters the client. | CONFIRMED — Artifact inspection |
| 26 | Production client cannot switch trust anchor to attacker key via casual env override. | CONFIRMED — Build statically locks trust anchors. |
| 27 | QA signing key cannot be used as production signing key. | CONFIRMED |
| 28 | Production licensing API uses secure transport. | NOT_VERIFIED (TLS requires real DNS deployment) |
| 29 | Temporary server outage does not invalidate valid offline authorization. | CONFIRMED (Tested in Phase 13 QA tests) |
| 30 | Production database restore does not manufacture client authorization. | NOT_VERIFIED |
| 31 | Admin recovery remains server-side and authenticated. | CONFIRMED |
| 32 | No heartbeat, lease, grace period, or mandatory periodic network communication. | CONFIRMED |

---

*This manifest will be updated after packaging, signing, notarization, production infrastructure deployment, and hardware QA are completed on a provisioned environment.*
