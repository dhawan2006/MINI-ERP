# Mini POS — Technical Documentation Index

Welcome to the technical documentation for **Mini POS**, a self-contained, offline-first desktop Point of Sale application built with Electron, React, TypeScript, and SQLite.

---

## Active Documentation Suite

The active documentation describes the current standalone architecture, local data management, development procedures, and release processes:

| Document | Description |
| :--- | :--- |
| **[Architecture](architecture.md)** | System architecture, Electron process model, IPC contracts, domain entities, and data flows. |
| **[Development Guide](development.md)** | Developer environment setup, prerequisite tools, scripts, coding conventions, and local workflow. |
| **[Database Architecture](database.md)** | SQLite database engine (`better-sqlite3`), WAL mode, schema definitions, migrations, and performance. |
| **[Backup & Recovery](backup-and-restore.md)** | Automated snapshots, manual database exports, restore locking mechanisms, and disaster recovery. |
| **[Testing Strategy](testing.md)** | Comprehensive test suites: Vitest unit & integration tests, Playwright desktop E2E, and packaged app validation. |
| **[Release & Packaging](release.md)** | Multi-platform desktop packaging with `electron-builder`, artifact signing, DMG/EXE outputs, and distribution. |
| **[Support & Troubleshooting](support.md)** | Workstation support runbook, hardware diagnostics (printers, barcode scanners), database repairs, and logging. |
| **[Release Validation Report](final-mini-pos-2.0-release-validation.md)** | Production release certification, clean install, E2E test results, and final architectural verdict. |

---

## Historical Archive

Mini POS was previously coupled with a cloud-based web Admin Panel, remote licensing verification, and Supabase infrastructure. In version 2.0, this architecture was permanently decommissioned in favor of a 100% independent, offline-first desktop design.

Detailed specifications, security audits, migration logs, and decommissioning execution reports are preserved for historical governance in the archive:

- **[Archive: Licensing Subsystem](archive/legacy-infrastructure/licensing/)**: Historical license key schemas, cryptographic protocols, device attestation, and activation workflows.
- **[Archive: Web Admin Panel](archive/legacy-infrastructure/admin-panel/)**: Former multi-tenant administrative portal, API specifications, and role-based access controls.
- **[Archive: Supabase Infrastructure](archive/legacy-infrastructure/supabase/)**: Former PostgreSQL cloud migrations, Edge Functions, and Row Level Security audits.
- **[Archive: Decommissioning Execution](archive/legacy-infrastructure/decommissioning/)**: Step-by-step decommission preflights, data dumps, and removal inventories.

---

*For quickstart instructions and end-user features, refer to the root [README.md](../README.md).*
