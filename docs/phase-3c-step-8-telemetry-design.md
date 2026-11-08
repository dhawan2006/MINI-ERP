# Phase 3C — Step 8: Tenant-Scoped Telemetry Design Document (Option B)

**Document:** `docs/phase-3c-step-8-telemetry-design.md`  
**Author:** Senior Application Security & Multi-Tenant Authorization Engineer  
**Date:** 2026-10-28  
**Target QA Environment:** `hooemticmycoqhoccdsn` (Singapore `ap-southeast-1`)  
**Production Target:** `rmkosqdgltiimdhpmrsk` (Mumbai `ap-south-1`) — **STRICTLY PROHIBITED / UNTOUCHED**  
**Policy Status:** **`LAST_SEEN_AT_POLICY = PENDING PRODUCT APPROVAL`**  
**Tenant-Isolation Sign-Off:** **BLOCKED**  

---

## 1. Executive Summary & Problem Definition

In a multi-tenant POS licensing architecture, hardware terminals can be reassigned between customers over time (e.g. refurbished devices, franchise transfers, or hardware returns). 

Under the repository's certified tenant isolation model:
1. **Device Visibility (Inclusive History):** A customer has read access to a device record if that customer currently holds, or has historically held, an authorized license binding on that hardware.
2. **Binding Redaction:** Cross-tenant binding history is strictly redacted; Customer A never sees Customer B's license keys, binding IDs, or metadata.
3. **The Side-Channel Vulnerability:** The physical table `public.devices` maintains a single column `last_seen_at TIMESTAMPTZ`, updated during POS terminal activations (`/v1/activation`) and runtime check-in heartbeats (`/v1/checkin`).

### 1.1 The Cross-Tenant Activity Inference Side-Channel
When Terminal `DEV-001` is reassigned from Customer A to Customer B:
- Customer A deactivates their binding on `DEV-001`.
- Customer B binds and activates `DEV-001`.
- As Customer B's cash register operates and checks in periodically, `devices.last_seen_at` is updated to the current timestamp.
- When Customer A queries `GET /admin/devices` or `GET /admin/devices/DEV-001`, Customer A observes `last_seen_at` updating in real-time.

**Impact:** Although Customer A cannot view Customer B's name or license keys, Customer A can infer Customer B's operational status, active trading days, store opening/closing hours, and terminal activity patterns.

---

## 2. Option B Architectural Specification

Option B resolves this side-channel by eliminating global hardware timestamp serialization from customer-scoped API surfaces, replacing it with an authoritative, tenant-scoped calculation derived exclusively from qualifying check-ins associated with the caller's own bindings.

### 2.1 Authoritative Ownership Chain
The database establishes a deterministic, multi-hop relationship between check-in receipts and tenant scope:

$$\text{runtime\_checkins} \xrightarrow{\text{binding\_id}} \text{license\_bindings} \xrightarrow{\text{license\_id}} \text{licenses} \xrightarrow{\text{customer\_id}} \text{customers}$$

- `runtime_checkins.binding_id`: Foreign key referencing `license_bindings(id)`.
- `license_bindings.device_key_id`: Foreign key referencing `devices(device_key_id)`.
- `license_bindings.license_id`: Foreign key referencing `licenses(id)`.
- `licenses.customer_id`: Foreign key referencing `customers(id)`.

### 2.2 Tenant-Scoped Telemetry Definition
For any customer-scoped administrator (`OWNER`, `ADMIN`, `AUDITOR`, `FINANCE`), the serialized `last_seen_at` value for device $D$ is formally defined as:

$$\text{tenant\_last\_seen\_at}(D, C) = \max \left\{ rc.\text{checked\_in\_at} \;\middle|\; \begin{array}{l} rc \in \text{runtime\_checkins}, \\ lb \in \text{license\_bindings}, \\ l \in \text{licenses}, \\ lb.\text{id} = rc.\text{binding\_id}, \\ lb.\text{device\_key\_id} = D.\text{device\_key\_id}, \\ l.\text{id} = lb.\text{license\_id}, \\ l.\text{customer\_id} = C, \\ rc.\text{status} \neq \text{'FAILED'} \end{array} \right\}$$

If no qualifying check-ins exist for Customer $C$ on Device $D$, the expression evaluates to `NULL`.

---

## 3. SQL Implementation Architecture

### 3.1 Device Listing Query (`AdminDeviceService.listDevices`)
For customer-scoped requests (`auth.scopeType === 'CUSTOMER'`), the service replaces the physical column `d.last_seen_at` with the correlated subquery:

```sql
SELECT * FROM (
  SELECT d.device_key_id, d.status, d.created_at,
    (
      SELECT MAX(rc.checked_in_at)
      FROM runtime_checkins rc
      JOIN license_bindings lb ON lb.id = rc.binding_id
      JOIN licenses l ON l.id = lb.license_id
      WHERE lb.device_key_id = d.device_key_id
        AND l.customer_id = ${scopedId}
        AND (rc.status IS NULL OR rc.status != 'FAILED')
    ) AS last_seen_at
  FROM devices d
  WHERE EXISTS (
    SELECT 1
    FROM license_bindings lb
    JOIN licenses l ON l.id = lb.license_id
    WHERE lb.device_key_id = d.device_key_id
      AND l.customer_id = ${scopedId}
  )
  -- Optional search: AND d.device_key_id ILIKE ${'%' + search + '%'}
) sub
ORDER BY sub.last_seen_at DESC NULLS LAST, sub.device_key_id ASC
LIMIT ${limit} OFFSET ${offset};
```

