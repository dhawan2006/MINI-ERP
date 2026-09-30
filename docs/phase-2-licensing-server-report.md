# Mini POS — Phase 2 Licensing Server Report

## 1. Result

PASS

## 2. Architecture

The licensing server was implemented as a standalone Node.js, Express, and PostgreSQL application under `server/licensing/`. It uses a layered architecture strictly isolating validation (Zod), business logic (Services), database transactions (`pg` PoolClient passing), and HTTP routing (Express). The client integration boundaries (e.g., the Activation API) are strictly represented but explicitly reject traffic pending the completion of the Phase 3 cryptographic implementation.

## 3. Database Schema

- **licenses**: Represents commercial truth. Stores `id` (uuid), `product_id`, `license_key_hmac`, status, validity windows, and concurrency limits (`max_devices`).
- **devices**: Stores discovered devices (`device_key_id`, `public_key`). No private keys are retained.
- **license_bindings**: Tracks active device relationships to licenses (`license_id`, `device_key_id`, `status`). Enforces cardinality rules.
- **activation_requests**: Provides atomic idempotency. Tracks `request_id`, request hashing, and logical outcomes.
- **audit_events**: Append-only log of security events (e.g., `LICENSE_CREATED`, `ACTIVATION_SUCCESS`, `ACTIVATION_FAILED`), never logging plain text secrets.

## 4. Database Constraints

- `unique_active_device_binding`: A partial unique index on `license_bindings(device_key_id)` where `status = 'ACTIVE'`, strictly ensuring INVARIANT DB-01 (one active license per device).
- `activation_requests(request_id) PRIMARY KEY`: Prevents multiple insertions of the same idempotency ID concurrently via `ON CONFLICT DO NOTHING`.
- `chk_valid_dates`: Ensures `valid_from < valid_until`.
- `chk_max_devices`: Ensures `max_devices > 0`.
- Foreign key constraints enforce strict referential integrity across bindings and audits (`ON DELETE RESTRICT` / `SET NULL`).

## 5. License Key Security

Plaintext license keys are dynamically generated (Crockford's Base32 format for readability) by `generateLicenseKey()`. The plaintext is returned exactly once during administrative creation and is **never logged or persisted**. The server persists only an `HMAC-SHA-256(secret, canonicalKey)` to allow constant-time indexed lookup without risking leakage of the plaintext keys if the database is compromised.

## 6. Transaction Design

The `ActivationService` explicitly requires a PostgreSQL transaction client (`PoolClient`). It utilizes explicit PostgreSQL locking mechanisms:
- `SELECT ... FOR UPDATE` against the `licenses` table prevents max-devices race conditions by serializing concurrent activations against the same license.
- PostgreSQL `SAVEPOINT` is utilized immediately prior to binding insertion. This allows constraints (like `unique_active_device_binding`) to trigger errors safely without permanently aborting the outer transaction block, preserving the ability to record the failure in the `activation_requests` cache and `audit_events`.

## 7. Idempotency

Implemented utilizing `activation_requests` with an `ON CONFLICT DO NOTHING` idempotency initialization strategy. It captures the logical fingerprint of the request.
- Concurrent identical requests hit the `PENDING` state and are logically rejected to break the race condition.
- Identical retries following a successful transaction immediately yield the cached deterministic authorization payload without mutating business state or logging duplicate activations.

## 8. Concurrency Results

Vitest test matrix (`activation.concurrency.test.ts`) executed perfectly:
- **SCENARIO A (100 devices -> 1 license -> maxDevices=1)**: 1 Success, 99 `DEVICE_LIMIT_REACHED` rejections. Final DB state: 1 Active Binding.
- **SCENARIO B (1 device -> 100 different licenses)**: 1 Success, 99 `DEVICE_ALREADY_BOUND` rejections via unique partial index. Final DB state: 1 Active Binding.
- **SCENARIO C (100 simultaneous retries -> same request ID)**: 1 physical activation transaction succeeded, 99 logical idempotent returns / conflict aborts. Zero duplicate bindings. Final DB state: 1 Active Binding.
- **SCENARIO D (10 concurrent different request IDs -> same device/license)**: 1 physical activation succeeded, remainder failed to bypass constraint/logic checks. Final DB state: 1 Active Binding.

## 9. Validation

Zod schema parsing validates inputs directly at boundaries.
- String length/datetime constraints.
- `maxDevices` is enforced as `z.number().int().positive()`.
- Invalid objects instantly yield a `400 INVALID_REQUEST` rejecting further traversal.

## 10. Security Controls

- Idempotency transaction boundaries.
- Cryptographic hash storage for the master bearer token (license key).
- Placeholder abstract boundary for the Ed25519 Device Proof.
- Explicit Express size limits (`100kb` JSON payload limit) and basic rate limiting via `express-rate-limit`.
- No sensitive configuration (HMAC secret, DB credentials, Admin Tokens) embedded in source code (enforced via `.env` / Zod `configSchema`).
- Disabling of stack-trace exposure via global error handlers.

## 11. Tests

- 4 distinct mandatory Database Transaction Concurrency Test Scenarios (spanning ~410 simultaneous transactions).
- All 4 passed comprehensively demonstrating 0 invariant failures.

## 12. Remaining Limitations

- **Cryptographic client/device-proof protocol not yet implemented**: The `IDeviceProofVerifier` boundary intentionally mocks the signature check for Phase 2 isolation testing.
- **Client integration not yet implemented**: Mini POS React renderer and Electron IPC remain unpatched.
- **Production signing not yet implemented**: The server issues a mock signed authorization payload.

## 13. Files Created

- `server/licensing/migrations/001_initial_schema.sql`
- `server/licensing/src/config/config.ts`
- `server/licensing/src/config/db.ts`
- `server/licensing/src/validation/schemas.ts`
- `server/licensing/src/crypto/licenseKey.ts`
- `server/licensing/src/crypto/deviceProof.ts`
- `server/licensing/src/services/AuditService.ts`
- `server/licensing/src/services/LicenseService.ts`
- `server/licensing/src/services/DeviceService.ts`
- `server/licensing/src/services/ActivationService.ts`
- `server/licensing/scripts/migrate.ts`
- `server/licensing/tests/dbCleaner.ts`
- `server/licensing/tests/activation.concurrency.test.ts`
- `server/licensing/vitest.config.ts`
- `server/licensing/src/app.ts`
- `server/licensing/src/server.ts`
- `docs/phase-2-licensing-server-report.md`

## 14. Files Modified

None outside of `server/licensing/` and `docs/`. **NO CLIENT CODE WAS MODIFIED.**

## 15. Production Readiness

**SERVER FOUNDATION READY**
The PostgreSQL schema, service boundaries, and transaction logic are production-quality and safely modeled. The system awaits the final cryptographic logic defined in Phase 3. The overall **FULL LICENSING SYSTEM IS NOT YET READY**.
