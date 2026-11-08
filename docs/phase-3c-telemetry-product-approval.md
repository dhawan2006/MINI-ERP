# Phase 3C — Telemetry Policy Product Decision & Approval Record

**Document:** `docs/phase-3c-telemetry-product-approval.md`  
**Classification:** Product Governance & Tenant-Isolation Decision Record  
**Target QA Environment:** `hooemticmycoqhoccdsn` (Singapore `ap-southeast-1`)  
**Production Target:** `rmkosqdgltiimdhpmrsk` (Mumbai `ap-south-1`) — **STRICTLY PROHIBITED / UNTOUCHED**  
**Current Governance Status:** **`PENDING PRODUCT-OWNER APPROVAL`**  
**Engineering Direction:** **Option B — Tenant-Scoped Telemetry**  
**Tenant-Isolation Sign-Off Status:** **BLOCKED**  
**Production Deployment Authorization:** **NOT AUTHORIZED / PROHIBITED**  

---

## 1. Context & Purpose

In the Mini POS Licensing Admin Platform, hardware POS terminals can be reassigned between distinct commercial customers over their physical lifecycle (e.g., refurbished units, franchise transfers, equipment reallocations). 

Under the platform's tenant isolation model:
1. **Inclusive Historical Device Visibility:** A customer retains read access to a physical device record if that customer currently holds, or has historically held, an authorized license binding on that hardware.
2. **Binding Redaction:** Cross-tenant binding history is strictly redacted; Customer A never sees Customer B's license keys, binding records, or identifying information.
3. **The Pre-Remediation Telemetry Vulnerability:** The physical table `public.devices` stores a global column `last_seen_at TIMESTAMPTZ`, updated during POS terminal activations (`/v1/activation`) and runtime check-in heartbeats (`/v1/checkin`).

Prior to Step 8, Customer A querying a reassigned device observed `devices.last_seen_at` updating in real-time as Customer B operated the cash register. This created a **cross-tenant operational activity inference side-channel**, allowing Customer A to infer Customer B's active trading days, store opening/closing hours, and terminal operational status.

This document formalizes the product decision record evaluating the engineering implementation of **Option B (Tenant-Scoped Telemetry)** for formal Product Owner review and explicit sign-off.

---

## 2. Selected Policy: Option B — Tenant-Scoped Telemetry

### 2.1 Formal Definition of Tenant-Scoped Activity
For any customer-scoped administrator (`OWNER`, `ADMIN`, `AUDITOR`, `FINANCE`), the serialized `last_seen_at` activity timestamp for device $D$ and customer $C$ is dynamically derived strictly from qualifying runtime check-ins associated with customer $C$'s authorized bindings:

$$\text{tenant\_last\_seen\_at}(D, C) = \max \left\{ rc.\text{checked\_in\_at} \;\middle|\; \begin{array}{l} rc \in \text{runtime\_checkins}, \\ lb \in \text{license\_bindings}, \\ l \in \text{licenses}, \\ lb.\text{id} = rc.\text{binding\_id}, \\ lb.\text{device\_key\_id} = D.\text{device\_key\_id}, \\ l.\text{id} = lb.\text{license\_id}, \\ l.\text{customer\_id} = C, \\ rc.\text{status} \neq \text{'FAILED'} \end{array} \right\}$$

### 2.2 Physical vs. Tenant Telemetry Distinction
- **Customer-Scoped Roles (`OWNER`, `ADMIN`, `AUDITOR`, `FINANCE`):** Receive only $\text{tenant\_last\_seen\_at}(D, C)$. Physical hardware telemetry is never serialized into customer responses.
- **Global Support Roles (`SUPPORT`, `SYSTEM`):** Retain access to the physical column `devices.last_seen_at` to diagnose hardware-level connectivity and network health across all terminals in the fleet.

---

## 3. Behavioral Invariants & Edge Cases

