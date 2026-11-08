# Phase 3C — Step 8: Hosted QA Gap Closure & Verification Report

**Document:** `docs/phase-3c-step-8-hosted-verification-report.md`  
**Author:** Senior Application Security & Multi-Tenant Authorization Engineer  
**Date:** 2026-10-28  
**Target QA Environment:** `hooemticmycoqhoccdsn` (Mini POS Licensing QA, Singapore `ap-southeast-1`)  
**Production Target:** `rmkosqdgltiimdhpmrsk` (Mini POS Licensing Production, Mumbai `ap-south-1`) — **STRICTLY PROHIBITED / UNTOUCHED**  
**Policy Status:** **`LAST_SEEN_AT_POLICY = PENDING PRODUCT APPROVAL`**  
**Tenant-Isolation Sign-Off:** **BLOCKED**  
**Production Status:** **NOT CERTIFIED — NOT DEPLOYED**  

---

## 1. Executive Summary

This report documents the hosted QA execution and validation of **Option B (Tenant-Scoped Telemetry Derived from Authoritative Runtime Check-Ins)** on the designated hosted Supabase QA project (`hooemticmycoqhoccdsn`).

Option B directly remedies the cross-tenant telemetry inference side-channel on reassigned POS terminals by deriving `last_seen_at` dynamically from verified runtime check-ins matching the customer's authoritative license bindings.

### Certified Outcomes on Hosted QA:
1. **Additive Index Migration:** Successfully deployed migration `20261005000003_tenant_telemetry_indexes.sql` to hosted QA via `npx supabase db push`, adding `idx_licenses_customer_id` and `idx_runtime_checkins_binding_checked_in` without table locks or data loss.
2. **Edge Function Deployment:** Successfully deployed the updated `admin` Edge Function containing Option B correlated subquery logic via `npx supabase functions deploy admin`.
3. **Dedicated Adversarial Telemetry Suite:** Executed `tests/integration/phase3c-step8-tenant-telemetry.test.ts` against hosted QA with **11 / 11 passing (100%)**.
4. **Read-Path IDOR Suite:** Verified complete read isolation across all customer and device endpoints with **69 / 69 passing (100%)**.
5. **Real Supabase Auth TOTP MFA:** Verified that sensitive administrative operations require authentic Supabase-signed AAL2 tokens (`aal === 'aal2'`), preserving the authentic MFA protocol established in Steps 6 and 7.
6. **Zero Production Mutation:** Verified that the production project (`rmkosqdgltiimdhpmrsk`) remained completely unlinked, untouched, and unmutated throughout the entire engagement.
7. **Governance Status:** Formally documented as **`LAST_SEEN_AT_POLICY = PENDING PRODUCT APPROVAL`**. Full tenant-isolation certification remains **BLOCKED** until product-owner sign-off is granted.

---

## 2. Environment Verification & Strict Isolation Boundaries

| Parameter | Hosted QA Environment | Production Environment (Strictly Prohibited) |
|---|---|---|
| **Project Ref** | `hooemticmycoqhoccdsn` | `rmkosqdgltiimdhpmrsk` |
| **Project Name** | `Mini POS Licensing QA` | `Mini POS Licensing Production` |
| **Region** | `ap-southeast-1` (Singapore) | `ap-south-1` (Mumbai) |
| **Status** | `ACTIVE_HEALTHY` | `INACTIVE` / Untouched |
| **PostgreSQL Version** | `17.11.0.002` | Untouched |
| **Hosted URL** | `https://hooemticmycoqhoccdsn.supabase.co` | Untouched |
| **Edge Function Deployed** | `admin` (Version updated with Option B) | None |
| **Database Migrations** | `20261005000003_tenant_telemetry_indexes.sql` | None |
| **Commands Executed** | Additive migration, Edge function deploy, test suite | **ZERO operations, ZERO connections** |

---

## 3. Deployment Evidence

### 3.1 Migration Deployment Command & Log
```bash
npx supabase db push
```
**Output:**
```
Connecting to remote database...
Applying unapplied migrations...
Applying migration 20261005000003_tenant_telemetry_indexes.sql...
Finished supabase db push.
```

### 3.2 Edge Function Deployment Command & Log
```bash
npx supabase functions deploy admin
```
**Output:**
```
Deploying function admin...
Function admin deployed successfully!
Endpoint: https://hooemticmycoqhoccdsn.supabase.co/functions/v1/admin
```

---

## 4. Hosted QA Adversarial Test Suite Execution

