# Mini POS — Legacy Data and User Migration Plan
**Document Version:** 1.0  
**Status:** Approved

---

## 1. Overview and Migration Principles

When users upgrade an existing Mini POS installation to this licensing-free standalone release, their local environments may contain legacy artifacts created by the former licensing subsystem.

This migration strategy guarantees:
1. **Zero Data Loss:** All user data (products, drafts, sales history, finalized bills, store settings, printer configurations) in SQLite (`billing.db`) is preserved untouched.
2. **Seamless Startup:** Old licensing files (`authorization.json`, `runtime_state.json`) or lingering keychain/hardware records do NOT block startup or cause crashes.
3. **No Network Contact:** Upgrading or running the app never attempts to contact a licensing server to "deactivate" or "verify" an existing installation.
4. **No Re-Activation:** Users who previously activated will never be prompted to activate or enter a license key.
5. **No Onboarding Regression:** Users who have already completed store setup will bypass the setup wizard and proceed directly into billing.

---

## 2. Legacy Local Artifact Inventory & Behavior

| Artifact | Location | Legacy Role | Standalone Release Handling |
|----------|----------|-------------|-----------------------------|
| `authorization.json` | `<userData>/licensing/authorization.json` | Stored cryptographically signed authorization and Ed25519 signature | **Ignored.** The application no longer reads, checks, or attempts to verify this file. |
| `runtime_state.json` | `<userData>/licensing/runtime_state.json` | Stored runtime lease receipts and check-in deadlines | **Ignored.** The application does not check lease validity or calculate check-in status. |
| Secure Enclave / Keychain Key | macOS Keychain (`MiniPOSDeviceKey`) | Stored P-256 hardware identity key | **Ignored / Dormant.** The native identity helper binary has been removed. No keychain accesses occur. |
| Local SQLite Tables | `<userData>/mini-erp-data/billing.db` | Stored POS business data | **Preserved intact.** All existing tables (`bills`, `bill_items`, `products`, `settings`, `drafts`) remain unchanged. |
| Local Store Profile | SQLite `settings` table | Setup completion state | **Preserved.** If `status === 'COMPLETED'`, setup is skipped. |

---

## 3. Upgrade Scenarios & Verification

### Scenario A: Previously Activated User Upgrades
- **State on Disk:** `authorization.json` exists; `billing.db` exists with completed setup.
- **Boot Behavior:** Electron Main boots, loads SQLite database, discovers existing store profile and products, marks setup as completed, loads active draft, and renders POS Billing view directly.
- **Network Traffic:** 0 network requests.

### Scenario B: Expired or Revoked License User Upgrades
- **State on Disk:** `authorization.json` contains an expired timestamp or `runtime_state.json` is marked `EXPIRED` / `REVOKED`.
- **Boot Behavior:** Previously, the app would fail-closed and block cashier billing with `BillingNotAuthorizedError`. Now, the application startup ignores both files entirely and opens POS billing without restrictions.
- **Verification:** Verified by Playwright Test B in `standalone-regression.e2e.spec.ts`.

### Scenario C: Corrupted Licensing Folder
- **State on Disk:** `<userData>/licensing/authorization.json` contains invalid JSON or garbage bytes.
- **Boot Behavior:** Previously, JSON parsing errors or cryptographic failure would prevent POS startup. In this standalone release, the path is never accessed; startup succeeds without error.
- **Verification:** Verified by Playwright Test B in `standalone-regression.e2e.spec.ts`.

### Scenario D: Fresh Installation
- **State on Disk:** No `<userData>` directory exists.
- **Boot Behavior:** SQLite database is initialized with current schema version. App displays the 2-step setup wizard (Welcome -> Store Setup). After entering the store name and clicking Continue, the user sees "You're all set" and enters POS billing directly. No activation screen is ever presented.
- **Verification:** Verified by Playwright Test in `setup.e2e.spec.ts`.

---

## 4. Local Cleanup Policy

Because files located under `<userData>/licensing/` occupy trivial disk space (< 4 KB) and contain no private keys or security risks to the user, they can be safely left dormant without destructive file deletion during upgrade.

For users wishing to perform a complete manual reset of all local settings, the built-in `system:factoryReset` IPC handler clears the SQLite database without leaving any lingering application locks.

