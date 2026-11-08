-- Phase 3C Step 2.1: Customer Scope Foundation Hardening
-- Fixes: one-customer-per-admin enforcement, UNASSIGNED sentinel marking, SYSTEM role in constraint

-- =========================================================================
-- 1. FIX: One-customer-per-scoped-admin enforcement
-- =========================================================================
-- PROBLEM: idx_admin_roles_unique_customer ON (admin_id, customer_id)
-- only prevents the same (admin_id, customer_id) pair from existing twice.
-- It does NOT prevent admin_id=X from having rows for BOTH customer_id=A 
-- AND customer_id=B. An admin could gain access to multiple customers.
--
-- FIX: Drop the flawed per-pair index and replace with a unique index
-- on just (admin_id) WHERE scoped. This guarantees one scoped membership total.

DROP INDEX IF EXISTS idx_admin_roles_unique_customer;

-- A scoped admin can only belong to exactly ONE customer, period.
CREATE UNIQUE INDEX idx_admin_roles_unique_scoped_admin
ON admin_roles (admin_id)
WHERE customer_id IS NOT NULL;

-- =========================================================================
-- 2. FIX: Mark the UNASSIGNED sentinel customer explicitly
-- =========================================================================
-- PROBLEM: The UNASSIGNED migration customer (all-zeros UUID) is just a
-- regular customers row. It could theoretically be confused with a real
-- tenant, or be returned in customer lists, or be the target of license
-- creation, etc.
--
-- FIX: Add an is_sentinel column to the customers table and mark the 
-- all-zeros UUID. Application logic should exclude or guard against 
-- sentinel rows.

ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_sentinel BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE customers 
SET is_sentinel = TRUE
WHERE id = '00000000-0000-0000-0000-000000000000';

-- Prevent future customers from being created with is_sentinel = TRUE
-- via a check (only the known sentinel ID may have this flag)
-- We enforce that real customers cannot set this flag to TRUE
-- at the application layer; no new sentinel rows should be inserted.
-- A guard check: the sentinel can only be the all-zeros UUID.
ALTER TABLE customers ADD CONSTRAINT check_sentinel_uuid
CHECK (
  (is_sentinel = FALSE)
  OR 
  (is_sentinel = TRUE AND id = '00000000-0000-0000-0000-000000000000')
);

-- =========================================================================
-- 3. FIX: admin_roles_role_check was missing SYSTEM
-- =========================================================================
-- PROBLEM: The original role_check constraint does not include 'SYSTEM'.
-- While SYSTEM admins are authenticated via ADMIN_API_TOKEN and don't 
-- need database rows, the constraint should accurately reflect all valid
-- roles to avoid silent data corruption if a SYSTEM row were ever inserted.
-- NOTE: SYSTEM tokens do NOT have admin_roles rows -- the constraint 
-- is protective rather than permissive.

ALTER TABLE admin_roles DROP CONSTRAINT IF EXISTS admin_roles_role_check;
ALTER TABLE admin_roles ADD CONSTRAINT admin_roles_role_check
CHECK (role IN ('OWNER', 'ADMIN', 'SUPPORT', 'FINANCE', 'AUDITOR', 'SYSTEM'));

-- =========================================================================
-- 4. VERIFY: Test that one admin cannot have two customer memberships
-- =========================================================================
-- (This is validated at migration time via the new unique index)
DO $$
BEGIN
  -- Ensure no existing rows violate the new constraint before applying it
  IF EXISTS (
    SELECT admin_id, COUNT(*) 
    FROM admin_roles
    WHERE customer_id IS NOT NULL
    GROUP BY admin_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Migration pre-check failed: Admin with multiple scoped memberships exists. Manual remediation required before applying this migration.';
  END IF;
  RAISE NOTICE 'Pre-check passed: No admin has multiple scoped memberships.';
END
$$;
