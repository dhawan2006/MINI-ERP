# Mini POS — Architectural Cleanup & Simplification Inventory

## 1. Executive Summary

This inventory document provides a comprehensive classification of all components, files, directories, scripts, and dependencies across the Mini POS repository prior to the final architectural simplification. The objective is to transition Mini POS into a completely self-contained, standalone, offline-first desktop POS application by eliminating all obsolete architectural layers:

1. **Dedicated Web Admin UI (`admin-ui/`)**: A separate web dashboard previously used for tenant/license management.
2. **Supabase & Cloud Backend (`supabase/`, Deno runtime, edge functions, migrations)**: All cloud infrastructure and database integrations.
3. **Licensing Remnants & Legacy Scratch Artifacts**: Temporary scripts, debug logs, deprecated native stubs, and obsolete backup environment files.
4. **Preserved Core Desktop POS Architecture**: The fully offline, local SQLite-backed Electron/React desktop billing system.

---

## 2. Classification Matrix

Each item is classified into exactly one of four categories:
- **CATEGORY 1: Exclusively Admin Panel** (Target: Complete Deletion)
- **CATEGORY 2: Exclusively Supabase / Cloud Backend** (Target: Complete Deletion)
- **CATEGORY 3: Exclusively Licensing Remnants / Legacy Scratch / Debug** (Target: Complete Deletion)
- **CATEGORY 4: Required POS Functionality** (Target: Preserved & Protected)

---

## 3. Detailed Inventory by Category

### Category 1: Exclusively Admin Panel (To Be Completely Deleted)

The `admin-ui/` directory was developed as an administrative portal for licensing, customer assignment, and telemetry review. In a pure standalone desktop POS, this surface is wholly obsolete and decoupled from the desktop application runtime.

| Path | Description | Specific Reason for Deletion |
| :--- | :--- | :--- |
| `admin-ui/` | Complete Web Admin portal directory | Independent web application project; zero imports from desktop application (`src/` or `electron/`). |
| `admin-ui/package.json` | Admin UI package specification | Defines web admin dependencies (Vite, Tailwind, Oxlint, Lucide). |
| `admin-ui/package-lock.json`| Admin UI dependency lockfile | Lockfile for web admin packages. |
| `admin-ui/vite.config.ts` | Admin UI Vite build configuration | Admin-specific bundling and dev server configuration. |
| `admin-ui/index.html` | Admin UI HTML entry point | Web browser document root for the admin portal. |
| `admin-ui/src/` | Admin UI React components, pages, stores | Admin interface implementation (customers, licenses, audit logs, login, navigation). |
| `admin-ui/tests/` | Admin UI unit and Playwright tests | Tests specifically validating web admin functionality. |
| `admin-ui/public/` | Admin UI static assets | Web admin favicons and public assets. |
| `admin-ui/dist/` | Admin UI build output | Compiled distribution artifacts for the web admin. |
| `admin-ui/node_modules/` | Admin UI dependencies | Local node modules installed for admin UI. |
| `admin-ui/.env` / `.env.test` | Admin UI environment files | Supabase credentials and API endpoints for web admin. |
| `admin-ui/tsconfig*.json` | Admin UI TypeScript configs | Build configuration for web admin codebase. |
| `admin-ui/playwright.config.ts` | Admin UI Playwright test runner | Test configuration for web admin browser suites. |
| `admin-ui/.oxlintrc.json` | Admin UI linter configuration | Linting rules specific to admin codebase. |

---

### Category 2: Exclusively Supabase / Cloud Backend (To Be Completely Deleted)

The `supabase/` directory and related cloud artifacts managed cloud database migrations, Supabase Edge Functions (Deno), authentication, and cloud configuration. The standalone Mini POS relies exclusively on local SQLite (`billing.db`), making all cloud backend assets redundant.

