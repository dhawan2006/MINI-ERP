# Phase 3C Step 4B — Mutation-Path IDOR Certification

**Status:** CERTIFIED (MUTATION PATH ONLY)  
**Date:** 2026-10-27  
**Test Suite:** `tests/integration/phase3c-mutation-idor.test.ts` (46/46 PASS)  
**Target Environment:** Local Supabase Edge Functions (`http://127.0.0.1:54321/functions/v1/admin`) & Local PostgreSQL (`127.0.0.1:54322`)  
**Scope Limit:** Mutation-Path IDOR Certification Only. No hosted QA claims; no real TOTP claims; no full multi-tenancy certification.

---

## 1. Target Environment

- **Server Runtime:** Supabase Edge Runtime (`functions serve --no-verify-jwt --env-file ./supabase/.env.local`)
- **Database:** Local PostgreSQL (`localhost:54322`, postgres db)
- **Base Endpoint:** `http://127.0.0.1:54321/functions/v1/admin`
- **Hosted QA:** **NOT TESTED / NOT CLAIMED.** All tests executed on the local integration testbed.
- **Assurance Mechanism:** `SYNTHETIC_QA_AAL2` test tokens signed via local test secret (`super-secret-jwt-token-with-at-least-32-characters-long`). Not real Supabase TOTP MFA.

---

## 2. Route Inventory

Before testing, `supabase/functions/admin/index.ts` and underlying domain services were audited for all exposed mutation routes:

| Route Path | Method | Roles Permitted | MFA Required | Idempotency Supported | Source Implementation | Status |
| :--- | :---: | :--- | :---: | :---: | :--- | :---: |
| `/lifecycle/release-binding` | POST | `OWNER`, `ADMIN`, `SUPPORT`, `SYSTEM` | YES | YES (`X-Idempotency-Key`) | `AdminLifecycleService.releaseBinding` | TESTED |
| `/lifecycle/revoke-license` | POST | `OWNER`, `ADMIN`, `SYSTEM` | YES | YES | `AdminLifecycleService.revokeLicense` | TESTED |
| `/lifecycle/restore-license` | POST | `OWNER`, `ADMIN`, `SYSTEM` | YES | YES | `AdminLifecycleService.restoreLicense` | TESTED |
| `/lifecycle/disable-license` | POST | `OWNER`, `ADMIN`, `SYSTEM` | YES | YES | `AdminLifecycleService.disableLicense` | TESTED |
| `/lifecycle/extend-license` | POST | `OWNER`, `ADMIN`, `SYSTEM` | YES | YES | `AdminLifecycleService.extendLicense` | TESTED |
| `/licenses` | POST | `OWNER`, `ADMIN`, `FINANCE`, `SYSTEM` | YES | YES | `AdminLicenseService.createLicense` | TESTED |
| `/customers/:id` | PUT | `OWNER`, `ADMIN`, `FINANCE` | YES | YES | `AdminCustomerService.updateCustomer` | TESTED |
| `/directives` | POST | `OWNER`, `ADMIN`, `SUPPORT` | YES | YES | `AdminDirectiveService.createDirective` | TESTED |
| `/directives/:id/cancel` | POST | `OWNER`, `ADMIN`, `SUPPORT` | YES | YES | `AdminDirectiveService.cancelDirective` | TESTED |
| `/bindings/:id` | PUT/DELETE | N/A | N/A | N/A | N/A | NOT CURRENTLY ADMIN-EXPOSED |
| `/lifecycle/requests` | POST | N/A | N/A | N/A | N/A | NOT CURRENTLY ADMIN-EXPOSED |

---

## 3. Authentication and AAL Baseline

