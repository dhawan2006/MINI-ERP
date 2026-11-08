# Phase 3C — Hosted QA Readiness Assessment

**Assessment Outcome:** **READY WITH LIMITATIONS**  
**Hosted Execution Status:** **NOT TESTED** (Readiness Assessment Only — Zero Destructive Remote Actions Taken)  
**Real Supabase TOTP / MFA:** **NOT VERIFIED** (Synthetic Local AAL2 Only)  
**Device Telemetry Policy:** **UNRESOLVED (`LAST_SEEN_AT_POLICY = UNRESOLVED`)**  
**Auditor:** Senior Application Security & Multi-Tenant Authorization Engineer  
**Date:** 2026-10-27  

---

## 1. Executive Summary

This readiness assessment audits the repository's configuration, schema migrations, Edge Function architecture, secret boundaries, and test automation fixtures to determine whether the Mini POS licensing Admin Platform is prepared for a controlled deployment to a hosted Supabase QA environment.

**Key Finding:** The server-side authorization architecture, database migrations, RLS hardening, idempotency controls, and adversarial test suites are fully prepared for hosted deployment. However, deployment and verification must proceed under controlled conditions due to two material limitations:
1. `LAST_SEEN_AT_POLICY` remains pending product approval.
2. Real Supabase Auth TOTP enrollment/challenge flows must be tested on the hosted instance to replace synthetic local test tokens (`SYNTHETIC_QA_AAL2`).

---

## 2. Hosted-QA Readiness Audit Matrix

| Audit Item | Readiness Criteria | Evaluation Status | Evidence / Verification Notes |
|------------|-------------------|-------------------|--------------------------------|
| **1. Target Project Identity** | Approved hosted Supabase project target defined without ambiguity. | **BLOCKED (Configuration)** | Repository contains local configuration (`supabase/config.toml`, `project_id = "mini_ERP"`). No remote Supabase project ref is linked in `.branches/_current_branch`. A target QA project reference (e.g. `sb-qa-xxxxx`) must be supplied by DevOps before linking. |
| **2. Migration Sequence & Idempotency** | All schema migrations are ordered, sequential, and idempotent. | **PASS** | 7 migrations verified in `supabase/migrations/`: initial schema, runtime checkin, RLS hardening, admin idempotency, customer admin scope, customer scope hardening, and sentinel license guard. |
| **3. Edge Function Code Consistency** | Deployed function matches audited Git commit `91edb3a` / working tree. | **PASS** | `supabase/functions/admin/` and `_shared/` contain the complete audited router, middleware, and domain services. |
| **4. Trust Anchor Separation** | QA signing keys and HMAC secrets strictly isolated from production keys. | **PASS** | QA signing keys are isolated in `supabase/qa-server-signing.pem` and `.local-qa/signing/`. Production private keys are not stored in repository code. |
| **5. Server-Only Secrets Boundary** | Signing keys, HMAC secrets, and service-role tokens never reach client. | **PASS** | Verified that `LICENSING_SERVER_PRIVATE_KEY`, `LICENSE_KEY_HMAC_SECRET`, `ADMIN_API_TOKEN`, and `SUPABASE_SERVICE_ROLE_KEY` are only read via `Deno.env.get()` in backend Edge Functions. Bundled `admin-ui/dist` contains zero backend secrets. |
| **6. Database RLS & Data API Hardening** | Direct PostgREST access blocked for anon/unauthorized users. | **PASS** | `20261003100000_rls_security_hardening.sql` enables RLS on all 7 core tables. Data access is mediated exclusively through Edge Functions using `service_role`. |
| **7. Server-Side Scope Derivation** | Customer scope derived from server DB state, immune to client headers/body. | **PASS** | Verified in `adminAuth.ts` and `phase3c-step2-1-hardening.test.ts`. Query params (`?customerId=`), headers (`X-Customer-Id`), and body fields cannot expand or override server-derived tenant scope. |
| **8. Deterministic Test Fixtures & Cleanup** | Hosted test suite can create and cleanly destroy isolated test tenants. | **PASS** | All integration test suites (`phase3c-cross-surface-tenant-leakage.test.ts`, `phase3c-read-idor.test.ts`, `phase3c-mutation-idor.test.ts`) generate randomized sentinel identifiers (`SENTINEL_ALPHA_<runId>`) and run comprehensive `afterAll` cleanup. |
| **9. Idempotency & Concurrency Safety** | Mutations support duplicate detection, locking, and replay protection. | **PASS** | `admin_idempotency_keys` table + SHA-256 payload hashing verified in `Router.ts`. `SELECT ... FOR UPDATE` row-locking verified in `AdminLifecycleService.ts`. |
| **10. Log Sanitization & PII Leakage** | Edge Function and test runner logs do not print tokens or secrets. | **PASS** | `Router.ts` logs only method, pathname, and correlation ID. JWT bodies, private keys, and HMAC signatures are suppressed. |
| **11. Real Supabase MFA / TOTP Verification** | End-to-end TOTP enrollment and AAL2 session step-up verified. | **NOT VERIFIED** | Only tested with `SYNTHETIC_QA_AAL2` HMAC tokens locally. Requires live verification on hosted QA instance per Step 5E verification plan. |
| **12. Physical Device Telemetry (`last_seen_at`)** | Policy on shared-device activity inference finalized. | **UNRESOLVED** | Explicitly marked `LAST_SEEN_AT_POLICY = UNRESOLVED`. Decision pending Product Owner approval between Global Health vs. Tenant-Scoped telemetry. |

