# Phase 3C Step 3 — Server-Side Resource Isolation

## 1. Objective

The objective of Phase 3C Step 3 is to implement comprehensive server-side customer isolation across all existing Admin backend resources. The tenant security boundary exists strictly on the server: client-supplied headers, query parameters, body fields, or UI state can never dictate or override tenant authorization.

Customer-scoped roles (`OWNER`, `ADMIN`, `FINANCE`, `AUDITOR`) are strictly confined to their own customer tenant. Global roles (`SUPPORT` and `SYSTEM`) retain global operational access without restriction. Cross-customer resource access attempts return `404 NOT_FOUND` to prevent resource enumeration attacks.

---

## 2. Authorization Flow

Every request to the Admin API adheres to the following server-enforced sequence:

```
Request
  ↓
Authenticate (JWT / SYSTEM API Token)
  ↓
Resolve Admin Membership & Customer Scope from DB (admin_roles table)
  ↓
Determine Scope: GLOBAL vs CUSTOMER
  ↓
Construct Server-Side SQL Ownership Predicate
  ↓
Execute Parameterized SQL Query (Filtering in DB engine BEFORE aggregation/pagination)
  ↓
Return Authorized Scoped Result (or 404 NOT_FOUND if resource not in tenant scope)
```

At no point are records queried globally and subsequently filtered in application memory or TypeScript.

---

## 3. Customer Filtering

### Endpoints
- `GET /admin/customers`
- `GET /admin/customers/:id`
- `PUT /admin/customers/:id`
- `POST /admin/customers`

### Server Implementation (`AdminCustomerService.ts`)
- **Detail (`GET /admin/customers/:id`)**:
  - CUSTOMER-scoped predicate: `WHERE id = ${id} AND id = ${auth.customerId} AND is_sentinel = FALSE`
  - Cross-customer access attempt: returns `404 NOT_FOUND` (`CUSTOMER_NOT_FOUND`).
- **List (`GET /admin/customers`)**:
  - Scoped predicate: `WHERE id = ${auth.customerId} AND is_sentinel = FALSE`.
  - Search filter operates strictly within this single authorized row.
  - Returns `meta.total = 1` (or 0 if search does not match). Never discloses other customers or aggregate counts.
- **Update (`PUT /admin/customers/:id`)**:
  - Pre-mutation ownership verification: `auth.customerId === id`. Cross-customer attempt returns `404`.
- **Global Roles (`SUPPORT` / `SYSTEM`)**:
  - Returns all non-sentinel customers.

---

## 4. License Isolation

### Endpoints
- `GET /admin/licenses`
- `GET /admin/licenses/:id`
- `POST /admin/licenses`

### Server Implementation (`AdminLicenseService.ts`)
- **Detail (`GET /admin/licenses/:id`)**:
  - Predicate: `JOIN customers c ON c.id = l.customer_id WHERE l.id = ${id} AND l.customer_id = ${auth.customerId} AND c.is_sentinel = FALSE`.
  - Cross-customer access returns `404 NOT_FOUND` (`LICENSE_NOT_FOUND`).
- **List (`GET /admin/licenses`)**:
  - Predicate: `JOIN customers c ON c.id = l.customer_id WHERE l.customer_id = ${auth.customerId} AND c.is_sentinel = FALSE`.
  - Count query mirrors the exact predicate. No foreign license counts are leaked.
- **Create (`POST /admin/licenses`)**:
  - Scoped admins: if `customer_id` is supplied in the request body and differs from `auth.customerId`, the server immediately rejects the request with `403 FORBIDDEN` (`CUSTOMER_MISMATCH_FORBIDDEN`). It does not silently redirect.
  - If omitted by a scoped admin, it defaults to `auth.customerId`.
  - Global roles (`SYSTEM`) can specify explicit non-sentinel customer IDs.

---

## 5. Device Isolation

### Endpoints
- `GET /admin/devices`
- `GET /admin/devices/:id`

