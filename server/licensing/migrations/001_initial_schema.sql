-- =============================================================================
-- Migration 001 — Initial Schema (Production-Safe)
--
-- SAFE: All CREATE statements use IF NOT EXISTS.
-- Does NOT drop any tables. Existing data is never destroyed.
--
-- To reset a test database, use: scripts/reset-test-db.sql (NEVER in prod)
-- =============================================================================
BEGIN;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS licenses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id VARCHAR(255) NOT NULL,
    license_key_hmac VARCHAR(255) NOT NULL UNIQUE,
    status VARCHAR(50) NOT NULL, -- 'ACTIVE', 'REVOKED', 'DISABLED'
    valid_from TIMESTAMPTZ NOT NULL,
    valid_until TIMESTAMPTZ NOT NULL,
    max_devices INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ,
    CONSTRAINT chk_valid_dates CHECK (valid_from < valid_until),
    CONSTRAINT chk_max_devices CHECK (max_devices > 0)
);

CREATE TABLE IF NOT EXISTS devices (
    device_key_id VARCHAR(255) PRIMARY KEY,
    public_key VARCHAR(1024) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS license_bindings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    license_id UUID NOT NULL REFERENCES licenses(id) ON DELETE RESTRICT,
    device_key_id VARCHAR(255) NOT NULL REFERENCES devices(device_key_id) ON DELETE RESTRICT,
    status VARCHAR(50) NOT NULL, -- 'ACTIVE', 'DEACTIVATED'
    activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deactivated_at TIMESTAMPTZ
);

-- INVARIANT DB-01: A device cannot have multiple ACTIVE license bindings simultaneously.
CREATE UNIQUE INDEX IF NOT EXISTS unique_active_device_binding
  ON license_bindings(device_key_id) WHERE status = 'ACTIVE';

CREATE TABLE IF NOT EXISTS activation_requests (
    request_id UUID PRIMARY KEY,
    license_id UUID REFERENCES licenses(id) ON DELETE SET NULL,
    device_key_id VARCHAR(255) REFERENCES devices(device_key_id) ON DELETE SET NULL,
    request_fingerprint VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL, -- 'PENDING', 'SUCCESS', 'FAILED', 'CONFLICT'
    response_payload JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS audit_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_type VARCHAR(100) NOT NULL,
    license_id UUID REFERENCES licenses(id) ON DELETE SET NULL,
    device_key_id VARCHAR(255) REFERENCES devices(device_key_id) ON DELETE SET NULL,
    request_id UUID,
    details JSONB,
    admin_id VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Schema version tracking
CREATE TABLE IF NOT EXISTS schema_migrations (
    version     INTEGER PRIMARY KEY,
    applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    description TEXT NOT NULL
);

INSERT INTO schema_migrations (version, description)
VALUES (1, 'Initial schema — licenses, devices, bindings, activation_requests, audit_events')
ON CONFLICT (version) DO NOTHING;

COMMIT;
