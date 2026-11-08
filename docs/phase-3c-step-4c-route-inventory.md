# Phase 3C — Step 4C: Admin API Route Inventory

**Target Environment:** Local Supabase Edge Functions (`http://127.0.0.1:54321/functions/v1/admin`) & Local PostgreSQL (`127.0.0.1:54322`)  
**Router Base Path:** `/admin` (Entrypoint: `supabase/functions/admin/index.ts`)  
**Scope Model:** Phase 3C Customer-Scoped Admin Identity & Resource Isolation (`OWNER`, `ADMIN`, `FINANCE`, `AUDITOR` = `CUSTOMER`; `SUPPORT`, `SYSTEM` = `GLOBAL`)  
**Date:** 2026-10-27  

---

## 1. Executive Summary

An exhaustive code audit of `supabase/functions/admin/index.ts`, `supabase/functions/_shared/http/Router.ts`, `supabase/functions/_shared/services/*`, `supabase/migrations/*`, and `admin-ui/src/api/*` was conducted to establish the complete inventory of reachable Admin API endpoints.

A total of **23 routes** are registered on the Admin Edge Function router:
- **17 production routes** (Customer, License, Device, Checkin, Directive, Audit, Dashboard, Identity)
- **5 lifecycle mutation routes** (Release binding, Revoke license, Restore license, Disable license, Extend license)
- **1 test-only route** (`POST /_test/scope-check`, conditionally registered only when `ADMIN_TEST_ROUTES_ENABLED="true"`)

Commonly requested or queried surfaces not present in the code:
- **Exports/Downloads (`GET /export/*`):** `NOT APPLICABLE` — No export endpoints are implemented in the Admin API.
- **Time-series metrics/charts:** `NOT APPLICABLE` — `/dashboard/summary` is the sole dashboard endpoint.
- **Standalone binding list (`GET /bindings`):** `NOT APPLICABLE` — Bindings are accessed only nested under `GET /devices/:id` or via `GET /bindings/:id/checkin`.
- **Lifecycle requests log (`GET /lifecycle/requests`):** `NOT APPLICABLE` — Table exists in schema, but no Admin API route exposes it.
- **Admin user/membership endpoints (`/admin-users`):** `NOT APPLICABLE` — Admin roles are managed via database migrations/seed scripts.

---

## 2. Exhaustive Route Inventory Matrix