### Server Implementation (`AdminDeviceService.ts`)
- **Ownership Model**:
  Devices do not carry a direct `customer_id` column. A customer has visibility over a device if ANY license binding (active OR historical) for that device is linked to a license belonging to that customer:
  `device → license_bindings → licenses → customer_id`
- **List Predicate (`GET /admin/devices`)**:
  Executed via SQL `EXISTS` subquery:
  ```sql
  SELECT DISTINCT d.device_key_id, d.status, d.created_at, d.last_seen_at
  FROM devices d
  WHERE EXISTS (
    SELECT 1
    FROM license_bindings lb
    JOIN licenses l ON l.id = lb.license_id
    WHERE lb.device_key_id = d.device_key_id
      AND l.customer_id = ${scopedId}
  )
  ORDER BY d.last_seen_at DESC NULLS LAST
  LIMIT ${limit} OFFSET ${offset}
  ```
  The count query utilizes the identical `EXISTS` subquery.
- **Detail Predicate (`GET /admin/devices/:id`)**:
  If the calling customer has no historical or current binding for the device, the query returns 0 rows, throwing `DEVICE_NOT_FOUND` (`404 NOT_FOUND`).

---

## 6. Historical Binding Redaction

When a physical device is reassigned across customers (e.g., Device X had Binding 1 with Customer A [now deactivated] and currently has Binding 2 with Customer B [active]):

### Redaction Policy (`AdminDeviceService.getDevice`)
- Both Customer A and Customer B can view the device metadata because both have historical/current relationships.
- However, the returned nested `bindings` array is strictly redacted in SQL:
  ```sql
  SELECT lb.id, lb.license_id, lb.status, lb.activated_at, lb.deactivated_at
  FROM license_bindings lb
  JOIN licenses l ON l.id = lb.license_id
  WHERE lb.device_key_id = ${deviceKeyId}
    AND l.customer_id = ${scopedId}
  ORDER BY lb.activated_at DESC
  ```
- **Customer A response**: Contains ONLY Customer A bindings (Binding 1). Customer B's binding (Binding 2), license ID, and status are completely hidden.
- **Customer B response**: Contains ONLY Customer B bindings (Binding 2). Customer A's historical bindings are completely hidden.
- **Global SUPPORT response**: Contains all bindings (Binding 1 and Binding 2).

### Last Seen At Policy
- `LAST_SEEN_AT_POLICY = DEFERRED`: Device-level physical telemetry reflects the physical device state without disclosing tenant-specific business data. No customer-identifying data is exposed.

---

## 7. Binding Isolation

### Status
- **Collection / Detail Endpoints**: `NOT CURRENTLY ADMIN-EXPOSED`. No standalone `GET /admin/bindings` or `GET /admin/bindings/:id` endpoints exist in the Admin API.
- **Binding Check-in Status (`GET /admin/bindings/:id/checkin`)**:
  - Implemented in `AdminCheckinService.getBindingCheckinStatus`.
  - For customer-scoped admins, verifies `lb.id = ${bindingId} AND l.customer_id = ${scopedId}`. If the binding belongs to another customer, returns `null` (200 empty / 404 semantics), preventing existence enumeration.

---

## 8. Lifecycle Request Isolation

### Status
- `NOT CURRENTLY ADMIN-EXPOSED`.
- The `lifecycle_requests` table is utilized by the client deactivation protocol (`/v1/lifecycle/deactivation`). No admin-facing collection endpoint exists.
- Lifecycle mutations (`/admin/lifecycle/*`) operate on bindings and licenses and are fully isolated (see Section 15 below).

---

## 9. Runtime Check-in Isolation

### Endpoints
- `GET /admin/checkins`
- `GET /admin/bindings/:id/checkin`

### Server Implementation (`AdminCheckinService.ts`)
- **Ownership Chain**:
  `runtime_checkins → binding_id → license_bindings → license_id → licenses → customer_id`
