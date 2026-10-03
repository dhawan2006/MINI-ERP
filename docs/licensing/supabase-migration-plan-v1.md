# Mini POS — Supabase Licensing Migration Plan

## 1. Executive Summary
This document outlines the migration strategy for moving the Mini POS licensing backend from a Node.js/Express application to Supabase Edge Functions and PostgreSQL. The primary requirement is that this migration is **infrastructure-only**. The API contract, security properties, error semantics, database invariants, and offline-first Electron client behavior must remain strictly identical to the certified implementation (commit `7792f7bc1262f75b74c6f4e164d9c9b7b3d930ec`).

## 2. Current Architecture
- **Runtime**: Node.js, Express.
- **Database**: PostgreSQL with `pg` module.
- **Security**: Ed25519 authorization signatures, P-256 device challenge proofs, strictly separated cryptographic operations, domain-separated payloads.
- **State Management**: Database transactions with strict `SELECT ... FOR UPDATE` locking to prevent TOCTOU concurrency bugs on seat limits.

## 3. Current Runtime Flow
Example for Activation:
```text
Electron Main (LicensingRuntimeService)
    ↓
LicensingClient
    ↓ HTTPS POST /api/v1/activation
Express Route (activation.ts)
    ↓
ActivationService (transaction bounds)
    ↓ (DB Lock & Validate)
PostgreSQL query (license_bindings, licenses, devices)
    ↓ (Sign payload)
ServerAuthorizationSigner (Ed25519)
    ↓
Express Response (JSON)
```

## 4. Complete API Contract
All endpoints consume and produce JSON. Strict `zod` validation is applied.

### `POST /api/v1/activation/challenge`
- **Purpose**: Issue a cryptographic nonce challenge for a device.
- **Request**: `{ "deviceKeyId": string }`
- **Response**: `200 OK`, `{ protocolVersion: 1, challengeId: string, issuedAt: string, expiresAt: string, nonce: string, deviceKeyId: string, purpose: 'ACTIVATION' }`

### `POST /api/v1/activation`
- **Purpose**: Complete device binding and receive a signed authorization.
- **Request**: `{ requestId: UUID, licenseKey: string, deviceKeyId: string, publicKey: string, deviceProof: { challenge: any, signature: string } }`
- **Response**: `200 OK`, `{ status: "SUCCESS", licenseId: string, payload: { authorization: SignedAuthorization, licenseId: string } }`
- **Idempotency**: Indexed by `requestId`. Reused `requestId` with the same payload returns the cached `response_payload`. Reused `requestId` with different payload throws `409 Conflict`.

### `POST /api/v1/lifecycle/deactivation/challenge`
- **Purpose**: Issue a challenge for deactivation.
- **Request**: `{ "deviceKeyId": string, "licenseId": UUID }`
- **Response**: Similar to activation challenge, but purpose is `DEACTIVATION`.

### `POST /api/v1/lifecycle/deactivation`
- **Purpose**: Deactivate an active binding, freeing up a seat.
- **Request**: `{ requestId: UUID, licenseId: UUID, deviceKeyId: string, proof: ProofPayload }`
- **Response**: `200 OK`, `{ status: "DEACTIVATED", timestamp: string }`

### Admin Endpoints (`/api/v1/admin/lifecycle/*`)
- **Purpose**: Administrative overrides (release-binding, revoke-license, restore-license).
- **Auth**: `Bearer <ADMIN_API_TOKEN>`
- **Requests**: Require `licenseId`, `reason` (and `deviceKeyId` for binding release).
- **Responses**: `{ status: 'SUCCESS' }` or 400/401 errors.

## 5. Database Schema Map
- **`licenses`**: Tracks product, HMAC of license key, valid dates, max devices, and status.
- **`devices`**: Tracks registered devices and their P-256 public keys.
- **`license_bindings`**: Junction table. `UNIQUE INDEX` on `device_key_id WHERE status = 'ACTIVE'`.
- **`activation_requests` / `lifecycle_requests`**: Stores `request_id`, `request_fingerprint`/`payload_hash`, `status`, and `response_payload` for strict idempotency and deduplication.
- **`device_challenges`**: Stores issued challenges. Atomic consumption via `UPDATE ... WHERE status = 'PENDING' AND expires_at > NOW()`.
- **`audit_events`**: Append-only log of all security-relevant actions.

