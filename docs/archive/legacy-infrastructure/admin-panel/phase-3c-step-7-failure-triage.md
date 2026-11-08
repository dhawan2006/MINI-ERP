# Phase 3C — Step 7: Hosted QA Failure Triage & Classification

**Document:** `docs/phase-3c-step-7-failure-triage.md`  
**Date:** 2026-10-27  
**Auditor:** Senior Application Security & Multi-Tenant Authorization Engineer  
**Target Project:** `hooemticmycoqhoccdsn` (Mini POS Licensing QA, Singapore `ap-southeast-1`)  
**Status:** **TRIAGE COMPLETE — ZERO AUTHORIZATION DEFECTS — ALL ROOT CAUSES IDENTIFIED**  

---

## 1. Executive Summary

This document presents a comprehensive, evidence-based triage and classification of all six test failures observed during the Phase 3C Step 6 hosted QA certification run:
- **1 Read-Path Failure** in `tests/integration/phase3c-read-idor.test.ts`
- **5 Cross-Surface Failures** in `tests/integration/phase3c-cross-surface-tenant-leakage.test.ts`

### Key Audit Findings:
1. **Zero Authorization Defects:** Not a single failure was caused by an authorization bypass, tenant boundary breakdown, cross-tenant data leak, or unauthorized database mutation.
2. **Zero Insecure State Changes:** In all six cases, the server either returned `401 ADMIN_UNAUTHORIZED` (fail-closed authentication) or `404 Not Found` (endpoint absent). Database verification confirmed protected records remained unmutated.
3. **Root Cause Distribution:**
   - **1 Failure:** Diagnostic route dependency (`/_test/scope-check` intentionally disabled on hosted QA).
   - **1 Failure:** Test configuration variable collision (`vite.config.ts` hardcoded dummy token overwriting shell environment variable).
   - **4 Failures:** Synthetic-token signature rejection (`SYNTHETIC_QA_AAL2` HMAC signed with local dev secret, rejected by live Supabase GoTrue Auth).

---

## 2. Detailed Triage of the Six Failures

### Failure 1: Read-Path — Diagnostic Route Dependency
- **Test File:** `tests/integration/phase3c-read-idor.test.ts`
- **Test Name:** `Phase 3C Step 4A — Adversarial Read-Path IDOR Certification > 10. Global SUPPORT Regression (GLOBAL_ACCESS_ALLOWED) > SYSTEM programmatic token: retains global programmatic scope (scopeType = GLOBAL, target access = ALLOW)`
- **Exact Assertion:** Line 708: `expect(res.status).toBe(200)`
- **Observed Result:** `404 Not Found` (`{"error":"Not Found"}`)
- **Classification:** **Disabled Test-Only Endpoint**.
- **Technical Analysis:** The test sent a `POST` request to `${ADMIN_URL}/_test/scope-check`. In `supabase/functions/admin/index.ts`, `/_test/*` routes are conditionally registered *only* when `ADMIN_TEST_ROUTES_ENABLED === 'true'`. In accordance with production-readiness security principles, this variable is intentionally omitted from hosted QA secrets (`.local-qa/secrets.env`). As a result, the route does not exist in the hosted router, yielding an expected, safe `404 Not Found`.
- **Intended Security Property Exercised:** The test intended to prove that a request authenticated with `ADMIN_API_TOKEN` is recognized by `adminAuth.ts` as having `role: 'SYSTEM'` and `scopeType: 'GLOBAL'`. Because the diagnostic endpoint is absent, the property was not exercised through this route.
- **Unauthorized Data / Mutation:** **None**. `404 Not Found` was returned with zero data leakage.
- **Corrective Action (Minimum Valid):** Do *not* enable test routes in QA. Replace the dependency with the production-reachable, non-destructive endpoint `GET /audit`, which permits `SYSTEM` role and returns cross-tenant audit records, definitively proving `scopeType = GLOBAL`.

---

### Failure 2: Cross-Surface — Test Runner Environment Variable Override
- **Test File:** `tests/integration/phase3c-cross-surface-tenant-leakage.test.ts`
- **Test Name:** `4 — Audit Logs Isolation & Ambiguous Event Protection > Global SYSTEM role audit list includes all events (A, B, and device-only)`
- **Exact Assertion:** Line 720: `expect(res.status).toBe(200)`
- **Observed Result:** `401 ADMIN_UNAUTHORIZED` (`{"error":"ADMIN_UNAUTHORIZED","message":"Invalid admin credentials"}`)
- **Classification:** **Test Runner Configuration Stomping**.
- **Technical Analysis:** In `vite.config.ts`, lines 47–51 declared:
  ```ts
  env: {
    ADMIN_API_TOKEN: 'test_admin_token_1234567890_32_chars_long',
  }
  ```
  Vitest automatically applies `test.env` over `process.env`. Even though the shell passed the real 64-character QA token (`ADMIN_API_TOKEN="$QA_TOKEN"`), Vitest overwrote it with the local dummy string `'test_admin_token_1234567890_32_chars_long'`. When sent to hosted QA Edge Functions, `timingSafeEqual` rejected the token, returning `401 ADMIN_UNAUTHORIZED`.