Baseline access controls were verified on `POST /lifecycle/release-binding`:
1. **Anonymous Mutation:** Request without `Authorization` header rejected with HTTP 401.
2. **Invalid Bearer Token:** Request with `Authorization: Bearer invalid.jwt.token` rejected with HTTP 401.
3. **Role Denial (RBAC):** Authenticated `AUDITOR_A` with AAL2 rejected with `403 ADMIN_FORBIDDEN`.
4. **Role Denial (RBAC):** Authenticated `FINANCE_A` with AAL2 rejected with `403 ADMIN_FORBIDDEN`.
5. **Assurance Level (AAL):** Authenticated `OWNER_A` with AAL1 context rejected with `403 MFA_REQUIRED`.

---

## 4. Release Binding Foreign-Target Tests

**Target Route:** `POST /v1/admin/lifecycle/release-binding`  
**Caller:** `OWNER_A` with `SYNTHETIC_QA_AAL2`

| Attack Vector | Input Parameters | Expected Status | Actual Status | DB State Check | Result |
| :--- | :--- | :---: | :---: | :--- | :---: |
| Customer A license + Customer B device | `licenseId: licenseA, deviceKeyId: deviceBOnly` | 404 | 404 | Zero row updated in `license_bindings` | PASS |
| Customer B license + Customer A device | `licenseId: licenseB, deviceKeyId: deviceAOnly` | 404 | 404 | Zero row updated in `license_bindings` | PASS |
| Customer B license + Customer B device | `licenseId: licenseB, deviceKeyId: deviceBOnly` | 404 | 404 | `bindingBOnly` remains `ACTIVE`, `deactivated_at IS NULL` | PASS |
| Customer A license + Customer A device (isolated) | `licenseId: licenseA, deviceKeyId: deviceAIso` | 200 | 200 | `bindingAIso` transitions to `DEACTIVATED`, `deactivated_at NOT NULL` | PASS |

---

## 5. License Lifecycle Mutation Tests

Every exposed license mutation endpoint was tested against foreign targets:

### 1. Extend License (`POST /lifecycle/extend-license`)
- **Caller:** `OWNER_A` targeting `LICENSE_A_EXTEND` -> HTTP 200 SUCCESS (`valid_until` updated).
- **Attack:** `OWNER_A` targeting `LICENSE_B_EXTEND` -> HTTP 404 NOT_FOUND. Foreign `valid_until` unchanged.
- **Attack:** `ADMIN_A` targeting `LICENSE_B_EXTEND` -> HTTP 404 NOT_FOUND. Foreign `valid_until` unchanged.

### 2. Disable License (`POST /lifecycle/disable-license`)
- **Caller:** `OWNER_A` targeting `LICENSE_A_DISABLE` -> HTTP 200 SUCCESS (`status` transitions to `DISABLED`).
- **Attack:** `OWNER_A` targeting `LICENSE_B_DISABLE` -> HTTP 404 NOT_FOUND. Foreign license remains `ACTIVE`.
- **Attack:** `ADMIN_A` targeting `LICENSE_B_DISABLE` -> HTTP 404 NOT_FOUND. Foreign license remains `ACTIVE`.

### 3. Restore License (`POST /lifecycle/restore-license`)
- **Caller:** `OWNER_A` targeting `LICENSE_A_RESTORE` -> HTTP 200 SUCCESS (`status` transitions from `DISABLED` to `ACTIVE`).
- **Attack:** `OWNER_A` targeting `LICENSE_B_RESTORE` -> HTTP 404 NOT_FOUND. Foreign license remains `DISABLED`.
- **Attack:** `ADMIN_A` targeting `LICENSE_B_RESTORE` -> HTTP 404 NOT_FOUND. Foreign license remains `DISABLED`.

### 4. Revoke License (`POST /lifecycle/revoke-license`)
- **Caller:** `OWNER_A` targeting `LICENSE_A_REVOKE` -> HTTP 200 SUCCESS (`status` transitions to `REVOKED`, `revoked_at NOT NULL`).
- **Attack:** `OWNER_A` targeting `LICENSE_B_REVOKE` -> HTTP 404 NOT_FOUND. Foreign license remains `ACTIVE`.
- **Attack:** `ADMIN_A` targeting `LICENSE_B_REVOKE` -> HTTP 404 NOT_FOUND. Foreign license remains `ACTIVE`.

