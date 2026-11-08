# Phase 3B License Testing - Step 4.6B

## AAL2 Test Assurance

This section explicitly documents the nature of the AAL2 session token used in the Phase 3B Step 4.6B tests.

### 1. Token Provenance
- **Type**: SYNTHETIC_QA_AAL2
- **Description**: The AAL2 token used in these tests is **not** produced by a real Supabase GoTrue MFA enrollment or physical challenge flow (due to `auth.mfa.totp` being disabled in the QA environment).
- **Mechanism**: The test script manually re-signs a valid AAL1 token using the QA server's symmetric key (`LICENSE_KEY_HMAC_SECRET` / `VITE_SUPABASE_JWT_SECRET`), injecting `"aal": "aal2"`. This creates a cryptographically valid token that proves the middleware properly authorizes the token based on the AAL2 claim.

### 2. Middleware Verification
- **What is verified**: The `_shared/middleware/adminAuth.ts` uses `supabase.auth.getUser(token)` which strictly verifies the JWT signature, issuer, and expiration. The middleware then directly decodes the JWT payload to read the `aal` claim. 
- **What this proves**: This test proves that the server correctly distinguishes and enforces the `aal2` branch during mutation requests, and strictly rejects unauthenticated or AAL1 requests.
- **What this does NOT prove**: It does not prove that a user can successfully navigate the frontend TOTP challenge UI.

### 3. Secret Isolation
- **Browser Exposure**: Neither `VITE_SUPABASE_JWT_SECRET` nor `LICENSE_KEY_HMAC_SECRET` are exposed in `admin-ui/src/` or the production browser bundle.
- **Location**: The secret exists only in the test script (`admin-ui/tests/licenses-mfa-success-create.spec.ts`), local test utilities (`test-jwt.js`), and the local `.env.local` for the Edge Functions server. Test-only secrets remain securely isolated from the browser context.

### 4. Idempotency JSONB Defect
- During this step, a minor defect was identified in `Router.ts` where idempotency responses from `response_body` were double stringified due to storing `await response.clone().text()` as a Postgres JSONB field.
- **Status**: DEFECT_FIXED. The issue was successfully addressed in `Router.ts` by ensuring the idempotency layer correctly handles string payloads before formatting them as JSON for the HTTP response.
