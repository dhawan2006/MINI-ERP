# Phase 3C — Device Telemetry (`last_seen_at`) Policy Decision Document

**Status:** **PENDING PRODUCT APPROVAL**  
**Policy Identifier:** `LAST_SEEN_AT_POLICY = UNRESOLVED`  
**Classification:** Side-Channel / Activity Inference Analysis  
**Auditor:** Senior Application Security & Multi-Tenant Authorization Engineer  
**Date:** 2026-10-27  

---

## 1. Executive Summary

During Phase 3C Steps 1, 4A, 4B, and 4C, the security audit identified that `devices.last_seen_at` carries cross-tenant activity inference risk on reassigned or historically shared devices.

Under the approved historical visibility policy, a tenant (Customer A) retains read access to a device if Customer A held any historical license binding for it. If that physical hardware is subsequently reassigned to Customer B, Customer B's ongoing runtime check-ins continuously update `devices.last_seen_at`. Consequently, Customer A can observe real-time timestamps and infer that the physical hardware is currently active, despite having zero active licenses or bindings associated with it.

Because no explicit product-owner decision is recorded in repository documentation, this document formally records the policy as **PENDING PRODUCT APPROVAL**, defines the risk, evaluates three viable architectural options, and provides an actionable recommendation.

---

## 2. Technical Profile of `last_seen_at`

