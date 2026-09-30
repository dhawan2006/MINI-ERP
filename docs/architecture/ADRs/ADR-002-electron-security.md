# ADR-002: Electron Security Model
**Decision:** contextIsolation: true, nodeIntegration: false.
**Reason:** Prevents XSS from executing arbitrary node commands.