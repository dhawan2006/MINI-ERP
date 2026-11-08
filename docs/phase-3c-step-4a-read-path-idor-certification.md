# Phase 3C Step 4A — Read-Path IDOR Certification

**Status:** CERTIFIED (READ PATH ONLY)  
**Date:** 2026-10-27  
**Test Suite:** `tests/integration/phase3c-read-idor.test.ts` (69/69 PASS)  
**Environment:** Local Supabase Edge Functions (`http://127.0.0.1:54321/functions/v1/admin`) & Local PostgreSQL (`127.0.0.1:54322`)  
**Scope Limit:** Read-Path IDOR Certification Only. No mutation certification; no hosted QA claims.

---

## 1. Environment and Method

### Target Environment
- **Runtime:** Supabase Edge Runtime (`functions serve --no-verify-jwt --env-file ./supabase/.env.local`)
- **Database:** Local PostgreSQL (`localhost:54322`, postgres db)
- **API URL:** `http://127.0.0.1:54321/functions/v1/admin`
- **Verification Level:** Local environment only. Hosted QA was **not** tested and is not claimed.

### Attack Methodology
Direct adversarial black-box HTTP probing against the production-grade Edge Function endpoints. All requests reached the live database authorization layer (`AdminScopeService`, `AdminCustomerService`, `AdminLicenseService`, `AdminDeviceService`).
- **No Mocking:** Vitest was executed with native HTTP clients (`fetch`) calling the Kong gateway. `page.route()` was not utilized.
- **Role Coverage:** Authenticated tokens generated for all customer-scoped roles (`OWNER_A`, `ADMIN_A`, `FINANCE_A`, `AUDITOR_A`), cross-tenant adversary (`OWNER_B`), and global administrator (`SUPPORT`).
- **Fixture Isolation:** Dynamically generated unique IDs per test run (`IDOR_Customer_A_<timestamp>`, `PRODUCT_IDOR_A_<timestamp>`, `dev_idor_a_only_<timestamp>`). Clean lifecycle teardown in `afterAll` ensuring zero persistent test contamination.

---

## 2. Customer Detail IDOR

**Route Tested:** `GET /v1/admin/customers/:id`

| Role | Target Resource | Expected HTTP | Actual HTTP | Detail / Leak Check | Result |
| :--- | :--- | :---: | :---: | :--- | :---: |
| `OWNER_A` | Customer A (Own) | 200 | 200 | Full record returned | PASS |
| `OWNER_A` | Customer B (Foreign) | 404 | 404 | `{ "error": "NOT_FOUND" }`, zero B fields | PASS |
| `OWNER_A` | Nonexistent UUID | 404 | 404 | `{ "error": "NOT_FOUND" }`, identical status | PASS |
| `ADMIN_A` | Customer A (Own) | 200 | 200 | Full record returned | PASS |
| `ADMIN_A` | Customer B (Foreign) | 404 | 404 | `{ "error": "NOT_FOUND" }`, zero B fields | PASS |
| `ADMIN_A` | Nonexistent UUID | 404 | 404 | `{ "error": "NOT_FOUND" }`, identical status | PASS |
| `FINANCE_A` | Customer A (Own) | 200 | 200 | Full record returned | PASS |
| `FINANCE_A` | Customer B (Foreign) | 404 | 404 | `{ "error": "NOT_FOUND" }`, zero B fields | PASS |
| `FINANCE_A` | Nonexistent UUID | 404 | 404 | `{ "error": "NOT_FOUND" }`, identical status | PASS |
| `AUDITOR_A` | Customer A (Own) | 200 | 200 | Full record returned | PASS |
| `AUDITOR_A` | Customer B (Foreign) | 404 | 404 | `{ "error": "NOT_FOUND" }`, zero B fields | PASS |
| `AUDITOR_A` | Nonexistent UUID | 404 | 404 | `{ "error": "NOT_FOUND" }`, identical status | PASS |

**Security Finding:** Complete tenant boundary isolation. Cross-customer customer requests return generic 404 responses that are byte-for-byte and structurally indistinguishable from requests for nonexistent IDs.

---

## 3. License Detail IDOR

**Route Tested:** `GET /v1/admin/licenses/:id`

