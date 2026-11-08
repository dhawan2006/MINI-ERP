-- Phase 3C Step 8: Additive Indexes for Tenant-Scoped Telemetry (Option B)
-- Non-destructive, safe to retry migration.

CREATE INDEX IF NOT EXISTS idx_licenses_customer_id ON licenses(customer_id);
CREATE INDEX IF NOT EXISTS idx_runtime_checkins_binding_checked_in ON runtime_checkins(binding_id, checked_in_at DESC);