---

## 6. Customer Association Injection

### 1. License Creation Injection (`POST /licenses`)
- **Foreign Customer Injection:** `OWNER_A` or `ADMIN_A` supplying `customer_id: customerB` in the JSON body is rejected with `403 CUSTOMER_MISMATCH_FORBIDDEN`.
- **Sentinel Customer Target:** `OWNER_A` supplying `customer_id: '00000000-0000-0000-0000-000000000000'` is rejected with `400 SENTINEL_CUSTOMER_FORBIDDEN`.
- **Authoritative DB Verification:** Exact count queries confirm zero licenses created for Customer B or the UNASSIGNED sentinel.

### 2. Customer Update IDOR (`PUT /customers/:id`)
- **Attack:** `OWNER_A` attempting `PUT /customers/${customerB}` is rejected with `404 NOT_FOUND` (`CUSTOMER_NOT_FOUND`).
- **Authoritative DB Verification:** Customer B's `business_name`, `contact_name`, `email`, and `phone` remain strictly unmodified.

---

## 7. Shared Device / Historical Binding Tests

**Target Device:** `DEVICE_SHARED_REASSIGNED`  
**State:** Customer A has historical binding (DEACTIVATED); Customer B has current active binding (ACTIVE).

1. **Foreign Mutation Attempt:** `OWNER_A` targeting Customer B active binding (`licenseId: licenseB, deviceKeyId: deviceSharedReassigned`) is rejected with `404 NOT_FOUND`.
2. **Historical Re-deactivation Attempt:** `OWNER_A` targeting Customer A historical binding (`licenseId: licenseA, deviceKeyId: deviceSharedReassigned`) returns `400 ALREADY_DEACTIVATED` and cannot affect Customer B's active binding.
3. **Database Integrity:** Authoritative check confirms Customer B active binding remains `ACTIVE` with `deactivated_at IS NULL`.
4. **Legitimate Tenant Deactivation:** `OWNER_B` legitimately releases Customer B active binding (`licenseId: licenseB, deviceKeyId: deviceSharedReassigned`) -> HTTP 200 SUCCESS (`deactivated_at NOT NULL`).

---

## 8. State Integrity

For every denied cross-customer mutation across all tested endpoints, database state was asserted before and after execution:
- **Foreign License State:** `status`, `valid_until`, `revoked_at`, and `customer_id` remained byte-for-byte identical.
- **Foreign Binding State:** `status` and `deactivated_at` remained untouched.
- **Foreign Customer State:** Profile fields remained untouched.
- **Lifecycle Records:** Zero unauthorized lifecycle records created.

---

## 9. Idempotency

Tested against `admin_idempotency_keys` table using standard UUID request identifiers:
1. `OWNER_A` sends foreign-target request with UUID key `K` -> rejected with 404 NOT_FOUND.
2. `admin_idempotency_keys` verification confirms no `COMPLETED` record with status 200 was stored under key `K`.
3. Replaying the denied foreign-target request with key `K` remains denied.
4. `OWNER_B` then executes a legitimate mutation using a distinct UUID key -> HTTP 200 SUCCESS, and replay of `OWNER_B`'s key returns the cached 200 SUCCESS.
5. Proved that an attacker's failed idempotency key cannot poison or bypass subsequent legitimate operations.

---

## 10. Concurrency

Two simultaneous foreign-target mutation requests were dispatched from `OWNER_A` against Customer B's active binding (`Promise.all`):
- Both concurrent requests were rejected with HTTP 404 NOT_FOUND.
- Authoritative database verification immediately following concurrent execution verified that Customer B's binding remained `ACTIVE` and `deactivated_at` was `NULL`. No race window permitted foreign deactivation.

---

## 11. Scope Override Resistance

