# Phase 3C Customer Boundary Security Model

## 1. Objective
Determine exactly what constitutes a Customer boundary, map every protected Admin resource to a Customer, and define the canonical authorization predicates. This document serves as the source of truth for Phase 3C IDOR and multi-tenancy isolation implementation and testing.

## 2. Current Schema
Based on inspection of current migrations (`20240101000000_initial_schema.sql`, `20261003000000_runtime_checkin_schema.sql`):

- **`customers`**: PK `id`. Timestamps `created_at`, `updated_at`.
- **`licenses`**: PK `id`. FK `customer_id` -> `customers(id)`. Unique `license_key_hmac`.
- **`devices`**: PK `device_key_id`. No `customer_id`. Fields: `public_key`, `status`, `last_seen_at`.
- **`license_bindings`**: PK `id`. FK `license_id`, `device_key_id`. Status (`ACTIVE`, `DEACTIVATED`).
- **`runtime_checkins`** & **`requests`**: FK to `binding_id` / `license_id` / `device_key_id`.
- **`runtime_directives`**: FK `target_binding_id`.
- **`lifecycle_requests`**: FK `license_id`, `device_key_id`.
- **`audit_events`**: FK `license_id`, `device_key_id`.
- **`admin_roles`**: PK `admin_id`. Fields: `role`. **CRITICAL FINDING: No `customer_id` exists in this table. All roles are currently global.**

## 3. Resource Ownership Matrix

| Resource | Customer Scoped? | Ownership Source | Cross-Customer Access |
|----------|------------------|------------------|-----------------------|
| Customer | YES | `id` | DENIED |
| License | YES | `customer_id` | DENIED |
| Device | YES (Derived) | `license_bindings` -> `license_id` | DENIED (See §5) |
| Binding | YES (Derived) | `license_id` -> `customer_id` | DENIED |
| Check-in | YES (Derived) | `binding_id` -> `license_id` -> `customer_id` | DENIED |
| Directive | YES (Derived) | `target_binding_id` -> `license_id` | DENIED |
| Lifecycle Request | YES (Derived) | `license_id` -> `customer_id` | DENIED |
| Audit Event | YES (Derived) | `license_id` -> `customer_id` | DENIED |

## 4. Customer Scope Model
The canonical ownership predicate for a Customer Administrator is:
`resource.customer_id = auth.customer_id`

Since resources like `license_bindings` and `audit_events` do not contain a direct `customer_id`, the predicate must explicitly join or traverse through the `licenses` table to resolve the Customer boundary.

## 5. Device Ownership Model (Decision D-Variant)
Because a physical Device (`device_key_id`) can be repurposed, Device ownership is volatile.

- **Case A (Device has exactly one ACTIVE binding to Customer A):** The Device is considered owned by Customer A. Customer A can view the Device and execute mutations (like Release Binding).
- **Case B (Device has no active binding but historical binding to Customer A):** Customer A retains read-only visibility of the Device metadata to view historical bindings. Mutations are blocked.
- **Case C (Device has moved from Customer A to Customer B):** Customer B holds the ACTIVE binding and owns the Device. Customer B sees NO historical bindings belonging to Customer A. Customer A retains read-only visibility but sees NO active/historical bindings belonging to Customer B.

## 6. Historical Binding Semantics
Bindings represent an immutable historical record of a License-to-Device association. 
**Rule:** When retrieving Device details (`GET /v1/admin/devices/:id`), the backend MUST dynamically filter the returned `bindings` array to ONLY include bindings where `licenses.customer_id = auth.customer_id`.

## 7. Admin Role Scope
**Current Finding:** The `admin_roles` table lacks a `customer_id` column, rendering all admins globally scoped at the database level.
**Phase 3C Requirement:** Customer isolation is impossible if all admins are global. The architecture MUST differentiate between:
1. **Customer-Scoped Roles (`OWNER`, `ADMIN`, `FINANCE`, `AUDITOR`)**: Must be constrained to a specific `customer_id`.
2. **Global Roles (`SUPPORT`, `SYSTEM`)**: Represent the platform vendor and have legitimate cross-customer administrative capabilities (`GLOBAL_ACCESS_ALLOWED`).

