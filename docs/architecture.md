# Mini POS — System Architecture

## 1. Architectural Vision & Principles

Mini POS is designed as an **offline-first, standalone desktop application**. It requires no external server connectivity, cloud authentication, remote databases, or periodic check-ins. All application state is persisted on the local filesystem using SQLite.

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

### Core Invariants
1. **Air-Gapped Operation:** The application can run indefinitely without an internet connection.
2. **Context Isolation:** The renderer has no direct access to Node.js APIs or the database. It communicates strictly through `contextBridge` using typed IPC channels.
3. **Atomic Persistence:** All financial transactions (bill finalization, draft updates) are guarded by SQLite transactions.
4. **Data Portability:** Business data resides entirely in a single SQLite database file, enabling seamless backups, migrations, and restores.

---

## 2. Process Boundaries

### Electron Main Process (`electron/main.ts`)
- Manages application lifecycle (`ready`, `window-all-closed`, `before-quit`).
- Creates the primary `BrowserWindow` with security settings (`nodeIntegration: false`, `contextIsolation: true`).
- Initializes SQLite database connection (`src/infrastructure/database/connection.ts`) and executes schema migrations (`runMigrations`).
- Registers IPC handlers for billing, products, sales history, settings, printer hardware, and backups.

### Electron Preload Script (`electron/preload.ts`)
- Bridges renderer and main processes via `contextBridge.exposeInMainWorld('api', { ... })`.
- Exposes typed methods:
  - `products`: Search, create, update, delete.
  - `billing`: Create bill, finalize bill, save draft, get active draft.
  - `history`: Query bills with offset/limit pagination.
  - `settings`: Read and update store profile and printer settings.
  - `backup`: Trigger manual database backup, list backups.
  - `restore`: Execute verified database restore.
  - `printers`: Discover system printers, test print.

### React Renderer (`src/`)
- Built with React 19, TypeScript, and Tailwind CSS.
- State management powered by Zustand stores:
  - `cartStore`: Active items, quantities, discounts, line totals, and cashier keyboard buffers.
  - `settingsStore`: Cached store metadata and printer configuration.
  - `productStore`: Product search results and local catalog cache.
- Views and Layouts:
  - `SetupLayout`: First-time store onboarding wizard.
  - `BillingLayout`: Main cashier terminal with fast barcode/search inputs and keyboard shortcuts.
  - `ProductsLayout`: Product catalog management.
  - `HistoryLayout`: Paginated invoice browsing and receipt reprint.
  - `SettingsLayout`: Store details, printer setup, and database backup/restore.

---

## 3. Domain Model

- **`ActiveBill` (`src/domain/entities/ActiveBill.ts`)**: Represents a customer cart in progress. Enforces discount constraints, calculates line totals and grand totals in integer minor currency units (paise/cents) to avoid floating-point errors.
- **`BillItem` (`src/domain/entities/BillItem.ts`)**: Snapshot of product details at the exact moment of sale (price, tax, name, quantity).
- **`Product` (`src/domain/entities/Product.ts`)**: Represents a catalog item with unique SKU/barcode, price, and active status.
- **`BillingService` (`src/application/use-cases/BillingService.ts`)**: Coordinates draft persistence, bill finalization, and transaction logging.

---

## 4. Hardware Integration

- **Thermal Receipt Printers:** Connects via ESC/POS commands directly over TCP/IP (port 9100) or USB serial. Falls back to generating PDF receipts using `pdf-lib`.
- **Barcode Scanners:** Captures USB HID keystroke bursts in `BarcodeInputService.ts` to automatically detect barcode entry without requiring input focus.
- **Cash Drawers:** Triggered via ESC/POS pulse signal (`ESC p 0 25 250`) on receipt finalization.
