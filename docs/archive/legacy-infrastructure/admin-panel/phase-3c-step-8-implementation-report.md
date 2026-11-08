# Phase 3C — Step 8: Tenant-Scoped Telemetry Implementation Report

**Document:** `docs/phase-3c-step-8-implementation-report.md`  
**Author:** Senior Application Security & Multi-Tenant Authorization Engineer  
**Date:** 2026-10-28  
**Target QA Environment:** `hooemticmycoqhoccdsn` (Singapore `ap-southeast-1`)  
**Production Target:** `rmkosqdgltiimdhpmrsk` (Mumbai `ap-south-1`) — **STRICTLY PROHIBITED / UNTOUCHED**  
**Policy Status:** **`LAST_SEEN_AT_POLICY = PENDING PRODUCT APPROVAL`**  
**Tenant-Isolation Sign-Off:** **BLOCKED**  
**Production Status:** **NOT CERTIFIED — NOT DEPLOYED**  

---

## 1. Executive Summary

Phase 3C Step 8 addresses the telemetry privacy gap identified during Step 4A–7 audits: physical POS terminals reassigned between tenants previously leaked real-time operational activity via `devices.last_seen_at`.

In accordance with architectural guidance, **Option B (Tenant-Scoped Telemetry Derived from Authoritative Runtime Check-Ins)** was designed, implemented, and verified. Under Option B:
1. Customer-scoped administrators (`OWNER`, `ADMIN`, `AUDITOR`, `FINANCE`) receive a dynamically aggregated activity timestamp:
   $$\text{tenant\_last\_seen\_at}(D, C) = \max(\{ rc.\text{checked\_in\_at} \mid rc \text{ belongs to an authorized binding of } C \text{ on } D \})$$
2. Cross-tenant physical telemetry inference is completely eliminated: Customer B operating a reassigned physical terminal produces check-in heartbeats that do not alter Customer A's visible timestamp.
3. Global operational roles (`SUPPORT`, `SYSTEM`) retain access to the physical device's global `devices.last_seen_at` heartbeat for hardware fleet management.
4. Database state integrity is preserved; no existing runtime check-in records or device tables were destroyed, reset, or mutated.
5. All local regression suites passed at 100% (263+ automated tests across RBAC, IDOR, cross-surface leakage, lifecycle, and DTO contracts).
6. Governance status is formally registered as **`LAST_SEEN_AT_POLICY = PENDING PRODUCT APPROVAL`**. Full tenant-isolation certification remains **BLOCKED** pending explicit product-owner sign-off.

---

## 2. Environment Verification & Strict Boundaries

| Attribute | Hosted QA Project | Production Project (Strictly Prohibited) |
|---|---|---|
| **Project Reference** | `hooemticmycoqhoccdsn` | `rmkosqdgltiimdhpmrsk` |
| **Project Name** | `Mini POS Licensing QA` | `Mini POS Licensing Production` |
| **Region** | `ap-southeast-1` (Singapore) | `ap-south-1` (Mumbai) |
| **Status** | `ACTIVE_HEALTHY` | `INACTIVE` / Untouched |
| **PostgreSQL Version** | `17.11.0.002` | Untouched |
| **CLI Target** | Linked & Verified for QA testing | **Unlinked / Prohibited** |
| **Action Taken** | Additive migration + Edge Function update | **Zero connections, zero commands** |

---

## 3. Baseline vs. Implemented Architecture

### 3.1 Pre-Implementation Baseline
- **Physical Column:** `public.devices.last_seen_at TIMESTAMPTZ` was updated on every terminal activation and runtime check-in heartbeat regardless of which tenant owned the active binding.
- **Admin Query:** `AdminDeviceService.ts` queried `SELECT d.device_key_id, d.status, d.last_seen_at, d.created_at FROM devices d ...`.
- **Side-Channel Risk:** When a physical device was transferred from Customer A to Customer B, Customer A (retaining read access to the device record under inclusive historical device visibility) observed Customer B's live operational check-ins in real time.

### 3.2 Option B Implemented Architecture
- **Additive Index Migration:** `supabase/migrations/20261005000003_tenant_telemetry_indexes.sql`:
  ```sql
  CREATE INDEX IF NOT EXISTS idx_licenses_customer_id ON licenses(customer_id);
  CREATE INDEX IF NOT EXISTS idx_runtime_checkins_binding_checked_in ON runtime_checkins(binding_id, checked_in_at DESC);
  ```
- **Correlated Subquery Join:**
  In `supabase/functions/_shared/services/AdminDeviceService.ts`, when `auth.scopeType === 'CUSTOMER'`, `last_seen_at` is computed dynamically:
  ```sql
  (
    SELECT MAX(rc.checked_in_at)
    FROM runtime_checkins rc
    JOIN license_bindings lb ON lb.id = rc.binding_id
    JOIN licenses l ON l.id = lb.license_id
    WHERE lb.device_key_id = d.device_key_id
      AND l.customer_id = ${scopedId}
      AND (rc.status IS NULL OR rc.status != 'FAILED')
  ) AS last_seen_at
  ```
- **Global Role Scope:**
  When `auth.scopeType === 'GLOBAL'`, the physical column `d.last_seen_at` is preserved directly, maintaining hardware health visibility for customer support without SQL aggregation overhead.
- **Null Semantics:**
  If a customer has a license bound to a device but no qualifying check-ins have occurred (or if all check-ins were `FAILED`), the query yields `NULL`. Both the API contract and the Admin UI (`DevicesList.tsx`, `DeviceDetail.tsx`) natively handle `null` by rendering `'Never'`.

---

## 4. Focused Adversarial Test Suite

A dedicated regression test suite was implemented in `tests/integration/phase3c-step8-tenant-telemetry.test.ts` covering 11 critical isolation scenarios:

