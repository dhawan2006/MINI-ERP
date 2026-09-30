-- =============================================================================
-- Migration 003 — Lifecycle Schema (Production-Safe)
--
-- SAFE: Uses CREATE TABLE IF NOT EXISTS and ADD COLUMN IF NOT EXISTS.
-- Does NOT drop any tables. Existing data is preserved.
--
-- For test environments that need a clean slate, use scripts/reset-test-db.sql
-- before running migrations (never in production).
-- =============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS lifecycle_requests (
  request_id       UUID PRIMARY KEY,
  operation        VARCHAR(32) NOT NULL,
  license_id       UUID REFERENCES licenses(id) ON DELETE SET NULL,
  device_key_id    VARCHAR(255) REFERENCES devices(device_key_id) ON DELETE SET NULL,
  payload_hash     VARCHAR(64) NOT NULL,
  status           VARCHAR(16) NOT NULL DEFAULT 'PENDING',
  response_payload JSONB,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  completed_at     TIMESTAMPTZ
);

ALTER TABLE audit_events
  ADD COLUMN IF NOT EXISTS admin_id VARCHAR(255);

INSERT INTO schema_migrations (version, description)
VALUES (3, 'Lifecycle schema — lifecycle_requests table, admin_id on audit_events')
ON CONFLICT (version) DO NOTHING;

COMMIT;
