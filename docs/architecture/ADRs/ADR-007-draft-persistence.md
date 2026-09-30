# ADR-007: Draft Persistence
**Decision:** Debounced IPC saves to `drafts` table.
**Reason:** Protects against power loss without blocking the main UI thread.