## 6. Transaction Map
**Activation Transaction Boundaries:**
1. Insert `activation_requests` (idempotency check)
2. Lock `activation_requests` via `SELECT FOR UPDATE`
3. Verify P-256 device proof
4. Lock `licenses` via `SELECT FOR UPDATE`
5. Upsert `devices`
6. Check/Lock `license_bindings` via `SELECT FOR UPDATE` (Idempotent success if already bound)
7. Capacity check (`COUNT(*)`)
8. Savepoint `before_binding`
9. Insert `license_bindings`. If duplicate device constraint violation, rollback to savepoint, deactivate old binding, and re-insert new binding (Seamless Renewal).
10. Sign authorization payload.
11. Update `activation_requests` with success payload.
12. Insert `audit_events`.
13. Commit.

Must preserve these exact isolation properties in Supabase PostgreSQL via Deno `pg` or `postgres` drivers.

## 7. Crypto Contract
- **Client → Server (Device Proof)**: P-256 ECDSA. Canonicalized challenge payload prefixed with `MINIPOS-DEVICE-CHALLENGE-V1:`. Signed by the Secure Enclave. Verified on the server.
- **Server → Client (Authorization)**: Ed25519. Canonicalized authorization payload prefixed with `MINIPOS-AUTHORIZATION-V1:`. Signed by the server private key (`LICENSING_SERVER_PRIVATE_KEY`). Verified locally by the Electron client.
- Base64url encoding is used strictly for signatures.

## 8. License Key Lifecycle
- Generated as plaintext: `XXXX-XXXX-XXXX-XXXX-XXXX`.
- Canonicalized (uppercase, non-alphanumeric stripped).
- Hashed using `crypto.createHmac('sha256', config.LICENSE_KEY_HMAC_SECRET)`.
- Server only stores the HMAC in `license_key_hmac`. Plaintext is NEVER stored.

## 9. Challenge/Replay Model
Challenges have a `UUID`, `nonce` (32 bytes base64url), and `expires_at`.
To consume: `UPDATE device_challenges SET status = 'CONSUMED' WHERE challenge_id = $1 AND device_key_id = $2 AND purpose = $3 AND status = 'PENDING' AND expires_at > NOW() RETURNING challenge_id`. If `rowCount === 0`, it rejects as a replay or expired.

## 10. Rate Limiting
Currently in-memory via `express-rate-limit`:
- `general`: 100 req / 15m
- `lifecycle` (activation/deactivation): 20 req / 1h
- `admin`: 30 req / 1h
In Supabase Edge Functions, this must be reimplemented either via Supabase API Gateway, Redis/Upstash, or a lightweight DB-backed token bucket, as Deno Edge Functions are stateless and globally distributed.

## 11. Error Contract
Standardized internal codes mapped to HTTP statuses:
- `400 Bad Request`: `LIFECYCLE_INVALID_REQUEST`, `DEVICE_PROOF_INVALID`, `LICENSE_NOT_FOUND`, `LICENSE_REVOKED`, `LICENSE_DISABLED`, `LICENSE_EXPIRED`, `DEVICE_LIMIT_REACHED`.
- `401 Unauthorized`: `LIFECYCLE_ADMIN_UNAUTHORIZED`.
- `403 Forbidden`: `FORBIDDEN` (CORS).
- `409 Conflict`: `ACTIVATION_REQUEST_CONFLICT`, `LIFECYCLE_REQUEST_CONFLICT`.
- `500 Internal Server Error`: `INTERNAL_ERROR`.

## 12. Audit Events
Events generated: `ACTIVATION_SUCCESS`, `ACTIVATION_FAILED`, `ACTIVATION_IDEMPOTENT_REPLAY`, `DEACTIVATION_COMPLETED`, `LICENSE_CREATED`, `LICENSE_REVOKED`, `ADMIN_RELEASE_BINDING`, `ADMIN_REVOKE_LICENSE`, `ADMIN_RESTORE_LICENSE`.
Stored in `audit_events` with JSONB details.

## 13. Configuration/Secrets
**Moving to Supabase Edge Secrets**:
- `DATABASE_URL` (Provided by Supabase environment automatically, usually via connection pooler).
- `ADMIN_API_TOKEN`
- `LICENSE_KEY_HMAC_SECRET`
- `LICENSING_SERVER_PRIVATE_KEY`
- `LICENSING_SERVER_KEY_ID`
- `ALLOWED_ORIGINS`

**Client Environment (Unchanged)**:
- `LICENSING_SERVER_URL` (Will point to Supabase Edge Functions domain).
- `LICENSING_SERVER_KEY_ID`.

## 14. Electron Client Dependencies
Files requiring **ZERO** modifications during migration:
- `LicensingClient.ts`
- `LicensingRuntimeService.ts`
- `LicensingLifecycleService.ts`
- `LicensingBillingGate.ts`
- `AuthorizationVerifier.ts`
- `LocalAuthorizationStore.ts`
- `licensing.handlers.ts`
The client strictly validates JSON structures and Ed25519 signatures.