| Path | Description | Specific Reason for Deletion |
| :--- | :--- | :--- |
| `supabase/` | Complete Supabase configuration and code | Entire cloud infrastructure directory. |
| `supabase/config.toml` | Supabase local/hosted project config | Configures Supabase services (Auth, Edge Functions, PostgreSQL, Studio). |
| `supabase/functions/` | Deno Edge Functions | Serverless functions (`admin`, `activate`, `checkin`) previously handling licensing. |
| `supabase/migrations/` | PostgreSQL database migrations | Schema migrations for hosted PostgreSQL database. |
| `supabase/tests/` | Supabase Edge Function test suites | Tests validating Deno edge functions. |
| `supabase/.temp/` | Temporary Supabase CLI working files | CLI state and database connection dumps. |
| `supabase/.branches/` | Supabase branch configurations | Supabase CLI branch metadata. |
| `supabase/.env.local` | Supabase Edge Function secrets | Local development secrets for Supabase runtime. |
| `deno.lock` | Deno package lockfile | Lockfile for Supabase Deno Edge Functions; not used by Node/Electron POS. |
| `scripts/test-supabase-auth.js` | Supabase Auth API test script | Scratch script testing `@supabase/supabase-js` authentication methods. |
| Root `package.json` -> `@supabase/supabase-js` | Supabase Client SDK dependency | Unused in desktop app; zero imports across `src/` and `electron/`. |
| Root `package.json` -> `pg` | PostgreSQL client dependency | Used only for hosted database scripts; desktop POS uses SQLite. |
| Root `package.json` -> `postgres` | PostgreSQL client dependency | Used only for hosted database scripts; desktop POS uses SQLite. |
| Root `package.json` -> `@types/pg` | TypeScript definitions for `pg` | Obsolete types for removed `pg` library. |

---

### Category 3: Exclusively Licensing Remnants / Legacy Scratch / Debug (To Be Completely Deleted)

During prior testing, licensing removal, and debugging phases, several transient scripts, log files, stubs, and legacy configuration backups were accumulated in the workspace root.

| Path | Description | Specific Reason for Deletion |
| :--- | :--- | :--- |
| `electron/native/` | Empty native directory | Residual empty directory from removed native licensing attestation modules. |
| `.env.production.bak` | Deprecated environment backup | Contains obsolete licensing server URLs and public Ed25519 keys. |
| `dump_html.js` | Playwright debug DOM dumper | Temporary script used during UI debug sessions. |
| `e2e_debug.log` | Playwright test execution log | Stale log output from prior test runs. |
| `edge.log` | Supabase Edge Function execution log | Stale log output from prior edge function tests. |
| `functions.log` | Supabase Edge Function runtime log | Stale log output from prior edge function tests. |
| `fix_imports.py` | AST repair script | One-off Python script used during licensing removal migration. |
| `fix_ipc.py` | IPC repair script | One-off Python script used during licensing removal migration. |
| `fix_server_tsconfig.py` | Config repair script | One-off Python script used during licensing removal migration. |
| `fix_signer_imports2.py` | Import repair script | One-off Python script used during licensing removal migration. |
| `fix_tests.py` | Test fix script | One-off Python script used during licensing removal migration. |
| `get-packaged.js` | Scratch script for packaged binary | Replaced by standard `scripts/verify-packaged.js`. |
| `packaged_output.log` | Packaged binary execution log | Stale execution log. |
| `patch-ispackaged.js` | Temporary Electron builder patch | Scratch patch script no longer required. |
| `playwright-output.log` | Playwright run output | Stale test execution log. |
| `playwright.log` | Playwright run log | Stale test execution log. |
| `test-db.js` | Direct SQLite test script | Scratch script; covered by automated `tests/infrastructure/database.test.ts`. |
| `test-deno.ts` | Deno scratch script | Scratch script for Deno runtime testing. |
| `test-dotenv.js` | Scratch dotenv script | Scratch script testing environment variables. |
| `test-launch.js` | Scratch app launcher | Scratch script for manual Electron launches. |
| `clean-vitest-results.json` | Stale Vitest JSON output | Temporary test runner output. |
| `vitest-results.json` | Stale Vitest JSON output | Temporary test runner output. |
| `vitest_files.txt` | Stale Vitest file listing | Temporary test runner output. |
| `verification_audit_post_isolation.md` | Transient audit scratchpad | Transient workspace notes; superseded by formal `docs/` reports. |
| `tests/temp/*` | Ephemeral test outputs | Generated PDF files and temporary SQLite DB instances from prior test runs. |

---

### Category 4: Required POS Functionality (Preserved & Protected)

All components, configurations, logic, and tests necessary to run, build, test, and package the standalone Mini POS desktop application.

