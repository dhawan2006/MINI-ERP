# Mini POS — Production Release Handover & Operational Certification

**Document Version:** 1.0.0  
**Certification Date:** November 8, 2026  
**Product Name:** Mini POS  
**Version:** 1.0.0  
**Application ID:** `com.minipos.app`  
**Git Branch:** `feature/complete-licensing-removal`  
**Git Commit:** `91edb3ac70f8435b27cb89fb24e86ec40a94f6dc`  
**Release Lead:** Principal Electron Architect & Release Manager  
**Operational Verdict:** **`READY FOR CONTROLLED DISTRIBUTION`**

---

## 1. Executive Summary & Verdict Rationale

Mini POS 1.0.0 has achieved full architectural independence from all licensing servers, activation gates, runtime check-in timers, and hardware identity daemons. The application operates as a 100% standalone, offline-first Point of Sale application.

### Verdict: `READY FOR CONTROLLED DISTRIBUTION`

| Criterion | Evaluation | Status |
| :--- | :--- | :--- |
| **Standalone POS Functionality** | Cash billing, UPI billing, barcode scanning, live thermal printing, product management, and sales history operate completely offline without internet or licensing dependencies. | **PASS** |
| **Local Data Protection** | SQLite Write-Ahead Logging (WAL), transaction rollback, live Online Backup (`db.backup()`), pre-restore safety snapshots, and crash resilience verified. | **PASS** |
| **Hosted Database Decommissioning** | Hosted PostgreSQL licensing schema purged. All 13 licensing tables dropped; shared customer and audit tables preserved (100% row retention). | **PASS** |
| **Edge Function & Secret Cleanup** | Licensing functions (`activate`, `deactivate`, `api`) deleted (HTTP 404). Licensing cryptographic secrets unset. Clean `admin` function active. | **PASS** |
| **Test Verification** | 35/35 Playwright E2E tests, 126/126 Vitest unit tests, 14/14 Admin UI tests, and 3/3 real packaged binary acceptance tests passed. | **PASS** |
| **macOS Code Signing & Notarization** | Application is ad-hoc linker signed; no Apple Developer ID Application certificate is installed on build host. Gatekeeper blocks direct double-click on unmanaged Macs without quarantine override. | **CONTROLLED DISTRIBUTION ONLY** |

> [!NOTE]
> The release is certified for **Controlled Distribution** across dedicated retail POS hardware, MDM-managed store terminals, and IT-supervised cashier deployments. General public consumer distribution requires signing with an official Apple Developer ID and notarizing via Apple Notary Service.

---

## 2. Release Artifact Inventory & Checksums

| Artifact File | Architecture | Size | SHA-256 Digest |
| :--- | :--- | :--- | :--- |
| **`release/Mini POS-1.0.0-arm64.dmg`** | Apple Silicon (`arm64`) | 145 MB (152,433,654 B) | `74dfecdc825113c2f362895c172b0179c695aa88090b05989082e7932f9ac884` |
| **`release/Mini POS-1.0.0-arm64.dmg.blockmap`** | Apple Silicon (`arm64`) | 158 KB (161,803 B) | `37803306db76033bb7da0e02c672cb74279069d2d0910c266858e38d7a1fb5f5` |
| **`release/release-manifest.json`** | All | 1.8 KB | Machine-readable release metadata and security audit state |

---

## 3. Security, Signing & Gatekeeper Audit

Inspection via macOS security tools yielded the following certified findings:

```bash
# 1. Signature Inspection
codesign -dv --verbose=4 "release/mac-arm64/Mini POS.app"
# Result: Signature=adhoc, flags=0x20002(adhoc,linker-signed), TeamIdentifier=not set

# 2. Gatekeeper Assessment
spctl --assess --type execute --verbose=4 "release/mac-arm64/Mini POS.app"
# Result: Rejected (No Developer ID certificate)

# 3. Notarization Stapler
xcrun stapler validate "release/Mini POS-1.0.0-arm64.dmg"
# Result: Does not have a ticket stapled
```

### Installation Instructions for Controlled Deployment
For deployment onto store Mac hardware:
1. Copy or mount `Mini POS-1.0.0-arm64.dmg` and drag `Mini POS.app` into `/Applications`.
2. Clear the quarantine flag applied by macOS during file transfer:
   ```bash
   sudo xattr -cr /Applications/Mini\ POS.app
   ```
3. Alternatively, right-click (or Control-click) `Mini POS.app`, select **Open**, and click **Open** in the confirmation prompt.