| # | HTTP Method & Route | Required Roles | MFA (AAL2) | Data Action | Authoritative Tenant Ownership Model | Filtering Layer | Pagination / Count / Nested Isolation | Global Roles Path | Existing Tests | Initial Result |
|---|---------------------|----------------|------------|-------------|---------------------------------------|-----------------|----------------------------------------|-------------------|----------------|----------------|
| 1 | `GET /customers` | `OWNER`, `ADMIN`, `SUPPORT`, `FINANCE`, `AUDITOR` | No | Read / Search / Paginate | Customer-scoped: `customers.id = auth.customerId AND is_sentinel = FALSE` | Parameterized SQL (`WHERE id = ${scopedId} AND is_sentinel = FALSE`) | Scoped in SQL before limit/offset. Count matches filtered records. Search within own tenant. | Returns all non-sentinel customers | `phase3c-read-idor.test.ts`, `phase3c-resource-isolation.test.ts` | **PASS** |
| 2 | `POST /customers` | `OWNER`, `ADMIN`, `FINANCE` | **Yes** | Mutate (Create customer) | Global customer creation (tenant isolation: creates new tenant record; scoped admin cannot self-associate across tenants) | Service layer + Parameterized SQL insert | N/A (single record created) | Identical execution path | `device-aal2.test.ts`, `phase3c-mutation-idor.test.ts` | **PASS** |
| 3 | `GET /customers/:id` | `OWNER`, `ADMIN`, `SUPPORT`, `FINANCE`, `AUDITOR` | No | Read detail | Customer-scoped: `customers.id = params.id AND customers.id = auth.customerId` | Parameterized SQL. Mismatch yields 404 (`CUSTOMER_NOT_FOUND`) | N/A | Can read any non-sentinel customer | `phase3c-read-idor.test.ts` | **PASS** |
| 4 | `PUT /customers/:id` | `OWNER`, `ADMIN`, `FINANCE` | **Yes** | Mutate (Update customer) | Customer-scoped: `customers.id = params.id AND customers.id = auth.customerId` | Service guard + Parameterized SQL UPDATE with `is_sentinel = FALSE` | N/A | Can update any non-sentinel customer | `phase3c-mutation-idor.test.ts` | **PASS** |
| 5 | `GET /licenses` | `OWNER`, `ADMIN`, `SUPPORT`, `FINANCE`, `AUDITOR` | No | Read / Search / Paginate | Customer-scoped: `licenses.customer_id = auth.customerId` via non-sentinel customer | Parameterized SQL JOIN to `customers` | Total count & list filtered in SQL before limit/offset. UUID & text search isolated. `license_key_hmac` omitted. | Returns all non-sentinel licenses | `phase3c-read-idor.test.ts`, `phase3c-resource-isolation.test.ts` | **PASS** |
| 6 | `POST /licenses` | `OWNER`, `ADMIN`, `FINANCE`, `SYSTEM` | **Yes** | Mutate (Create license) | Customer-scoped: Forced to `auth.customerId`. Body override rejected with 403 `CUSTOMER_MISMATCH_FORBIDDEN`. Sentinel rejected with 400. | Service validation + Parameterized SQL + DB trigger `trg_license_no_sentinel_customer` | N/A | Body `customer_id` honored if valid non-sentinel | `phase3c-mutation-idor.test.ts` | **PASS** |
| 7 | `GET /licenses/:id` | `OWNER`, `ADMIN`, `SUPPORT`, `FINANCE`, `AUDITOR` | No | Read detail | Customer-scoped: `licenses.id = params.id AND licenses.customer_id = auth.customerId` | Parameterized SQL. Mismatch yields 404 (`LICENSE_NOT_FOUND`) | N/A. `license_key_hmac` secret omitted. | Can read any non-sentinel license | `phase3c-read-idor.test.ts` | **PASS** |
| 8 | `GET /devices` | `OWNER`, `ADMIN`, `SUPPORT`, `AUDITOR` | No | Read / Search / Paginate | Customer-scoped: Device has active or historical binding to `auth.customerId` (`EXISTS` subquery) | Parameterized SQL `EXISTS` subquery | Scoped in SQL. Count matches `EXISTS` subquery. Excludes devices with zero tenant bindings. | Returns all devices | `phase3c-read-idor.test.ts`, `phase3c-resource-isolation.test.ts` | **PASS** |
| 9 | `GET /devices/:id` | `OWNER`, `ADMIN`, `SUPPORT`, `AUDITOR` | No | Read detail + Nested bindings | Customer-scoped: Device must have active or historical binding to `auth.customerId`. If none, 404. | Parameterized SQL `EXISTS` check + nested SQL query for `bindings` | Nested `bindings` array filtered in SQL (`l.customer_id = auth.customerId`). Foreign bindings redacted. | Returns device with all historical bindings | `phase3c-read-idor.test.ts`, `phase3c-resource-isolation.test.ts` | **PASS** |
| 10 | `GET /checkins` | `OWNER`, `ADMIN`, `SUPPORT`, `AUDITOR` | No | Read / Paginate | Customer-scoped: `c -> binding_id -> license_id -> customer_id = auth.customerId` | Parameterized SQL JOIN across `license_bindings` and `licenses` | List and count filtered in SQL before limit/offset. Foreign receipts never returned. | Returns all checkins across all tenants | `phase3c-read-idor.test.ts` | **PASS** |
| 11 | `GET /bindings/:id/checkin` | `OWNER`, `ADMIN`, `SUPPORT`, `AUDITOR` | No | Read detail | Customer-scoped: `binding.license_id -> customer_id = auth.customerId` | Parameterized SQL ownership check | Returns `null` (200) if binding does not belong to caller or has no checkins. Non-enumerating. | Returns latest checkin for any binding | `phase3c-resource-isolation.test.ts` | **PASS** |
| 12 | `GET /directives` | `OWNER`, `ADMIN`, `SUPPORT`, `AUDITOR` | No | Read / Paginate | Customer-scoped: `rd -> target_binding_id -> license_id -> customer_id = auth.customerId` | Parameterized SQL JOIN across `license_bindings` and `licenses` | List and count filtered in SQL before limit/offset. Foreign directives never returned. | Returns all directives | `phase3c-read-idor.test.ts` | **PASS** |
| 13 | `POST /directives` | `OWNER`, `ADMIN`, `SUPPORT` | **Yes** | Mutate (Create directive) | Customer-scoped: `target_binding_id` must belong to `auth.customerId` | Parameterized SQL verification query before insert. Mismatch yields 404 (`BINDING_NOT_FOUND`) | N/A | Can target any binding | `phase3c-mutation-idor.test.ts` | **PASS** |
| 14 | `POST /directives/:id/cancel` | `OWNER`, `ADMIN`, `SUPPORT` | **Yes** | Mutate (Cancel directive) | Customer-scoped: `rd.target_binding_id -> license_id -> customer_id = auth.customerId` | Parameterized SQL UPDATE with JOIN to `license_bindings` and `licenses`. Mismatch yields 404 | N/A | Can cancel any pending directive | `phase3c-mutation-idor.test.ts` | **PASS** |
| 15 | `GET /audit` | `OWNER`, `ADMIN`, `AUDITOR`, `SYSTEM` | No | Read / Paginate | Customer-scoped: `ae.license_id -> customer_id = auth.customerId` | Parameterized SQL JOIN to `licenses`. Unresolvable device-only records (`license_id IS NULL`) excluded | List and count strictly filtered in SQL. No foreign or ambiguous event leakage. | Returns all audit events globally | `phase3c-read-idor.test.ts` | **PASS** |
| 16 | `GET /dashboard/summary` | `OWNER`, `ADMIN`, `SUPPORT`, `FINANCE`, `AUDITOR` | No | Aggregate / KPI totals | Customer-scoped: All counts (`total_customers`, `active_licenses`, `revoked_licenses`, `active_bindings`, `recent_checkins`, `overdue_checkins`) filtered by `customer_id = auth.customerId` | Parameterized SQL count queries | Single summary object. Empty tenant sees zeros (total_customers = 1 or 0). No foreign trend leakage. | Returns global totals across all non-sentinel customers | `phase3c-read-idor.test.ts` | **PASS** |
| 17 | `GET /me` | `OWNER`, `ADMIN`, `SUPPORT`, `FINANCE`, `AUDITOR` | No | Read session identity | Caller's authenticated context (`adminId`, `role`, `aal`, `scopeType`, `customerId`) | Server-side verified Supabase Auth JWT + DB query against `admin_roles` | N/A | Returns `scopeType: 'GLOBAL', customerId: null` | `phase3c-resource-isolation.test.ts` | **PASS** |
| 18 | `POST /_test/scope-check` | `OWNER`, `ADMIN`, `SUPPORT`, `FINANCE`, `AUDITOR`, `SYSTEM` | No | Test verification (Test flag only) | Checks `AdminScopeService.assertCustomerAccess(auth, targetCustomerId)` | In-memory assertion service (denies if `auth.customerId !== targetCustomerId`) | N/A. Only registered when `ADMIN_TEST_ROUTES_ENABLED="true"` | Allows cross-customer access for `SUPPORT`/`SYSTEM` | `phase3c-customer-scope.test.ts` | **PASS (Test-Only)** |
| 19 | `POST /lifecycle/release-binding` | `OWNER`, `ADMIN`, `SUPPORT`, `SYSTEM` | **Yes** | Mutate (Release binding) | Customer-scoped: `license_bindings.license_id -> customer_id = auth.customerId` | Parameterized SQL row-lock query (`FOR UPDATE`) with JOIN to `licenses` | N/A. Foreign binding yields 404 `BINDING_NOT_FOUND`. No data mutated; no misleading audit. | Can release any binding globally | `phase3c-mutation-idor.test.ts` (14 cases) | **PASS** |
| 20 | `POST /lifecycle/revoke-license` | `OWNER`, `ADMIN`, `SYSTEM` | **Yes** | Mutate (Revoke license) | Customer-scoped: `licenses.customer_id = auth.customerId` | Parameterized SQL row-lock query (`FOR UPDATE`). Cross-customer yields 404 `LICENSE_NOT_FOUND` | N/A. Cascades deactivation only to caller's license bindings. | Can revoke any license globally | `phase3c-mutation-idor.test.ts` | **PASS** |
| 21 | `POST /lifecycle/restore-license` | `OWNER`, `ADMIN`, `SYSTEM` | **Yes** | Mutate (Restore license) | Customer-scoped: `licenses.customer_id = auth.customerId` | Parameterized SQL row-lock query (`FOR UPDATE`). Cross-customer yields 404 `LICENSE_NOT_FOUND` | N/A | Can restore any disabled license globally | `phase3c-mutation-idor.test.ts` | **PASS** |
| 22 | `POST /lifecycle/disable-license` | `OWNER`, `ADMIN`, `SYSTEM` | **Yes** | Mutate (Disable license) | Customer-scoped: `licenses.customer_id = auth.customerId` | Parameterized SQL row-lock query (`FOR UPDATE`). Cross-customer yields 404 `LICENSE_NOT_FOUND` | N/A | Can disable any active license globally | `phase3c-mutation-idor.test.ts` | **PASS** |
| 23 | `POST /lifecycle/extend-license` | `OWNER`, `ADMIN`, `SYSTEM` | **Yes** | Mutate (Extend license) | Customer-scoped: `licenses.customer_id = auth.customerId` | Parameterized SQL row-lock query (`FOR UPDATE`). Cross-customer yields 404 `LICENSE_NOT_FOUND` | N/A | Can extend any license globally | `phase3c-mutation-idor.test.ts` | **PASS** |

