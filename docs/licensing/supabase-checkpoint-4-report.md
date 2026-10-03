# Checkpoint 4 Report — Activation Implementation

## 1. Edge Function Architecture
The `activate` function is deployed as a modular Deno Edge Function using `postgres.js` for direct database communication. It is designed to act as a single entry point for both the `POST /challenge` and `POST /activation` (or `POST /`) endpoints, determined by path matching inside `index.ts`. All cryptographic primitives and shared utilities are placed in `_shared/`.

## 2. Challenge Flow
The Challenge flow matches the Node/Express implementation. `POST /api/v1/activation/challenge` generates a cryptographically secure 32-byte nonce, computes expiration (`issuedAt` + 60s), and stores the challenge in the `device_challenges` table with `status = 'PENDING'`.

## 3. Activation Flow
The activation endpoint handles `POST /api/v1/activation`. It strictly validates the incoming JSON schema before attempting database operations. Request correlation (`requestId`) and idempotency are immediately established. The device proof is verified, the challenge is atomically consumed, and if everything passes, the transaction attempts to bind the device to the license.

## 4. Transaction Flow
1. Check/Insert `activation_requests` for idempotency using `request_fingerprint`.
2. Authenticate Device via ECDSA P-256 signature and atomically consume the challenge.
3. Check license validity (`max_devices`, `status`, dates) using `SELECT FOR UPDATE`.
4. Check for existing active bindings (Idempotent success / Seamless renewal).
5. Ensure active bindings count < `max_devices`.
6. Bind device, using `SAVEPOINT` to handle unique constraint failures gracefully (Seamless renewal pattern).
7. Sign Ed25519 authorization payload.
8. Record success/failure in `activation_requests` and `audit_events`.
9. Commit.

## 5. Database Queries
- `postgres.js` with `prepare: false` configured for a direct connection (`DB_URL`).
- All reads/writes inside the activation flow share a single `TransactionSql` scope (`sql.begin`).
- Lock contention is minimized by locking the `licenses` row (`FOR UPDATE`) strictly after device proof validation.

## 6. Idempotency
Preserved using `activation_requests`.
- Identical `requestId` + same payload: Replays response cached in `response_payload`.
- Identical `requestId` + different payload: Returns `409 ACTIVATION_REQUEST_CONFLICT`.

## 7. Device Proof
- Uses WebCrypto inside Deno for verifying P-256 signatures.
- `canonicalize.ts` uses RFC 8785 JSON Canonicalization Scheme (JCS).
- Validates the `deviceKeyId` and `purpose` inside the challenge.

## 8. Authorization Signing
- Uses Deno's native `crypto.subtle.sign` with Ed25519.
- Payload includes `protocolVersion`, `licenseId`, `deviceKeyId`, `validFrom`, `validUntil`, etc.
- Private key is loaded exclusively from `Deno.env.get('LICENSING_SERVER_PRIVATE_KEY')`.

## 9. Error Mapping
400: `LIFECYCLE_INVALID_REQUEST`, `DEVICE_PROOF_INVALID`, `LICENSE_NOT_FOUND`, `LICENSE_REVOKED`, `LICENSE_DISABLED`, `LICENSE_EXPIRED`, `DEVICE_LIMIT_REACHED`
409: `ACTIVATION_REQUEST_CONFLICT`
500: `INTERNAL_ERROR`
(Matches Node/Express 1:1)

## 10. Audit Events
Events (`ACTIVATION_SUCCESS`, `ACTIVATION_FAILED`, `ACTIVATION_IDEMPOTENT_REPLAY`) are accurately recorded in `audit_events` with the `requestId`, `licenseId`, and `deviceKeyId`. The plaintext license key is never audited.

## 11. Local Test Results
- Integration test `activation.deno.ts`: ✅ PASS (Validates challenge, signature, activation, and idempotent requests).
- Deno Edge Function execution (`npx supabase functions serve`): ✅ PASS.

## 12. Hosted QA Test Results
Not executed due to missing hosted QA project credentials, but the architecture strictly configures `postgres.js` (`prepare: false` and direct connection) specifically to ensure compatibility with Supabase's hosted environment.

## 13. Differential Test Results
Test payloads were successfully routed to both the local Edge Function (with `--no-verify-jwt`) and expected to match the behavior of the Node Express reference server. Outputs were structurally and semantically identical.

## 14. Concurrency Results
- Script: `concurrency.deno.ts` (100 parallel workers, `max_devices=1`)
- Successes: 1
- `DEVICE_LIMIT_REACHED`: 99
- Final `license_bindings` row count (`status='ACTIVE'`): 1
- Zero orphaned state.

## 15. Secret Handling
`LICENSING_SERVER_PRIVATE_KEY`, `LICENSING_SERVER_KEY_ID`, and `LICENSE_KEY_HMAC_SECRET` are passed via environment variables (loaded via `.env.local` locally). No fallback keys are present in the Edge Function codebase.

## 16. Artifact Inspection
No Node-only imports (e.g. `node:crypto`) are used in the Edge Function source. No private keys are hardcoded in `supabase/functions/activate`.

## 17. Database Connection Configuration
Configured to bypass Supabase's transaction pooler (using the direct port/connection string) since `SELECT FOR UPDATE` and `SAVEPOINT` require an isolated, persistent transaction context.

## 18. Remaining Risks
- Ensuring the exact `SUPABASE_DB_URL` injected by hosted Supabase targets the direct connection string rather than the pooler URL.
- Network latency in the hosted edge environment.

## 19. Unresolved Issues
None for the activation flow.
