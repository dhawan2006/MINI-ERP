# Phase 2C Step 3 Activation Fixture Debug

## 1. Exact License Source
**Result:** HARCODED QA FIXTURE  
The key is hardcoded to `Z5QHH-AVBH7-ZT0NZ` in `tests/e2e/licensing-real/activation-real.spec.ts`. It is inserted into the `licenses` table via the `pg` driver prior to launching the Electron app.

## 2. Exact Electron Endpoint/Domain
**Result:** FAIL - MISMATCHED ENDPOINT (LOCAL NODE SERVER)  
The Playwright test is launching the REAL Electron process with `LICENSING_SERVER_URL: 'http://localhost:3456'`. This is the Node.js QA server, not the Local Supabase Edge Function environment (`http://localhost:54321/functions/v1/api`) which is required for Step 3.

## 3. Exact Database Used by the Edge Function
**Result:** `postgresql://postgres:postgres@127.0.0.1:54322/postgres` (Local Supabase PostgreSQL instance, `public` schema).

## 4. Fixture Verification
**Result:** PASS  
The test connects to the same `54322` database via `dbPool` and successfully provisions the license before the app launches.
- **licenseId:** `266c9e29-12ed-4ed4-849f-e114fdc5d122`
- **status:** `ACTIVE`
- **valid_from:** Valid (inserted via `NOW()`)
- **valid_until:** Future (inserted via `NOW() + interval '1 year'`)
- **max_devices:** 5

## 5. HMAC Secret Consistency
**Result:** NO (Was inconsistent)  
Because Electron hit the Node QA server (`3456`), it used the Node QA server's database (`minipos_licensing_qa`) and HMAC secret (`qa_hmac_secret...`). The test, however, inserted into the Supabase database (`54322`) and used the test secret. 
Fix applied: Removed quotes in `.env.local` to prevent Deno quoting bugs, and the test will now use the exact secret `test-hmac-secret-32-chars-min-must-be-long-enough!`.

## 6. Canonicalization Result
**Result:** PASS  
Canonicalization works properly and matches between Node testing harness and the Deno Edge Function.

## 7. Request Payload
**Result:** PASS  
Electron constructs the correct payload (requestId, licenseKey, deviceKeyId, publicKey, deviceProof).

## 8. Direct API Activation Result
**Result:** NOT TESTED (Issue found prior to this step).

## 9. Electron Activation Result
**Result:** FAIL  
Electron was hitting the wrong server and receiving `LICENSE_NOT_FOUND` because the Node QA server operates on a completely different database and HMAC configuration.

## 10. Root Cause
**Case D: Electron reaches wrong server**  
The Playwright tests were hardcoded to use `LICENSING_SERVER_URL: 'http://localhost:3456'` (the Node.js QA Express server) instead of `http://localhost:54321/functions/v1/api` (the Local Supabase Edge Functions server). As a result, the backend lookup was executed in the QA Express environment (which connects to the `minipos_licensing_qa` DB) while the test inserted the fixture license into the Supabase `public.licenses` table.

## 11. Fix
Update `activation-real.spec.ts` environment configurations:
- Change `LICENSING_SERVER_URL` to `http://localhost:54321/functions/v1/api`.
- Ensure tests L4, L5, L6, L7 also use the correct `LICENSING_SERVER_URL`.

## 12. Regression Test
The current end-to-end test covers this once the endpoints are aligned. No additional regression test is needed for URL mismatches.
