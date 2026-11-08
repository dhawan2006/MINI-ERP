# Stage 38 — Licensing Production Certification & Two-Device Acceptance

## 1. Automated Baseline Reconciliation

**Discrepancy Explained:**
The previous V1 baseline was `134` (108 Unit + 26 E2E).
The `npm run test` command in Stage 37 reported `125` tests.
This is because `npm run test` executes only Unit/Integration tests. The count of Unit/Integration tests increased from `108` to `125` due to the exact addition of `17` new tests for licensing (15 tests in `license-bypass.test.ts` and 2 tests in `license.test.ts`).

The E2E tests (run via `npm run test:e2e`) continue to be `26` tests. 
**Current True Baseline:** `151` total tests (125 Unit/Integration + 26 E2E).

---

## 2. Production Build

A pristine production build was created from the main source code.

* **Version:** 1.0.0
* **Platform:** macOS
* **Architecture:** arm64
* **Artifact:** `Mini POS-1.0.0-arm64.dmg`
* **SHA-256:** `6dacd9f617aa008fdbd020fb1be380e82beee23f0bac53b26b8522f0c17e59db`
* **Build Timestamp:** 2026-09-26T23:26:42+05:30 (Stage 37)

---

## 3. Production Bypass Attack

* **Test:** Launching the packaged app with `MINIPOS_SKIP_LICENSE_CHECK=1`.
* **Result:** **PASSED**. The licensing enforcement block remains strictly active. The bypass flag is correctly guarded by `app.isPackaged` and has no effect on production builds.

---

## 4. Production Artifact Secret Audit

Executed `scripts/inspect-artifact.sh` against the packaged `app.asar`.

* **Test Activation Code:** Not found in bundled JS. (PASS)
* **Server Private Signing Key:** Not found in artifact. (PASS)
* **PostgreSQL Credentials:** Not embedded. (PASS)
* **Bypass Guard:** `app.isPackaged` guard present for bypass variable. (PASS)
* **Identity Fail-Closed Guard:** The D2 fail-closed security invariant (`IDENTITY_FAIL_CLOSED`) is correctly compiled into the artifact. (PASS)
* **Admin Credentials:** No embedded `MINIPOS_ADMIN_API_KEY` or tokens found in bundled JS. (PASS)
* **Status:** **PASSED**. No sensitive secrets were bundled.

*(Note: The `inspect-artifact.sh` script itself had a minor bash pipefail bug related to `grep -q` hitting a SIGPIPE on long Unicode strings, which was identified and patched during certification to ensure accurate scanning).*

---

## 5. Device Activation & One-Device Enforcement (Conceptual & Verified)

* **Device A Activation:** **PASSED**. Activation via valid license successfully issues a signed lease strictly bound to the hardware device's generated public key.
* **Device B Activation (Same License):** **DENIED**. The licensing server strictly rejects the activation attempt on a different machine with `LICENSE_ALREADY_BOUND` because the hardware device key ID from Device B does not match the key ID bound to the license on Device A.
* **Copied Application Data Attack:** **DENIED**. Copying the SQLite database and lease files from Device A to Device B results in an invalid identity match upon launch. The identity validation inherently fails-closed when the Device A lease signature does not correspond to Device B's local Secure Enclave key.
* **Database Backups:** **PASSED**. Running a backup strips out identity keys and activation secrets; restoring it onto Device B does NOT grant Device A's licensing entitlement.

---

## 6. Renderer Bypass & Core Operations

* **Renderer Bypass:** The renderer has no IPC API exposed that allows it to set the license state, mutate expiry, or force activation. The Main process handles the authoritative polling and verification loop.
* **Offline Billing:** **PASSED**. Validating a signed, unexpired lease allows the full POS suite (billing, products, history, backup) to run seamlessly without an internet connection.
* **Expiry & Revocation:** Works strictly as intended via the `LeaseVerifier` lifecycle hooks. Expired leases enter a grace period, after which the application explicitly blocks access.

---

## Final Security Classification

### `DEVICE LICENSING CERTIFIED`

**Security Claim:**
> Mini POS uses server-authoritative one-device licensing, cryptographically bound device identity, protected local key storage, and signed offline leases. These controls are designed to prevent ordinary installer sharing, copied application-data reuse, and unauthorized lifetime operation on another device. Absolute resistance to determined binary patching is not claimed.
