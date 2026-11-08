-- Phase 3C Step 3 — Sentinel License Protection
-- Adds a database-level constraint to prevent licenses from being created
-- for the sentinel customer (00000000-0000-0000-0000-000000000000).
--
-- Defense-in-depth: the application layer (AdminLicenseService.createLicense)
-- already rejects sentinel targets before any INSERT. This DB constraint
-- ensures the invariant holds even if the application check is bypassed
-- (e.g., direct DB inserts, migration scripts, future code paths).
--
-- Invariant:
--   real license.customer_id → real customer → is_sentinel = FALSE

-- Trigger function: raises an exception if the target customer is a sentinel.
-- Called on BEFORE INSERT on licenses.
CREATE OR REPLACE FUNCTION check_license_customer_not_sentinel()
RETURNS TRIGGER AS $$
DECLARE
  target_is_sentinel BOOLEAN;
BEGIN
  IF NEW.customer_id IS NOT NULL THEN
    SELECT is_sentinel INTO target_is_sentinel
    FROM customers
    WHERE id = NEW.customer_id;

    IF target_is_sentinel IS TRUE THEN
      RAISE EXCEPTION 'SENTINEL_CUSTOMER_FORBIDDEN: Cannot create a license for sentinel customer %', NEW.customer_id
        USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists (idempotent migration)
DROP TRIGGER IF EXISTS trg_license_no_sentinel_customer ON licenses;

-- Attach trigger BEFORE INSERT on licenses
CREATE TRIGGER trg_license_no_sentinel_customer
BEFORE INSERT ON licenses
FOR EACH ROW
EXECUTE FUNCTION check_license_customer_not_sentinel();
