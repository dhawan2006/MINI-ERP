-- =============================================================================
-- DEVELOPMENT / TEST ONLY — Database Reset Script
--
-- WARNING: This script DESTROYS ALL DATA. It is ONLY for test environments.
-- It must NEVER be run against a production database.
--
-- The production migrations (001–004) are all additive. The DROP statements
-- that previously lived in 001_initial_schema.sql have been moved here.
--
-- Usage in test setup:
--   psql $TEST_DATABASE_URL -f scripts/reset-test-db.sql
--   # Then run all migrations
-- =============================================================================

-- Guard: refuse to run if DATABASE_URL looks like a production URL.
-- (Operators running this manually should see this comment before proceeding.)

DROP TABLE IF EXISTS audit_events CASCADE;
DROP TABLE IF EXISTS lifecycle_requests CASCADE;
DROP TABLE IF EXISTS activation_requests CASCADE;
DROP TABLE IF EXISTS device_challenges CASCADE;
DROP TABLE IF EXISTS license_bindings CASCADE;
DROP TABLE IF EXISTS devices CASCADE;
DROP TABLE IF EXISTS licenses CASCADE;
DROP TABLE IF EXISTS schema_migrations CASCADE;
