# Phase 3B - Step 5.6A: Device RBAC UI Certification

## Objective
Certify that the Admin UI correctly exposes and hides Device functionality according to the documented Device Role-Based Access Control (RBAC) policy. This tests the UI authorization visibility and route protection, ensuring components enforce frontend restrictions appropriately before delegating to backend checks.

## Scope
- Device Read/List/Detail access visibility.
- Release Binding UI visibility and modal interactions.
- Redirection behavior for unauthorized roles (FINANCE).
- Role transition and session isolation.
- The testing avoids treating UI changes as authoritative backend validation. Backend RBAC enforcement is reserved for Step 5.6B.

## Implementation Details

### Frontend Protections
1. **Navigation Guards (Sidebar)**
   - The `Sidebar.tsx` navigation link for "Devices" is conditionally hidden from the `FINANCE` role based on the current active session state in `useAuthStore`.

2. **Route Guards (DevicesList & DeviceDetail)**
   - Client-side navigation to `/devices` or `/devices/:id` forcibly redirects `FINANCE` users back to the dashboard (`/`) using `<Navigate to="/" replace />`.
   - Error components handle session expirations transparently. A 401 response explicitly renders a custom "Error Loading Device" layout.

3. **Release Binding Control**
   - The "Release Binding" action button and its associated form fields within `DeviceDetail.tsx` are selectively enabled for `OWNER`, `ADMIN`, and `SUPPORT` roles, but fully concealed for `AUDITOR` logic.

### Playwright Certification (UI tests)
The certification tests are executed in `tests/devices-rbac-ui.spec.ts`.

#### 1. Device Core Access Tests
*   `TEST 1`: **OWNER** can view the device detail layout and the "Release Binding" feature.
*   `TEST 2`: **ADMIN** can view the device detail layout and the "Release Binding" feature.
*   `TEST 3`: **SUPPORT** can view the device detail layout and the "Release Binding" feature.
*   `TEST 4 & 6`: **AUDITOR** can view the device detail layout, but the "Release Binding" feature is strictly hidden.
*   `TEST 5 & 7`: **FINANCE** is denied access entirely and automatically redirected away from the page, throwing no hard fatal exceptions.

#### 2. Release Binding UI Modal Interactivity
*   `TEST 8`: **SUPPORT** can open the Release Binding modal, verify the presence of the reason input, and verify the MFA/AAL2 warning.
*   `TEST 9`: **OWNER** can open the Release Binding modal correctly.
*   `TEST 10`: **ADMIN** can open the Release Binding modal correctly.

#### 3. Edge Cases & Isolation
*   `TEST 11`: Validates the table layout correctly flags bindings as "DEACTIVATED".
*   `TEST 12`: Guarantees isolation between user logins, specifically transitioning from `OWNER` (full access) to `AUDITOR` (read-only) gracefully without state bleeding.

## Resolution of Intermittent Auth Issues
- The mock interceptors for API tests were refined (`/.*\/admin\/devices.*/`) to correctly capture cross-origin `OPTIONS` requests triggered by the admin `fetch` wrapper.
- Synthesized `CORS` headers were introduced directly within the local network tests to ensure the DOM could accurately emulate a successful session token response across multiple simulated roles, avoiding errant HTTP 401 exceptions triggered implicitly.

## Status
- `devices-rbac-ui.spec.ts` executed 10 tests across multiple workers.
- Status: **10/10 PASS**.

## Next Steps
- Proceeding to Phase 3B - Step 5.6B: Device Backend RBAC Certification.
- **Do not implement real Device Check-ins yet.**
- **Do not modify backend real-QA certifications except where required for this testing.**