- **List Predicate (`GET /admin/checkins`)**:
  ```sql
  SELECT c.receipt_id, c.binding_id, c.checked_in_at, c.check_in_valid_until, c.status,
         b.device_key_id, b.license_id
  FROM runtime_checkins c
  JOIN license_bindings b ON b.id = c.binding_id
  JOIN licenses l ON l.id = b.license_id
  WHERE l.customer_id = ${scopedId}
  ORDER BY c.checked_in_at DESC
  LIMIT ${limit} OFFSET ${offset}
  ```
- Count query utilizes the identical two-join predicate. Foreign customer check-ins and counts are never returned.

---

## 10. Runtime Directive Isolation

### Endpoints
- `GET /admin/directives`
- `POST /admin/directives`
- `POST /admin/directives/:id/cancel`

### Server Implementation (`AdminDirectiveService.ts`)
- **List (`GET /admin/directives`)**:
  - Scoped via join: `runtime_directives → target_binding_id → license_bindings → licenses → customer_id`.
  - Filter: `l.customer_id = ${scopedId}`.
- **Create (`POST /admin/directives`)**:
  - Pre-insert verification: checks that `target_binding_id` resolves to a license owned by `auth.customerId`.
  - Targeting another customer's binding throws `BINDING_NOT_FOUND` -> returns `404 NOT_FOUND`.
- **Cancel (`POST /admin/directives/:id/cancel`)**:
  - Update predicate incorporates `JOIN licenses l ON l.id = lb.license_id WHERE l.customer_id = ${scopedId}`.
  - Attempting to cancel another customer's directive throws `DIRECTIVE_NOT_FOUND_OR_NOT_PENDING` -> returns `404 NOT_FOUND`.

---

## 11. Audit Isolation

### Endpoints
- `GET /admin/audit`

### Server Implementation (`AdminAuditService.ts`)
- **Ownership Strategy**:
  - Scoped via: `audit_events.license_id → licenses.customer_id`.
  - Filter: `JOIN licenses l ON l.id = ae.license_id WHERE l.customer_id = ${scopedId}`.
- **Unresolvable Device-Only Records**:
  - Records where `license_id IS NULL` (such as device-level system audits) cannot be conclusively attributed to a customer. To prevent inference or cross-tenant leaks, they are **strictly excluded** from customer-scoped results.
- **Global Roles**:
  - Programmatic `SYSTEM` tokens retain full global audit log access.

---

## 12. List / Search / Count Isolation

All collection endpoints (`/customers`, `/licenses`, `/devices`, `/checkins`, `/directives`, `/audit`) adhere to strict SQL aggregation isolation:

1. **Filtering Before Pagination**: `WHERE` and `EXISTS` clauses are evaluated in PostgreSQL before `LIMIT` and `OFFSET`.
2. **Synchronized Count Queries**: Total counts (`meta.total`) are calculated using the exact same customer-scoped predicate.
3. **Search In-Scope**: Full-text and identifier search parameters (`?search=`) are scoped with `AND` inside the customer boundary. Searching for foreign IDs or business names returns 0 results with `total = 0`.

---

## 13. Sentinel License Protection

A multi-layered defense-in-depth invariant protects the sentinel customer (`00000000-0000-0000-0000-000000000000`):

1. **Application Layer (`AdminLicenseService.createLicense`)**:
   - Explicit check: `validated.customer_id === UNASSIGNED_SENTINEL` throws `SENTINEL_CUSTOMER_FORBIDDEN` (HTTP `400`).
   - Database lookup verification: queries `SELECT is_sentinel FROM customers WHERE id = ${targetId}` before insert. If `is_sentinel === TRUE`, throws `SENTINEL_CUSTOMER_FORBIDDEN` (HTTP `400`).
   - No silent redirection: attempts to set sentinel customer are immediately rejected, not redirected.
2. **Database Engine Trigger (`trg_license_no_sentinel_customer`)**:
   - Migration `20261005000002_sentinel_license_guard.sql` installs a `BEFORE INSERT` trigger on `licenses`.
   - Any raw SQL attempt to insert a license pointing to an `is_sentinel = TRUE` customer raises exception `P0001: SENTINEL_CUSTOMER_FORBIDDEN`.
   - Invariant verified: no license row, key material, or binding can ever be created for the sentinel customer.

