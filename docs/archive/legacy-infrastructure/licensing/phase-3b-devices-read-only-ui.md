# Phase 3B - Step 5B: Devices Read-Only UI

## API Contract Verification
- **List Endpoint:** `GET /admin/devices` (supports limit, offset, and search queries)
- **Detail Endpoint:** `GET /admin/devices/:id` where `:id` is the `device_key_id`.
- **Exact Identifier Used for Detail Route:** `device_key_id`
- **DTOs:**
  - `Device`: `{ device_key_id, status, created_at, last_seen_at }`
  - `LicenseBinding`: `{ id, license_id, status, activated_at, deactivated_at }`

## UI Implementation Details
- **Fields Displayed:**
  - List: Device Key ID, Status, Created (First Registered), Last Seen
  - Detail: Device Key ID, Status, Lifecycle timestamps, Bindings History (License ID, Status, Activated At, Deactivated At).
- **Search Behavior:** Server-side search on `device_key_id` via `search` parameter, fully debounced with pagination reset.
- **Pagination Behavior:** Offset/limit based pagination, rendering next/previous buttons according to server's `meta.total`.
- **Binding Rendering:** Table mapping active/deactivated bindings. No additional license joins (N+1 queries avoided).
- **Role-Aware UX:** Only roles `['OWNER', 'ADMIN', 'SUPPORT', 'AUDITOR']` are permitted. Accessing forbidden routes (like `FINANCE`) will show a standard UI API error state (403 Forbidden).
- **Error Handling:** 
  - `DevicesList`: Fallback to error overlay with a "Retry" button. Empty states mapped correctly.
  - `DeviceDetail`: Special treatment for 404 (Not Found state) and generic error boundary for other server/network issues.
- **Security Boundary:**
  - No direct Supabase PostgREST client code in the UI (`supabase.from("devices")` is absent).
  - No `postgres` or privileged keys exist in the frontend (`pg`, `SERVICE_ROLE_KEY` absent).
  - Component calls `devices.ts` which proxies through `adminFetch` to the edge functions.
- **Explicitly Excluded Mutations:** `Release Binding` backend method is verified but omitted from the UI components. No mutation triggers exist.
- **Check-ins Exclusion:** Runtime receipts and Check-ins are deliberately omitted from the UI pending Step 6.

## Known Limitations
- Deactivated/revoked license bindings only show timestamps and IDs (no extra UI fields for context without N+1 queries).
- Check-ins UI remains hidden until Step 6.
- The `Release Binding` mutation exists on the server but is not yet exposed via a button.
