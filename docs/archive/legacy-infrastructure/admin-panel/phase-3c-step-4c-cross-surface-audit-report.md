# Phase 3C — Step 4C: Cross-Surface Tenant Leakage Audit Report

**Certification Status:** **PASS WITH LIMITATIONS**  
**Local Test Certification:** **PASS — TESTED LOCAL SURFACE**  
**Hosted QA Status:** **NOT TESTED**  
**Production Deployment Status:** **NOT CERTIFIED**  
**Real MFA / Supabase TOTP:** **NOT VERIFIED** (Synthetic AAL2 Test Automation Only: `SYNTHETIC_QA_AAL2`)  
**Device Telemetry Policy:** **UNRESOLVED (`LAST_SEEN_AT_POLICY = UNRESOLVED`)**  
**Date:** 2026-10-27  
**Auditor:** Senior Application Security & Multi-Tenant Authorization Engineer  

---

## 1. Executive Summary

Phase 3C Step 4C conducted an exhaustive, audit-first security evaluation of cross-surface tenant isolation and boundary leakage across all reachable endpoints of the Mini POS licensing and Admin Platform.

The audit examined:
1. **Aggregates and KPI totals** (`/dashboard/summary`, collection pagination metadata, search counts).
2. **Nested object serialization** (`GET /devices/:id` bindings array, historical device bindings).
3. **Response serialization disclosure** (complete payload scan for foreign customer IDs, foreign license IDs, foreign device keys, directive/checkin records, and secret cryptographic material like `license_key_hmac`).
4. **Audit log boundaries** (`GET /audit` scoping via authoritative customer relationships, exclusion of unresolvable device-only events).
5. **Direct export and unexposed endpoints** (`GET /export/*`, `/bindings`, `/lifecycle/requests`).
6. **Error path contracts** (non-enumerating `404 NOT_FOUND` responses without disclosing database syntax, table names, foreign IDs, or stack traces).
7. **Physical device telemetry** (`last_seen_at` observation and cross-tenant inference risk).

Adversarial integration testing using deterministic fixtures (Customer A, Customer B, Customer C empty tenant, Global SUPPORT, and Global SYSTEM) verified that **all 52 cross-surface adversarial tests passed**. Across the full multi-phase regression suite (530 total test cases across 10 suites), zero regressions were observed.

Because product requirements and schema currently lack a finalized architectural decision regarding whether device `last_seen_at` should reflect physical hardware telemetry or per-tenant activity, this report formally marks `LAST_SEEN_AT_POLICY = UNRESOLVED` and certifies the local surface with limitations.

---

## 2. Test Environment & Working-Tree State