## 8. Cross-Customer IDOR Threat Model
- **Scenario 1:** Customer A admin requests Customer B license by ID. **Expected:** 404 NOT FOUND (DENY).
- **Scenario 2:** Customer A admin requests Customer B device by `device_key_id` (where A has no history). **Expected:** 404 NOT FOUND (DENY).
- **Scenario 3:** Customer A admin searches Devices using a value associated with Customer B. **Expected:** No Customer B data returned.
- **Scenario 4:** Customer A admin attempts Release Binding against Customer B Device. **Expected:** 404 NOT FOUND (DENY).
- **Scenario 5:** Customer A admin uses a known Customer B binding ID. **Expected:** 404 NOT FOUND (DENY).
- **Scenario 6:** Customer A admin supplies Customer B `license_id` + Customer A `device_key_id`. **Expected:** 404 NOT FOUND (DENY).
- **Scenario 7:** Customer B administrator views a Device that previously belonged to Customer A. **Expected:** Allowed, but all Customer A historical bindings and data are strictly redacted.

## 9. List/Search/Count Leakage Risks
**Current Implementation Leak:** `GET /v1/admin/devices` (in `AdminDeviceService.listDevices`) performs a raw `SELECT * FROM devices` without any customer predicate.
This leaks total device counts, search results, and metadata across all customers.
**Fix:** Collection endpoints, aggregates, and pagination metadata MUST append `WHERE` clauses restricting results to resources derived from the authenticated admin's `customer_id`.

## 10. Mutation Authorization Model
Mutations (`Release Binding`, `Revoke License`, `Check-in`) MUST enforce a `SELECT ... FOR UPDATE` that explicitly includes a `customer_id` ownership constraint in the `WHERE` clause before applying the update.

## 11. Audit Context
`audit_events` stores `license_id` and `device_key_id`. Customer scope must be derived via `license_id -> licenses.customer_id`. Queries for audit logs must filter out events where the license belongs to another customer.

## 12. Required Server-Side Authorization Predicates
For Customer-Scoped admins, all `SELECT` and `UPDATE` queries must wrap target resources:
```sql
-- License Access
WHERE id = ${licenseId} AND customer_id = ${auth.customer_id}

-- Binding Access
WHERE id = ${bindingId} AND license_id IN (SELECT id FROM licenses WHERE customer_id = ${auth.customer_id})

-- Device Access
WHERE device_key_id IN (
  SELECT device_key_id FROM license_bindings 
  JOIN licenses ON licenses.id = license_bindings.license_id 
  WHERE licenses.customer_id = ${auth.customer_id}
)
```

## 13. Security Decisions
- **Decision 1 (Device Ownership):** Device visibility is granted if the Customer has ANY binding (historical or active) to the device. Cross-customer bindings are strictly redacted.
- **Decision 2 (Admin Scope):** `admin_roles` must be enhanced or a new mechanism established to map standard admins to a `customer_id`, while reserving `SUPPORT`/`SYSTEM` as `GLOBAL_ACCESS_ALLOWED`.
- **Decision 3 (Negative Access):** Unauthorized or cross-customer resources MUST return `404 NOT_FOUND` rather than `403 FORBIDDEN` to prevent resource existence enumeration.

## 14. Unresolved Questions
- **Schema Update:** Do we alter `admin_roles` to add `customer_id UUID REFERENCES customers(id)`, or use an external mapping mechanism (e.g., Supabase `auth.users.raw_app_meta_data`)?
- **Global Leakage on Shared Devices:** If Customer A and B share device history, does Customer A seeing `last_seen_at` updating in real-time constitute a security risk? If so, `last_seen_at` might need to be scoped to the `license_bindings` or decoupled.

## 15. Phase 3C Test Plan
1. Stand up Multi-Tenant Fixtures (Customer A, Customer B, Global Support).
2. Execute IDOR Threat Model Scenarios 1-7 via integration tests.
3. Certify that List endpoints accurately paginate only Customer-owned records.
4. Verify `404 NOT FOUND` negative rules.
