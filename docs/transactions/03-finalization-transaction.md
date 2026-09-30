# 03. Finalization Transaction

To ensure data integrity, the finalization process uses a single, atomic SQLite transaction via `better-sqlite3`.

## Transaction Scope
The atomic transaction covers:
1. `INSERT INTO bills` - Creates the bill header.
2. `INSERT INTO bill_items` - Creates all line items linked to the bill.
3. `DELETE FROM drafts` - Clears the active draft.

## Rollback Behavior
If any step in the transaction fails (e.g., database constraint violation, disk full), the entire transaction rolls back.
- No partial bill is created.
- The active draft remains intact and can be recovered.
- The bill number generator state remains consistent.
