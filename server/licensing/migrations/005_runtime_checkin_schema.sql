-- Phase 1B & 1C: Additive Migrations

CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_name VARCHAR(255),
    contact_name VARCHAR(255),
    email VARCHAR(255),
    phone VARCHAR(50),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE licenses ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS runtime_checkin_challenges (
    challenge_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_key_id VARCHAR(255) NOT NULL,
    nonce VARCHAR(255) NOT NULL,
    purpose VARCHAR(100) NOT NULL CHECK (purpose = 'RUNTIME_CHECKIN'),
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'CONSUMED')),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_runtime_challenges_expires ON runtime_checkin_challenges(expires_at) WHERE status = 'PENDING';

CREATE TABLE IF NOT EXISTS runtime_checkin_requests (
    request_id UUID PRIMARY KEY, -- Idempotency key provided by client
    license_id UUID REFERENCES licenses(id) ON DELETE SET NULL,
    device_key_id VARCHAR(255) REFERENCES devices(device_key_id) ON DELETE SET NULL,
    payload_hash VARCHAR(64) NOT NULL,
    status VARCHAR(50) NOT NULL CHECK (status IN ('PENDING', 'SUCCESS', 'FAILED', 'CONFLICT')),
    response_payload JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS runtime_checkins (
    receipt_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID NOT NULL REFERENCES runtime_checkin_requests(request_id) ON DELETE RESTRICT UNIQUE,
    binding_id UUID NOT NULL REFERENCES license_bindings(id) ON DELETE RESTRICT,
    checked_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    check_in_valid_until TIMESTAMPTZ NOT NULL,
    status VARCHAR(50) NOT NULL,
    receipt_payload JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_runtime_checkins_binding ON runtime_checkins(binding_id);

CREATE TABLE IF NOT EXISTS runtime_directives (
    directive_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_binding_id UUID REFERENCES license_bindings(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL CHECK (type IN ('DISPLAY_MESSAGE', 'REQUIRE_RECHECK', 'CONTACT_SUPPORT', 'REQUIRE_UPDATE', 'REQUIRE_DEACTIVATION')),
    payload JSONB,
    priority VARCHAR(20) DEFAULT 'NORMAL',
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'DELIVERED', 'ACKNOWLEDGED', 'CANCELLED', 'EXPIRED')),
    requires_acknowledgement BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_runtime_directives_binding ON runtime_directives(target_binding_id) WHERE status = 'PENDING';

CREATE TABLE IF NOT EXISTS runtime_directive_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    directive_id UUID NOT NULL REFERENCES runtime_directives(directive_id) ON DELETE CASCADE,
    receipt_id UUID REFERENCES runtime_checkins(receipt_id) ON DELETE SET NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'DELIVERED' CHECK (status IN ('DELIVERED', 'ACKNOWLEDGED')),
    delivered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    acknowledged_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS admin_roles (
    admin_id UUID PRIMARY KEY,
    role VARCHAR(50) NOT NULL CHECK (role IN ('OWNER', 'ADMIN', 'SUPPORT', 'FINANCE', 'AUDITOR')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
