# Phase 3C Step 2: Customer-Scoped Admin Identity & Authorization Foundation

## Objective

Establish the authorization foundation required to enforce customer boundaries for Admin users. This includes creating the schema updates for the `admin_roles` table, updating the `adminAuth` middleware to securely derive the customer scope from the database, and providing helper methods for authorization enforcement.

## Status

**COMPLETE**

## Work Done

1. **Schema Migration:**
   - Created migration `20261004195245_customer_admin_scope.sql`.
   - Added `customer_id` (`uuid`, foreign key to `customers(id)`) and a surrogate primary key `id` to the `admin_roles` table.
   - Migrated legacy global roles without a customer mapping to an 'UNASSIGNED' dummy customer for scoping compatibility.
   - Enforced database constraints:
     - `check_admin_role_scope`: Ensures that `customer_id` is exactly `NULL` for global roles (`SYSTEM`, `SUPPORT`) and `NOT NULL` for scoped roles (`OWNER`, `ADMIN`, `FINANCE`, `AUDITOR`).
     - Added partial unique indexes preventing conflicting memberships (`admin_id, customer_id` for scoped roles, and `admin_id` for global roles).

2. **Middleware Enhancement:**
   - Updated `_shared/middleware/adminAuth.ts` to return an extended `AdminAuthResult` containing `scopeType` (`GLOBAL` | `CUSTOMER`) and `customerId`.
   - Middleware now directly derives customer boundaries from server-side trusted state (`admin_roles`), satisfying the strict requirement that scope MUST NOT come from client-supplied claims, headers, query parameters, or state.

3. **Authorization Foundation Services:**
   - Created `AdminScopeService` (`_shared/services/AdminScopeService.ts`) providing role testing predicates (`isGlobalRole`, `isCustomerScopedRole`).
   - Added core assertions like `assertCustomerAccess(auth, targetCustomerId)` which validates if the current admin's scope permits access to the target customer resource.

4. **Test Fixtures & Refactoring:**
   - Refactored `tests/integration/device-backend-rbac.test.ts`, `tests/integration/device-aal2.test.ts`, and other legacy tests to supply a valid `customer_id` when seeding `admin_roles` records, aligning with the new `NOT NULL` DB constraint.
   - Replaced old `admin_roles.upsert()` calls with clean `insert()` calls utilizing the new schema.

5. **Authorization Unit Tests:**
   - Created `tests/integration/phase3c-customer-scope.test.ts`.
   - Added a `POST /_test/scope-check` dummy endpoint to `admin/index.ts` to expose `AdminScopeService` checks.
   - Ran extensive scope tests:
     - Verified `NOT NULL` DB enforcement for scoped roles.
     - Verified `NULL` DB enforcement for global roles.
     - `OWNER`, `ADMIN`, `FINANCE`, `AUDITOR`: Customer A -> Customer A = `ALLOW`.
     - `OWNER`, `ADMIN`, `FINANCE`, `AUDITOR`: Customer A -> Customer B = `DENY` (Cross-customer access denied).
     - `SUPPORT`: Customer A -> Customer A = `ALLOW`.
     - `SUPPORT`: Customer A -> Customer B = `ALLOW`.
     - `SYSTEM`: Programmatic `ADMIN_API_TOKEN` = `ALLOW`.
   - All tests successfully pass.

## Key Decisions

- Multi-customer membership per admin is explicitly unsupported. Database constraints enforce a maximum of 1 customer scope per admin user.
- The dummy customer used for migrating existing roles acts as a safe 'UNASSIGNED' placeholder, ensuring that they don't gain unauthorized access while conforming to the `NOT NULL` schema.
- We opted to add an explicit `id` UUID primary key to `admin_roles` rather than utilizing composite keys because of Prisma/Supabase tooling complexities surrounding composite primary keys on simple joining tables.

## Next Steps

Phase 3C Step 2 is concluded. We are awaiting Phase 3C Step 3 instructions to proceed with full IDOR resource isolation and data ownership audits.
