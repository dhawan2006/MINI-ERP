# Architectural Invariants
1. Renderer NEVER queries SQLite directly.
2. Finalized bills NEVER depend on current product prices (snapshots only).