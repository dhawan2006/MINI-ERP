# Stage 25 — Product Management Discovery & Planning

## Current Product Architecture
Mini POS currently implements products using a robust Domain-Driven Design pattern:
- **Domain**: `src/domain/entities/Product.ts` encapsulates core logic (`id`, `name`, `barcode`, `priceMinor`, `isActive`), validating that prices are non-negative minor integers and names/ids are non-empty.
- **Repository**: `src/infrastructure/repositories/product.repository.ts` successfully abstracts SQLite operations. It maps rows to Domain entities and currently contains working methods for `create`, `update`, `softDelete`, `findByBarcode`, `getById`, and `searchActiveByPrefix`.
- **Application Interface**: `IProductRepository` only exposes read operations (`findByBarcode`, `getById`, `searchActiveByPrefix`). The write operations are hidden from the application layer.
- **Application Services**: There is no `ProductService` managing the product lifecycle.

## Current Product Schema
Defined in `migrations.ts` (Version 1):
- `id` (TEXT PRIMARY KEY) - UUIDv4
- `barcode` (TEXT UNIQUE) - Nullable, unique constraint preserved.
- `name` (TEXT NOT NULL) - Stripped and validated on save.
- `price_minor` (INTEGER NOT NULL) - Fixed-price minor units (paise).
- `is_active` (INTEGER NOT NULL DEFAULT 1) - Used for soft deletion.
- `created_at` / `updated_at` (INTEGER)

## Existing Product APIs
- **IPC Handlers**: `electron/ipc/products.handlers.ts` only registers `products:findByBarcode` and `products:searchActiveByPrefix`.
- **Renderer UI**: There are strictly zero product management UI components in `src/presentation/components/`.

## Identified Gaps
1. The `IProductRepository` does not expose `create`, `update`, or `softDelete`.
2. There is no `ProductService` orchestrating product writes.
3. IPC endpoints for write operations (`create`, `update`, `setActive`) are missing.
4. UI screens for the Product Catalog and Product Editor do not exist.

## Product Fields
The existing schema is perfectly suited for V1.1. We will **NOT** add new fields (no SKU, no tax, no inventory). The fields are: Name, Barcode (Optional), Price (Minor units).

## Product Creation Workflow
1. Focus starts in `Barcode` input (since operators usually scan physical products first).
2. Operator scans barcode (automatically moves focus or operator hits Tab).
3. Operator enters `Name`.
4. Operator enters `Price` (as decimal, formatted to minor units automatically).
5. Operator hits `Enter` to save.
6. Form resets, focus returns to `Barcode` for rapid sequential additions.

## Product Editing Workflow
- An operator clicks/selects a product from the Catalog list.
- A modal or side-panel opens.
- Operator modifies fields and clicks Save.
- **Historical Integrity**: The billing history uses snapshot tables (`bill_items`), so editing a product's price or name will *never* mutate a past bill.

## Activation / Deactivation
- We will map `Deactivate` to the repository's `softDelete(id)` which sets `is_active = 0`.
- Deactivated products will be hidden from the default catalog list but can be toggled visible to reactivate them.
- Deactivated products will explicitly be ignored by the billing search (as `searchActiveByPrefix` already enforces `is_active = 1`).

## Search & Catalog Scaling
- The catalog will be a compact table list.
- To handle realistic V1 catalog sizes (e.g. 1000 - 5000 products), we will add a simple `searchProducts(term, limit, includeInactive)` method to the repository rather than dumping the entire SQL table into React memory.

## Keyboard Model
- `Ctrl/Cmd + P` or dedicated shortcut to open Product Management from billing.
- `Arrow Up/Down` to navigate the catalog table.
- `Enter` on a row to edit.
- `Esc` to close edit modal.

## Navigation
- A "Products" button will be placed in the primary application header next to "History" and "Settings".

## Scanner Integration Decision
- The global `useScannerDetector` captures all scanner keystrokes in the application window. If a scanner is used while adding a product, we should ensure the scanner payload populates the active Barcode field if it is focused, or we can simply let the global detector pass events into focused inputs naturally (wedge scanners type like a keyboard).

## Historical Integrity & Error Handling
- Validations will trigger domain errors (`InvalidPriceError`, `InvalidProductError`) which map cleanly through our existing `translateError` IPC mapper.

## Implementation Plan Slices
1. **Slice 1 (Domain & Repo)**: Update `IProductRepository.ts` to expose `create`, `update`, and `softDelete`. Implement `listProducts` and `searchProducts`.
2. **Slice 2 (App Layer)**: Create `ProductService.ts` to orchestrate validations and mapping.
3. **Slice 3 (IPC)**: Add `createProduct`, `updateProduct`, `listProducts`, `searchProducts` channels in `ipc-contracts.ts` and `products.handlers.ts`.
4. **Slice 4 (Renderer Store)**: Add `productStore.ts` (Zustand) for catalog state management.
5. **Slice 5 (UI Components)**: Build `ProductList`, `ProductEditorModal`, and integrate into the main header navigation.

## Final Recommendation
**PRODUCT MANAGEMENT READY FOR IMPLEMENTATION**
