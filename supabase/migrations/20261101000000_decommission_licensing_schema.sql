-- =============================================================================
-- Migration: 20261101000000_decommission_licensing_schema.sql
-- Forward-only decommissioning of licensing-only tables, functions, and triggers.
-- Preserves customers, admin_roles, and audit_events tables.
-- =============================================================================

BEGIN;

-- 1. Drop licensing triggers
DROP TRIGGER IF EXISTS trg_license_no_sentinel_customer ON licenses;
DROP TRIGGER IF EXISTS trg_check_license_customer_not_sentinel ON licenses;
DROP FUNCTION IF EXISTS check_license_customer_not_sentinel() CASCADE;

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
DROP TABLE IF EXISTS qa_licensing_test_settings CASCADE;

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

