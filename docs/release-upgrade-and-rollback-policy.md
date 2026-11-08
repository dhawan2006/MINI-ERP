# Mini POS — Application Upgrade & Rollback Policy

**Document Version:** 1.0.0  
**Effective Date:** November 8, 2026  
**Scope:** Mini POS Desktop Application Lifecycle Management  
**Architecture:** Offline-First, Operator-Managed Desktop Upgrades  

---

## 1. Principles & Offline Independence

Mini POS is designed for mission-critical retail environments. The application has **zero automatic online update dependencies** (`electron-updater` is not included) to prevent unexpected disruptions during store operating hours.

All updates are:
- **Operator-Controlled:** Upgrades are applied deliberately by the store owner or IT administrator during scheduled maintenance windows.
- **Air-Gapped Compatible:** Installers (`.dmg` for macOS, `.exe` for Windows) are self-contained and require no active internet connection during installation or startup.
- **Data-Safe:** Local transaction history, product catalogs, customer drafts, and store profiles are preserved across upgrades.

---

## 2. Standard 6-Step Production Upgrade Protocol

Before applying any update on production POS hardware, cashiers or administrators must follow this sequence:

```
+---------------------+     +---------------------+     +---------------------+
| 1. Live Data Backup | --> | 2. Verify Installer | --> | 3. Install Package  |
+---------------------+     +---------------------+     +---------------------+
                                                                   |
+---------------------+     +---------------------+     +----------v----------+
| 6. Final Validation | <-- | 5. Test Live Billing| <-- | 4. Auto Migration   |
+---------------------+     +---------------------+     +---------------------+
```

### Step 1: Create a Verified Local Backup
From the Mini POS interface:
1. Navigate to **Settings** (`Cmd+,` or gear icon).
2. Click **Create Backup**.
3. Select an external storage drive or secure folder (e.g. `/Volumes/POS_Backup/Mini-POS-Backup-YYYY-MM-DD.db`).
4. Wait for the confirmation notification. Mini POS uses the SQLite Online Backup API to generate a crash-consistent, verified copy.

Alternatively, from the command line while Mini POS is closed:
```bash
# macOS default database location:
cp "$HOME/Library/Application Support/mini-erp/mini-erp-data/billing.db" \
   "$HOME/Desktop/PreUpgrade-Backup-$(date +%Y%m%d).db"
```

### Step 2: Verify the Release Package Integrity
Compare the cryptographic checksum of the downloaded installer against the official release manifest:
```bash
shasum -a 256 "Mini POS-1.0.0-arm64.dmg"
# Must match the published SHA-256 in release/release-manifest.json
```

### Step 3: Install the New Binary
- **macOS:** Open the DMG, drag `Mini POS.app` into `/Applications`, and choose **Replace**.
- **Windows:** Run the setup executable and complete the wizard. Existing application data in `userData` is preserved.

### Step 4: Execute Automated Schema Migrations
Launch the updated application. During startup, [`initDatabase()`](file:///Users/laksh/Desktop/mini_ERP/src/infrastructure/database/connection.ts) invokes [`runMigrations()`](file:///Users/laksh/Desktop/mini_ERP/src/infrastructure/database/migrations.ts):
- Migrations are sequential and forward-only.
- Each migration runs within a single SQLite transaction (`BEGIN TRANSACTION ... COMMIT`).
- If any migration step encounters an error, the transaction rolls back cleanly, leaving the previous schema version completely intact, and displays a fatal error dialog to prevent running on a partially migrated state.

### Step 5: Verify Startup & Billing Functionality
1. Confirm the application launches directly into the POS billing screen without displaying onboarding prompts (for existing installations).
2. Search for an existing product using the search input or barcode scanner.
3. Ring up a test item, add it to the cart, and verify that totals and taxes compute properly.
4. Finalize the test transaction via Cash or UPI and verify invoice generation.

### Step 6: Verify Data Integrity
1. Open **History** (`Cmd+H`).
2. Verify previous sales transactions, invoices, and totals are fully accessible.
3. Open **Products** (`Cmd+P`).
4. Confirm existing inventory records and pricing remain unchanged.

---

## 3. Rollback Policy & Failure Recovery

### Case A: Failure Prior to Database Migration (Installer Fails)
If the new application bundle fails to launch due to an operating system incompatibility or corrupted binary:
1. Delete the new application bundle from `/Applications`.
2. Reinstall the previous known-good version from its original installer DMG.
3. Launch Mini POS. Since no database migrations were applied, the database remains fully compatible.

### Case B: Failure During Database Migration
Because all migrations execute inside an atomic SQLite transaction:
```typescript
const transaction = db.transaction(() => {
  db.exec(migration.sql);
  db.prepare('INSERT INTO schema_version ...').run(...);
});
transaction();
```
If an error occurs midway through a migration script:
1. SQLite rolls back the transaction in full.
2. `schema_version` is not incremented.
3. Mini POS refuses to start with an explicit migration error.
4. The database is in its exact pre-migration state. Reinstalling the previous binary will start normally.

### Case C: Rollback After Successful Migration
> [!CAUTION]
> **Database Schema Incompatibility on Downgrade**
> 
> Reinstalling an older binary over a database that has already been upgraded to a newer schema version is **strictly unsupported**. An older binary may not recognize newly added columns, tables, or index structures, which could lead to silent data omission.

If a critical software bug in the new version requires rolling back to a previous binary:
1. Close Mini POS.
2. Reinstall the previous application version.
3. **Restore the Pre-Upgrade Backup:** Replace the upgraded `billing.db` with the backup taken in Step 1.
   ```bash
   cp "/path/to/PreUpgrade-Backup-YYYYMMDD.db" \
      "$HOME/Library/Application Support/mini-erp/mini-erp-data/billing.db"
   # Remove stale WAL/SHM files:
   rm -f "$HOME/Library/Application Support/mini-erp/mini-erp-data/billing.db-wal"
   rm -f "$HOME/Library/Application Support/mini-erp/mini-erp-data/billing.db-shm"
   ```
4. Launch the previous binary. The database is restored to the exact supported schema.
5. Manually re-enter any cash/UPI transactions processed during the interim period using physical paper receipts.

---

## 4. Disaster Recovery Matrix

| Scenario | Impact | Corrective Action | Data Loss |
| :--- | :--- | :--- | :--- |
| **Installer corrupted during download** | App cannot be extracted | Redownload and verify SHA-256 against release manifest | 0% |
| **Migration syntax error** | Startup aborted with error dialog | Transaction auto-aborted. Reinstall previous binary | 0% |
| **New release has runtime crash** | Cashier blocked | Reinstall previous version, restore Step 1 backup | Transactions during test window |
| **Power loss during upgrade** | Machine restarts | Re-run installer; SQLite WAL auto-recovers | 0% |

