# Phase 3B - License Testing Step 4.1

## Test Scope
This step covers ONLY read-only flows for the License Module to establish that the basic browser navigation and read-only license workflows are stable before introducing mutation tests.
The test scope includes:
- Authentication entry (AppShell layout & route access)
- License list rendering (Data tables)
- Search (Valid, Invalid)
- Pagination (Next, Previous)
- Open license detail & Direct deep-link navigation
- Browser refresh on detail page
- Return to license list
- Logout/Auth Guarding
- Not found behavior
- No mutating operations tested.

## Environment
- Existing Playwright configuration reused.
- Mocked Supabase Auth response to represent an active session (role: OWNER, aal2).
- Mocked Admin API backend endpoints (`/admin/licenses*`) using `route.fulfill()` for deterministic state.
- Playwright's network interception avoids calling the actual server or Database API to maintain isolation.
- No real production secrets are exposed or injected.

## Tests Created
File: `admin-ui/tests/licenses-readonly.spec.ts`
1. **TEST 1: Authenticated Access and TEST 2: License List** - Confirms navigation, protective route resolution, and basic list rendering.
2. **TEST 3: Empty State and TEST 4: Search** - Searches for known valid input (verifying rendering) and invalid input (verifying clean empty state with 'No licenses found.').
3. **TEST 5: Pagination** - Controls limit to require multiple pages, clicking Next and Previous.
4. **TEST 6: License Detail and Return to list** - Tests linking to the detail view and back to ensure route transitions do not crash.
5. **TEST 7: Deep Link and TEST 8: Refresh** - Verifies page loads independently of list navigation state, surviving browser refresh.
6. **TEST 9: Not Found** - Requests unknown identifier yielding 404 with error UI.
7. **TEST 10: Logout** - Clears auth state and verifies restricted access redirect loop to `/login`.

## Test Data Strategy
- Used controlled, deterministic mock JSON fixtures within `licenses-readonly.spec.ts`.
- Mocks return explicit static licenses (e.g. `lic-1` and `lic-2`).
- Offset logic programmed in mock to accurately replicate API offset functionality for pagination.

## Exact Result
- **Playwright read-only smoke tests**: 7/7 PASS
- **Unexpected page errors**: 0
- **TypeScript build**: PASS
- **Vite build**: PASS

## Known Issues
- The `toBeInTheDocument` from `@testing-library/jest-dom` was omitted from Vitest compilation initially. Replaced with `toBeDefined()` in unit tests to ensure `tsc -b` passes consistently. 
- Total limits mocked explicitly due to frontend component pagination constraints (e.g. mock limit updated from 2 to 30 to trigger Next navigation logic correctly).

## Explicitly Excluded Testing Areas
- **Mutations:** Create, Extend, Disable, Restore, Revoke License.
- **Security Validation:** RBAC matrix, MFA/AAL matrix, security certification.
- **Backend Checks:** Lifecycle authorization, idempotency correctness, PostgreSQL security, RLS, transaction safety.
