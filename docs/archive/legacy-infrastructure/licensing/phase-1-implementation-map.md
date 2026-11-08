# Phase 1 Implementation Map

## Existing Tables
- `licenses`
- `devices`
- `license_bindings`
- `activation_requests`
- `lifecycle_requests`
- `device_challenges`
- `audit_events`

## Proposed New Tables
- `customers` (Handles business metadata safely without disrupting historical licenses)
- `runtime_checkin_challenges` (Dedicated challenge table to avoid commingling with activation challenges)
- `runtime_checkins` (Append-only success records)
- `runtime_checkin_requests` (Tracks idempotency and lifecycle of check-in attempts)
- `runtime_directives` (Allow-listed admin-to-client directives)
- `runtime_directive_deliveries` (Tracks delivery state: PENDING, DELIVERED, ACKNOWLEDGED)
- `admin_roles` (Role-based access control for Supabase Auth users)

## Existing Routes (Do Not Change)
- `POST /v1/activation/challenge`
- `POST /v1/activation`
- `POST /v1/lifecycle/deactivation/challenge`
- `POST /v1/lifecycle/deactivation`

## Proposed New Routes
- `POST /v1/runtime/checkin/challenge`
- `POST /v1/runtime/checkin`
- `POST /v1/runtime/directives/:id/acknowledge`

## Existing Crypto Utilities
- `DenoServerAuthorizationSigner` (Ed25519 signing)
- `canonicalize` (RFC 8785 JSON canonicalization)
- `ChallengeService` (Creates nonces) -> We will create a `RuntimeChallengeService` or extend this safely.

## Existing Transaction Patterns
- `postgres.js` transaction boundaries (`sql.begin()`).
- Explicit savepoints are critical as node-postgres tests do not catch postgres.js savepoint semantic differences.

## Existing Test Helpers
- `generate_test_license.js`
- Test suites in `tests/` and `supabase/functions/tests/`

## Exact Files to Change
- `supabase/migrations/20261003000000_runtime_checkin_schema.sql` (NEW)
- `supabase/functions/api/index.ts` (Add new routes)
- `supabase/functions/_shared/crypto/canonicalize.ts` (if needed for new schema)
- `supabase/functions/_shared/services/RuntimeCheckinService.ts` (NEW)
- `supabase/functions/_shared/crypto/RuntimeChallengeService.ts` (NEW)
- `tests/licensing/runtime-checkin-postgresjs.test.ts` (NEW)

## Exact Files NOT to Change
- Existing migration `20240101000000_initial_schema.sql`
- `electron/main.ts`
- `electron/licensing/LicensingBillingGate.ts`
- `electron/licensing/LicensingRuntimeService.ts` (Except type additions if strictly necessary, but preferably avoid logic changes)
- Existing activation/deactivation backend services.

## Contradictions / Resolutions
- **Challenge reuse**: The Phase 1B instructions say "Do NOT duplicate device_challenges", but Phase 1B also lists `runtime_checkin_challenges` as a new conceptual entity, and Phase 1E says "Do not reuse activation challenges semantically". Resolution: We will create `runtime_checkin_challenges` to ensure absolute isolation of the runtime check-in security surface from the activation security surface.
- **Customer Backfill**: We will insert a dummy "Legacy Customer" or allow `customer_id` to be nullable in `licenses` rather than attempting a destructive backfill.