| Role | Target Resource | Expected HTTP | Actual HTTP | Leaked Fields | Result |
| :--- | :--- | :---: | :---: | :--- | :---: |
| `OWNER_A` | `LICENSE_A` (Own) | 200 | 200 | None (authorized) | PASS |
| `OWNER_A` | `LICENSE_B` (Foreign) | 404 | 404 | None (no HMAC, key, product, or customer metadata) | PASS |
| `OWNER_A` | Nonexistent UUID | 404 | 404 | None | PASS |
| `ADMIN_A` | `LICENSE_A` (Own) | 200 | 200 | None (authorized) | PASS |
| `ADMIN_A` | `LICENSE_B` (Foreign) | 404 | 404 | None | PASS |
| `ADMIN_A` | Nonexistent UUID | 404 | 404 | None | PASS |
| `FINANCE_A` | `LICENSE_A` (Own) | 200 | 200 | None (authorized) | PASS |
| `FINANCE_A` | `LICENSE_B` (Foreign) | 404 | 404 | None | PASS |
| `FINANCE_A` | Nonexistent UUID | 404 | 404 | None | PASS |
| `AUDITOR_A` | `LICENSE_A` (Own) | 200 | 200 | None (authorized) | PASS |
| `AUDITOR_A` | `LICENSE_B` (Foreign) | 404 | 404 | None | PASS |
| `AUDITOR_A` | Nonexistent UUID | 404 | 404 | None | PASS |

**Data Leak Verification:** Responses for foreign licenses contain zero license attributes (`id`, `customer_id`, `product_id`, `license_key_hmac`, `max_devices`, `valid_until` are all `undefined`).

---

## 4. Device Detail IDOR

**Route Tested:** `GET /v1/admin/devices/:deviceKeyId`

| Role | Target Device | Expected HTTP | Actual HTTP | Notes | Result |
| :--- | :--- | :---: | :---: | :--- | :---: |
| `OWNER_A` | `DEVICE_A_ONLY` | 200 | 200 | Authorized | PASS |
| `OWNER_A` | `DEVICE_B_ONLY` | 404 | 404 | Denied with 404 (no existence revelation) | PASS |
| `OWNER_A` | `DEVICE_SHARED_REASSIGNED` | 200 | 200 | Permitted under historical-visibility policy | PASS |
| `OWNER_A` | Nonexistent Key | 404 | 404 | 404 NOT_FOUND | PASS |
| `ADMIN_A` | `DEVICE_A_ONLY` | 200 | 200 | Authorized | PASS |
| `ADMIN_A` | `DEVICE_B_ONLY` | 404 | 404 | Denied with 404 | PASS |
| `ADMIN_A` | `DEVICE_SHARED_REASSIGNED` | 200 | 200 | Permitted under historical-visibility policy | PASS |
| `ADMIN_A` | Nonexistent Key | 404 | 404 | 404 NOT_FOUND | PASS |
| `AUDITOR_A` | `DEVICE_A_ONLY` | 200 | 200 | Authorized | PASS |
| `AUDITOR_A` | `DEVICE_B_ONLY` | 404 | 404 | Denied with 404 | PASS |
| `AUDITOR_A` | `DEVICE_SHARED_REASSIGNED` | 200 | 200 | Permitted under historical-visibility policy | PASS |
| `AUDITOR_A` | Nonexistent Key | 404 | 404 | 404 NOT_FOUND | PASS |
| `OWNER_B` | `DEVICE_B_ONLY` | 200 | 200 | Authorized for Customer B | PASS |
| `OWNER_B` | `DEVICE_A_ONLY` | 404 | 404 | Denied with 404 | PASS |
| `OWNER_B` | `DEVICE_SHARED_REASSIGNED` | 200 | 200 | Permitted under active binding | PASS |
| `FINANCE_A` | `DEVICE_A_ONLY` | 403 | 403 | Phase 3B Device RBAC denies FINANCE | PASS |

---

## 5. Historical Binding Redaction

**Target Device:** `DEVICE_SHARED_REASSIGNED`  
**Database Topology:**
- `bindingSharedA` (Historical, `status: 'DEACTIVATED'`, linked to `LICENSE_A` / Customer A)
- `bindingSharedB` (Current Active, `status: 'ACTIVE'`, linked to `LICENSE_B` / Customer B)