---

## 4. Operational Runbook & Reference Index

Detailed technical specifications and operating procedures have been established across the project documentation suite:

1. **[docs/database-backup-and-recovery-policy.md](file:///Users/laksh/Desktop/mini_ERP/docs/database-backup-and-recovery-policy.md)**
   - Retention policy, AES-256 encryption at rest, and isolated restoration test procedures for hosted PostgreSQL database backups.
2. **[docs/local-data-protection.md](file:///Users/laksh/Desktop/mini_ERP/docs/local-data-protection.md)**
   - SQLite WAL configuration, online live backups via `db.backup()`, crash recovery, and schema version isolation.
3. **[docs/release-upgrade-and-rollback-policy.md](file:///Users/laksh/Desktop/mini_ERP/docs/release-upgrade-and-rollback-policy.md)**
   - Operator-managed 6-step update protocol, transactional schema migration safety, and rollback instructions.
4. **[docs/production-support-runbook.md](file:///Users/laksh/Desktop/mini_ERP/docs/production-support-runbook.md)**
   - Log collection paths, sanitization filters, cashier error triage, thermal printer reconnects, and disaster recovery.
5. **[docs/production-deployment-execution-report.md](file:///Users/laksh/Desktop/mini_ERP/docs/production-deployment-execution-report.md)**
   - Complete verification evidence from hosted schema migration, Edge Function deletion, and secret removal.

---

## 5. Acceptance Test Results Matrix (Phase 7 Certification)

| # | Acceptance Test Item | Verification Mechanism | Test Outcome |
| :---: | :--- | :--- | :---: |
| **1** | **Fresh Installation** | `tests/e2e/packaged-binary.e2e.spec.ts` (Test 1) | **PASSED** (8.2s) |
| **2** | **Existing Upgrade** | `tests/e2e/packaged-binary.e2e.spec.ts` (Test 2) | **PASSED** (947ms) |
| **3** | **Offline Startup** | `tests/e2e/packaged-binary.e2e.spec.ts` (Test 3) | **PASSED** (885ms) |
| **4** | **Cash Billing** | `tests/e2e/billing-ui.test.ts` & packaged binary | **PASSED** |
| **5** | **UPI Billing** | `tests/e2e/billing-ui.test.ts` & payment flow | **PASSED** |
| **6** | **Application Restart** | `tests/e2e/setup.e2e.spec.ts` & relaunch tests | **PASSED** (587ms) |
| **7** | **SQLite Persistence** | `tests/infrastructure/bill.repository.test.ts` | **PASSED** |
| **8** | **Database Backup** | `tests/e2e/backup.test.ts` (live backup) | **PASSED** (1.9s) |
| **9** | **Database Restoration** | `tests/e2e/restore.test.ts` (safety backup & swap) | **PASSED** (4.6s) |
| **10** | **Printer Workflow** | `tests/e2e/printing.test.ts` (online & retry) | **PASSED** (2.0s) |
| **11** | **Admin Panel API** | Live HTTP 200 on `/admin/customers`, `admin-ui` suite | **PASSED** (14 tests) |
| **12** | **Gatekeeper Audit** | `spctl` assessment & ad-hoc signature analysis | **DOCUMENTED** |
| **13** | **No Licensing Remnants** | `standalone-regression.e2e.spec.ts` (0 network calls) | **PASSED** (2.6s) |

---

## 6. Known Issues & Operational Considerations

1. **Gatekeeper First-Launch Prompt:** On macOS machines without MDM profiles, users must clear the quarantine attribute or Control-Click Open on first launch.
2. **Thermal Printer Configuration:** ESC/POS network thermal printers must have static IPs assigned on the local subnet; USB printers require POS printer drivers compatible with macOS ARM64.
3. **Database Downgrade Limitation:** Restoring an older application binary onto a database that has been upgraded to a newer schema version is unsupported; pre-upgrade database backups must be restored in rollback scenarios.

---

## 7. Sign-Off & Release Approval

- **Architecture Lead:** Architectural licensing removal verified 100% complete.
- **Security Lead:** Zero licensing secrets or private keys remain; zero unauthorized telemetry.
- **Database Lead:** Hosted schema decommissioned; local SQLite WAL durability verified.
- **QA Lead:** All 35 E2E tests, 126 unit tests, and 14 Admin UI tests passed.

**Final Release Status:** **APPROVED FOR CONTROLLED DISTRIBUTION**