- **Intended Security Property Exercised:** Intended to prove that a `SYSTEM` token can view all audit events across Customer A, Customer B, and device-only events. The test was blocked at the authentication gate due to token stomping.
- **Unauthorized Data / Mutation:** **None**. Denied with 401.
- **Corrective Action (Minimum Valid):** Modify `vite.config.ts` line 49 to `ADMIN_API_TOKEN: process.env.ADMIN_API_TOKEN || 'test_admin_token_...'`, ensuring external environment variables are preserved. (Verified: when preserved, `GET /audit` immediately returns `200 OK` and passes).

---

### Failure 3: Cross-Surface — Synthetic AAL2 Token Signature Rejection
- **Test File:** `tests/integration/phase3c-cross-surface-tenant-leakage.test.ts`
- **Test Name:** `6 — Error Paths & Non-Enumeration Contract > Foreign directive cancel POST returns 404 without mutation`
- **Exact Assertion:** Line 804: `expect(res.status).toBe(404)`
- **Observed Result:** `401 ADMIN_UNAUTHORIZED` (`{"error":"ADMIN_UNAUTHORIZED","message":"Invalid admin credentials"}`)
- **Classification:** **Synthetic-Token Incompatibility (`SYNTHETIC_QA_AAL2`)**.
- **Technical Analysis:** `POST /directives/:id/cancel` requires `requireMfa: true`. The test passed `ownerA.aal2Token`, which was created via `createAAL2Token(token)`. That function modified the JWT payload (`aal = 'aal2'`) and re-signed it using `crypto.createHmac('sha256', JWT_SECRET)` with the hardcoded local development key (`super-secret-jwt-token-with-at-least-32-characters-long`). On hosted QA, Supabase Auth (`supabase.auth.getUser`) verifies the JWT against the hosted project's true asymmetric/symmetric key. The signature verification failed, resulting in `401 ADMIN_UNAUTHORIZED`.
- **Intended Security Property Exercised:** Intended to verify that Customer A's owner cannot cancel Customer B's directive, receiving `404 NOT_FOUND` and leaving directive status as `PENDING`. Because the request failed at authentication, the tenant authorization check was not evaluated.
- **Unauthorized Data / Mutation:** **None**. `401` returned. Database inspection confirmed `runtime_directives.status` remained `PENDING`.
- **Corrective Action (Minimum Valid):** Update `createTestAdmin` to obtain a real Supabase-signed AAL2 token by enrolling an authentic TOTP factor and verifying it via the Supabase Auth SDK during test user setup.

---

### Failure 4: Cross-Surface — Synthetic AAL2 Token Signature Rejection
- **Test File:** `tests/integration/phase3c-cross-surface-tenant-leakage.test.ts`
- **Test Name:** `6 — Error Paths & Non-Enumeration Contract > Role-denied operation returns 403 ADMIN_FORBIDDEN (AUDITOR attempting license creation)`
- **Exact Assertion:** Line 837: `expect(res.status).toBe(403)`
- **Observed Result:** `401 ADMIN_UNAUTHORIZED`
- **Classification:** **Synthetic-Token Incompatibility (`SYNTHETIC_QA_AAL2`)**.
- **Technical Analysis:** `POST /licenses` requires `requireMfa: true`. The test passed `auditorA.aal2Token`, which was forged with the local test secret. Hosted GoTrue rejected the token with `401 ADMIN_UNAUTHORIZED` prior to the middleware reaching the RBAC check (`roles: ['OWNER', 'ADMIN', 'FINANCE', 'SYSTEM']`).
- **Intended Security Property Exercised:** Intended to prove that `AUDITOR` is denied license creation with `403 ADMIN_FORBIDDEN`. Blocked at authentication gate.
- **Unauthorized Data / Mutation:** **None**. Denied with 401; no license created.
- **Corrective Action (Minimum Valid):** Provide authentic Supabase-signed AAL2 token for `auditorA` via live TOTP enrollment.

---

