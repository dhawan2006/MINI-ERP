-- 20261003100000_rls_security_hardening.sql
-- Security Hardening Phase: RLS and Grants remediation

-- 1. Revoke default public/anon/authenticated grants from all licensing tables
-- This ensures no Data API exposure even if RLS is somehow bypassed or disabled.
REVOKE ALL PRIVILEGES ON TABLE 
    activation_requests,
    admin_roles,
    audit_events,
    customers,
    device_challenges,
    devices,
    license_bindings,
    licenses,
    lifecycle_requests,
    runtime_checkin_challenges,
    runtime_checkin_requests,
    runtime_checkins,
    runtime_directive_deliveries,
    runtime_directives
FROM anon, authenticated;

-- 2. Enable Row Level Security on all licensing tables
-- By enabling RLS without creating any policies for anon/authenticated,
-- we enforce a default-deny posture for any role that doesn't bypass RLS.
ALTER TABLE activation_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE license_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE lifecycle_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE runtime_checkin_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE runtime_checkin_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE runtime_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE runtime_directive_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE runtime_directives ENABLE ROW LEVEL SECURITY;

-- Note: The Edge Functions in this system connect using a direct 
-- 'postgres' role connection string, which automatically bypasses RLS
-- and has full table access. We do not need to create explicit RLS 
-- policies for the 'postgres' role.
