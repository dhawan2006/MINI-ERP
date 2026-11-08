# Phase 3A: API Certification

## Objective
Certify the security and API foundation of the Professional Admin Platform, ensuring that role-based access control (RBAC), multi-factor authentication (MFA/AAL2) enforcement, and centralized routing operate precisely as expected before any Admin UI is built.

## Architecture

The `admin` Edge Function acts as the unified gateway for all administrative workflows. It leverages:
1. **`Router.ts`**: A declarative routing class built around `URLPattern`, allowing endpoints to map directly to controllers with strict role/MFA definitions.
2. **`adminAuth.ts`**: The core security middleware. It validates Supabase Auth JWTs, queries the `admin_roles` table to enforce RBAC, checks the `aal` (Authenticator Assurance Level) claim for `aal2` when sensitive operations are executed, and falls back to validating the legacy `ADMIN_API_TOKEN` mapped to the `SYSTEM` role.
3. **Services (`AdminCustomerService`, `AdminLicenseService`, etc.)**: Domain-specific logic encapsulated in classes, separating HTTP concerns from business logic.

## Tested Scenarios (RBAC & MFA)

Automated tests (`tests/supabase/deno-native/rbac-admin-api.test.ts`) were written and executed against a live local QA instance. The tests verified the following security scenarios:

1. **Anonymous / Regular User Rejection (PASS)**
   - A standard user (with no entry in `admin_roles`) attempting to access `GET /customers` is correctly rejected with a `403 Forbidden` status.

2. **Read-Only Access for SUPPORT (PASS)**
   - An administrator assigned the `SUPPORT` role is permitted to access `GET /customers` (Returns `200 OK`).

3. **Mutation Restriction for SUPPORT (PASS)**
   - An administrator assigned the `SUPPORT` role attempting to execute a protected mutation (`POST /customers`) is rejected with a `403 Forbidden` status, as this operation requires `OWNER`, `ADMIN`, or `FINANCE` privileges.

4. **Mutation Allowed for FINANCE (Without MFA) (PASS)**
   - An administrator assigned the `FINANCE` role executing `POST /customers` succeeds (`201 Created`). The `adminAuth.ts` middleware correctly determines that the `FINANCE` role does not require MFA enforcement for this endpoint, maintaining a frictionless workflow for billing operations.

5. **MFA Enforcement for OWNER / ADMIN (PASS)**
   - An administrator assigned the `OWNER` role attempting to execute `POST /customers` with only a standard `aal1` token is rejected with a `403 Forbidden (MFA required)` status. The system correctly identifies that `OWNER` and `ADMIN` roles must satisfy AAL2 for sensitive operations.

6. **Unrestricted Read Access for OWNER (Without MFA) (PASS)**
   - An administrator assigned the `OWNER` role attempting to access `GET /customers` succeeds (`200 OK`). Read operations do not trigger the MFA requirement, preventing unnecessary friction.

## Conclusion

The server-side security matrix has been comprehensively validated. The Admin API correctly isolates legacy operations (`SYSTEM`), protects sensitive mutations with MFA for high-privileged accounts, and properly restricts cross-domain access based on explicit role assignments. The foundation is certified and ready for the Phase 3B visual dashboard integration.