| Path | Description | Role in Standalone Architecture |
| :--- | :--- | :--- |
| `electron/main.ts` | Electron Main Process entry point | Manages application lifecycle, BrowserWindow creation, IPC registration, database connection, backup/restore. |
| `electron/preload.ts` | Context-isolated Preload Script | Exposes secure `window.api` bridge to renderer via `contextBridge`. |
| `electron/ipc/` | IPC Handlers | Handlers for `products`, `billing`, `history`, `settings`, `backup`, `restore`, `printers`. |
| `electron/services/` | Main Process Services | `backup.service.ts` and `restore.service.ts` for automated and manual SQLite database management. |
| `src/main.tsx` | React Renderer Entry Point | Mounts the React application in the desktop DOM. |
| `src/App.tsx` | Root Application Component | Orchestrates POS setup check, cashier layout, active billing tabs, history, and settings navigation. |
| `src/domain/` | Core Business Entities & Services | Pure domain logic: `ActiveBill.ts`, `BillItem.ts`, `Product.ts`, `BillingService.ts`. |
| `src/infrastructure/` | Local Persistence & Printing | SQLite database manager, table migrations (`migrations.ts`), repositories (`bill`, `product`, `draft`), ESC-POS printer, PDF generator. |
| `src/presentation/` | React UI Components & Stores | Zustand stores (`cartStore.ts`, `settingsStore.ts`, `cashierStore.ts`), POS screens (`BillingScreen`, `ProductCatalog`, `SalesHistory`, `SettingsView`, `SetupWizard`). |
| `src/shared/` | Shared TypeScript Types & Constants | Cross-process interfaces, IPC contracts, DTOs, calculation helpers. |
| `src/ui/` | Reusable UI Elements | Buttons, modal dialogs, inputs, tabs. |
| `assets/` | Application Icons & Branding | Icons used for window icons, app packaging, and receipt logos. |
| `scripts/prebuild-check.js` | Pre-build Validation Script | Verifies environment path cleanliness (no spaces) before building native modules. |
| `scripts/verify-packaged.js` | Packaged Binary Verification Script | Launches packaged `.app` / `.exe` via Playwright to verify SQLite, IPC, and settings end-to-end. |
| `tests/domain/` | Domain Unit Tests | Validates active bill calculations, discounts, item additions, product domain rules. |
| `tests/infrastructure/` | Infrastructure Unit Tests | Validates SQLite migrations, bill repository, draft repository, product repository, backup/restore services. |
| `tests/integration/` | Desktop Integration Tests | Validates full IPC message exchange, PDF generation, database concurrency, and transaction rollbacks. |
| `tests/unit/` | Unit Tests | Validates foundation, settings, printing, and UI helper functions. |
| `tests/e2e/` | Desktop E2E Tests (Playwright) | End-to-end testing of setup wizard, billing UI, scanner, printing, products, backup, and packaged app. |
| `package.json` | Project Definition & Scripts | Manages dependencies, build scripts (`dev`, `build`, `test`, `test:e2e`, `package:mac:*`). |
| `vite.config.ts` | Bundler & Test Configuration | Bundles renderer and electron processes with Vite, configures Vitest. |
| `playwright.config.ts` | E2E Test Runner Configuration | Configures Playwright Electron testing. |
| `tsconfig.json` / `tsconfig.node.json` | TypeScript Configurations | Compiler settings for main process, preload, and renderer. |
| `tailwind.config.js` / `postcss.config.js` | UI Styling Pipeline | Tailwind CSS v4 styling rules. |
| `electron-builder.yml` | Desktop Packaging Configuration | DMG, NSIS, and cross-platform packaging metadata. |
| `.env.local` / `.env.production` | Desktop Environment Templates | Minimal local configuration files (devoid of cloud/licensing variables). |

---

## 4. Verification Checkpoints

Before executing deletions:
1. Verify no file in `src/` or `electron/` imports from `admin-ui/` or `supabase/`.
2. Verify package dependencies in Category 2 are not imported anywhere in the core POS code.
3. Verify all required POS modules in Category 4 remain completely untouched by the cleanup.

After executing deletions:
1. Re-run `npm install` to update `package-lock.json`.
2. Run `npx tsc --noEmit` to ensure zero compilation or import errors.
3. Run `npm test` to verify all 27 unit/integration test suites pass.
4. Run `npm run test:e2e` to verify all desktop E2E flows pass.
