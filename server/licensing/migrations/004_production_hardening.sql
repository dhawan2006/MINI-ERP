-- =============================================================================
-- Migration 004 — Phase 12 Production Schema Hardening
--
-- SAFE: This migration is additive. It adds indexes and constraints that may
--       have been absent from the initial schema. It does NOT drop any tables,
--       columns, or rows.
--
-- IDEMPOTENT: All CREATE INDEX / ALTER TABLE statements use IF NOT EXISTS or
--             are guarded so they can be re-run without error.
--
-- Run order: 004 after 001, 002, 003.
-- =============================================================================
BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Harden license_bindings
--    Ensure deactivated_at is only set when status = 'DEACTIVATED'.
--    (Check constraints cannot be added via IF NOT EXISTS in PG, so we guard
--    with a named constraint and catch the duplicate error in the migration
--    runner if already present.)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_deactivated_at_consistency'
      AND conrelid = 'license_bindings'::regclass
  ) THEN
    ALTER TABLE license_bindings
      ADD CONSTRAINT chk_deactivated_at_consistency
      CHECK (
        (status = 'DEACTIVATED' AND deactivated_at IS NOT NULL)
        OR (status <> 'DEACTIVATED')
      );
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Index: license_bindings lookups by license_id (activation capacity check)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_license_bindings_license_id
  ON license_bindings(license_id);

-- ---------------------------------------------------------------------------
-- 3. Index: license_bindings lookups by device_key_id (deactivation lookup)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_license_bindings_device_key_id
  ON license_bindings(device_key_id);

-- ---------------------------------------------------------------------------
-- 4. Index: lifecycle_requests by license_id (audit/reporting)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_lifecycle_requests_license_id
  ON lifecycle_requests(license_id)
  WHERE license_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 5. Index: lifecycle_requests by operation (operational queries)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_lifecycle_requests_operation
  ON lifecycle_requests(operation);

-- ---------------------------------------------------------------------------
-- 6. Index: audit_events by license_id (audit trail queries)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_audit_events_license_id
  ON audit_events(license_id)
  WHERE license_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 7. Index: audit_events by created_at (time-based audit queries)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_audit_events_created_at
  ON audit_events(created_at DESC);

-- ---------------------------------------------------------------------------
-- 8. Index: device_challenges by expires_at (cleanup/expiry queries)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_device_challenges_expires_at
  ON device_challenges(expires_at);

-- ---------------------------------------------------------------------------
-- 9. Add retention column to lifecycle_requests (documented in Phase 10)
--    Allows future cleanup jobs to identify records past retention window.
-- ---------------------------------------------------------------------------
ALTER TABLE lifecycle_requests
  ADD COLUMN IF NOT EXISTS retain_until TIMESTAMPTZ;

-- Default retention: 90 days from creation for existing rows (backfill).
UPDATE lifecycle_requests
  SET retain_until = created_at + INTERVAL '90 days'
  WHERE retain_until IS NULL;

-- ---------------------------------------------------------------------------
-- 10. Schema version tracking table
--     Allows the startup self-check to verify that all migrations have run.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS schema_migrations (
  version     INTEGER PRIMARY KEY,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  description TEXT NOT NULL
);

INSERT INTO schema_migrations (version, description)
VALUES (4, 'Phase 12 production schema hardening — indexes, constraints, retention column')
ON CONFLICT (version) DO NOTHING;

COMMIT;
