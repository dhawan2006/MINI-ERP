-- =============================================================================
-- Migration 20240101000000_initial_schema.sql
-- Combined schema from Node/Express backend.
-- Preserves all constraints, partial indexes, tables, and types.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS licenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    license_id UUID NOT NULL REFERENCES licenses(id) ON DELETE RESTRICT,
    device_key_id VARCHAR(255) NOT NULL REFERENCES devices(device_key_id) ON DELETE RESTRICT,
    status VARCHAR(50) NOT NULL, -- 'ACTIVE', 'DEACTIVATED'
    activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deactivated_at TIMESTAMPTZ,
    CONSTRAINT chk_deactivated_at_consistency CHECK (
        (status = 'DEACTIVATED' AND deactivated_at IS NOT NULL)
        OR (status <> 'DEACTIVATED')
    )
);

-- INVARIANT DB-01: A device cannot have multiple ACTIVE license bindings simultaneously.
CREATE UNIQUE INDEX IF NOT EXISTS unique_active_device_binding
  ON license_bindings(device_key_id) WHERE status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_license_bindings_license_id ON license_bindings(license_id);
CREATE INDEX IF NOT EXISTS idx_license_bindings_device_key_id ON license_bindings(device_key_id);

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

CREATE TABLE IF NOT EXISTS lifecycle_requests (
    request_id       UUID PRIMARY KEY,
    operation        VARCHAR(32) NOT NULL,
    license_id       UUID REFERENCES licenses(id) ON DELETE SET NULL,
    device_key_id    VARCHAR(255) REFERENCES devices(device_key_id) ON DELETE SET NULL,
    payload_hash     VARCHAR(64) NOT NULL,
    status           VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    response_payload JSONB,
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    completed_at     TIMESTAMPTZ,
    retain_until     TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '90 days')
);

CREATE INDEX IF NOT EXISTS idx_lifecycle_requests_license_id ON lifecycle_requests(license_id) WHERE license_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lifecycle_requests_operation ON lifecycle_requests(operation);

CREATE TABLE IF NOT EXISTS device_challenges (
    challenge_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_key_id VARCHAR(255) NOT NULL,
    nonce VARCHAR(255) NOT NULL,
    purpose VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'CONSUMED'
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_challenges_expires ON device_challenges(expires_at) WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_device_challenges_expires_at ON device_challenges(expires_at);

CREATE TABLE IF NOT EXISTS audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(100) NOT NULL,
    license_id UUID REFERENCES licenses(id) ON DELETE SET NULL,
    device_key_id VARCHAR(255) REFERENCES devices(device_key_id) ON DELETE SET NULL,
    request_id UUID,
    details JSONB,
    admin_id VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_events_license_id ON audit_events(license_id) WHERE license_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_events_created_at ON audit_events(created_at DESC);
