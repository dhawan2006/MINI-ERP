-- Migration: Admin Idempotency and Secrets
CREATE TABLE IF NOT EXISTS admin_idempotency_keys (
    request_id UUID PRIMARY KEY,
    admin_id VARCHAR(255) NOT NULL,
    path VARCHAR(255) NOT NULL,
    payload_hash VARCHAR(64) NOT NULL,
    response_body JSONB,
    response_status INTEGER,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
