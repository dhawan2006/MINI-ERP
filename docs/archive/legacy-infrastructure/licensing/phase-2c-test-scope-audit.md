# Phase 2C: Test Scope Audit

## 1. Vitest Test Files
The `npm run test` command successfully executed **48 test files** containing **356 tests**. 
These tests cover all Node-based client logic, backend HTTP integrations, and shared code.

**Executed Vitest Test Files (48 Total):**
- `electron/licensing/__tests__/RuntimeCheckInCoordinator.integration.test.ts`
- `electron/licensing/__tests__/RuntimeCheckInCoordinator.test.ts`
- `server/licensing/tests/activation.concurrency.test.ts`
- `server/licensing/tests/audit-license-generation.test.ts`
- `server/licensing/tests/crypto.test.ts`
- `server/licensing/tests/driver-savepoint.test.ts`
- `server/licensing/tests/phase12.security.test.ts`
- `server/licensing/tests/qa-lifecycle.test.ts`
- `server/licensing/tests/qa-runtime-checkin.test.ts`
- `server/licensing/tests/qa-runtime-edge.test.ts`
- `src/application/use-cases/__tests__/RuntimeCheckInStateCalculator.test.ts`
- `src/infrastructure/licensing/__tests__/LocalRuntimeStateStore.test.ts`
- `src/shared/crypto/__tests__/RuntimeCheckinReceiptVerifier.test.ts`
- `tests/basic.test.ts`
- `tests/domain/ActiveBill.test.ts`
- `tests/domain/BillItem.test.ts`
- `tests/domain/BillingService.test.ts`
- `tests/domain/Product.test.ts`
- `tests/domain/performance.test.ts`
- `tests/infrastructure/backup.service.test.ts`
- `tests/infrastructure/bill.repository.test.ts`
- `tests/infrastructure/database.test.ts`
- `tests/infrastructure/draft.repository.test.ts`
- `tests/infrastructure/history.performance.test.ts`
- `tests/infrastructure/performance.test.ts`
- `tests/infrastructure/product.repository.test.ts`
- `tests/infrastructure/restore.service.test.ts`
- `tests/integration/history.test.ts`
- `tests/integration/ipc.test.ts`
- `tests/integration/pdfExport.test.ts`
- `tests/integration/reliability.test.ts`
- `tests/integration/restore-concurrency.test.ts`
- `tests/integration/transactions.test.ts`
- `tests/licensing/activation-integration.test.ts`
- `tests/licensing/activation-ui.test.tsx`
- `tests/licensing/billing-enforcement.test.ts`
- `tests/licensing/device-identity.test.ts`
- `tests/licensing/fake-identity-isolation.test.ts`
- `tests/licensing/local-store.test.ts`
- `tests/licensing/runtime-authority.test.ts`
- `tests/licensing/runtime-checkin-postgresjs.test.ts`
- `tests/setup.test.ts`
- `tests/unit/foundation.test.ts`
- `tests/unit/pdf/PdfReceiptRenderer.test.ts`
- `tests/unit/printing/EscPosReceiptRenderer.test.ts`
- `tests/unit/printing/NetworkPrinterTransport.test.ts`
- `tests/unit/settings/SettingsService.test.ts`
- `tests/unit/ui/BarcodeInputService.test.ts`

## 2. Tests Excluded by Configuration
The `vitest.config.ts` (mapped to `vite.config.ts`) explicitly excludes the following paths from the standard Node test suite:
- `**/node_modules/**` (External dependencies)
- `**/dist/**` (Build artifacts)
- `**/tests/e2e/**` (Playwright E2E tests, executed separately via `npm run test:e2e`)
- `**/tests/supabase/**` (Supabase database scripts/tests)
- `supabase/functions/tests/**` (Deno/Edge Function tests, to be executed in Deno runtime)

*Status of Excluded Tests:*
- E2E Tests: **NOT RUN** (To be executed via Playwright in later steps)
- Supabase DB Tests: **NOT RUN**
- Edge Function Tests: **RUN SEPARATELY** (Executed in isolated Deno step)

## 3. Deno / Edge Function Test Files
The following files are verified to be Deno-native test files representing the Phase 1 Runtime Check-in validation:
- `supabase/functions/tests/runtime-checkin-regression.test.ts`
- `supabase/functions/tests/savepoint-regression.test.ts`

*Execution Status:* Executed via `npx deno test -A --no-check --unstable-sloppy-imports supabase/functions/tests/`. Both passed.

## 4. Playwright Test Files
- `tests/e2e/backup.test.ts`
- `tests/e2e/billing-ui.test.ts`
- `tests/e2e/ipc-smoke.test.ts`
- `tests/e2e/printing.test.ts`
- `tests/e2e/products.test.ts`
- `tests/e2e/restore.test.ts`
- `tests/e2e/scanner.test.ts`

*Execution Status:* **NOT RUN** (These validate frontend flows, to be run during full Packaged Electron verification).

## 5. Integration Tests
Included in the Vitest run and passed:
- History, IPC, reliability, restore concurrency, transactions, and licensing integration test suites.

## 6. Licensing Regression Tests
The `server/licensing/tests/*.test.ts` files test backend validation paths (activation concurrency, lifecycle, check-in, savepoints, etc.) through HTTP calls from Vitest against the local or hosted QA server. These **WERE INCLUDED** and successfully passed the 356-test run. The `qa-runtime-edge.test.ts` file ensures challenge generation, check-in success, replay protection, concurrency races, and directive lifecycle are fully validated.

## Summary
The "356 tests passed" claim is **VALID** for all Node/Electron logic, integration workflows, and mock-driven components. Edge Functions were separated for isolation, and Playwright E2E tests are pending execution on the real packed application.
