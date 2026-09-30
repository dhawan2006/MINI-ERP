# 02. Finalization

Finalization is the process of converting a mutable Active Draft into an immutable Finalized Bill.

## Process
1. **Domain Validation**: The draft is validated. It must contain at least one item. Empty drafts are rejected.
2. **Snapshot Creation**: The current product names, prices, and line totals are captured and stored in the bill items.
3. **Number Allocation**: A unique, monotonic bill number is assigned.
4. **Persistence**: The bill and its items are saved to the database.
5. **Draft Cleanup**: The active draft is deleted.
6. **Next Bill Ready**: The UI immediately transitions to a new, empty draft, ready for the next customer.

## Renderer Independence
The renderer (React/Zustand) is strictly responsible for requesting finalization. It never calculates the final totals or constructs the finalized bill object itself. The Main Process is completely authoritative over the finalization logic.