---

## 3. Surfaces Queried but Not Implemented in the Admin API

| Surface Category | Queried Routes / Features | Status in Repository | Justification / Notes |
|------------------|---------------------------|----------------------|-----------------------|
| **Exports & Downloads** | `GET /export/customers`, `GET /export/licenses`, `GET /export/audit`, `GET /export/devices` | **NOT APPLICABLE** | No export or CSV/PDF generator endpoints are registered in the Admin router (`supabase/functions/admin/index.ts`). |
| **Time-Series / Trend Charts** | `GET /dashboard/charts`, `GET /dashboard/time-series` | **NOT APPLICABLE** | `/dashboard/summary` is the only dashboard endpoint. No time-series aggregation query exists in `AdminDashboardService`. |
| **Standalone Binding List** | `GET /bindings`, `GET /license-bindings` | **NOT APPLICABLE** | Bindings cannot be listed as a top-level collection. They are only viewable nested within `GET /devices/:id` or status queried via `GET /bindings/:id/checkin`. |
| **Lifecycle Request History** | `GET /lifecycle/requests` | **NOT APPLICABLE** | `lifecycle_requests` table exists in PostgreSQL schema, but is not exposed via any Admin API route. |
| **Admin Membership Management** | `GET /admin-users`, `POST /admin-users` | **NOT APPLICABLE** | Admin users and roles are managed out-of-band via database migrations and Supabase Auth administrative tools. |
| **Diagnostic / Debug Routes** | `GET /health`, `GET /debug` | **NOT APPLICABLE** | No unauthenticated health or debug route exists; unrecognized paths fall through to router 404. `/_test/scope-check` is gated behind `ADMIN_TEST_ROUTES_ENABLED="true"`. |

