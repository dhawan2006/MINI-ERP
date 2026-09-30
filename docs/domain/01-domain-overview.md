# Domain Layer Architecture

The Domain Layer serves as the single, authoritative source of truth for all billing behavior in the Mini Billing System.

## Principles
- **Pure TypeScript**: The domain has absolutely no knowledge of React, Zustand, Electron, SQLite, printers, or DOM APIs.
- **Strict Layering**: React/Zustand -> Application Use Cases (`BillingService`) -> Domain Entities (`ActiveBill`, `BillItem`, `Product`).
- **Encapsulation**: Domain models throw typed errors (e.g., `InvalidQuantityError`) to prevent invalid states. They do not expose directly mutable state arrays.

## Core Models

### Product
Represents the source of truth for an item in the store. Has a strict integer `priceMinor` and an `isActive` flag.

### BillItem
A snapshot representation of a product as it was added to a bill. Contains a duplicated `snapshotPriceMinor` and `snapshotName`. Once a BillItem is created, subsequent mutations to the global Product catalog do not affect it.

### ActiveBill
The mutable domain representation of an ongoing transaction. Enforces rules regarding:
- **Duplicate Merging**: Scanning the same product ID twice increments quantity rather than creating a new line.
- **Invariants**: Active/inactive product eligibility.
- **Undo Strategy**: Maintains an internal history stack bounding up to 50 previous mutations.

## Persistence Boundary
The domain does NOT persist itself. `BillingService` accepts repository interfaces (`IBillRepository`, `IDraftRepository`) injected from the outside, which it calls upon when state transitions require storage.
