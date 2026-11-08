-- Phase 3C: Customer Boundary Security Model - Admin Scope Foundation

-- 1. Create a dummy "Unassigned" customer for migration of existing CUSTOMER-SCOPED rows that lack a customer_id.
-- This prevents data loss while fulfilling the NOT NULL constraints.
INSERT INTO customers (id, business_name)
VALUES ('00000000-0000-0000-0000-000000000000', 'UNASSIGNED_LEGACY_MIGRATION')
ON CONFLICT (id) DO NOTHING;

-- 2. Add id and customer_id to admin_roles
ALTER TABLE admin_roles ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();
ALTER TABLE admin_roles ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id) ON DELETE RESTRICT;

-- 3. Migrate existing rows
-- If role is SUPPORT or SYSTEM, keep customer_id NULL.
-- If role is OWNER, ADMIN, FINANCE, AUDITOR, assign to the dummy customer.
UPDATE admin_roles 
SET customer_id = '00000000-0000-0000-0000-000000000000'
WHERE role IN ('OWNER', 'ADMIN', 'FINANCE', 'AUDITOR') AND customer_id IS NULL;

-- 4. Change Primary Key from admin_id to id
ALTER TABLE admin_roles DROP CONSTRAINT IF EXISTS admin_roles_pkey;
ALTER TABLE admin_roles ADD PRIMARY KEY (id);

-- 5. Add constraints for valid role/scope permutations
ALTER TABLE admin_roles ADD CONSTRAINT check_admin_role_scope CHECK (
  (role IN ('SUPPORT', 'SYSTEM') AND customer_id IS NULL)
  OR
  (role IN ('OWNER', 'ADMIN', 'FINANCE', 'AUDITOR') AND customer_id IS NOT NULL)
);

-- 6. Add uniqueness constraints to prevent duplication
-- A user can only have one global role.
CREATE UNIQUE INDEX idx_admin_roles_unique_global 
ON admin_roles (admin_id) 
WHERE customer_id IS NULL;

-- A user can only have one membership per customer.
CREATE UNIQUE INDEX idx_admin_roles_unique_customer 
ON admin_roles (admin_id, customer_id) 
WHERE customer_id IS NOT NULL;

