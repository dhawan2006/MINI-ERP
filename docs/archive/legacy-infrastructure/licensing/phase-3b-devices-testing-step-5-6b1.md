# Phase 3B - Step 5.6B.1: Device Backend RBAC Detail-Path Remediation

## 1. Objective
Investigate and fix an unexpected `500 Internal Server Error` returned when an authorized user queried `GET /v1/admin/devices/:device_key_id` for a nonexistent device. The target was to ensure the error gracefully degrades to `404 Not Found` per the API contract for valid authorized roles, without compromising the `403` or `401` states for unauthorized roles.

## 2. Investigation and Remediation
- **Investigation**: We discovered that `AdminDeviceService.getDevice` properly throws `new Error('DEVICE_NOT_FOUND')` when a device does not exist. However, the global routing error handler inside `supabase/functions/admin/index.ts` was only catching and mapping `CUSTOMER_NOT_FOUND` and `LICENSE_NOT_FOUND` to `404`. Since `DEVICE_NOT_FOUND` was missing from this whitelist, it fell through to the catch-all `500` handler.
- **Remediation**: 
  - Updated `supabase/functions/admin/index.ts` to include `err.message === 'DEVICE_NOT_FOUND'` in the 404 handler block.
  - No authorization boundaries or checks were weakened. The 500 error only occurred *after* RBAC successfully allowed the request, meaning security was never compromised, but the deterministic contract was violated.

## 3. Test Fixture Enhancement
We enhanced `tests/integration/device-backend-rbac.test.ts` to implement strict, deterministic testing:
- **Valid Device Fixture**: Created a `test-valid-device-key-1` with a connected `Fixture Customer`, `ACTIVE` license, and an `ACTIVE` license binding in the `beforeAll` block.
- **Matrix Expansion**: The `DETAIL` tests now explicitly check both:
  - `test-valid-device-key-1` (EXPECT: 200)
  - `test-nonexistent-device-key-999` (EXPECT: 404 for authorized, 403 for FINANCE)
- **Anonymous Test**: Added a `401` test strictly for the DETAIL route without an Authorization header.

## 4. Final Detail-Path Results Matrix

| Role | Existing Device | Nonexistent Device |
|------|------------------|--------------------|
| OWNER | 200 | 404 |
| ADMIN | 200 | 404 |
| SUPPORT | 200 | 404 |
| AUDITOR | 200 | 404 |
| FINANCE | 403 | 403 |
| Anonymous | 401 | 401 |

## 5. Certification Decision
With the unexpected `500` condition eliminated and full verification of the valid vs nonexistent pathways, the **DEVICE BACKEND RBAC is formally CERTIFIED = PASS**.

Release Binding AAL2-positive mutation remains:
**UNVERIFIED / DEFERRED TO STEP 5.6C**

Customer/data boundary remains:
**UNVERIFIED / PHASE 3C**

Real production MFA remains:
**UNVERIFIED**