### 3.2 Device Detail Query (`AdminDeviceService.getDevice`)
```sql
SELECT d.device_key_id, d.status, d.created_at,
  (
    SELECT MAX(rc.checked_in_at)
    FROM runtime_checkins rc
    JOIN license_bindings lb ON lb.id = rc.binding_id
    JOIN licenses l ON l.id = lb.license_id
    WHERE lb.device_key_id = d.device_key_id
      AND l.customer_id = ${scopedId}
      AND (rc.status IS NULL OR rc.status != 'FAILED')
  ) AS last_seen_at
FROM devices d
WHERE d.device_key_id = ${deviceKeyId}
  AND EXISTS (
    SELECT 1
    FROM license_bindings lb
    JOIN licenses l ON l.id = lb.license_id
    WHERE lb.device_key_id = d.device_key_id
      AND l.customer_id = ${scopedId}
  );
```

### 3.3 Global Role Telemetry Preservation
For global roles (`SUPPORT`, `SYSTEM`):
- Physical device health telemetry (`devices.last_seen_at`) is preserved as-is.
- No subquery overhead is added to global queries.
- Global support operators can monitor whether physical hardware is checking in regardless of customer tenancy.

---

## 4. Null Semantics & Edge Cases

| Scenario | Tenant-Scoped Value | Global Role Value | UI Rendering (`admin-ui`) |
|---|---|---|---|
| **Active binding with verified check-ins** | Latest qualifying `checked_in_at` | Global `devices.last_seen_at` | Formatted locale timestamp (e.g. `10/28/2026, 2:30 PM`) |
| **New device bound, no check-ins yet** | `null` | Global `devices.last_seen_at` | `'Never'` |
| **Reassigned device: former tenant query** | Former tenant's latest `checked_in_at` (historical frozen timestamp) | Global `devices.last_seen_at` (new tenant's live heartbeat) | Former tenant's historical date |
| **Reassigned device: former tenant with zero check-ins** | `null` | Global `devices.last_seen_at` | `'Never'` |
| **Reassigned device: new tenant query** | New tenant's latest `checked_in_at` | Global `devices.last_seen_at` | New tenant's date |
| **Non-owned device query** | `404 Not Found` (Zero disclosure) | Full device detail | N/A (404 error page) |

---

## 5. Additive Migration & Performance Plan

### 5.1 Additive Index Migration
To guarantee sub-millisecond execution for the correlated subquery, an additive, non-destructive migration is introduced:
- Migration: `20261005000003_tenant_telemetry_indexes.sql`
- Statements:
  ```sql
  CREATE INDEX IF NOT EXISTS idx_licenses_customer_id ON licenses(customer_id);
  CREATE INDEX IF NOT EXISTS idx_runtime_checkins_binding_checked_in ON runtime_checkins(binding_id, checked_in_at DESC);
  ```

### 5.2 Query Plan Analysis
1. `idx_license_bindings_device_key_id` indexes bindings for the device.
2. `idx_licenses_customer_id` allows instantaneous verification of `licenses.customer_id = ${scopedId}`.
3. `idx_runtime_checkins_binding_checked_in` allows an index-only scan to fetch `MAX(checked_in_at)` in $O(1)$ operations per binding.
4. Total subquery cost is bounded by the small number of historical bindings a single device has (typically 1–3).

---

## 6. API and UI Surfaces Affected

1. **Edge Function Service:** `supabase/functions/_shared/services/AdminDeviceService.ts`.
2. **Admin API Routes:**
   - `GET /admin/devices` (Collection list; exposes tenant-scoped `last_seen_at`).
   - `GET /admin/devices/:id` (Device detail; exposes tenant-scoped `last_seen_at`).
3. **Admin UI Frontend:**
   - `admin-ui/src/pages/Devices/DevicesList.tsx` (Table column: handles `null` as `'Never'`).
   - `admin-ui/src/pages/Devices/DeviceDetail.tsx` (Metadata badge: handles `null` as `'Never'`).
   - `admin-ui/src/api/devices.ts` (TypeScript DTO: `last_seen_at: string | null`).

---

## 7. Governance Status & Blocker Record

### Policy Status: `LAST_SEEN_AT_POLICY = PENDING PRODUCT APPROVAL`
- **Current Authorization:** Option B represents the engineering-approved implementation direction designed to eliminate the telemetry inference side-channel.
- **Formal Approval Status:** **PENDING PRODUCT APPROVAL**. Formal product-owner sign-off has not yet been recorded.
- **Certification Boundary:** Complete multi-tenant isolation sign-off remains **BLOCKED** until formal product-owner approval is documented. Production promotion remains strictly **PROHIBITED**.
