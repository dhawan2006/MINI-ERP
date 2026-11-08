# Phase 3B - Step 5.3: Release Binding Implementation

## Objective
Implement the UI and API client for the **Release Binding** domain action for Devices, ensuring all constraints and dependencies (idempotency, MFA visually indicated, authorization, etc.) are strictly followed.

## Progress
- **Backend Audit:** Confirmed `/lifecycle/release-binding` expects `POST` with `{ licenseId, deviceKeyId, reason }`. Authorized roles are `OWNER, ADMIN, SUPPORT, SYSTEM` with `requireMfa: true`.
- **API Client:** Added `releaseBinding` to `admin-ui/src/api/devices.ts` utilizing the centralized `adminFetch` and passing the `X-Idempotency-Key` header.
- **Role-Based Authorization:** Leveraged `useAuthStore` to restrict visibility of the "Release Binding" action solely to `OWNER`, `ADMIN`, and `SUPPORT`. `FINANCE` (if they had access) and `AUDITOR` roles cannot see the action.
- **Target Context:** Displayed the "Release Binding" button on each active binding row inside `DeviceDetail.tsx`, avoiding a global, ambiguous "Delete Device" action. Extracts `licenseId` directly from the binding object and `deviceKeyId` from the device context, preventing unsafe client-side data assumptions.
- **Confirmation Modal (`ReleaseBindingModal`):**
  - Built a dedicated modal confirming the exact intent: "This will deactivate the binding between this device and license."
  - Displays the specific `Device Key ID` and `License ID` being released.
  - Displays a visual AAL2 / MFA prerequisite warning.
  - Collects and validates the mandatory `reason` text input before allowing submission.
- **Lifecycle Execution:**
  - Generates a fresh `crypto.randomUUID()` for `X-Idempotency-Key` at submission.
  - Manages disabled states, loading spinners, and graceful error handling if the API rejects the request (e.g. AAL2 missing, invalid target).
  - Triggers an authoritative refresh (`loadDevice()`) upon success to update the UI with the final state seamlessly.

## Known Limitations / Skipped Checks (By Instruction)
- Device RBAC, Device AAL2, Browser security, and data boundary QA integrations are strictly postponed for their dedicated respective steps.
- Concurrency/Idempotency testing via Playwright is also postponed.

## Conclusion
Step 5.3 implementation is complete and ready for integration/QA certification.