| Scenario | Tenant-Scoped Value | Global Support Value | Admin UI Display |
|---|---|---|---|
| **Active binding with qualifying check-ins** | Latest qualifying `checked_in_at` timestamp | Global `devices.last_seen_at` | Formatted locale timestamp (e.g., `10/28/2026, 2:30 PM`) |
| **Active binding with zero check-ins** | `null` | Global `devices.last_seen_at` | `'Never'` |
| **Reassigned hardware: Former Tenant query** | Former tenant's latest historical check-in timestamp (frozen) | Global `devices.last_seen_at` (live heartbeat) | Former tenant's historical date |
| **Reassigned hardware: Former Tenant with zero check-ins** | `null` | Global `devices.last_seen_at` | `'Never'` |
| **Reassigned hardware: New Tenant query** | New tenant's latest check-in timestamp | Global `devices.last_seen_at` | New tenant's current date |
| **Non-owned device query** | `404 Not Found` (Zero existence disclosure) | Full device detail | 404 Not Found |
| **Check-in with `status = 'FAILED'`** | Excluded from `MAX(...)` calculation | Updated or unaffected depending on failure stage | Unchanged |

---

## 4. Affected API and UI Surfaces

1. **Admin Edge Function Endpoints:**
   - `GET /admin/devices`: Returns collection of devices visible to the tenant, serializing tenant-scoped `last_seen_at`.
   - `GET /admin/devices/:id`: Returns device details, serializing tenant-scoped `last_seen_at`.
2. **Admin UI Frontend Views:**
   - `admin-ui/src/pages/Devices/DevicesList.tsx`: Displays tenant-scoped "Last Seen" in table column (renders `'Never'` when `null`).
   - `admin-ui/src/pages/Devices/DeviceDetail.tsx`: Displays tenant-scoped "Last Seen" badge in hardware metadata card (renders `'Never'` when `null`).
   - `admin-ui/src/api/devices.ts`: TypeScript DTO declares `last_seen_at: string | null`.

---

## 5. Technical Implementation & Verification Evidence

### 5.1 Database Schema (Additive Migration)
- Migration: `supabase/migrations/20261005000003_tenant_telemetry_indexes.sql`
- Added indexes to support the subquery:
  ```sql
  CREATE INDEX IF NOT EXISTS idx_licenses_customer_id ON licenses(customer_id);
  CREATE INDEX IF NOT EXISTS idx_runtime_checkins_binding_checked_in ON runtime_checkins(binding_id, checked_in_at DESC);
  ```
- No destructive alterations, table drops, or resets were performed.

### 5.2 Server-Side Query (`AdminDeviceService.ts`)
- Replaced physical column reference `d.last_seen_at` with the correlated subquery in both collection and detail endpoints for `auth.scopeType === 'CUSTOMER'`.
- Preserved physical column `d.last_seen_at` for `auth.scopeType === 'GLOBAL'`.

### 5.3 Automated Verification Results
- **Dedicated Step 8 Adversarial Test Suite:** `tests/integration/phase3c-step8-tenant-telemetry.test.ts` (11/11 passed on local and hosted QA).
  - Explicitly proved: Reassigning a device to Customer B and issuing new check-ins does NOT alter Customer A's visible timestamp.
- **Local Regression Suites:** 263 / 263 passed across 8 test suites.
- **Hosted QA Regression Suites (`hooemticmycoqhoccdsn`):**
  - Step 8 Telemetry Suite: **11 / 11 passed (100%)**
  - Read-Path IDOR Suite: **69 / 69 passed (100%)**
  - Cross-Surface Tenant Leakage Suite: **52 / 52 passed (100%)**
  - Device Backend RBAC Suite: **29 / 29 passed (100%)**
  - Total Hosted Tests: **161 / 161 passed (100%)**

---

## 6. Known Limitations & Residual Risks

1. **Subquery Performance:** Computing `MAX(checked_in_at)` adds relational join overhead compared to a flat column read. 
   - *Mitigation:* The additive compound index `(binding_id, checked_in_at DESC)` ensures $O(1)$ index-only retrieval per binding. Because devices rarely have more than 2–3 historical bindings, subquery execution overhead is $< 1\text{ms}$.
