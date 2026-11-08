# Phase 3C Step 2.1 — Customer Scope Foundation Hardening

**Status:** CERTIFIED  
**Date:** 2026-10-05  
**Scope:** Authorization foundation hardening only. Not full IDOR isolation (Phase 3C Step 3).

---

## 1. One-Customer-Per-Admin Enforcement

### Problem Found

The original migration (`20261004195245_customer_admin_scope.sql`) created:

```sql
CREATE UNIQUE INDEX idx_admin_roles_unique_customer
ON admin_roles (admin_id, customer_id)
WHERE customer_id IS NOT NULL;
```

This index prevents the **same** `(admin_id, customer_id)` pair from existing twice (duplicate row), but does **NOT** prevent an admin from holding memberships in two **different** customers (`admin_id=X, customer_id=A` and `admin_id=X, customer_id=B`).

**Probe result:** Multi-customer insert succeeded — confirmed vulnerability.

### Fix Applied

Migration `20261005000001_customer_scope_hardening.sql`:

```sql
-- Drop the insufficient per-pair index
DROP INDEX IF EXISTS idx_admin_roles_unique_customer;

-- Replace with: one scoped membership per admin, period
CREATE UNIQUE INDEX idx_admin_roles_unique_scoped_admin
ON admin_roles (admin_id)
WHERE customer_id IS NOT NULL;
```

This guarantees that a scoped admin can belong to **exactly one customer**. Any attempt to insert a second customer membership for the same admin results in `ERROR 23505` (unique_violation).

### Verified Behaviors

| Scenario | Result |
|---|---|
| Same admin + Customer A (first insert) | ✅ ALLOWED |
| Same admin + Customer A (duplicate same role) | ❌ REJECTED `23505` |
| Same admin + Customer B (different customer) | ❌ REJECTED `23505` |
| Global SUPPORT (NULL customer_id) + duplicate | ❌ REJECTED `23505` |
| Two different admins, same customer | ✅ ALLOWED |

---

## 2. Global Role Enforcement

The `check_admin_role_scope` DB constraint enforces:

| Role | customer_id Required | Constraint |
|---|---|---|
| OWNER | NOT NULL | ✅ Enforced |
| ADMIN | NOT NULL | ✅ Enforced |
| FINANCE | NOT NULL | ✅ Enforced |
| AUDITOR | NOT NULL | ✅ Enforced |
| SUPPORT | NULL | ✅ Enforced |
| SYSTEM | NULL | ✅ (role not used in DB rows) |

The original `admin_roles_role_check` excluded `SYSTEM`. This was also corrected:

```sql
ALTER TABLE admin_roles DROP CONSTRAINT IF EXISTS admin_roles_role_check;
ALTER TABLE admin_roles ADD CONSTRAINT admin_roles_role_check
CHECK (role IN ('OWNER', 'ADMIN', 'SUPPORT', 'FINANCE', 'AUDITOR', 'SYSTEM'));
```

Note: `SYSTEM` identity is exclusively derived from the `ADMIN_API_TOKEN` environment variable via timing-safe comparison in `adminAuth.ts`. No `admin_roles` row is used or required for `SYSTEM` authentication.

---

## 3. UNASSIGNED Customer Handling

### Sentinel Row

The migration uses `00000000-0000-0000-0000-000000000000` as a placeholder for legacy scoped admins without a real customer assignment.

**Risks addressed:**

1. **Could be confused with a real customer** → Fixed: `is_sentinel = TRUE` flag added to the `customers` table. A `check_sentinel_uuid` constraint enforces that only the all-zeros UUID may have `is_sentinel = TRUE`.

2. **Could be queried as a real tenant** → Fixed: `adminAuth.ts` middleware now explicitly checks for the sentinel UUID and returns `403 ADMIN_FORBIDDEN` with message `"Admin role not yet assigned to a customer"` before any route handler executes.

3. **Real customers could receive this ID** → Fixed: Constraint ensures `is_sentinel = FALSE` for all real customers, and only the hardcoded all-zeros UUID can bear `is_sentinel = TRUE`.

4. **Real licenses could be created for the sentinel** → Not a risk. The sentinel customer cannot be a target of Route RBAC after the middleware guard. No application path should route to it.

### Middleware Guard (adminAuth.ts)

```typescript
export const UNASSIGNED_SENTINEL_CUSTOMER_ID = '00000000-0000-0000-0000-000000000000';

// After role resolution...
if (scopeType === 'CUSTOMER' && rawCustomerId === UNASSIGNED_SENTINEL_CUSTOMER_ID) {
  return {
    authorized: false,
    response: new Response(
      JSON.stringify({ error: 'ADMIN_FORBIDDEN', message: 'Admin role not yet assigned to a customer...' }),
      { status: 403 }
    )
  };
}
```

---

## 4. Legacy Admin Audit

Query run against current QA database after `db reset`:

| Metric | Count |
|---|---|
| Total `admin_roles` rows | 94 |
| Global SUPPORT (NULL customer_id) | 23 |
| Global SYSTEM (NULL customer_id) | 0 |
| Customer-scoped roles | 71 |
| Mapped to UNASSIGNED sentinel | 11 |
| Admins with multiple scoped memberships | **0** |
| Mixed global + scoped memberships | **0** |

The 11 UNASSIGNED-sentinel rows are residual test fixtures from pre-hardening test runs. They will be naturally cleaned up on next `db reset`. The middleware guard prevents any of them from obtaining functional authorization.

