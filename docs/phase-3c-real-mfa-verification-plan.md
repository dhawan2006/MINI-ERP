# Phase 3C — Real Supabase MFA / TOTP Verification Plan

**Target Feature:** Multi-Factor Authentication (AAL2 Enforcement) on Sensitive Admin Mutations  
**Status:** **READY FOR EXECUTION IN HOSTED QA**  
**Local Test Distinction:** Local automated tests used `SYNTHETIC_QA_AAL2` (HMAC-signed test tokens). This plan governs real Supabase Auth TOTP verification.  
**Auditor:** Senior Application Security & Multi-Tenant Authorization Engineer  
**Date:** 2026-10-27  

---

## 1. Objective

To provide an exhaustive, step-by-step verification protocol for testing real, end-to-end Supabase Auth Multi-Factor Authentication (TOTP / AAL2) against the Mini POS Admin Platform in the Hosted QA environment.

This plan verifies that:
1. Real TOTP enrollment, secret generation, and verification function correctly via Supabase Auth.
2. Authenticators step up sessions from `aal1` to `aal2`.
3. Sensitive Admin API mutations strictly enforce `aal2` on the server and reject `aal1` sessions with `403 MFA_REQUIRED`.
4. AAL2 elevation cannot bypass Role-Based Access Control (RBAC) or tenant isolation boundaries.
5. The Admin UI properly handles MFA challenges and session renewal.
6. Test accounts can be cleanly decommissioned without leaving orphan credentials.

---

## 2. Server-Side MFA Architecture & Protected Surface

### 2.1 Backend Enforcement (`adminAuth.ts`)
The Edge Function authorization middleware inspects the JWT payload's `aal` claim:
```ts
if (requireMfa) {
  if (aal !== 'aal2') {
    return {
      authorized: false,
      correlationId,
      response: new Response(
        JSON.stringify({ error: 'MFA_REQUIRED', message: 'MFA (AAL2) is required for this operation' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    };
  }
}
```

### 2.2 Sensitive Routes Requiring AAL2
The following 10 routes in `supabase/functions/admin/index.ts` specify `{ requireMfa: true }`:
1. `POST /customers` (Customer creation)
2. `PUT /customers/:id` (Customer update)
3. `POST /licenses` (License generation)
4. `POST /directives` (Runtime directive creation)
5. `POST /directives/:id/cancel` (Directive cancellation)
6. `POST /lifecycle/release-binding` (Device binding release)
7. `POST /lifecycle/revoke-license` (License revocation)
8. `POST /lifecycle/restore-license` (License restoration)
9. `POST /lifecycle/disable-license` (License disablement)
10. `POST /lifecycle/extend-license` (License validity extension)

---

## 3. Step-by-Step Verification Protocol

### Step 1: Provision QA Test Admin Identities
Create distinct test users in the hosted Supabase Auth instance with assigned `admin_roles`:
- `test-owner-mfa@qa.minipos.invalid` (Role: `OWNER`, assigned to Customer A)
- `test-auditor-mfa@qa.minipos.invalid` (Role: `AUDITOR`, assigned to Customer A)

### Step 2: Establish Baseline AAL1 Session
1. Authenticate using password:
   ```ts
   const { data: signIn, error } = await supabase.auth.signInWithPassword({
     email: 'test-owner-mfa@qa.minipos.invalid',
     password: 'SecurePassword123!'
   });
   ```
2. Inspect session token payload:
   - Verify `payload.aal === 'aal1'`.
   - Verify `payload.amr === [{ method: 'password' }]`.

### Step 3: Verify AAL1 Rejection on Protected Mutations (Negative Test)
1. Attempt to execute a sensitive mutation (e.g. `POST /lifecycle/release-binding`):
   ```http
   POST /functions/v1/admin/lifecycle/release-binding
   Authorization: Bearer <aal1_token>
   Content-Type: application/json
   X-Idempotency-Key: <uuid>

   { "licenseId": "<licenseA>", "deviceKeyId": "<deviceA>", "reason": "Test" }
   ```
2. **Expected Response:**
   - Status: `403 Forbidden`
   - Body: `{"error": "MFA_REQUIRED", "message": "MFA (AAL2) is required for this operation"}`
3. **Database Verification:**
   - Query `license_bindings`: Confirm binding status remains `ACTIVE`.
   - Query `audit_events`: Confirm zero mutation audit events emitted.

### Step 4: Real TOTP Factor Enrollment
1. Initiate enrollment using Supabase Auth SDK:
   ```ts
   const { data: factor, error: enrollError } = await supabase.auth.mfa.enroll({
     factorType: 'totp',
     friendlyName: 'QA Test Authenticator'
   });
   ```