---

## 3. Policy Boundary Review Matrix (Step 5C)

| Domain Surface | Intended Access Policy | Implementation & Test Status | Boundary Classification |
|----------------|------------------------|------------------------------|-------------------------|
| **Dashboard Aggregates** | Customer-scoped roles see only own counts; empty tenant sees zeros; global SUPPORT sees system totals. | Parameterized SQL in `AdminDashboardService.ts`. Verified in `phase3c-cross-surface-tenant-leakage.test.ts`. | **Implemented & Tested** |
| **Device Visibility** | Customer sees devices with active or historical bindings; non-associated devices return 404. | Filtered in SQL via `EXISTS` subquery in `AdminDeviceService.ts`. Verified in Step 4A/4C. | **Implemented & Tested** |
| **Nested Binding Redaction** | Shared device returns only viewing customer's bindings in `bindings[]`. Foreign bindings redacted. | Parameterized SQL JOIN to `licenses` on `l.customer_id`. Verified in Step 4A/4C. | **Implemented & Tested** |
| **Audit Logs Scoping** | Customer sees events where `ae.license_id` matches own license. Unresolvable device events excluded. | Parameterized SQL in `AdminAuditService.ts`. Verified in `phase3c-cross-surface-tenant-leakage.test.ts`. | **Implemented & Tested** |
| **Audit Role Restriction** | `SUPPORT` role denied access (`403`); `SYSTEM` token granted global access. | Enforced in `Router.ts` route options. Verified in Step 4C test suite. | **Implemented & Tested** |
| **Search & Pagination** | Search across customers, licenses, devices scoped to tenant before limit/offset. | Parameterized SQL ILIKE/UUID matches. Verified in Step 4A/4C. | **Implemented & Tested** |
| **Scope Tampering** | Query params (`?customerId=`), headers, and body customer overrides rejected. | Ignored or rejected with 403 `CUSTOMER_MISMATCH_FORBIDDEN`. Verified in Step 4B/4C. | **Implemented & Tested** |
| **Sentinel Customer** | Migration placeholder customer (`00000000...`) cannot hold licenses or be viewed by admins. | App checks + DB trigger `trg_license_no_sentinel_customer`. Verified in Step 3/4B. | **Implemented & Tested** |
| **Lifecycle Mutations** | Binding release, license revoke/restore/disable/extend locked and verified against tenant in SQL. | Parameterized SQL `FOR UPDATE` queries. Verified across 46 mutation tests in Step 4B. | **Implemented & Tested** |
| **Device Telemetry** | `last_seen_at` on physical device table. | Updated by runtime checkin. Visible across historical assignees. | **Pending Product Decision** |
| **Exports & Downloads** | `/export/customers`, `/export/licenses`, etc. | Not registered on router (returns 404 cleanly). | **Not Currently Exposed** |
| **Lifecycle Request Log** | `GET /lifecycle/requests` | Table exists in DB; no Admin API route exposed. | **Not Currently Exposed** |
| **Admin User Management** | `GET /admin-users`, `POST /admin-users` | Roles assigned directly via DB migrations/seeds. | **Not Currently Exposed** |

---

## 4. Controlled Hosted-QA Execution Protocol

When DevOps links the approved hosted Supabase QA project, testing MUST adhere to this strict protocol:

1. **Pre-Deployment Safety Checks:**
   - Confirm project environment is explicitly labeled `QA` (never `PRODUCTION`).
   - Confirm `ADMIN_TEST_ROUTES_ENABLED="false"` in hosted secrets (test routes disabled in QA/Prod).
   - Verify that QA database contains NO production customer data.
2. **Migration Deployment:**
   - Run `supabase db push` against the QA project.
   - Verify migrations apply cleanly from `20240101000000_initial_schema.sql` through `20261005000002_sentinel_license_guard.sql`.
3. **Secret Provisioning:**
   - Set `LICENSING_SERVER_KEY_ID`, `LICENSING_SERVER_PRIVATE_KEY` (QA key pair), `LICENSE_KEY_HMAC_SECRET`, and `ADMIN_API_TOKEN` via `supabase secrets set`.
4. **Edge Function Deployment:**
   - Deploy `admin` and `api` edge functions from commit `91edb3a` / clean working tree:
     ```bash
     supabase functions deploy admin
     supabase functions deploy api
     ```
5. **Non-Destructive Smoke Verification:**
   - Run anonymous probe (`GET /functions/v1/admin/dashboard/summary`) $\rightarrow$ verify `401 ADMIN_UNAUTHORIZED`.
   - Run unexposed route probe (`GET /functions/v1/admin/export/licenses`) $\rightarrow$ verify `404 Not Found`.
6. **Execution of Automated QA Test Suites:**
   - Run the dedicated test suites pointing to hosted QA URL:
     ```bash
     SUPABASE_URL=https://<qa-project-ref>.supabase.co \
     npx vitest run tests/integration/phase3c-cross-surface-tenant-leakage.test.ts
     ```
   - Confirm all fixtures are cleaned up in `afterAll`.

---

## 5. Certification Restrictions

- **Deployment Authorization:** This document authorizes deployment ONLY to an isolated, non-production Hosted QA project.
- **Production Ban:** Production deployment remains strictly **UNAUTHORIZED**.
- **Real MFA Requirement:** Multi-tenancy sign-off cannot be completed until real Supabase TOTP enrollment is verified using the Step 5E verification plan.