### 2.1 Schema Definition & Storage
- **Database Table:** `public.devices`
- **Column Definition:** `last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- **Key Relationships:**
  - `devices` is a hardware registry keyed by `device_key_id`.
  - It does NOT have a `customer_id` column.
  - Multi-tenancy is mediated exclusively via the junction table `license_bindings` (`device_key_id` $\leftrightarrow$ `license_id` $\rightarrow$ `customer_id`).

### 2.2 Update Mechanism
- The timestamp is updated in PostgreSQL by `RuntimeCheckinService.ts` during runtime operations:
  ```sql
  UPDATE devices
  SET last_seen_at = NOW()
  WHERE device_key_id = ${deviceKeyId}
  ```
- Triggered by POS terminal requests to:
  - `POST /v1/activation` (device activation)
  - `POST /v1/checkin` (periodic heartbeat / runtime check-in)

### 2.3 Exposing API & UI Surfaces
1. **API Endpoints:**
   - `GET /admin/devices` (Collection list; returns `last_seen_at` on every device item).
   - `GET /admin/devices/:id` (Device detail; returns top-level `last_seen_at`).
2. **Admin UI Views:**
   - `admin-ui/src/pages/Devices/DevicesList.tsx` (Renders "Last Seen" column: `device.last_seen_at ? new Date(device.last_seen_at).toLocaleDateString() : 'Never'`).
   - `admin-ui/src/pages/Devices/DeviceDetail.tsx` (Renders "Last Seen" timestamp metadata card).

---

## 3. Threat Model: Cross-Tenant Inference on Reassigned Hardware

### 3.1 The Scenario
1. **Month 1:** POS Terminal `POS-001` is licensed to **Tenant A** (Binding 1). Tenant A checks in daily.
2. **Month 2:** Tenant A deactivates Binding 1. `POS-001` is factory-reset or returned to inventory.
3. **Month 3:** `POS-001` is reassigned to **Tenant B** (Binding 2). Tenant B begins trading and checking in.
4. **Tenant A Perspective:** Under the inclusive historical visibility model, Tenant A queries `GET /admin/devices/POS-001`.
   - Binding 2 (Tenant B) is properly redacted from `bindings[]` (certified in Step 4A/4B/4C).
   - Tenant B's customer ID, license keys, and names are completely concealed.
   - **However**, `devices.last_seen_at` displays `2026-10-27T16:00:00Z` (Tenant B's check-in 5 minutes ago).

### 3.2 Information Disclosed (Side-Channel)
- **Active Operational State:** Former tenant infers the hardware is actively in service elsewhere.
- **Operating Hours:** By polling `last_seen_at`, former tenant can determine the daily business hours of the new possessor.
- **Downtime / Ceased Operations:** Former tenant can infer when the hardware was decommissioned or turned off.

---

## 4. Physical-Device Telemetry vs. Tenant-Scoped Activity

| Telemetry Concept | Target Consumer | Semantics | Current System Support |
|-------------------|-----------------|-----------|------------------------|
| **Physical Hardware Health** | Global Support (`SUPPORT`, `SYSTEM`) | "Is this physical silicon board responding to network pings?" | Fully supported on `devices.last_seen_at`. |
| **Tenant-Specific Activity** | Tenant Admins (`OWNER`, `ADMIN`, `AUDITOR`) | "When did this device last interact with *my* store/license?" | Stored in `runtime_checkins.checked_in_at`, but not exposed on the device record. |

---

## 5. Architectural Options for Product Owner Resolution

### Option A: Global-Only Hardware Telemetry (Recommended Minimal Change)
- **Concept:** Treat physical hardware telemetry as an operational support metric. Customer-scoped roles do not need to know physical hardware state when they have no active binding.
- **Implementation:**
  - For `SUPPORT` and `SYSTEM`: Return `last_seen_at` as-is.
  - For customer-scoped roles (`OWNER`, `ADMIN`, `AUDITOR`):
    - If the device currently has an **ACTIVE** binding belonging to the caller's customer: Return `last_seen_at`.
    - If the caller only holds **DEACTIVATED / HISTORICAL** bindings: Return `null` (or omit the field).
- **Pros:**
  - Zero database schema migrations required.
  - Prevents former assignees from observing new tenant pings.
  - Active customers still see their device's live ping time.
- **Cons:**
  - Requires minor adjustment to `AdminDeviceService.ts` query logic.

### Option B: True Tenant-Scoped Telemetry (`tenant_last_seen_at`)
- **Concept:** Replace or augment `last_seen_at` with an authoritative tenant-scoped timestamp derived from the tenant's own check-ins.
- **Implementation:**
  - In SQL for customer-scoped queries:
    ```sql
    SELECT d.device_key_id, d.status, d.created_at,
           (
             SELECT MAX(c.checked_in_at)
             FROM runtime_checkins c
             JOIN license_bindings lb ON lb.id = c.binding_id
             JOIN licenses l ON l.id = lb.license_id
             WHERE lb.device_key_id = d.device_key_id
               AND l.customer_id = ${auth.customerId}
           ) AS last_seen_at
    FROM devices d ...
    ```
- **Pros:**
  - Complete semantic accuracy: Former tenant sees the date *they* last used the device.
  - Active tenant sees the date *they* last used the device.
  - Completely eliminates cross-tenant activity leakage.
- **Cons:**
  - Subquery adds slight overhead to device list queries (mitigated by existing index `idx_runtime_checkins_binding`).

### Option C: Restricted Telemetry (Immediate Interim Defense)
- **Concept:** Completely hide `last_seen_at` from all customer-scoped views until a formal product redesign is completed.
- **Implementation:**
  - Set `last_seen_at: null` or strip the property in `AdminDeviceService` when `auth.scopeType === 'CUSTOMER'`.
- **Pros:**
  - Zero leakage guaranteed.
  - Trivial to implement.
- **Cons:**
  - Removes a useful UI field for active tenants.

---

## 6. Formal Status & Product Decision Block

1. **Approval Status:** **`PENDING PRODUCT APPROVAL`**
   - No architectural decision record (ADR) or product specification in the repository authorizes physical hardware telemetry to be viewed by historical assignees.
2. **Certification Impact:**
   - Under Phase 3C Certification Rules, this unresolved telemetry side-channel **blocks full, unqualified multi-tenancy certification**.
   - Certification must be awarded as **`PASS WITH LIMITATIONS`** (or `READY WITH LIMITATIONS` for hosted QA) until the Product Owner selects Option A, B, or C.

---

## 7. Recommended Action Plan

1. **Step 5 Review:** Present this document to Product and Engineering leadership.
2. **Preferred Recommendation:** Implement **Option B** (Tenant-Scoped Telemetry via `MAX(runtime_checkins.checked_in_at)`), which delivers full semantic correctness for both active and historical tenants without breaking UI expectations.
3. **Hosted QA:** In hosted QA, verify that whatever option is chosen is covered by automated regression tests before production deployment.
