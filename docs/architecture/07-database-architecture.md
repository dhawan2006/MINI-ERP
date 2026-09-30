# Database Architecture
- Engine: SQLite (`better-sqlite3`).
- Mode: WAL mode for crash resilience.
- Connection: Exclusively owned by Main process.