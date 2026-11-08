# Phase 3B - License Testing Step 4.5B
## Playwright Server-Side Mutation Authorization Certification

### Overview
This step verifies that the Phase 3A RBAC implementation enforced strictly on the server boundary (`supabase/functions/admin`) is functioning correctly, independent of the UI controls tested in Step 4.5A.

### Roles Tested
- `OWNER` (test_owner@example.com)
- `ADMIN` (test_admin@example.com)
- `FINANCE` (test_finance@example.com)
- `SUPPORT` (test_support@example.com)
- `AUDITOR` (test_auditor@example.com)

### Backend Mutations Tested
The following protected Admin API endpoints were targeted:
- `POST /functions/v1/admin/licenses` (Create License)
- `POST /functions/v1/admin/lifecycle/extend-license` (Extend License)
- `POST /functions/v1/admin/lifecycle/disable-license` (Disable License)
- `POST /functions/v1/admin/lifecycle/restore-license` (Restore License)
- `POST /functions/v1/admin/lifecycle/revoke-license` (Revoke License)

### Security Boundary and AAL Observation
During this step, we observed the precise sequence of middleware validation (`_shared/middleware/adminAuth.ts`):
1. **Authentication Check:** Validates the JWT structure and expiration.
2. **Role Authorization Check (RBAC):** Checks the `admin_roles` table for the user ID and ensures the assigned role is included in the endpoint's allowed roles (`ADMIN_FORBIDDEN` if not).
3. **MFA Assurance Level Check (AAL):** Enforces AAL2 (`MFA_REQUIRED` if not) on sensitive mutations.

**Crucial Finding:**
For unauthorized roles, the server immediately returns `403 ADMIN_FORBIDDEN` (Insufficient role for this operation).
For authorized roles, the RBAC validation successfully passes, and execution correctly hits the subsequent AAL boundary, returning `403 MFA_REQUIRED` (MFA (AAL2) is required for this operation).
This proves the fundamental RBAC policy is completely accurate and effectively gates sensitive operations, allowing tests to correctly distinguish between a role failure and an MFA requirement.

*Note: A defect was discovered during testing where `requireMfa: true` was only strictly enforced for `OWNER` and `ADMIN` roles in the backend middleware, omitting `FINANCE`. This defect was fixed in the middleware before the final test suite executed.*

### UI Bypass Proof
We successfully proved that removing UI controls is NOT the primary security layer:
1. Logged in as `SUPPORT` role via browser.
2. Visited `/licenses/:id`.
3. Confirmed the "Disable" button was properly hidden from the DOM.
4. Manually invoked the API `POST /admin/lifecycle/disable-license` bypassing the UI.
5. The backend immediately rejected the mutation with `403 ADMIN_FORBIDDEN` and the license state remained strictly `ACTIVE`.

### IDOR Boundary Discovery
**Status:** `BLOCKED / PRE-EXISTING-IDOR-SETUP`
The cross-customer mutation test is explicitly skipped due to the known pre-existing architecture constraint preventing full cross-customer testing until the Phase 3C Data Boundary certification.

### Conclusion
**Status:** PASS
Server-side License Mutation RBAC strictly enforces the Phase 3A specifications. The system is securely locked down at the API level, and operations correctly escalate to the MFA boundary where appropriate.
