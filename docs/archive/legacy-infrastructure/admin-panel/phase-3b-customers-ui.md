# Phase 3B - Customers UI

## Status
Integration of the Phase 3A Customers Admin API with the Phase 3B Admin Dashboard is complete.

## API Endpoints Used
- `GET /v1/admin/customers`: Lists customers with search and pagination (limit/offset).
- `GET /v1/admin/customers/:id`: Retrieves a single customer.
- `POST /v1/admin/customers`: Creates a new customer. Requires `X-Idempotency-Key` and MFA (`AAL2`).
- `PUT /v1/admin/customers/:id`: Edits an existing customer. Requires `X-Idempotency-Key` and MFA (`AAL2`).
- *Note: `DELETE` is not supported by the certified Admin API, thus it is not implemented in the UI.*

## Customer DTO
```typescript
export interface Customer {
  id: string;
  business_name: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  created_at: string;
  updated_at: string;
}
```

## Features Implemented
### Customers List (`/customers`)
- **Search**: Fully server-side search based on `business_name`, `contact_name`, or `email`. Handled with a 400ms debounce.
- **Pagination**: Supports server-side limit and offset.
- **Empty State**: Displays a clear message when no results are found.
- **Loading State**: Displays a skeleton/spinner while loading.
- **Error State**: Displays API errors gracefully and offers a retry option.

### Customer Detail (`/customers/:id`)
- Displays contact information (name, email, phone) and system metadata (created, updated dates).
- *Known API Limitation*: The backend `CustomerService` does not currently expose related licenses or devices for a given customer. The UI adheres to this limitation and does not attempt direct cross-table lookups.

### Mutations (Create/Edit)
- **Create/Edit Modal**: Uses a modal dialog containing a typed form with fields for `business_name`, `contact_name`, `email`, and `phone`.
- **Idempotency**: A new `crypto.randomUUID()` is generated and sent as the `X-Idempotency-Key` header for every mutation attempt, satisfying the Phase 3A strict idempotency policy.
- **Refresh**: Automatically refetches authoritative state from the server after a successful mutation.

## RBAC and MFA (Role-Aware UX)
- Creation and editing buttons are hidden if the user role is not `OWNER`, `ADMIN`, or `FINANCE`.
- If a mutation is rejected with `403 FORBIDDEN` (e.g. missing `AAL2` MFA), the UI displays a message explaining that higher privileges or MFA is required, in alignment with the certified security matrix.
- The UI relies on the backend to enforce authorization. Client-side RBAC is purely for UX purposes to hide non-actionable elements.

## Security & Architecture
- **No Secrets**: The frontend bundle was audited. No privileged `SUPABASE_SERVICE_ROLE_KEY` or `DATABASE_URL` secrets are exposed.
- **No Direct Table Queries**: The UI does not use the Supabase JS library to query the `customers` table directly. It strictly uses Edge Functions via `api/customers.ts`.

## Testing
- **Unit & Component Tests**: Added Vitest and React Testing Library tests asserting success, empty states, loading, API error handling (403, 404, 422), and idempotency keys. (14/14 passed)
- **E2E Playwright Tests**: Added `customers.spec.ts` mocking the Supabase Auth and API layer. Covers complete navigation to customer lists, search, clicking a customer detail view, and opening/filling the creation modal. (3/3 passed)
- **Phase 3A Regression**: Confirmed Phase 3A server tests continue to pass with no regressions introduced by the frontend consumer.
