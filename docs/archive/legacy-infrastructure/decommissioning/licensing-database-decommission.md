# Mini POS — Database Decommissioning Strategy
**Document Version:** 1.0  
**Status:** Approved for Safe Execution  
**Scope:** Decommissioning Licensing-Only Schema Objects from Hosted PostgreSQL Database

---

## 1. Executive Summary

As part of the complete architectural removal of the licensing subsystem from Mini POS, all licensing dependencies have been excised from the active application codebase and runtime. Mini POS now functions as a 100% standalone desktop application storing all POS data locally in SQLite (`billing.db`).

The hosted Supabase PostgreSQL database contains both licensing-specific structures and unrelated administrative structures. This document defines the exact classification of all database objects, analyzes foreign-key dependencies, and provides a safe, forward-only migration script for decommissioning licensing tables without data loss to shared administrative or customer data.

---

## 2. Database Object Classification

### A. Exclusively Licensing Tables (Targeted for Decommissioning)

The following tables exist exclusively for license key activation, device binding, cryptographic challenges, and runtime check-in leases:

| Table Name | Original Purpose | Retention / Archival Policy |
|------------|------------------|-----------------------------|
| `licenses` | Stored issued license records and HMACs | Export/archive if auditing past billing/sales contracts; drop for new standalone databases. |
| `license_bindings` | Bound device keys to specific licenses | Export/archive historical binding records; drop. |
| `devices` | Hardware identity public keys and device status | Hardware IDs no longer collected; drop. |
| `activation_requests` | Idempotent activation transaction ledger | Transient protocol ledger; drop. |
| `lifecycle_requests` | Idempotent revoke/extend/suspend ledger | Transient protocol ledger; drop. |
| `device_challenges` | Nonce challenge storage for device proof | Ephemeral; drop. |
| `runtime_checkin_challenges` | Nonce challenge storage for check-ins | Ephemeral; drop. |
| `runtime_checkin_requests` | Check-in idempotency requests | Transient protocol ledger; drop. |
| `runtime_checkins` | Check-in receipts and timestamp telemetry | Transient runtime telemetry; drop. |
| `runtime_directives` | Server-pushed runtime commands to devices | Directives obsolete; drop. |
| `runtime_directive_deliveries` | Directives delivery confirmation ledger | Obsolete; drop. |
| `qa_licensing_settings` | Test mode lease duration configuration | Obsolete; drop. |

### B. Shared Infrastructure (MUST BE PRESERVED)

The following tables serve non-licensing administrative responsibilities in the Admin Panel and must NOT be dropped:

| Table Name | Reason for Retention |
|------------|----------------------|
| `customers` | Core business entity in Admin Panel for managing customer accounts, contact info, and business profiles. |
| `admin_roles` | Core RBAC mapping administrator identities to roles (`OWNER`, `ADMIN`, `SUPPORT`, `FINANCE`, `AUDITOR`). |
| `audit_events` | General security audit log tracking administrative user activity (customer creation, updates, logins). Note: column references to `license_id` and `device_key_id` are nullable and become legacy or can be detached safely. |

---

## 3. Foreign Key Dependency Graph & Safe Drop Order

Dropping tables out of order would violate foreign-key constraints. The exact dependency tree is:

```
customers (PRESERVED)
   │
   └── licenses (CASCADE / SET NULL)
          │
          ├── license_bindings
          │      │
          │      ├── runtime_checkins
          │      │      └── runtime_directive_deliveries
          │      │
          │      └── runtime_directives
          │             └── runtime_directive_deliveries
          │
          ├── activation_requests
          ├── lifecycle_requests
          └── runtime_checkin_requests

devices
   │
   ├── license_bindings
   ├── activation_requests
   ├── lifecycle_requests
   ├── runtime_checkin_requests
   └── runtime_checkin_challenges
```

### Safe Drop Sequence (Leaves Customers & Admin Roles Intact):
1. Drop triggers on `licenses` (e.g. `check_license_customer_not_sentinel`).
2. Drop leaf delivery tables: `runtime_directive_deliveries`.
3. Drop directive and checkin receipt tables: `runtime_directives`, `runtime_checkins`.
4. Drop challenge tables: `runtime_checkin_challenges`, `device_challenges`.
5. Drop idempotency request tables: `runtime_checkin_requests`, `lifecycle_requests`, `activation_requests`.
6. Drop binding table: `license_bindings`.
7. Drop device table: `devices`.
8. Drop licenses table: `licenses`.
9. Drop test setting table: `qa_licensing_settings` (if exists).
10. Detach nullable foreign keys from `audit_events` if present.

---

## 4. Forward-Only Decommission Migration Script

Save as `supabase/migrations/20261101000000_decommission_licensing_schema.sql`:

```sql
-- =============================================================================
-- Migration: 20261101000000_decommission_licensing_schema.sql
-- Forward-only decommissioning of licensing-only tables, functions, and triggers.
-- Preserves customers, admin_roles, and audit_events tables.
-- =============================================================================

BEGIN;

-- 1. Drop licensing triggers
DROP TRIGGER IF EXISTS trg_check_license_customer_not_sentinel ON licenses;
DROP FUNCTION IF EXISTS check_license_customer_not_sentinel();

-- 2. Drop dependent runtime directive deliveries
DROP TABLE IF EXISTS runtime_directive_deliveries CASCADE;

-- 3. Drop runtime directives
DROP TABLE IF EXISTS runtime_directives CASCADE;

-- 4. Drop runtime checkin receipts
DROP TABLE IF EXISTS runtime_checkins CASCADE;

-- 5. Drop challenges
DROP TABLE IF EXISTS runtime_checkin_challenges CASCADE;
DROP TABLE IF EXISTS device_challenges CASCADE;

-- 6. Drop idempotent request ledgers
DROP TABLE IF EXISTS runtime_checkin_requests CASCADE;
DROP TABLE IF EXISTS lifecycle_requests CASCADE;
DROP TABLE IF EXISTS activation_requests CASCADE;

-- 7. Drop license bindings
DROP TABLE IF EXISTS license_bindings CASCADE;

-- 8. Drop devices
DROP TABLE IF EXISTS devices CASCADE;

-- 9. Drop licenses
DROP TABLE IF EXISTS licenses CASCADE;

-- 10. Drop QA licensing settings
DROP TABLE IF EXISTS qa_licensing_settings CASCADE;

-- 11. Clean audit_events table: remove licensing foreign keys and retain general audit
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'audit_events' AND column_name = 'license_id'
    ) THEN
        ALTER TABLE audit_events ALTER COLUMN license_id DROP NOT NULL;
    END IF;
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'audit_events' AND column_name = 'device_key_id'
    ) THEN
        ALTER TABLE audit_events ALTER COLUMN device_key_id DROP NOT NULL;
    END IF;
END $$;

COMMIT;
```

---

## 5. Execution Rules and Safeguards

1. **Pre-Migration Backup:** Always execute `pg_dump` on the hosted database prior to applying the decommission migration:
   ```bash
   pg_dump -h <host> -U postgres -d postgres -F c -b -v -f "pre_licensing_removal_backup.dump"
   ```
2. **Explicit Confirmation:** Never apply destructive SQL without formal signoff.
3. **Application Decoupling:** The application runtime no longer accesses any of these tables. Applying this migration will have zero effect on POS operations.

