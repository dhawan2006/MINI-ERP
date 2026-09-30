# ADR-008: Printing Architecture
**Decision:** Asynchronous IPC Print Spooler.
**Reason:** Printer drivers can lock the event loop. React must remain free.