---

## 4. Key Cross-Surface Security Invariants

1. **Strict Server-Side Derivation:**
   - For all customer-scoped roles (`OWNER`, `ADMIN`, `FINANCE`, `AUDITOR`), `customerId` is loaded directly from PostgreSQL `admin_roles` where `admin_id = auth.user.id`.
   - Caller-supplied query parameters (e.g., `?customerId=...`) or body fields (e.g., `{ "customer_id": "..." }`) are either strictly ignored, overridden by `auth.customerId`, or rejected with `403 CUSTOMER_MISMATCH_FORBIDDEN`.
2. **Parameterized SQL Filtering:**
   - Every read, list, aggregate, search, and mutation query applies `auth.customerId` in SQL parameters before pagination (`LIMIT`, `OFFSET`), aggregation (`count(*)`), and joins.
3. **Non-Enumerating Error Responses:**
   - Cross-customer individual resource requests for Customers, Licenses, Devices, Directives, and Lifecycle Operations return `404 NOT_FOUND` rather than disclosing resource existence with `403`.
4. **Nested Object & Secret Redaction:**
   - Devices nested `bindings` array filters out any foreign customer bindings in SQL.
   - `license_key_hmac` is never selected or serialized in read endpoints.
   - Audit events without an unambiguous customer license relationship are excluded from customer-scoped audit logs.
5. **Physical Telemetry (`last_seen_at`):**
   - Device `last_seen_at` reflects hardware ping time on the physical device row. On reassigned devices, this timestamp reflects device-level activity. This policy is explicitly tracked and evaluated in the audit report.