### Invariant Test Results

1. **Customer A Admin (`OWNER_A`, `ADMIN_A`, `AUDITOR_A`):**
   - Returns HTTP 200.
   - `body.bindings` contains exactly `bindingSharedA` (linked to `licenseA`).
   - `body.bindings` **strictly excludes** `bindingSharedB`.
   - `licenseB` identifier **does not appear** anywhere in the response.
   - Customer B's activation timestamps and binding details are **100% redacted**.
   - Verified across all authorized roles: `OWNER_A`, `ADMIN_A`, `AUDITOR_A`.

2. **Customer B Admin (`OWNER_B`):**
   - Returns HTTP 200.
   - `body.bindings` contains exactly `bindingSharedB` (linked to `licenseB`).
   - `body.bindings` **strictly excludes** `bindingSharedA`.
   - `licenseA` identifier **does not appear** anywhere in the response.
   - Customer A's historical activation timestamps and binding details are **100% redacted**.

3. **Global Administrator (`SUPPORT`):**
   - Returns HTTP 200.
   - `body.bindings` contains **both** `bindingSharedA` and `bindingSharedB`.
   - Global visibility retained.

---

## 6. List / Search / Pagination IDOR

### Devices Collection (`GET /v1/admin/devices`)
- **List Scoping:** `OWNER_A` list query returns `DEVICE_A_ONLY` and `DEVICE_SHARED_REASSIGNED`. `DEVICE_B_ONLY` is absent.
- **Search Attack:** Query `?search=dev_idor_b_only_` executed by Customer A admin returns `data: []` and `meta.total: 0`.
- **Search Positive Baseline:** Query `?search=dev_idor_a_only_` returns the matching device.
- **Pagination Boundary Invariant:** Offsets (`offset=10`) return empty pages without disclosing foreign records or altering `total`.

### Licenses Collection (`GET /v1/admin/licenses`)
- **List Scoping:** `OWNER_A` list query returns only `LICENSE_A`. `LICENSE_B` is excluded.
- **Search Attack:** Query `?search=<licenseB_id>` executed by Customer A returns `data: []` and `meta.total: 0`.
- **Search Positive Baseline:** Query `?search=PRODUCT_IDOR_A_` successfully returns `LICENSE_A`.

---

## 7. Global SUPPORT Regression

**Role:** `SUPPORT` (`customerId: null`, `scopeType: 'GLOBAL'`)

| Action | Target | Status | Result |
| :--- | :--- | :---: | :---: |
| Read Customer Record | Customer A fixture | 200 | PASS |
| Read Customer Record | Customer B fixture | 200 | PASS |
| Read License Record | `LICENSE_A` & `LICENSE_B` | 200 | PASS |
| Read Device Record | `DEVICE_A_ONLY` & `DEVICE_B_ONLY` | 200 | PASS |
| Read Shared Device | `DEVICE_SHARED_REASSIGNED` (Both A & B bindings) | 200 | PASS |
| Self-Scope Discovery | `/v1/admin/me` | 200 (`customerId: null`, `scopeType: 'GLOBAL'`) | PASS |
| Programmatic System Scope | `/_test/scope-check` (`targetCustomerId: customerB`) | 200 (`ALLOW`) | PASS |

---

## 8. Authentication and Role Boundaries

1. **Anonymous Rejection:** Unauthenticated request to `/v1/admin/customers/:id` rejected with 401.
2. **Invalid Token Rejection:** Malformed Bearer token (`Bearer totally_invalid_token`) rejected with 401.
3. **Query Parameter Tampering:** Requesting `?customerId=CustomerB` with Customer A's token does **not** expand access scope; server derives scope strictly from `admin_roles` in DB.
4. **Header Tampering:** Sending `X-Customer-Id: CustomerB` with Customer A's token does **not** override server scope; foreign resource request returns 404.

---

## 9. Response and Existence-Leak Analysis