---

## 5. Test Endpoint Production Isolation

### Mechanism

The `POST /_test/scope-check` endpoint is now conditionally registered:

```typescript
const TEST_ROUTES_ENABLED = Deno.env.get('ADMIN_TEST_ROUTES_ENABLED') === 'true';

if (TEST_ROUTES_ENABLED) {
  router.add('POST', '/_test/scope-check', ...);
}
```

- **Local development** (`supabase/.env.local`): `ADMIN_TEST_ROUTES_ENABLED="true"` — route is registered.
- **Production Supabase secrets**: `ADMIN_TEST_ROUTES_ENABLED` is **absent** — route is not registered. Any request to `/_test/scope-check` returns `404 Not Found`.

### Data Disclosure Control

The endpoint returns **only** `{ status: 'ALLOW' }` or `{ status: 'DENY', reason: '<human message>' }`. It never returns:
- JWT tokens or claims
- DB credentials or connection strings
- Supabase keys
- Internal secrets

Verified by test: the response body only contains keys `status` and optionally `reason`.

### Production Build Verification

The `/_test/scope-check` route string is **NOT present** in:
- `dist/assets/index-*.js` (Vite renderer bundle)
- `dist-electron/main.js` (Electron main process)

The Edge Function source is a Deno runtime artifact, not bundled into the client-side build. In production Supabase deployments, the route is simply not registered.

---

## 6. Server-Derived Customer Context

`customerId` in `adminAuth.ts` is derived **exclusively** from the database:

```typescript
roleResult = await sql`SELECT role, customer_id FROM admin_roles WHERE admin_id = ${user.id} LIMIT 1`;
const rawCustomerId = roleResult[0].customer_id || null;
```

The following client-supplied inputs are **ignored** for scope determination:
- Query parameters (`?customerId=...`)
- Request body fields (`{ customerId: '...', customer_id: '...' }`)
- Custom headers (`X-Customer-Id: ...`)
- JWT claims beyond `sub` (used only for user identification)
- Frontend state (Zustand, localStorage, sessionStorage)

**Tested and confirmed:** All three override vectors return `403 DENY` when a customer-A-scoped admin attempts to supply customer-B's ID via those channels.

---

## 7. Authorization Tests

### Phase 3C Step 2.1 Hardening Suite: 30/30 PASS

| Suite | Tests | Result |
|---|---|---|
| DB Enforcement | 8 | ✅ ALL PASS |
| UNASSIGNED Sentinel Security | 3 | ✅ ALL PASS |
| Test Endpoint Security | 2 | ✅ ALL PASS |
| Client customerId Override Resistance | 4 | ✅ ALL PASS |
| Role/Scope Resolution | 13 | ✅ ALL PASS |

---

## 8. Regression Results

| Suite | Result |
|---|---|
| Phase 3C Step 2.1 Hardening | ✅ 30/30 |
| Phase 3C Step 2 Scope Foundation | ✅ 13/13 |
| Device Backend RBAC (Step 5.6B) | ✅ 29/29 |
| Device AAL2 (Step 5.6C) | ✅ 13/13 |
| PDF Export Integration | ✅ 4/4 |
| Transactions | ✅ 5/5 |
| Restore Concurrency | ✅ 3/3 |
| History | ✅ 4/4 |
| Reliability | ✅ 2/2 |
| IPC | ✅ 3/3 |
| **Total Integration** | **✅ 106/106** |
| TypeScript (`tsc --noEmit`) | ✅ PASS |
| Production Build (`vite build`) | ✅ PASS |

**Note:** The fix to the sentinel middleware guard required updating test fixtures in `device-backend-rbac.test.ts` and `device-aal2.test.ts`. Both now use the real `customerData.id` created in their `beforeAll`, not the sentinel UUID. This is the correct fix — the constraint now enforces what was always the design intent.

---

## 9. Remaining Limitations

1. **Real production MFA/TOTP**: Marked `UNVERIFIED` from Phase 3B. Not addressed here.
2. **UNASSIGNED sentinel rows in QA DB**: 11 legacy rows exist, middleware blocks them. Will be cleaned on next `db reset`.
3. **`is_sentinel` not enforced on license creation**: The customers table now has the flag, but the License creation endpoint does not yet check `is_sentinel = FALSE`. This is a Phase 3C Step 3 concern (resource isolation).
4. **Full IDOR isolation**: Not implemented. This is Phase 3C Step 3.
5. **`last_seen_at` customer visibility**: Remains UNRESOLVED from Phase 3C Step 1 model.

---

## Final Certification Checklist

| Check | Status |
|---|---|
| One-customer-per-scoped-admin is DB-enforced | ✅ PASS |
| Global/scoped role combinations are DB-enforced | ✅ PASS |
| UNASSIGNED sentinel cannot function as real customer | ✅ PASS |
| Test endpoint absent from production (env-gated) | ✅ PASS |
| Test endpoint absent from client build artifacts | ✅ PASS |
| Server derives customer scope independently of client input | ✅ PASS |
| Regression suite passes | ✅ 106/106 |
| TypeScript | ✅ PASS |
| Production build | ✅ PASS |

---

**PHASE 3C CUSTOMER SCOPE FOUNDATION = CERTIFIED**

> Does **NOT** claim: Customer Isolation Certified  
> Does **NOT** claim: IDOR Fixed  
> Those belong to Phase 3C Step 3+.