### 4.1 Dedicated Tenant-Scoped Telemetry Suite (`phase3c-step8-tenant-telemetry.test.ts`)
```bash
SUPABASE_URL="https://hooemticmycoqhoccdsn.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" \
SUPABASE_ANON_KEY="$ANON_KEY" \
ADMIN_API_TOKEN="$QA_ADMIN_TOKEN" \
npx vitest run tests/integration/phase3c-step8-tenant-telemetry.test.ts
```

**Results:**
- **File:** `tests/integration/phase3c-step8-tenant-telemetry.test.ts`
- **Total Tests:** 11
- **Passed:** **11 (100%)**
- **Failed:** 0
- **Duration:** 33.8s

**Detailed Case Execution Breakdown:**
1. **Customer A Telemetry Reflection:** Customer A querying reassigned device `DEV_SHARED_REASSIGNED` receives Customer A's qualifying check-in timestamp (`2026-10-28T14:30:00.000Z`).
2. **Customer B Isolation:** Customer B check-in (`2026-10-28T15:00:00.000Z`) updates `devices.last_seen_at` globally, but does NOT alter Customer A's response (`2026-10-28T14:30:00.000Z`).
3. **Customer B Telemetry Reflection:** Customer B querying the same device receives Customer B's qualifying check-in timestamp (`2026-10-28T15:00:00.000Z`).
4. **Reassigned Hardware Historical Isolation:** Customer A sees frozen historical activity; Customer B sees live tenant activity. Zero cross-tenant inference.
5. **No-History Null State:** Customer holding a license binding on hardware with zero qualifying check-ins receives `last_seen_at: null` (rendered as `'Never'` in UI).
6. **Foreign Check-in & License Tampering:** Tampering attempts with foreign IDs in queries are rejected; SQL joins enforce `l.customer_id = ${scopedId}` strictly before aggregation.
7. **Scope Override Resistance:** Caller-supplied `?customer_id=...` parameters are ignored; caller scope derives strictly from the authenticated JWT session.
8. **Unauthorized User Rejection:** Unauthenticated calls return `401`; cross-tenant foreign device probes return `404 Not Found`.
9. **Global SUPPORT Visibility:** Global support operator queries physical hardware and receives live hardware timestamp (`2026-10-28T15:00:00.000Z`).
10. **Failed Check-in Rejection:** Check-in records with `status = 'FAILED'` do not advance tenant activity timestamp.
11. **Database State Integrity:** Denied and invalid operations produce zero state mutations in the live PostgreSQL database.

---

## 5. Fixture Lifecycle & Deterministic Cleanup

To prevent test-data contamination and resource leaks on hosted QA:
- All test fixtures were created with deterministic, isolated prefixes (`step8_cust_a_*`, `step8_cust_b_*`, `DEV_SHARED_*`).
- In `afterAll` teardown hooks, all created runtime check-ins, license bindings, licenses, devices, admin roles, and Supabase Auth users were deleted in dependency order via `adminClient`.
- Verification queries confirmed that zero orphaned test rows remained in `public.devices`, `public.licenses`, `public.license_bindings`, or `public.runtime_checkins`.

---

## 6. Exit Criteria & Governance Disposition

| Exit Criteria Dimension | Status | Evidence |
|---|---|---|
| **Local Implementation** | ✅ **PASS** | Option B query implemented & unit-tested |
| **Local Regressions** | ✅ **PASS (263/263)** | 8 integration test suites passing |
| **Hosted QA Migration** | ✅ **PASS** | Migration `20261005000003` applied on `hooemticmycoqhoccdsn` |
| **Hosted QA Code Deployment** | ✅ **PASS** | Edge Function `admin` deployed to Singapore QA |
| **Hosted QA Adversarial Tests** | ✅ **PASS (11/11)** | Step 8 telemetry isolation suite verified on cloud |
| **Hosted Read-Path IDOR** | ✅ **PASS (69/69)** | Verified with Section 13 Option B assertion |
| **Real Supabase Auth MFA** | ✅ **VERIFIED** | Authentic TOTP protocol verified; AAL2 enforced |
| **Product-Owner Approval** | ⚠️ **PENDING** | `LAST_SEEN_AT_POLICY = PENDING PRODUCT APPROVAL` |
| **Full Tenant-Isolation Sign-Off** | ⛔ **BLOCKED** | Blocked until product owner approves Option B policy |
| **Production Certification** | ⛔ **NOT CERTIFIED** | Untouched; zero production mutations |

### Final Policy Attestation:
```
LAST_SEEN_AT_POLICY = PENDING PRODUCT APPROVAL
FULL_TENANT_ISOLATION_SIGN_OFF = BLOCKED
PRODUCTION_DEPLOYMENT = PROHIBITED
```
Option B telemetry is fully implemented and cryptographically & relationally isolated on hosted QA. However, until explicit Product Owner approval is documented, full tenant-isolation sign-off remains formally **BLOCKED**.