A comparative differential analysis was executed between:
1. Cross-customer foreign resource request (e.g., Customer A requesting Customer B's real ID)
2. Nonexistent resource request (e.g., Customer A requesting a random UUID)

### Findings:
- **Status Codes:** Identical (404 for both).
- **Body Contract:** Identical payload structure (`{ "error": "NOT_FOUND", "message": "..." }`).
- **No Stack Traces:** Neither query revealed PostgreSQL column names, table names, or SQL query snippets.
- **Zero Enumeration Vector:** An attacker cannot distinguish whether a foreign resource identifier is valid or nonexistent.

---

## 10. `last_seen_at` Observation

### Field Behavior Observed:
On `DEVICE_SHARED_REASSIGNED`, the top-level `devices.last_seen_at` field stores device-level hardware check-in telemetry.
- When Customer B's active device checked in, `last_seen_at` was updated to the latest timestamp.
- When Customer A reads `DEVICE_SHARED_REASSIGNED`, the top-level `last_seen_at` reflects the physical device's latest timestamp (`2026-10-27T16:00:00.000Z`), even though Customer A's binding was deactivated previously.
- All tenant-specific data (`bindings`, `licenses`, `reasons`) remain strictly filtered and redacted.

### Policy Determination:
As mandated in Step 1 and Step 4A instructions:
```
LAST_SEEN_AT_POLICY = UNRESOLVED
```
This field's behavior is explicitly **not** approved as compliant product policy, pending product-architecture resolution in later phases.

---

## 11. Test Results

### Suite: `tests/integration/phase3c-read-idor.test.ts`
- **Total Tests:** 69
- **Passed:** 69 (100%)
- **Failed:** 0
- **Duration:** 3.52s

```
Test Files  1 passed (1)
     Tests  69 passed (69)
```

---

## 12. Regression Results

| Test Suite / Build Target | Scope / Focus | Result |
| :--- | :--- | :---: |
| `tests/integration/phase3c-read-idor.test.ts` | Adversarial Read-Path IDOR Attacks | **69/69 PASS** |
| `tests/integration/phase3c-resource-isolation.test.ts` | Server-Side Customer Resource Isolation | **43/43 PASS** |
| `tests/integration/phase3c-step2-1-hardening.test.ts` | Database Enforcement & Scope Hardening | **30/30 PASS** |
| `tests/integration/phase3c-customer-scope.test.ts` | Scoped Admin Role Foundation | **13/13 PASS** |
| `tests/integration/device-backend-rbac.test.ts` | Device Backend RBAC Certification | **29/29 PASS** |
| `tests/integration/device-aal2.test.ts` | Device AAL2 / MFA Step 5.6C | **13/13 PASS** |
| `admin-ui` Vitest (`npm test`) | Admin UI Customer, License, Device Pages | **31/31 PASS** |
| TypeScript Compiler (`tsc --noEmit`) | Backend & Client Type Safety | **0 ERRORS** |
| Production Bundle (`npm run build`) | Desktop POS App Client & Electron Build | **PASS (1.65s)** |
| Admin UI Bundle (`npm run build`) | Admin Web Dashboard Build | **PASS (277ms)** |

---

## 13. Known Issues

1. **`last_seen_at` Cross-Tenant Telemetry Exposure:** Device-level `last_seen_at` reflects the latest physical ping across tenant reassignments. Marked `LAST_SEEN_AT_POLICY = UNRESOLVED`.
2. **Unexposed Standalone Routes:**
   - Standalone `GET /v1/admin/bindings` is `NOT CURRENTLY ADMIN-EXPOSED`.
   - Standalone `GET /v1/admin/lifecycle/requests` is `NOT CURRENTLY ADMIN-EXPOSED`.
   *(Data tested only through exposed parent resources `GET /devices/:id` and `GET /licenses/:id`).*

---

## 14. Unverified Items

As strictly mandated by Step 4A instructions, the following surfaces were **not certified** in this step:
- Cross-customer mutation authorization (deferred to Step 4B).
- Release Binding mutation security under foreign identifiers (deferred to Step 4B).
- Concurrency and race conditions on mutation endpoints.
- Hosted QA multi-tenant deployment.
- Full production multi-tenancy certification.

---

## 15. Certification Decision

All tested read paths reject cross-customer access with non-disclosing 404 responses. Historical binding redaction on shared/reassigned devices is strictly verified against real database relationships.

### Decision:
```
PHASE 3C STEP 4A = PASS
```
*(Certifies tested read-path IDOR surface only).*