---

## 14. Global Role Preservation

- **SUPPORT Role**: Retains full global access (`GLOBAL_ACCESS_ALLOWED`). Can list, view detail, and inspect devices, licenses, check-ins, and directives across all tenants.
- **SYSTEM Programmatic Token**: Retains global administrative capability without tenant restrictions.
- Neither role is restricted by customer scoping filters.

---

## 15. Query Security & Mutation Review

### Release Binding Foundation (`AdminLifecycleService.releaseBinding`)
- Row-level lock `FOR UPDATE` includes the customer ownership join:
  ```sql
  SELECT lb.id, lb.status
  FROM license_bindings lb
  JOIN licenses l ON l.id = lb.license_id
  WHERE lb.license_id = ${licenseId}
    AND lb.device_key_id = ${deviceKeyId}
    AND l.customer_id = ${scopedId}
  FOR UPDATE
  ```
- **Security Invariant**: Customer scope is evaluated in the initial query before row mutation, state transition, audit logging, or idempotency success.
- If a Customer A admin attempts to release Customer B's active binding (or a binding on a shared device belonging to Customer B), the query returns 0 rows, raising `BINDING_NOT_FOUND` which translates to HTTP `404 NOT_FOUND`.

### SQL Parameterization
- All dynamic values are strictly parameterized via `postgres.js` tagged template literals.
- No string concatenation or unsanitized template interpolation is used anywhere in the query layer.

---

## 16. Test Fixtures

Test suite `tests/integration/phase3c-resource-isolation.test.ts` sets up isolated deterministic fixtures:

- **Customers**:
  - `CUSTOMER_A` (IsoCustA)
  - `CUSTOMER_B` (IsoCustB)
- **Admins**:
  - `OWNER_A`, `ADMIN_A`, `FINANCE_A`, `AUDITOR_A` (assigned to `CUSTOMER_A`)
  - `OWNER_B` (assigned to `CUSTOMER_B`)
  - `SUPPORT` (global role, `customer_id: null`)
- **Licenses**:
  - `LICENSE_A` (`customer_id: CUSTOMER_A`)
  - `LICENSE_B` (`customer_id: CUSTOMER_B`)
- **Devices & Bindings**:
  - `DEVICE_A_ONLY`: Single active binding `BINDING_A` to `LICENSE_A`.
  - `DEVICE_B_ONLY`: Single active binding `BINDING_B` to `LICENSE_B`.
  - `DEVICE_SHARED_REASSIGNED`:
    - `BINDING_SHARED_A`: Historical deactivation linked to `LICENSE_A`.
    - `BINDING_SHARED_B`: Currently active binding linked to `LICENSE_B`.
- **Runtime Check-ins & Directives**:
  - `CHECKIN_A` / `CHECKIN_B`
  - `DIRECTIVE_A` / `DIRECTIVE_B`
- **Audit Records**:
  - `AUDIT_A` (linked to `LICENSE_A`)
  - `AUDIT_B` (linked to `LICENSE_B`)
  - `AUDIT_UNRESOLVED` (device-only, `license_id = NULL`)

---

## 17. Test Results

### Phase 3C Step 3 Suite Execution
```
✓ tests/integration/phase3c-resource-isolation.test.ts (43 tests)
  ✓ 1 — Customer Resource Isolation (5 tests)
  ✓ 2 — License Resource Isolation (7 tests)
  ✓ 3 — Sentinel Customer Protection (3 tests)
  ✓ 4 & 5 — Device Resource & List Isolation (5 tests)
  ✓ 6 — Historical Binding Redaction on Shared Device (3 tests)
  ✓ 7 — License Binding / Checkin Status Resource (2 tests)
  ✓ 8 — Lifecycle Operations & Release Binding Foundation (5 tests)
  ✓ 9 — Runtime Check-ins Isolation (2 tests)
  ✓ 10 — Runtime Directives Isolation (4 tests)
  ✓ 11 — Audit Events Isolation (3 tests)
  ✓ 12 — Role Parity: FINANCE & AUDITOR Customer Scoping (2 tests)
  ✓ 13 — Dashboard Summary Isolation (2 tests)

Test Files  1 passed (1)
Tests       43 passed (43)
```

