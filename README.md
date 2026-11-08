# Mini POS — Standalone Desktop Point of Sale

A fast, reliable, offline-first desktop Point of Sale (POS) application built with **Electron**, **React**, **TypeScript**, and **SQLite**. Designed for retail stores and small businesses requiring zero cloud dependency, zero external licensing servers, and instant offline operation.

---

## 1. Architectural Overview

Mini POS operates as a 100% self-contained desktop application. All application state, product catalogs, customer transaction histories, and hardware configurations are managed strictly on the local workstation.

```
┌─────────────────────────────────────────────────────────────┐
│                      Mini POS Desktop                       │
├──────────────────────────────┬──────────────────────────────┤
│      Electron Renderer       │   Electron Main Process      │
│  (React 19 + Tailwind CSS)   │   (Node.js + Electron)       │
│  - Setup Wizard              │   - Window Lifecycle         │
│  - Active Billing & Cart     │   - Safe Database Migrations │
│  - Product Catalog Search    │   - Backup & Restore Service │
│  - Sales History Explorer    │   - ESC/POS & PDF Printing   │
│  - Settings Configuration    │   - IPC Request Routing      │
└──────────────┬───────────────┴──────────────┬───────────────┘
               │ Context-Isolated Preload     │
               └───────────────┬──────────────┘
                               ▼
               ┌──────────────────────────────┐
               │    Local SQLite Database     │
               │   (`mini-erp-data/billing.db`)│
               │   - Products, Bills, Settings│
               │   - WAL Mode & Transactions  │
               └──────────────────────────────┘
```

### Core Architectural Principles
- **Offline-First**: Does not require internet connectivity, cloud authentication, remote API calls, or server leases.
- **Local Persistence**: Powered by SQLite via `better-sqlite3` in Write-Ahead Logging (WAL) mode for atomic transactions and ACID compliance.
- **Context Isolation**: Main process and renderer communicate strictly via context-isolated Electron IPC channels (`window.api`).
- **Resilient Data Protection**: Automated daily database backups, pre-restore transactional snapshots, and one-click database restoration.

---

## 2. Prerequisites

- **Node.js**: `v20.0.0` or higher (verified on Node.js `v26.x`)
- **Package Manager**: `npm` `v10.0.0` or higher
- **Supported Operating Systems**:
  - macOS (Apple Silicon `arm64` and Intel `x64`, macOS 12 Monterey or higher)
  - Windows (x64, Windows 10 / 11)
  - Linux (x64, major distributions)

---

## 3. Installation & Setup

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd mini_ERP
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Launch in development mode:**
   ```bash
   npm run dev
   ```
   This starts the Vite development server and launches Electron with hot-module reloading enabled.

---

## 4. Build & Quality Verification

### Production Build
Compile TypeScript and bundle the renderer and Electron main process:
```bash
npm run build
```

### Unit & Integration Tests (Vitest)
Run the full test suite covering domain entities, repositories, migrations, IPC handlers, PDF generation, and concurrency:
```bash
npm test
```

### Desktop End-to-End Tests (Playwright)
Run the end-to-end suite testing initial setup, billing workflows, hardware scanner input, database restore, and standalone resilience:
```bash
npm run test:e2e
```

### Packaged Binary Validation
Verify the packaged desktop executable directly in production mode:
```bash
node scripts/verify-packaged.js
```

---

## 5. Desktop Packaging

Mini POS packages into native platform installers using `electron-builder`:

### macOS
- **Apple Silicon (arm64)**:
  ```bash
  npm run package:mac:arm64
  ```
- **Intel (x64)**:
  ```bash
  npm run package:mac:x64
  ```
- **Universal Binary**:
  ```bash
  npm run package:mac:universal
  ```
*Output installer: `release/Mini POS-<version>-arm64.dmg`*

### Windows
- **Windows x64**:
  ```bash
  npm run package:win:x64
  ```
*Output installer: `release/Mini POS Setup <version>.exe`*

---

## 6. Local SQLite Architecture & File Locations

All application data is stored in a single SQLite database file named `billing.db`.

### Default Data Directory
- **macOS**: `~/Library/Application Support/Mini POS/mini-erp-data/billing.db`
- **Windows**: `%APPDATA%\Mini POS\mini-erp-data\billing.db`
- **Linux**: `~/.config/Mini POS/mini-erp-data/billing.db`

### Database Schema
- `products`: Product ID, SKU barcode, product name, price in minor units (cents/paise), active status, timestamps.
- `bills`: Invoice ID, receipt number, subtotal, discount, total, payment method (Cash / UPI), cashier notes, created timestamp.
- `bill_items`: Item ID, bill reference, product ID, item name snapshot, price snapshot, quantity, line total.
- `draft_bills`: Active cart state persistence to prevent work loss during system restarts or crashes.
- `settings`: Application configuration (store profile, printer configuration, onboarding status).

---

## 7. Data Backup & Recovery

### Automated Backups
Mini POS automatically generates verified SQLite database backups:
- **Trigger**: Automatically during daily operation or prior to executing a database restore.
- **Location**: `<UserData>/mini-erp-data/backups/Mini-POS-Backup-YYYY-MM-DD-HH-mm.db`
- **Integrity Check**: Every backup runs SQLite `PRAGMA integrity_check` before confirming success.

### Manual Backup & Restore
- **Create Backup**: Navigate to **Settings** -> **Database Management** -> click **Create Backup Now**.
- **Restore Database**:
  1. Open **Settings** -> **Database Management**.
  2. Select any previous backup `.db` file or browse external storage.
  3. Confirm the restore. The system validates the candidate backup, archives the current database, terminates active locks, swaps the database file, and restarts the data layer.

---

## 8. Hardware Integrations

- **Thermal Receipt Printers**:
  - Direct ESC/POS printing over USB, Serial, or Local Network TCP/IP (port 9100).
  - 80mm and 58mm paper size formatting.
  - Automatic receipt PDF generation fallback via `pdf-lib`.
- **Barcode Scanners**:
  - Compatible with standard USB and Bluetooth HID barcode scanners.
  - Hardware keystroke burst detection routes scanned barcodes directly to the active cart without requiring input focus.
- **Cash Drawers**:
  - Standard RJ11/RJ12 cash drawer kick pulse triggered via ESC/POS receipt printer pin.

---

## 9. Historical Note & Architecture Evolution

Earlier iterations of Mini POS utilized a cloud-based web Admin Panel, remote licensing verification, and Supabase infrastructure. In version 2.0, the entire external architecture was permanently retired in favor of an independent, offline-first desktop design. Complete historical reports, specifications, and decommissioning records are preserved in [`docs/archive/legacy-infrastructure/`](docs/archive/legacy-infrastructure/).

---

## 10. Documentation Index

For detailed engineering guides, schemas, and operational manuals, see the [`docs/`](docs/README.md) directory:
- [System Architecture](docs/architecture.md)
- [Development Guide](docs/development.md)
- [Database Architecture](docs/database.md)
- [Backup & Disaster Recovery](docs/backup-and-restore.md)
- [Testing Strategy](docs/testing.md)
- [Release & Packaging](docs/release.md)
- [Support & Troubleshooting](docs/support.md)

---

## 11. License

This project is licensed under the [ISC License](LICENSE).
