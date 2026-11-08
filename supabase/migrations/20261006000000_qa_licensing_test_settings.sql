-- QA-only accelerated licensing policy. The Edge Function additionally checks
-- the Supabase project hostname against the designated QA ref before reading
-- or writing this table. RLS has no client policies: access is server-only.
CREATE TABLE IF NOT EXISTS qa_licensing_test_settings (
    singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton = TRUE),
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    license_duration_seconds INTEGER,
    offline_lease_seconds INTEGER NOT NULL DEFAULT 604800,
    updated_by UUID,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_qa_license_duration CHECK (
      license_duration_seconds IS NULL OR license_duration_seconds IN (60, 300, 900)
    ),
    CONSTRAINT chk_qa_offline_lease CHECK (offline_lease_seconds IN (30, 60, 120, 604800))
);

INSERT INTO qa_licensing_test_settings(singleton, enabled, license_duration_seconds, offline_lease_seconds)
VALUES (TRUE, FALSE, NULL, 604800)
ON CONFLICT (singleton) DO NOTHING;

ALTER TABLE qa_licensing_test_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE qa_licensing_test_settings FROM anon, authenticated;
