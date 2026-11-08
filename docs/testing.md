# Mini POS — Testing Strategy & Quality Assurance

## 1. Overview

Mini POS maintains a rigorous automated testing pipeline covering pure domain logic, SQLite database transactions, Electron IPC messaging, hardware barcode processing, receipt rendering, and full desktop application end-to-end flows.

---

## 2. Test Suites & Frameworks

### 2.1 Unit & Integration Tests (Vitest)
- **Framework**: Vitest v5.0.0 (`npm test`).
- **Scope**: 27 test files, 126 automated tests.
- **Directories**:
  - `tests/domain/`: Pure domain logic tests (`ActiveBill.test.ts`, `BillItem.test.ts`, `BillingService.test.ts`, `Product.test.ts`, `performance.test.ts`).
  - `tests/infrastructure/`: SQLite migrations, repositories (`bill`, `draft`, `product`), backup/restore services (`backup.service.test.ts`, `restore.service.test.ts`, `database.test.ts`).
  - `tests/integration/`: Electron IPC message passing (`ipc.test.ts`), atomic transaction commits/rollbacks (`transactions.test.ts`), history pagination (`history.test.ts`), PDF receipt rendering (`pdfExport.test.ts`), restore concurrency (`restore-concurrency.test.ts`).
  - `tests/unit/`: UI helpers (`BarcodeInputService.test.ts`), settings service (`SettingsService.test.ts`), PDF receipt layout (`PdfReceiptRenderer.test.ts`), ESC/POS thermal printing (`EscPosReceiptRenderer.test.ts`, `NetworkPrinterTransport.test.ts`), first-time setup logic (`setup.test.ts`).

### 2.2 End-to-End Desktop Tests (Playwright)
- **Framework**: Playwright v1.63.0 (`npm run test:e2e`).
- **Scope**: 35 automated desktop UI and integration tests launching real Electron processes.
- **Scenarios Covered**:
  - `backup.test.ts`: Automated and manual backup generation from settings.
  - `billing-ui.test.ts`: Cashier tasks A-I (item search, quantity updates, undo, clear bill, authoritative pricing).
  - `ipc-smoke.test.ts`: Main-to-renderer IPC communication.
  - `packaged-binary.e2e.spec.ts`: Real packaged `.app` / `.exe` verification across fresh onboarding, legacy migrations, and air-gapped operation.
  - `printing.test.ts`: Receipt finalization, printer failure resilience, and retry flows.
  - `products.test.ts`: Product creation, catalog search, and cart addition.
  - `restore.test.ts`: Active draft locking, backup file validation, and atomic database replacement.
  - `scanner.test.ts`: Hardware barcode burst detection, rapid scan sequences, and input focus preservation.
  - `setup.e2e.spec.ts`: First-time store setup wizard onboarding directly into POS.
  - `standalone-regression.e2e.spec.ts`: Standalone execution, corrupt file resilience, zero outbound network requests.

### 2.3 Packaged Binary Validation Script
- **Script**: `node scripts/verify-packaged.js`
- Launches the built production artifact (`release/mac-arm64/Mini POS.app`) directly and verifies:
  1. Window title is `Mini Billing System`.
  2. Database file is initialized at user data directory.
  3. Product search executes via SQLite.
  4. Store settings persist across operations.
  5. Sales history queries succeed.

---

## 3. Running Automated Tests

```bash
# Run all Vitest unit and integration test suites
npm test

# Run all Playwright desktop E2E test suites
npm run test:e2e

# Run type check
npx tsc --noEmit

# Validate packaged desktop binary
node scripts/verify-packaged.js
```
