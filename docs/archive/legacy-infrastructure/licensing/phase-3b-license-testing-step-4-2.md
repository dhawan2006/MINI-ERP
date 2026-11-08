# Phase 3B - License Testing Step 4.2

## Scope
This step covers the browser flow for creating a new license, with a strict focus on correctly handling the one-time plaintext license key securely.
The test scope includes:
- Navigating to Create License and opening the modal
- Verifying required-field client-side validation
- Valid license creation (idempotency, payload structure, network conditions)
- Verifying the display of the one-time plaintext license key
- Checking browser persistence (URL, LocalStorage, SessionStorage)
- Handling post-dismissal behaviors
- Duplicate submission prevention
- Error handling on creation failure (Network 500 and Validation 422)
- Accessibility baseline checks

## Environment
- Existing Playwright configuration reused.
- Mocked Supabase Auth response to represent an active session.
- Mocked Admin API backend endpoints using `route.fulfill()` for `/admin/licenses` POST.
- No real production secrets are exposed or injected.

## Tests Created
File: `admin-ui/tests/licenses-create.spec.ts`
1. **TEST 1: Open Create License** - Verifies modal opens.
2. **TEST 2: Required field validation** - Prevents submission if fields are omitted.
3. **TEST 3: Valid License Creation and One-Time Plaintext Key Logic** - Extensive testing of idempotency header generation, auth headers, success modal, storage inspection for leaks, url inspection for leaks, page refreshes post-dismissal.
4. **TEST 19: Network Failure** - Simulates HTTP 500.
5. **TEST 20: Validation Failure (422)** - Simulates HTTP 422.
6. **TEST 21: Duplicate Submission Prevention** - Verifies multiple clicks only dispatch one creation request.

## Test Results
- **Create License UI Tests**: PASS (6/6 Playwright tests passed)
- **Step 4.1 Regression Tests**: PASS (7/7 Playwright tests passed)
- **Existing License Lifecycle Tests**: PASS (3/3 Playwright tests passed)
- **React Component Tests**: PASS (25/25 vitest tests passed)
- **TypeScript build**: PASS

## API Endpoint Tested
- POST `/admin/licenses`
- Requires headers: `Authorization` and `X-Idempotency-Key`
- Required body fields: `product_id`, `max_devices`, `valid_until`

## Security Behavior
- **One-time Plaintext Key**: Rendered only after creation, not added to local storage or session storage, not pushed to the URL parameters. 
- **Idempotency**: Included UUID string in the headers for mutation safety.
- **Role Restrictions**: Assumed inherited from session role OWNER.

## Explicitly Excluded
- License Extensions, Restoring, Revoking
- RBAC matrices, AAL2 matrices
- Full lifecycle API certification
