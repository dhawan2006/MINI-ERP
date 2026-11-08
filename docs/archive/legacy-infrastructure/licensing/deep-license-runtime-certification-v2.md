# Deep License Runtime Certification V2
**Date:** 2026-10-02
**Target System:** Mini POS Licensing Subsystem
**Status:** 🟢 PASSED

## Executive Summary of V2
This certification run focused exclusively on resolving a critical edge case during "Seamless Renewal" — the process where a device securely bound to an expired license attempts to activate a new, valid license. While previous unit tests (using `node-postgres`) passed, the actual production runtime (using Deno + `postgres.js` on Supabase Edge Functions) failed with a `500 Internal Server Error`. We have successfully diagnosed, reproduced, fixed, and verified this bug across all environments, culminating in a successful Hosted QA E2E verification.

## The Savepoint Bug Root Cause
The root cause was a subtle difference in transaction savepoint semantics between the `pg` driver used in tests and the `postgres.js` driver used in Edge Functions. 
When activating a new license on a device already bound to an expired one, the `ActivationService` attempts an `INSERT` into `license_bindings`. Because the device is already bound, this triggers a `unique_active_device_binding` constraint violation.

The code correctly wrapped this `INSERT` in a transaction `savepoint`. However, `postgres.js` automatically marks the parent sub-transaction context as aborted upon encountering an error inside a savepoint block. The `ActivationService` caught the error, but attempted to perform the subsequent `UPDATE` (to deactivate the old binding) and the new `INSERT` using the *aborted* savepoint object context rather than the main transaction context. This caused `postgres.js` to throw a fatal driver error, leading to an HTTP 500.

**Fix:** The error handling was refactored so that the `UPDATE` and new `INSERT` operations are executed against the parent transaction object (`tx`), strictly outside the scope of the aborted savepoint block.

## Driver Regression Defense
To ensure this specific driver behavior is continuously validated, a new regression test was added: `server/licensing/tests/driver-savepoint.test.ts`.
This test explicitly uses the `postgres` (postgres.js) NPM package instead of `pg`. It recreates the exact transactional scenario:
1. Inserting isolated mock licenses (one expired, one valid) and a device.
2. Binding the device to the expired license.
3. Executing the exact `tx.savepoint()` closure logic used in `ActivationService`.
4. Verifying that the unique constraint failure is properly caught, the old binding is deactivated, the new binding is activated, and no driver panic occurs.

This test now passes consistently.

## E2E Matrix Validation
A new script (`server/licensing/scripts/gate-e2e-test.ts`) was created to test the seamless renewal scenario completely end-to-end over HTTP. This script:
1. Provisions an isolated test device keypair.
2. Provisions an active (but expired) license and binds the device to it.
3. Provisions a new, valid license.
4. Performs an HTTP `POST /api/v1/activation/challenge` to request a device challenge.
5. Signs the challenge using Node.js `crypto`, correctly prepending the `MINIPOS-DEVICE-CHALLENGE-V1:` domain tag, resulting in a valid DER-encoded ECDSA-SHA256 signature.
6. Submits the `POST /api/v1/activation` request.
7. Verifies the database state transitions accurately from the old license binding to the new license binding.

This matrix was validated multiple times against the runtime.

## Hosted QA Signoff
The `api` Edge Function was successfully deployed to the Supabase Hosted QA environment (`rmkosqdgltiimdhpmrsk`). The E2E script was then executed against the remote HTTP endpoint (`https://rmkosqdgltiimdhpmrsk.supabase.co/functions/v1/api/v1/activation`), successfully connecting to the hosted Edge Function and the QA PostgreSQL database.

The seamless renewal process completed flawlessly over the public internet, proving that the fix works in the real production-like environment with actual networking, Edge Runtime, and driver constraints.

## Final Verdict
The Seamless Renewal feature is now fully operational and certified for production use. The licensing subsystem correctly handles device binding collisions by cleanly revoking the expired authorization and activating the new one within a secure transaction.

**CERTIFIED READY FOR PRODUCTION.**
