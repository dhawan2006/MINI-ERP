# 11. Duplicate Protection

The system is protected against duplicate finalization requests.

## Defenses
- The React UI disables the "Finalize Bill" button immediately upon click.
- The IPC handler uses a semaphore-like lock (`isFinalizing`) per draft to prevent concurrent finalization operations.
- Rapid double-clicks or IPC retries will not result in multiple finalized bills for the same draft.