For mutation requests (`POST /lifecycle/release-binding`), client tampering attempts were executed:
- Query parameter injection: `?customerId=${customerB}` -> Rejected (404 NOT_FOUND).
- JSON body injection: `{ "customerId": customerB, ... }` -> Rejected (404 NOT_FOUND).
- Header injection: `X-Customer-Id: ${customerB}` -> Rejected (404 NOT_FOUND).
The server derived tenant scope strictly from the authenticated database membership (`admin_roles`).

---

## 12. Error / Enumeration Analysis

Responses for denied foreign mutations:
- Return HTTP 404 NOT_FOUND with `{ "error": "NOT_FOUND", "message": "..." }`.
- Do not disclose foreign resource existence, foreign license status, or device binding state.
- Do not expose PostgreSQL error details, table names (`licenses`, `license_bindings`), column names, or stack traces.

---

## 13. Audit Behavior

- **Accepted Mutations:** Produce legitimate audit records (`ADMIN_RELEASE_BINDING`, `ADMIN_REVOKE_LICENSE`, etc.) correctly populated with `license_id` and caller `admin_id`.
- **Denied Foreign Mutations:** Produce **zero** successful mutation audit events. No audit pollution or false audit trail created.

---

## 14. last_seen_at Policy

Device-level `last_seen_at` on physical devices remains unchanged across failed cross-customer mutations. As established in Step 1 and Step 4A:
```
LAST_SEEN_AT_POLICY = UNRESOLVED
```
This field's cross-tenant visibility remains an unresolved product-policy item.

---

## 15. Regression Results

| Test Suite / Build Target | Scope / Focus | Result |
| :--- | :--- | :---: |
| `tests/integration/phase3c-mutation-idor.test.ts` | Adversarial Mutation-Path IDOR Attacks | **46/46 PASS** |
| `tests/integration/phase3c-read-idor.test.ts` | Adversarial Read-Path IDOR Attacks | **69/69 PASS** |
| `tests/integration/phase3c-resource-isolation.test.ts` | Server-Side Customer Resource Isolation | **43/43 PASS** |
| `tests/integration/phase3c-step2-1-hardening.test.ts` | Database Enforcement & Scope Hardening | **30/30 PASS** |
| `tests/integration/phase3c-customer-scope.test.ts` | Scoped Admin Role Foundation | **13/13 PASS** |
| `tests/integration/device-backend-rbac.test.ts` | Device Backend RBAC Certification | **29/29 PASS** |
| `tests/integration/device-aal2.test.ts` | Device AAL2 / MFA Step 5.6C | **13/13 PASS** |
| `admin-ui` Vitest (`npm test`) | Admin UI Customer, License, Device Pages | **31/31 PASS** |
| TypeScript Compiler (`tsc --noEmit`) | Backend & Client Type Safety | **0 ERRORS** |
| Production Bundle (`npm run build`) | Desktop POS App Client & Electron Build | **PASS (1.72s)** |
| Admin UI Bundle (`npm run build`) | Admin Web Dashboard Build | **PASS (253ms)** |

---

## 16. Known Issues

1. **`last_seen_at` Cross-Tenant Telemetry Exposure:** Device-level `last_seen_at` reflects latest hardware ping across tenant reassignments. Marked `LAST_SEEN_AT_POLICY = UNRESOLVED`.
2. **Unexposed Standalone Routes:** Standalone `GET/PUT/DELETE /bindings/:id` and `GET/POST /lifecycle/requests` are `NOT CURRENTLY ADMIN-EXPOSED`.

---

## 17. Unverified Items

- Hosted QA multi-tenant deployment (not tested; local Supabase only).
- Production deployment verification.
- Real production Supabase MFA / TOTP enrollment and challenge flows (used `SYNTHETIC_QA_AAL2`).
- Complete application-wide multi-tenancy beyond the tested routes.

---

## 18. Certification Decision

Every exposed mutation endpoint enforces strict customer ownership. Denied cross-customer mutations leave authoritative database state completely unchanged. Idempotency and concurrency attacks reveal zero authorization bypasses.

### Decision:
```
PHASE 3C STEP 4B = PASS
```
*(Certifies tested mutation-path IDOR surface only).*
