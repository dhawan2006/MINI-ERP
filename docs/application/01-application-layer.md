# Application Layer Architecture

The Application Layer connects the pure Domain Model (business rules) to the Infrastructure Layer (SQLite, Electron) and exposes a clean IPC boundary to the Presentation Layer (React).

## Core Principles
- **Main Process Ownership**: The Application Service (`BillingService`) and SQLite repositories run exclusively in the Electron Main process.
- **Strict Boundary**: The Renderer only ever sees Data Transfer Objects (DTOs) and strictly typed `IpcError` payloads, never Domain instances or SQL entities.
- **Authoritative Flow**: The Renderer requests a mutation. The Main process validates it, applies the Domain rules, persists the state, and returns the newly calculated state. The Renderer does NOT do optimistic UI for billing mutations.

## Architecture Flow

```text
React (Renderer) -> Zustand Store -> `window.api` (Preload)
   |
(IPC serialize to main)
   |
IPC Handlers -> (translates input) -> `BillingService` -> Domain Rules -> Repositories -> SQLite
   |
(Translates output to DTO / IpcError)
   |
(IPC serialize to renderer)
   |
Zustand Store receives DTO and updates React State
```

## DTO Mappers
We strictly map:
- `Product (Domain)` -> `ProductDTO`
- `ActiveBill (Domain)` -> `ActiveBillDTO`

These exist in `electron/ipc/mappers.ts`.

## Dependency Injection
All repositories are instantiated during `app.whenReady()` in `electron/main.ts` and injected into `BillingService`. This avoids DI frameworks and keeps the runtime fast and simple.