- **Local Admin API Runtime:** `http://127.0.0.1:54321/functions/v1/admin` (Supabase Edge Functions via Deno 1.45.x / Deno runtime)
- **Local Database:** PostgreSQL 15.x at `127.0.0.1:54322`
- **Active Git Branch:** `stabilization/production-hardening`
- **Route Inventory Document:** [`docs/phase-3c-step-4c-route-inventory.md`](file:///Users/laksh/Desktop/mini_ERP/docs/phase-3c-step-4c-route-inventory.md)
- **Primary Integration Test Suite:** [`tests/integration/phase3c-cross-surface-tenant-leakage.test.ts`](file:///Users/laksh/Desktop/mini_ERP/tests/integration/phase3c-cross-surface-tenant-leakage.test.ts)

---

## 3. Surface & Route Inventory Coverage

The 23 routes registered on the Admin Edge Function router were evaluated:

| Category | Endpoint | Isolation Mechanism | Adversarial Test Outcome |
|----------|----------|---------------------|--------------------------|
| **Dashboard** | `GET /dashboard/summary` | Parameterized SQL count queries filtered by `customer_id = auth.customerId`. Empty tenant returns strict zero-state. | **PASS** (Isolated to tenant) |
| **Identity** | `GET /me` | Returns server-derived identity (`adminId`, `role`, `aal`, `scopeType`, `customerId`). Ignores caller overrides. | **PASS** (Zero foreign leakage) |
| **Customers** | `GET /customers` | Filtered in SQL (`WHERE id = auth.customerId AND is_sentinel = FALSE`). Limit/offset applied after filter. | **PASS** (Total = 1 for tenant) |
| **Customers** | `POST /customers` | Gated by `OWNER`, `ADMIN`, `FINANCE` with MFA. Scoped admin cannot self-associate to new customer. | **PASS** (DB uniqueness enforced) |
| **Customers** | `GET /customers/:id` | Parameterized SQL. Cross-customer ID returns non-enumerating 404 (`CUSTOMER_NOT_FOUND`). | **PASS** (Non-enumerating 404) |
| **Customers** | `PUT /customers/:id` | Service ownership verification (`auth.customerId === id`). Cross-customer returns 404. | **PASS** (No cross-tenant edit) |
| **Licenses** | `GET /licenses` | Parameterized SQL JOIN to `customers`. UUID and text search scoped. `license_key_hmac` omitted. | **PASS** (Zero foreign licenses) |
| **Licenses** | `POST /licenses` | Forces `customer_id = auth.customerId`. Foreign target rejected with 403. Sentinel rejected with 400. | **PASS** (Injection rejected) |
| **Licenses** | `GET /licenses/:id` | Parameterized SQL. Cross-customer returns 404 (`LICENSE_NOT_FOUND`). Secret HMAC not returned. | **PASS** (Non-enumerating 404) |
| **Devices** | `GET /devices` | Filtered in SQL via `EXISTS` subquery over caller's license bindings. | **PASS** (Only tenant devices returned) |
| **Devices** | `GET /devices/:id` | Ownership verified via binding `EXISTS` check (404 if absent). Nested `bindings` array filtered in SQL. | **PASS** (Foreign bindings redacted) |
| **Check-ins** | `GET /checkins` | Parameterized SQL JOIN (`c -> binding -> license -> customer_id = auth.customerId`). | **PASS** (Only tenant check-ins) |
| **Check-ins** | `GET /bindings/:id/checkin` | Parameterized SQL check. Cross-customer or nonexistent binding returns 200 with `null`. | **PASS** (Non-enumerating null) |
| **Directives** | `GET /directives` | Parameterized SQL JOIN to licenses. Count and rows filtered before pagination. | **PASS** (Only tenant directives) |
| **Directives** | `POST /directives` | Gated by `OWNER`, `ADMIN`, `SUPPORT` with MFA. Target binding verified in SQL (404 if cross-customer). | **PASS** (Foreign target rejected) |
| **Directives** | `POST /directives/:id/cancel` | Gated by `OWNER`, `ADMIN`, `SUPPORT` with MFA. Verified against caller's binding in SQL. | **PASS** (404 without mutation) |
| **Audit** | `GET /audit` | Restricted to `OWNER`, `ADMIN`, `AUDITOR`, `SYSTEM`. SQL JOIN to licenses. Unresolvable device events excluded. | **PASS** (Strict tenant audit) |
| **Lifecycle** | `POST /lifecycle/release-binding` | Gated with MFA. Parameterized SQL `FOR UPDATE` JOIN to licenses. Cross-customer target yields 404. | **PASS** (Zero mutation on failure) |
| **Lifecycle** | `POST /lifecycle/revoke-license` | Gated with MFA. Parameterized SQL `FOR UPDATE`. Cross-customer yields 404. | **PASS** (Non-enumerating 404) |
| **Lifecycle** | `POST /lifecycle/restore-license` | Gated with MFA. Parameterized SQL `FOR UPDATE`. Cross-customer yields 404. | **PASS** (Non-enumerating 404) |
| **Lifecycle** | `POST /lifecycle/disable-license` | Gated with MFA. Parameterized SQL `FOR UPDATE`. Cross-customer yields 404. | **PASS** (Non-enumerating 404) |
| **Lifecycle** | `POST /lifecycle/extend-license` | Gated with MFA. Parameterized SQL `FOR UPDATE`. Cross-customer yields 404. | **PASS** (Non-enumerating 404) |
| **Test Route** | `POST /_test/scope-check` | Only registered when `ADMIN_TEST_ROUTES_ENABLED="true"`. Returns only authorization decision. | **PASS (Test-Only)** |

---

## 4. In-Depth Audit Findings by Domain

### 4.1 Aggregates and Dashboard Metrics (Step B)
- **Query Scoping:** `AdminDashboardService.getSummary` applies `auth.customerId` in parameterized SQL for all 6 metrics (`total_customers`, `active_licenses`, `revoked_licenses`, `active_bindings`, `recent_checkins`, `overdue_checkins`).
- **Sentinel Exclusion:** The migration placeholder sentinel (`00000000-0000-0000-0000-000000000000`, `is_sentinel = TRUE`) is explicitly excluded from customer counts (`WHERE is_sentinel = FALSE`).
- **Empty Tenant State:** Verified with Customer C (0 licenses, 0 devices, 0 bindings, 0 checkins). All metric counts return exactly `0`, with `total_customers: 1`.
- **Search & Pagination Totals:** Searching for foreign sentinels (`SENTINEL_B`) in `/customers`, `/licenses`, and `/devices` produces `data: []` and `meta.total: 0`. Foreign records cannot be discovered through pagination offsets or search probes.

### 4.2 Nested Object Redaction and Serialization (Step C)
- **Shared Device Binding Redaction:** When a physical device has historical bindings to Customer A and active bindings to Customer B:
  - `GET /devices/:sharedDeviceId` requested by Customer A returns only Customer A's historical binding in `bindings[]`. Customer B's active binding is completely absent.
  - `GET /devices/:sharedDeviceId` requested by Customer B returns only Customer B's active binding in `bindings[]`. Customer A's historical binding is completely absent.
  - Global `SUPPORT` sees both bindings for support troubleshooting.
- **Payload Inspection:** Full text serialized inspection of responses across all 11 GET endpoints confirmed:
  - 0 occurrences of Customer B sentinel strings (`SENTINEL_BETA_*`).
  - 0 occurrences of Customer B customer UUID.
  - 0 occurrences of Customer B license UUIDs, device keys, binding UUIDs, directive UUIDs, or checkin receipt UUIDs.
  - 0 occurrences of `license_key_hmac` or plaintext HMAC secrets.

### 4.3 Audit Logs, Exports, and Error Paths (Step D)
- **Audit Scoping:** Customer-scoped admins (`OWNER`, `ADMIN`, `AUDITOR`) receive only events with `ae.license_id` matching a license owned by `auth.customerId`.
- **Ambiguous Event Exclusion:** Device-only audit events (`license_id IS NULL`, `device_key_id` populated) cannot be authoritatively resolved to a single tenant when devices are shared across time. These events are strictly excluded from customer-scoped `/audit` query results in SQL.
- **Role Parity on Audit:** `SUPPORT` is intentionally denied access to `/audit` (`403 ADMIN_FORBIDDEN`) under the established RBAC policy. Global audit access is reserved for `SYSTEM` (`ADMIN_API_TOKEN`).
- **Unexposed Export Routes:** Verified that probing non-existent export endpoints (`/export/customers`, `/export/licenses`, `/export/audit`, `/export/devices`, `/bindings`, `/lifecycle/requests`, `/dashboard/charts`, `/admin-users`) cleanly returns router 404 without leaking server errors or database information.
- **Error Payloads:** Cross-customer probes consistently return standardized 404 payloads (`{ "error": "NOT_FOUND", "message": "..." }`) with zero leakage of SQL queries, table names, or internal stack traces.

---

## 5. Device Telemetry Policy (`last_seen_at`) — Analysis & Status (Step F)

### 5.1 Meaning & Implementation
- `devices.last_seen_at` is a hardware-level `TIMESTAMPTZ` column updated on the physical `devices` table during POS device runtime check-ins (`/v1/checkin`) and activations (`/v1/activation`).
- It is returned in serialized responses for `GET /devices` and `GET /devices/:id`.

### 5.2 Cross-Tenant Exposure Analysis
- **Scenario:** Device $D$ was bound to Customer A in January. In February, the binding was deactivated, and Device $D$ was reassigned to Customer B.
- **Visibility:** Under the established historical visibility policy (Step 1 & Step 4A), Customer A retains read access to Device $D$ because Customer A holds historical bindings to it.
- **Telemetry Update:** When Customer B's POS terminal executes a runtime check-in today, `devices.last_seen_at` updates to the current timestamp.
- **Observation:** When Customer A queries `GET /devices/D`, Customer A observes that `last_seen_at` was updated today. Customer A can infer that the physical device is currently active, even though Customer A's binding was deactivated.
- **Data Not Leaked:** No Customer B identifiers, license keys, customer names, or binding IDs are disclosed to Customer A. Only the hardware activity timestamp is visible.

### 5.3 Policy Decision & Required Next Steps
- Current repository documentation and product requirements do not define whether physical hardware telemetry is an intended shared-hardware property or whether tenants should only see tenant-scoped telemetry (e.g. `binding_last_seen_at` derived from `runtime_checkins.checked_in_at`).
- **Resolution:** As mandated by the Step 4C instructions, this policy cannot be unilaterally invented without business authorization.
- **Formal Status:** **`LAST_SEEN_AT_POLICY = UNRESOLVED`**.
- **Required Decision for Step 5 / Production:** Product management must decide between:
  1. *Accepting physical telemetry:* Explicitly document that `devices.last_seen_at` represents physical hardware health across all historical assignees.
  2. *Tenant-scoped telemetry:* Replace `last_seen_at` on customer-scoped views with the maximum `checked_in_at` timestamp from the tenant's own historical `runtime_checkins`.

---

## 6. Full Regression & Build Validation Results (Step H)

Every test suite was executed against the active local environment. Actual test counts and execution status:

| Suite Name | Execution Command | Result | Tests Passed / Total | Notes |
|------------|-------------------|--------|----------------------|-------|
| **Cross-Surface Tenant Leakage** | `npx vitest run tests/integration/phase3c-cross-surface-tenant-leakage.test.ts` | **PASS** | **52 / 52** | Primary Step 4C adversarial suite |
| **Read-Path IDOR (Step 4A)** | `npx vitest run tests/integration/phase3c-read-idor.test.ts` | **PASS** | **69 / 69** | Read-path IDOR baseline |
| **Mutation-Path IDOR (Step 4B)** | `npx vitest run tests/integration/phase3c-mutation-idor.test.ts` | **PASS** | **46 / 46** | Mutation-path IDOR baseline |
| **Resource Isolation (Step 3)** | `npx vitest run tests/integration/phase3c-resource-isolation.test.ts` | **PASS** | **43 / 43** | Resource isolation baseline |
| **Scope Foundation Hardening (Step 2.1)** | `npx vitest run tests/integration/phase3c-step2-1-hardening.test.ts` | **PASS** | **30 / 30** | One-customer-per-admin & sentinel checks |
| **Customer Scope Foundation (Step 2)** | `npx vitest run tests/integration/phase3c-customer-scope.test.ts` | **PASS** | **13 / 13** | Role/scope mapping tests |
| **Device Backend RBAC** | `npx vitest run tests/integration/device-backend-rbac.test.ts` | **PASS** | **29 / 29** | RBAC matrix on device endpoints |
| **Device AAL2 / MFA** | `npx vitest run tests/integration/device-aal2.test.ts` | **PASS** | **13 / 13** | Synthetic AAL2 enforcement |
| **Admin UI Component Tests** | `cd admin-ui && npm test` | **PASS** | **31 / 31** | Vitest UI suite across Customers, Devices, Licenses |
| **Deno Edge Function Regression** | `~/.deno/bin/deno test --allow-all --no-check --env-file=supabase/.env.local supabase/functions/tests/` | **PASS** | **2 / 2** | Savepoint & checkin rollback regression |
| **Root TypeScript Check** | `npx tsc --noEmit` | **PASS** | **0 errors** | Desktop client clean |
| **Admin UI TypeScript Check** | `cd admin-ui && npx tsc -b` | **PASS** | **0 errors** | Admin UI clean |
| **Desktop Production Build** | `npm run build` | **PASS** | **Built in 1.96s** | Vite + electron bundles generated |
| **Admin UI Production Build** | `cd admin-ui && npm run build` | **PASS** | **Built in 298ms** | Vite production bundle generated |

**Total Integration & Regression Tests Verified:** **328 passed / 328 run** (plus 0 TypeScript errors and 2 successful production builds).

---

## 7. Known Exclusions, Remaining Risks & Limitations

1. **Hosted QA Environment:**
   - **Status:** `NOT TESTED`.
   - All tests were executed against local Supabase containers (`127.0.0.1:54321` and `127.0.0.1:54322`). Hosted QA infrastructure, network latency, multi-region replication, and hosted Supabase Kong configurations have not been certified.
2. **Real Supabase TOTP / MFA:**
   - **Status:** `NOT VERIFIED`.
   - Tests utilized `SYNTHETIC_QA_AAL2` signed HMAC tokens to simulate AAL2 authentication context against Edge Function middleware. Real enrollment, QR code scanning, and TOTP challenge/verify flows via Supabase Auth require hosted QA verification.
3. **Production Deployment:**
   - **Status:** `NOT CERTIFIED`.
   - Production deployment certification must not be claimed until hosted QA certification and real TOTP verification are completed.
4. **Device Telemetry Policy:**
   - **Status:** `UNRESOLVED`.
   - Hardware `last_seen_at` is visible to historical assignees of reassigned devices.

---

## 8. Final Certification Decision

In accordance with Section 12 Certification Rules:

### **OUTCOME: PASS WITH LIMITATIONS**

- **In-Scope Tested Local Surfaces:** **PASS**  
  All 23 endpoints, dashboard aggregates, nested objects, audit logs, error pathways, and unexposed routes demonstrate strict parameterized SQL tenant isolation and non-enumerating error behavior.
- **Limitations:**
  1. `LAST_SEEN_AT_POLICY = UNRESOLVED` (device hardware telemetry visible across historical assignees).
  2. `HOSTED_QA = NOT TESTED` (certified strictly on local Supabase Edge Functions and PostgreSQL).
  3. `REAL_MFA_TOTP = NOT VERIFIED` (verified using local `SYNTHETIC_QA_AAL2` test tokens).
  4. `PRODUCTION = NOT CERTIFIED`.
