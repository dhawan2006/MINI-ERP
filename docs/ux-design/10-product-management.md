# Product Management UX

## Product Screen Design
- **Entry:** Press `F3`.
- **Purpose:** Fast CRUD operations for the shop owner. Not intended for use during an active checkout.
- **Layout:** 
  - Left Panel: List of products with a search bar.
  - Right Panel: Simple form (Name, Barcode, Selling Price, Active Status).
- **Workflow (Add):**
  1. Click "New" (or `Ctrl+N`).
  2. Focus is in the Barcode field. Owner scans the item.
  3. Focus jumps to Name. Owner types name.
  4. Focus jumps to Price. Owner types price.
  5. Press `Enter` to save.
- **Validation:** If barcode already exists, highlight field in red: "Barcode already assigned to [Product]".
