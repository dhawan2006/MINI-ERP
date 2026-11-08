# Mini POS — Development Guide

## 1. Prerequisites

- **Node.js**: `v20.0.0` or higher (verified on Node.js `v26.x`).
- **npm**: `v10.0.0` or higher.
- **Operating System**: macOS (ARM64 or x64), Windows (x64), or Linux (x64).
- **C/C++ Build Tools**: Required by `node-gyp` to compile native SQLite bindings (`better-sqlite3`):
  - macOS: Xcode Command Line Tools (`xcode-select --install`).
  - Windows: Visual Studio C++ Build Tools or `windows-build-tools`.
  - Linux: `build-essential`, `python3`.

---

## 2. Setup & Installation

Clone the repository and install dependencies:

```bash
git clone <repository-url>
cd mini_ERP
npm install
```

> [!NOTE]
> Mini POS requires **zero cloud credentials**, zero environment secrets, and zero backend configuration. The application works completely out of the box with local SQLite.

---

## 3. Development Workflow

### Launching Development Mode
Starts the Vite dev server and launches Electron with live hot reloading:
```bash
npm run dev
```

### Type Checking
Run TypeScript typecheck across renderer, main process, and preload:
```bash
npx tsc --noEmit
```

### Production Build
Bundle client and electron code for production:
```bash
npm run build
```

---

## 4. Project Directory Structure

```text
mini_ERP/
├── assets/                    # Static assets, fonts, icons
├── build/                     # App packaging icons
├── dist/                      # Compiled renderer bundle
├── dist-electron/             # Compiled Electron main and preload scripts
├── electron/                  # Electron Main Process
│   ├── ipc/                   # Typed IPC request handlers
│   ├── services/              # Main process services (backup, restore)
│   ├── main.ts                # Main process entrypoint
│   └── preload.ts             # Preload script exposing window.api
├── src/                       # React Renderer Application
│   ├── application/           # Application use-cases and ports
│   ├── domain/                # Pure domain entities and business rules
│   ├── infrastructure/        # SQLite connection, repositories, printer adapters
│   ├── presentation/          # React components, stores, hooks, layouts
│   ├── shared/                # DTOs, IPC contracts, calculation utilities
│   ├── ui/                    # Reusable atomic UI components
│   ├── App.tsx                # Application root component
│   └── main.tsx               # React DOM entrypoint
├── scripts/                   # Validation and prebuild scripts
├── tests/                     # Automated test suites
│   ├── domain/                # Unit tests for domain logic
│   ├── infrastructure/        # Unit tests for SQLite, repositories, services
│   ├── integration/           # IPC and transaction integration tests
│   ├── unit/                  # Renderer and utility unit tests
│   └── e2e/                   # Playwright desktop E2E tests
├── electron-builder.yml       # Desktop packaging configuration
├── vite.config.ts             # Bundler & test configuration
└── package.json               # Dependencies and scripts
```

---

## 5. Coding Conventions

- **Currency Calculations**: Always store and calculate monetary values as integers in minor currency units (paise or cents) using `Math.round`. Never store or calculate floating-point numbers for prices.
- **Process Communication**: Never use direct remote calls. All interactions between renderer and main process must define a contract in `src/shared/ipc-contracts.ts` and be registered in `electron/ipc/`.
- **Database Access**: Direct database calls are strictly prohibited in the renderer. All queries and transactions execute inside the main process via repositories located in `src/infrastructure/repositories/`.