## 15. Existing Test Inventory
- `activation.concurrency.test.ts`: Proves strict concurrency handling for seat limits.
- `audit-license-generation.test.ts`: Validates generation/HMAC storage.
- `crypto.test.ts`: Ensures canonicalization and signature integrity.
- `phase12.security.test.ts`: Hardened security regression suite (CORS, error masking, auth timing, etc).
- `qa-lifecycle.test.ts`: Local E2E testing of the full lifecycle.

These tests run against Node/Express currently. They must be ported or abstracted to run against the Supabase Edge Functions environment.

## 16. Differential Testing Strategy
A test suite must be built to dual-execute requests against the Node server (reference) and Supabase local emulator (target).
1. Seed identical DB state.
2. Send identical HTTP requests.
3. Assert:
   - HTTP status matches.
   - Error code matches.
   - Canonicalized payload properties match (excluding random IDs and timestamps).
   - Signatures successfully verify using the same public key.
   - Resulting database state (binding count, audit trails) matches.

## 17. Current → Supabase Mapping
- `server/licensing/src/routes/activation.ts` → `supabase/functions/activate/index.ts`
- `server/licensing/src/routes/lifecycle.ts` → `supabase/functions/deactivate/index.ts`
- `server/licensing/src/routes/admin.ts` → `supabase/functions/admin/index.ts`
- `server/licensing/migrations/*.sql` → `supabase/migrations/`
- Node `crypto` → Deno `crypto` (Web Crypto API) or polyfills for standard library.
- Express `req/res` → Deno `Request`/`Response` (Fetch API standard).

## 18. Supabase Runtime Risks
1. **Node vs Deno Crypto**: Web Crypto API differs from Node's `crypto` module. Canonicalization implementations must yield identical byte output for Ed25519 signing.
2. **Rate Limiting**: Memory-backed rate limiters will not work across distributed Edge function nodes.
3. **Connection Pooling**: Edge Functions require connection pooling (e.g., Supavisor) rather than direct Postgres connections to avoid exhausting connection limits during spikes.
4. **Cold Starts**: Supabase functions may experience cold starts. The Electron client (`LicensingClient.ts`) uses standard `fetch`; we must ensure its timeout behavior tolerates Edge function spin-up.

## 19. Free Plan Operational Considerations
Supabase Free tier pauses databases after 1 week of inactivity. If the DB is paused, the Edge Functions will fail to connect.
**Impact**:
- **Offline Billing**: Unaffected. `LicensingBillingGate` relies purely on `LicensingRuntimeService` and `LocalAuthorizationStore`.
- **Online Operations**: Activations and deactivations will fail until the project is manually unpaused in the Supabase dashboard.

## 20. Migration Checkpoints
1. **Current System Mapping** (Completed - this document)
2. **Supabase Project/Schema Setup**: Migrate schemas via Supabase CLI.
3. **Shared Protocol/Crypto Compatibility**: Port canonicalization and crypto logic to Deno; prove byte-for-byte equivalence.
4. **Activate Edge Function**: Implement `/activate` and `/challenge`.
5. **Activation Differential Tests**: Prove behavioral equivalence.
6. **Activation Concurrency Tests**: Prove TOCTOU safety in Supabase.
7. **Deactivate Edge Function**: Implement `/deactivate`.
8. **Lifecycle Differential Tests**: Prove deactivation equivalence.
9. **Admin Functions & Tests**: Implement and test admin routes.
10. **Full QA Certification**: Run E2E client tests against Supabase local.
11. **Production Supabase Deployment**: Deploy functions and set secrets.
12. **Production Smoke Test**: Validate against production DB.
13. **Cutover**: Update `LICENSING_SERVER_URL` in client build config.

## 21. Migration Rollback Strategy
Because the client protocol remains identical, rollback is a pure client configuration change:
- Revert `LICENSING_SERVER_URL` to point to the Node/Express server.
- The Node/Express server can simply point to the Supabase Postgres database to ensure state continuity.

## 22. Migration Risks
- **Critical**: Discrepancies in `canonicalize` yielding invalid signatures that lock out valid clients.
- **High**: Incorrect implementation of transaction savepoints in Deno `postgres` driver breaking Seamless Renewal.

## 23. Release/Certification Requirements
- Differential test pass rate: 100%.
- Concurrency test pass rate: 100% (no duplicate active bindings permitted).
- Client modifications: 0 lines of code changed in core logic (only `.env` URL).

## 24. Open Decisions
- **Rate Limiting**: Decide between Supabase API gateway capabilities, dropping strict rate limiting for the initial launch, or using an external Redis instance.
- **Database Driver**: Decide between `pg` via Node compat in Deno, or native Deno `postgres.js` (recommended for Edge).