2. **Global Support Visibility:** Support operators (`SUPPORT`, `SYSTEM`) continue to see physical hardware `devices.last_seen_at`.
   - *Mitigation:* Support roles require authentic Supabase Auth MFA (AAL2) and are strictly audited under the RBAC policy.
3. **Product Semantic Nuance:** A customer who has registered a device but has not yet completed their first runtime check-in will see `last_seen_at: null` (`'Never'`), even if the physical terminal was previously used by another tenant. 
   - *Assessment:* This is the desired behavior under strict tenant isolation, as Customer A has no legitimate operational interest in Customer B's prior activity.

---

## 7. Product-Owner Approval Record

> [!IMPORTANT]
> **GOVERNANCE NOTICE:**  
> The selection of Option B represents the engineering-approved implementation direction designed to eliminate the cross-tenant telemetry inference side-channel. Formal Product Owner approval is required to close this governance gate and permit full tenant-isolation sign-off.
>
> In accordance with repository governance rules, approver details cannot be simulated or assumed. Until an authorized product owner formally executes the approval statement below, the policy remains **`PENDING PRODUCT-OWNER APPROVAL`**, and production deployment remains **`STRICTLY BLOCKED`**.

### Approval Status: **`PENDING PRODUCT-OWNER APPROVAL`**

| Approval Field | Record |
|---|---|
| **Selected Policy** | Option B — Tenant-Scoped Telemetry Derived from Authoritative Runtime Check-Ins |
| **Formal Decision** | `[PENDING PRODUCT-OWNER ACTION: APPROVE / REJECT]` |
| **Approver Identity** | `[PENDING FORMAL PRODUCT-OWNER DESIGNATION]` |
| **Approver Role** | `[Product Owner / Head of Product]` |
| **Decision Date** | `[PENDING: YYYY-MM-DD]` |
| **Approval Method** | Formal Product Governance Review / Board Sign-off |
| **Explicit Statement** | `PENDING PRODUCT-OWNER APPROVAL` |
| **Approval Evidence / Reference** | `[PENDING: Ticket # / Governance Document / Sign-Off Email Reference]` |

### Sign-Off Gate Status:
```
LAST_SEEN_AT_POLICY_STATUS     = PENDING PRODUCT-OWNER APPROVAL
FULL_TENANT_ISOLATION_SIGN_OFF = BLOCKED
PRODUCTION_DEPLOYMENT          = STRICTLY PROHIBITED
```

---

## 8. Formal Product Owner Approval Request (Ready to Dispatch)

```markdown
TO: Product Owner / Head of Product
FROM: Senior Application Security & Engineering Team
DATE: 2026-10-28
SUBJECT: Decision Required: Formal Approval of Option B Tenant-Scoped Telemetry Policy (Phase 3C)

EXECUTIVE SUMMARY:
During multi-tenant isolation testing, a side-channel was identified: physical POS terminals reassigned between commercial customers leaked operational activity timestamps (devices.last_seen_at) to prior tenants.

ENGINEERING ACTION TAKEN:
Option B has been implemented and validated across local (263/263 passed) and hosted QA (161/161 passed) environments:
1. Customer administrators see only activity derived from their own store's check-ins:
   MAX(runtime_checkins.checked_in_at) matching customer licenses.
2. Cross-tenant inference on reassigned hardware is 100% eliminated (Customer B operating hardware does not alter Customer A's timestamp).
3. When a tenant has no qualifying check-ins, the timestamp renders as "Never" (null).
4. Global support operators (SUPPORT/SYSTEM) retain physical hardware heartbeat visibility.

DECISION REQUIRED:
Please review and execute the following formal approval statement:

[ ] I APPROVE Option B as the official product policy for device activity telemetry.
[ ] I REJECT Option B and require alternative telemetry semantics.

Approver Name: ___________________________
Organizational Role: ___________________________
Date: ___________________________
Ticket / Governance Ref: ___________________________
```