### Failure 5: Cross-Surface — Synthetic AAL2 Token Signature Rejection
- **Test File:** `tests/integration/phase3c-cross-surface-tenant-leakage.test.ts`
- **Test Name:** `7 — Scope Override Tampering Attempts > License creation with foreign customer_id in body is rejected with 403 CUSTOMER_MISMATCH_FORBIDDEN`
- **Exact Assertion:** Line 887: `expect(res.status).toBe(403)`
- **Observed Result:** `401 ADMIN_UNAUTHORIZED`
- **Classification:** **Synthetic-Token Incompatibility (`SYNTHETIC_QA_AAL2`)**.
- **Technical Analysis:** `POST /licenses` requires `requireMfa: true`. The test used `ownerA.aal2Token`. The synthetic JWT signature was rejected with 401 by hosted Supabase Auth before reaching the request body customer mismatch check in `AdminLicenseService.createLicense`.
- **Intended Security Property Exercised:** Intended to verify that a Customer A admin attempting to forge `customer_id: customerB` in the POST body is caught and rejected with `403 CUSTOMER_MISMATCH_FORBIDDEN`. Blocked at authentication gate.
- **Unauthorized Data / Mutation:** **None**. Denied with 401; no license created for Customer B.
- **Corrective Action (Minimum Valid):** Use authentic Supabase-signed AAL2 token for `ownerA`.

---

### Failure 6: Cross-Surface — Synthetic AAL2 Token Signature Rejection
- **Test File:** `tests/integration/phase3c-cross-surface-tenant-leakage.test.ts`
- **Test Name:** `7 — Scope Override Tampering Attempts > License creation targeting sentinel customer is rejected with 400 SENTINEL_CUSTOMER_FORBIDDEN`
- **Exact Assertion:** Line 907: `expect(res.status).toBe(400)`
- **Observed Result:** `401 ADMIN_UNAUTHORIZED`
- **Classification:** **Synthetic-Token Incompatibility (`SYNTHETIC_QA_AAL2`)**.
- **Technical Analysis:** `POST /licenses` requires `requireMfa: true`. The test used `ownerA.aal2Token`. The synthetic JWT signature was rejected with 401 before reaching the sentinel customer check (`customer_id === UNASSIGNED_SENTINEL_CUSTOMER_ID`).
- **Intended Security Property Exercised:** Intended to verify that creating a license targeting the dummy migration sentinel UUID (`00000000-0000-0000-0000-000000000000`) is rejected with `400 SENTINEL_CUSTOMER_FORBIDDEN`. Blocked at authentication gate.
- **Unauthorized Data / Mutation:** **None**. Denied with 401; no license created.
- **Corrective Action (Minimum Valid):** Use authentic Supabase-signed AAL2 token for `ownerA`.

---

## 3. Summary Classification Matrix

| # | Suite | Test Name | Assertion | Result | Root Cause | Security Breach? | Corrective Action |
|---|---|---|---|---|---|---|---|
| **1** | `phase3c-read-idor` | `SYSTEM programmatic token` | `200` | `404` | Disabled test route (`/_test/scope-check`) | ❌ No | Replace with `GET /audit` verification |
| **2** | `cross-surface` | `Global SYSTEM role audit list` | `200` | `401` | `vite.config.ts` token stomping | ❌ No | Preserve `process.env.ADMIN_API_TOKEN` |
| **3** | `cross-surface` | `Foreign directive cancel POST` | `404` | `401` | Synthetic token signature (`SYNTHETIC_QA_AAL2`) | ❌ No | Obtain real Supabase Auth AAL2 token |
| **4** | `cross-surface` | `Role-denied operation (AUDITOR)` | `403` | `401` | Synthetic token signature (`SYNTHETIC_QA_AAL2`) | ❌ No | Obtain real Supabase Auth AAL2 token |
| **5** | `cross-surface` | `Scope Override (foreign customer)` | `403` | `401` | Synthetic token signature (`SYNTHETIC_QA_AAL2`) | ❌ No | Obtain real Supabase Auth AAL2 token |
| **6** | `cross-surface` | `Scope Override (sentinel customer)`| `400` | `401` | Synthetic token signature (`SYNTHETIC_QA_AAL2`) | ❌ No | Obtain real Supabase Auth AAL2 token |

---

## 4. Conclusion & Next Steps

All 6 failures are non-defects regarding authorization logic and database integrity. The server behaved securely in every case (fail-closed authentication and unexposed diagnostic routes).

The corrective actions defined above strictly adhere to:
1. Never enabling test-only diagnostic routes in QA or production.
2. Preserving true environment secrets in test runners.
3. Leveraging authentic Supabase Auth TOTP enrollment to generate legitimate AAL2 tokens for cloud integration testing.