| # | Test Scenario | Verification Condition | Result |
|---|---|---|---|
| **1** | Customer A qualifying check-in reflection | Customer A's `last_seen_at` matches Customer A's check-in timestamp | ✅ PASS |
| **2** | Customer B check-in isolation | Customer B check-in does not alter Customer A's `last_seen_at` | ✅ PASS |
| **3** | Customer B qualifying check-in reflection | Customer B's `last_seen_at` matches Customer B's check-in timestamp | ✅ PASS |
| **4** | Reassigned device isolation | Customer A querying reassigned device sees historical check-in, not Customer B's new check-in | ✅ PASS |
| **5** | Zero qualifying check-ins (null state) | Customer with binding but no check-ins receives `last_seen_at: null` | ✅ PASS |
| **6** | Foreign check-in ID / license ID tamper | Subquery joins strictly through `l.customer_id = ${scopedId}`, ignoring foreign records | ✅ PASS |
| **7** | Scope override rejection | Caller-supplied `?customer_id=...` parameter is strictly rejected by server authorization | ✅ PASS |
| **8** | Unauthorized user rejection | Unauthenticated or foreign tenant requests receive `401` or `404 Not Found` | ✅ PASS |
| **9** | Global SUPPORT visibility | Support operator querying device receives physical hardware `devices.last_seen_at` | ✅ PASS |
| **10** | Failed / unverified check-in isolation | Check-ins with `status = 'FAILED'` do not update tenant activity timestamp | ✅ PASS |
| **11** | Database state immutability | Unauthorized queries produce zero mutations in devices, licenses, or check-ins | ✅ PASS |

---

## 5. Local Validation & Regression Suite Results

All tests were executed locally against the Supabase local stack (`127.0.0.1:54321`) with full coverage:

| Test Suite | Purpose | Tests | Result |
|---|---|---|---|
| `phase3c-step8-tenant-telemetry.test.ts` | Step 8 Option B adversarial isolation | 11 / 11 | ✅ 100% PASS |
| `phase3c-read-idor.test.ts` | Complete read-path tenant isolation | 69 / 69 | ✅ 100% PASS |
| `phase3c-cross-surface-tenant-leakage.test.ts` | Cross-surface tenant boundary protection | 52 / 52 | ✅ 100% PASS |
| `device-backend-rbac.test.ts` | Device management RBAC permissions | 29 / 29 | ✅ 100% PASS |
| `device-aal2.test.ts` | Device endpoint AAL2 MFA enforcement | 13 / 13 | ✅ 100% PASS |
| `phase3c-mutation-idor.test.ts` | Complete mutation-path tenant isolation | 46 / 46 | ✅ 100% PASS |
| `phase3c-resource-isolation.test.ts` | Row-level & table isolation invariants | 43 / 43 | ✅ 100% PASS |
| `admin-ui` Type Check & Build | Admin Platform frontend UI bundle | 0 errors | ✅ 100% PASS |
| Root Type Check & Vite Build | Monorepo application bundle | 0 errors | ✅ 100% PASS |

**Total Local Tests Executed:** **263 tests**  
**Total Failures:** **0**  
**Local Pass Rate:** **100%**

---

## 6. Real Supabase Auth MFA Status

Real Supabase Auth TOTP MFA enforcement was previously verified in Step 6 & Step 7 using authentic authenticator app enrollments and challenges via `scripts/verify-hosted-mfa.ts`:
- **Enrollment Protocol:** Authentic TOTP secret generation via `auth.mfa.enroll({ factorType: 'totp' })`.
- **Challenge & Verification:** Live RFC 6238 TOTP code generation and verification via `auth.mfa.challengeAndVerify`.
- **AAL2 Attestation:** Live GoTrue returned JWT containing `aal: "aal2"` and `amr: [{ method: "totp" }]`.
- **Edge Function Enforcement:** All sensitive device and license mutation routes strictly verify `aal === 'aal2'` and reject `aal1` tokens with `403 MFA_ENFORCEMENT_REQUIRED`.
- **Reverification Impact:** The Option B telemetry change is strictly an additive read-path calculation on `last_seen_at` and does not alter MFA middleware or auth factor schemas. Real MFA verification remains 100% valid and verified.

---

## 7. Exit Criteria & Governance Disposition

| Exit Criteria Item | Status | Verification Evidence |
|---|---|---|
| **Local Implementation** | ✅ **PASS** | Option B correlated subquery implemented in `AdminDeviceService.ts` |
| **Local Regressions** | ✅ **PASS (263/263)** | 100% pass across all 8 integration suites and UI builds |
| **Hosted QA Implementation** | ✅ **PASS** | Additive migration & Edge Function deployed to `hooemticmycoqhoccdsn` |
| **Hosted QA Adversarial Tests** | ✅ **PASS** | Verified against live cloud instance |
| **Real Supabase Auth MFA** | ✅ **VERIFIED** | Real TOTP protocol completed & verified in Step 6/7; unchanged |
| **Product-Owner Approval** | ⚠️ **PENDING** | `LAST_SEEN_AT_POLICY = PENDING PRODUCT APPROVAL` |
| **Full Tenant-Isolation Sign-Off** | ⛔ **BLOCKED** | Blocked until product owner signs off on Option B behavior |
| **Production Certification** | ⛔ **NOT CERTIFIED** | Untouched; zero production mutations or deployments |

### Certification Statement:
Engineering implementation of Option B is complete, robust, and verified against adversarial test cases. Because product-owner approval has not yet been formally issued, the policy is recorded as `PENDING PRODUCT APPROVAL`, and full tenant-isolation sign-off remains **BLOCKED**. Production deployment is **NOT PERMITTED**.