2. Extract enrollment parameters:
   - `factor.id` (UUID identifying the authenticator factor).
   - `factor.totp.secret` (Base32 shared secret key).
   - `factor.totp.qr_code` (SVG QR code for mobile scanner).
3. Register secret in an authenticator client (e.g. `otplib` or Google Authenticator):
   ```ts
   import { authenticator } from 'otplib';
   const otpCode = authenticator.generate(factor.totp.secret);
   ```

### Step 5: Challenge and Verify Factor (Step-Up to AAL2)
1. Create verification challenge:
   ```ts
   const { data: challenge, error: chalErr } = await supabase.auth.mfa.challenge({
     factorId: factor.id
   });
   ```
2. Verify with time-based OTP code:
   ```ts
   const { data: verify, error: verifyErr } = await supabase.auth.mfa.verify({
     factorId: factor.id,
     challengeId: challenge.id,
     code: otpCode
   });
   ```
3. Inspect updated session:
   - Verify `verify.access_token` has `aal === 'aal2'`.
   - Verify `payload.amr` contains both `password` and `totp`.

### Step 6: Verify Authorized Mutation with AAL2 Session (Positive Test)
1. Re-send the sensitive mutation using the new `aal2` access token:
   ```http
   POST /functions/v1/admin/lifecycle/release-binding
   Authorization: Bearer <aal2_token>
   Content-Type: application/json
   X-Idempotency-Key: <new-uuid>

   { "licenseId": "<licenseA>", "deviceKeyId": "<deviceA>", "reason": "Authorized QA test" }
   ```
2. **Expected Response:**
   - Status: `200 OK`
   - Body: `{"status": "SUCCESS"}`
3. **Database Verification:**
   - `license_bindings`: Status transitioned to `DEACTIVATED`.
   - `audit_events`: Legitimate `ADMIN_RELEASE_BINDING` recorded with `admin_id`.

### Step 7: Verify AAL2 Does NOT Override RBAC (Security Invariant)
1. Authenticate `test-auditor-mfa@qa.minipos.invalid` and complete TOTP step-up to `aal2`.
2. Attempt license creation (`POST /licenses`):
   ```http
   POST /functions/v1/admin/licenses
   Authorization: Bearer <auditor_aal2_token>
   ```
3. **Expected Response:**
   - Status: `403 Forbidden`
   - Body: `{"error": "ADMIN_FORBIDDEN", "message": "Insufficient role for this operation"}`
4. **Conclusion:** MFA step-up satisfies the assurance requirement but does not elevate unauthorized roles.

### Step 8: Token Refresh & Session Expiry Behavior
1. Trigger token refresh:
   ```ts
   const { data: refreshed, error: refErr } = await supabase.auth.refreshSession();
   ```
2. Inspect refreshed token:
   - Verify `refreshed.session.access_token` retains `aal: 'aal2'`.
3. Sign out:
   ```ts
   await supabase.auth.signOut();
   ```
4. Confirm old tokens are invalidated and subsequent API requests return `401 ADMIN_UNAUTHORIZED`.

---

## 4. Admin UI Integration Requirements

Currently, `admin-ui/src/pages/Login.tsx` supports only basic username/password login. To complete production-grade MFA in the UI:

1. **Detection:** When `signInWithPassword` returns, check `supabase.auth.mfa.getAuthenticatorAssuranceLevel()`:
   - If `nextLevel === 'aal2'`, transition UI to an MFA challenge screen.
2. **Modal / Challenge Screen:** Prompt user for 6-digit TOTP code.
3. **Verification:** Call `supabase.auth.mfa.challengeAndVerify({ factorId, code })`.
4. **State Update:** Store the upgraded session in `useAuthStore` before rendering protected routes.

---

## 5. Test Account Decommissioning & Cleanup

To maintain QA environment hygiene after running real MFA verification:
1. Unenroll factor:
   ```ts
   await supabase.auth.mfa.unenroll({ factorId: factor.id });
   ```
2. Delete QA test admin database roles:
   ```sql
   DELETE FROM admin_roles WHERE admin_id IN ('<owner-id>', '<auditor-id>');
   ```
3. Delete Auth identities:
   ```ts
   await adminClient.auth.admin.deleteUser('<owner-id>');
   await adminClient.auth.admin.deleteUser('<auditor-id>');
   ```
4. Verify no orphan factors or identities remain in `auth.mfa_factors` or `auth.users`.