### Full Integration Regression Execution
```
✓ tests/integration/phase3c-resource-isolation.test.ts (43 tests) - PASS
✓ tests/integration/phase3c-step2-1-hardening.test.ts (30 tests)   - PASS
✓ tests/integration/phase3c-customer-scope.test.ts (13 tests)      - PASS
✓ tests/integration/device-backend-rbac.test.ts (29 tests)        - PASS
✓ tests/integration/device-aal2.test.ts (13 tests)                - PASS

Test Files  5 passed (5)
Tests       128 passed (128)
Duration    22.99s
```

### Build & Compilation Checks
- `npx tsc --noEmit`: PASS (0 errors)
- `npm run build` (Root Client & Electron Main/Preload): PASS
- `npm run build` (`admin-ui`): PASS
- `admin-ui` Vitest Unit Suite: 31 passed (31)

---

## 18. Remaining Risks & Deferred Items

1. **Adversarial IDOR Suite (Phase 3C Step 4)**: While focused positive and negative isolation checks pass, adversarial parameter manipulation and fuzzing are deferred to Step 4.
2. **`last_seen_at` Tenant Semantic**: `LAST_SEEN_AT_POLICY = DEFERRED`. Device-level telemetry is currently returned without per-customer filtering, as approved in the security model.
3. **Production Multi-Tenancy**: Formal multi-tenant certification requires completion of Phase 3C Step 4 and Step 5.

---

## 19. Final Result Matrix

| Resource | Customer Isolation | Server Filter | Cross-Customer Result |
| :--- | :--- | :--- | :--- |
| **Customer** | **PASS** | `WHERE id = auth.customerId AND is_sentinel = FALSE` | `404 NOT_FOUND` |
| **License** | **PASS** | `WHERE l.customer_id = auth.customerId` | `404 NOT_FOUND` |
| **Device** | **PASS** | `WHERE EXISTS (SELECT 1 FROM license_bindings ... WHERE customer_id = ...)` | `404 NOT_FOUND` |
| **Binding** | **PASS** | Redacted in Device Detail / Checkin status verified | `404 NOT_FOUND` / Redacted (`NOT CURRENTLY ADMIN-EXPOSED` as standalone collection) |
| **Lifecycle Request** | **N/A** | Table exists, used by client deactivation API | `NOT CURRENTLY ADMIN-EXPOSED` |
| **Runtime Check-in** | **PASS** | `JOIN license_bindings ... JOIN licenses WHERE l.customer_id = ...` | Excluded from list / Redacted |
| **Runtime Directive** | **PASS** | `JOIN license_bindings ... JOIN licenses WHERE l.customer_id = ...` | `404 NOT_FOUND` on mutation / Excluded from list |
| **Audit Event** | **PASS** | `JOIN licenses l ON l.id = ae.license_id WHERE l.customer_id = ...` | Excluded from list / Unresolvable excluded |

### Additional Security Attributes
- **Sentinel License Creation**: **PASS** (Application 400 + DB Trigger Exception)
- **Device historical binding redaction**: **PASS** (Redacted to caller's customer in SQL)
- **Search isolation**: **PASS** (Search operates strictly within tenant boundary)
- **Pagination isolation**: **PASS** (Offsets/limits applied after tenant predicate)
- **Count isolation**: **PASS** (Aggregate counts use identical tenant filters)
- **SUPPORT global regression**: **PASS** (SUPPORT and SYSTEM access preserved)
- **SQL parameterization**: **PASS** (All queries use parameterized tagged templates)

---

## 20. Certification Decision

```
===============================================================================
CERTIFICATION DECISION:
PHASE 3C STEP 3 = CERTIFIED
===============================================================================
```

*(Note: NOT certified for Full IDOR or Production Multi-Tenancy; those require Phase 3C Step 4+).*
