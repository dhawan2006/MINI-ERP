# Phase 3B - Devices Testing
## Step 5.4 - Playwright Release Binding Certification

### Overview
This document serves as the certification for the **Release Binding UI Flow** using Playwright functional tests, finalizing the implementation of Phase 3B Step 5.4.

The tests ensure that the UI conforms to the established domain model and API contracts for device management, specifically for the `POST /admin/lifecycle/release-binding` mutation, while respecting authorization matrix constraints (OWNER, ADMIN, SUPPORT).

### Test Matrix

1. **TEST 1: Release Action Visibility & Row Association**
   - Asserts the "Release Binding" action button appears exclusively for the active binding row.
   - Ensures inactive bindings do not display the action button.

2. **TEST 2: Modal Content**
   - Asserts the modal correctly extracts and displays Contextually relevant information: `MOCK_DEVICE_KEY_ID` and `MOCK_LICENSE_ID_1`.
   - Asserts visibility of the "Require AAL2 / MFA Authorization" warning.
   - Verifies safety measures (e.g., absence of unrelated destructive actions like "Delete Device").

3. **TEST 3: Empty Reason Validation**
   - Confirms the mutation is blocked when attempting to submit without an explicit reason.
   - Asserts validation feedback message is displayed correctly.

4. **TEST 4: Cancellation Flow**
   - Verifies that dismissing the modal completely resets its state without firing mutations.
   - Checks that inputs are cleared for subsequent modal opens.

5. **TEST 5: Valid Submission & Request Capture**
   - Mocks the network response and intercepts the request payload.
   - Asserts correct formatting of the API contract: `licenseId`, `deviceKeyId`, `reason`.
   - Checks for the presence of the `X-Idempotency-Key` header.
   - Asserts authoritative refresh occurs after successful submission via modal closure and subsequent GET requests.

6. **TEST 6: Graceful Error Handling**
   - Mocks a 400 Bad Request (e.g., AAL2 requirement failure or other validation errors).
   - Asserts errors bubble up to the user visually within the modal boundary.
   - Ensures the modal remains open for retry or cancellation on failure.

7. **TEST 7: Duplicate Submission Prevention**
   - Forces an explicit delay in the mocked network response.
   - Checks that the submit button properly transitions into a disabled loading state.
   - Ensures only a single mutation request is fired for the operation duration.

### Constraints & Caveats

- **AAL2/MFA Certification**: Remains intentionally out of scope for frontend UI unit testing; Playwright does not natively forge or orchestrate AAL2 synthetic signatures in this module boundary. Handled at the API orchestration layer.
- **Device RBAC & IDOR**: Real-backend authorization and data-boundary limits intentionally omitted to maintain functional testing scope.
- **Browser-Level Security Isolation**: The `HttpOnly` cookie constraints are mocked for functional verification but verified outside of Playwright unit environments.

### Final Status
All 7 Playwright tests correctly assert functionality without regression.
Tests successfully execute within strict mode bounds.
**Status**: `PASS`
