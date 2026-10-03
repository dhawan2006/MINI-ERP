# Phase 1 Certification Closure Plan

## 1. Test Environment Setup
We will test against:
1. **Local Supabase Edge Functions**: Using `supabase functions serve` or our custom `start-qa-server.sh` script to host the Edge API. However, the existing tests (`qa-runtime-checkin.test.ts`) currently run against the local Node.js Express server (`app.ts`). For the edge function certification, we will deploy locally via Supabase CLI and run tests against the Supabase `api` function URL.
2. **Local PostgreSQL**: Using Supabase's local Postgres Docker container.
3. **Hosted QA**: Using the `qa` Supabase project config.

## 2. Fixture Strategy
- **Licenses/Devices/Bindings**: We will create fresh instances for every test run to ensure isolation and idempotency.
- **Crypto**: `crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' })` will be used strictly in memory.
- **Cleanup**: Fixtures will be deleted after tests, excluding historical audit events.

## 3. Test Cases (A - K)
The test suite will exactly implement the requested cases:
- **Test A**: Runtime Challenge Happy Path
- **Test B**: Runtime Check-In Happy Path
- **Test C**: Replay Protection
- **Test D**: Idempotency & Conflict
- **Test E**: Concurrency (using `Promise.all` across isolated requests)
- **Test F**: `postgres.js` Driver Regression (already covered in `driver-savepoint.test.ts`)
- **Test G**: Failure Injection
- **Test H**: Cryptographic Negative Cases
- **Test I**: License Status Reactions (Active, Disabled, Revoked, Expired)
- **Test J**: Directives Lifecycle
- **Test K**: Audit Events

## 4. Execution Commands
- **Start Local Supabase**: `npx supabase start`
- **Serve Edge Functions**: `npx supabase functions serve`
- **Run Edge QA Tests**: `QA_SERVER_URL=http://127.0.0.1:54321/functions/v1/api npx vitest run server/licensing/tests/qa-runtime-edge.test.ts`
- **Run Hosted QA Tests**: `QA_SERVER_URL=https://[hosted-qa-project].supabase.co/functions/v1/api npx vitest run server/licensing/tests/qa-runtime-edge.test.ts`

## 5. Certification Report
After execution, results will be summarized in `docs/phase-1-certification-closure-report.md`.
