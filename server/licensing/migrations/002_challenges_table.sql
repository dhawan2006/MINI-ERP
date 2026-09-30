-- =============================================================================
-- Migration 002 — Device Challenges Table (Production-Safe)
--
-- SAFE: Uses CREATE TABLE IF NOT EXISTS and CREATE INDEX IF NOT EXISTS.
-- Does NOT drop any tables. Existing data is preserved.
-- =============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS device_challenges (
    challenge_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_key_id VARCHAR(255) NOT NULL,
    nonce VARCHAR(255) NOT NULL,
    purpose VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'CONSUMED'
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for quickly finding and purging expired challenges
CREATE INDEX IF NOT EXISTS idx_challenges_expires
  ON device_challenges(expires_at) WHERE status = 'PENDING';

INSERT INTO schema_migrations (version, description)
VALUES (2, 'Device challenges table')
ON CONFLICT (version) DO NOTHING;

COMMIT;
