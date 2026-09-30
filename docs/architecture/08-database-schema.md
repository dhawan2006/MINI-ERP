# Database Schema
- `products`: id, barcode (unique index), name, price, active.
- `bills`: id, created_at, status, total.
- `bill_items`: bill_id, product_name, snapshot_price, quantity. (Snapshots ensure historical accuracy).
- `drafts`: id, state_json.