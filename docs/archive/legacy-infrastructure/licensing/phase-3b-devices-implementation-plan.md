# Phase 3B Devices Module - Implementation Plan

## 1. Current Architecture
The Admin UI connects to the Devices and Lifecycle domains through the central `adminFetch` client. The backend Edge Functions (`/v1/admin/devices` and `/v1/admin/lifecycle/release-binding`) enforce authentication, MFA (AAL2), and Role-Based Access Control before querying the PostgreSQL database through domain services (`AdminDeviceService` and `AdminLifecycleService`). No direct database queries are made from the frontend.

## 2. Device Domain Model
Based on the existing database architecture:
- **Device**: Uniquely identified by `device_key_id` (a cryptographic device identifier). Contains `status`, `created_at`, and `last_seen_at`. 
- **Binding**: A `license_binding` links a `device_key_id` to a `license_id`. It has its own unique `id`, `status` (`ACTIVE` / `DEACTIVATED`), `activated_at`, and `deactivated_at`. Devices can have a history of multiple bindings over time.
- **Runtime Check-in**: A periodic heartbeat associated with a specific device, license, and binding, providing updated authority to the device.
- **Creation**: Devices are created dynamically by the system upon activation; they are not manually created by Admins in the dashboard.

## 3. Existing Backend Endpoints
- **List Devices**: `GET /admin/devices`
  - Parameters: `search` (filters by `device_key_id`), `limit`, `offset`.
  - Pagination/Search: Supported.
- **Get Device**: `GET /admin/devices/:id`
  - Returns device identity fields and a nested array of `bindings`.
  - Device Detail: Supported.
- **Release Binding**: `POST /admin/lifecycle/release-binding`
  - Body: `licenseId`, `deviceKeyId`, `reason`
  - Requirement: `requireMfa: true`
  - Mutates binding `status` to `DEACTIVATED`.

## 4. Authorization Matrix
| Role | List Devices | View Device | Release Binding (Unbind) | Create / Other |
| :--- | :--- | :--- | :--- | :--- |
| **OWNER** | YES | YES | YES | NOT_SUPPORTED |
| **ADMIN** | YES | YES | YES | NOT_SUPPORTED |
| **SUPPORT** | YES | YES | YES | NOT_SUPPORTED |
| **AUDITOR** | YES | YES | NO | NOT_SUPPORTED |
| **FINANCE** | NO | NO | NO | NOT_SUPPORTED |
| **SYSTEM** | NO (Programmatic) | NO (Programmatic) | YES | NOT_SUPPORTED |

## 5. Data-Boundary Behavior
Currently, any authorized role can view and access any device. Device records do not explicitly contain `customer_id` mappings on the base table. Cross-customer IDOR (Insecure Direct Object Reference) boundary isolation remains explicitly **DEFERRED TO PHASE 3C**.

## 6. UI Information Architecture
- **Route `/devices`**: A paginated data table displaying `device_key_id`, `status`, `created_at`, and `last_seen_at`. Provides search by `device_key_id`.
- **Route `/devices/:id`**: Detail panel.
  - **Device Identity**: `device_key_id`, `status`.
  - **Lifecycle/Timestamps**: `created_at`, `last_seen_at`.
  - **Bindings History**: A table of historical and active bindings for this device (`license_id`, `status`, `activated_at`, `deactivated_at`).

## 7. API Client Plan
Create `admin-ui/src/api/devices.ts` reusing the robust `adminFetch`.
- `fetchDevices(search, limit, offset)`
- `fetchDevice(deviceKeyId)`
- `releaseBinding(licenseId, deviceKeyId, reason)`

## 8. Route Plan
Add routes to `AppShell`:
- `/devices` → `DevicesList.tsx`
- `/devices/:id` → `DeviceDetail.tsx`
No modifications to Customer or License routes required.

## 9. Mutation Plan
The only supported device-related mutation is **Release Binding** (`POST /admin/lifecycle/release-binding`).
- **Confirmation**: Requires explicit confirmation dialog.
- **Audit**: Generates a server-side audit event.
- **AAL**: Requires `AAL2` MFA verification context.
- **Idempotency**: Strictly requires `X-Idempotency-Key`.

## 10. Error Handling
All errors will natively utilize the centralized `ApiError` format (401, 403, 404, 422) integrated with React hooks and Toast notifications.

## 11. Testing Plan
- **5.1 Device read-only**: List/Detail rendering and edge cases.
- **5.2 Device search/pagination**: Query logic.
- **5.3 Device mutations**: Release binding flow.
- **5.4 Device browser security**: Unintended data leakage.
- **5.5 Device RBAC UI**: Role visibility rendering.
- **5.6 Device server authorization**: API route enforcement.
- **5.7 Device AAL**: MFA blocks.
- **5.8 Device real-QA integration**: End-to-end tests against real edge APIs.

## 12. Known Limitations
- Customer and full License details are not joined in the Device API responses. The UI will only display IDs (like `license_id`) unless secondary fetches are explicitly authorized and implemented. (Client-side multi-fetching of lists is prohibited to prevent N+1 issues).

## 13. Explicitly Unsupported Functionality
- Manual device creation.
- Device hard-deletion.
- Check-ins UI (deferred to step 6).
- Unrelated mutations (e.g. Reset, Reassign).
