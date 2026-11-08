# Stage 39 — Mini POS V2 Discovery & Product Roadmap

## Final Status

> **V2 DISCOVERY COMPLETE WITH OPEN QUESTIONS**
>
> Open question: Windows support requires significant platform validation of the Swift native identity helper, which must be re-evaluated before committing to that platform.

---

## Current V1 Baseline

Mini POS V1 is a production-ready, macOS-only, offline-first Point-of-Sale application for small retail shops.

### What V1 Does Exceptionally Well

| Workflow | Detail |
|---|---|
| **Scan → Search → Add → Bill → Finalize → Print** | Keyboard-first, barcode-scanner-first checkout pipeline with no mouse requirement |
| **Offline-first** | All billing, history, and product data lives in a local SQLite database. No network required during operation |
| **Backup & Restore** | Atomic, verified SQLite backup with schema migration support on restore |
| **Licensing** | Server-authoritative, one-license-one-active-device, cryptographically bound to macOS Keychain/Secure Enclave. Signed offline leases permit continued operation without connectivity |
| **Device Binding** | Hardware identity derived from macOS Keychain-protected P-256 key. Copying data to another machine does not transfer the entitlement |
| **PDF Generation** | Thermal-width (58mm/80mm) PDF receipts rendered locally |
| **Printer Support** | USB thermal printers via system print dialog |
| **Scanner Support** | HID-keyboard-emulating USB barcode scanners |

### Current Platform

* **macOS arm64** (Apple Silicon)
* **Single counter** — one terminal per license
* **Local-only** — no cloud, no LAN sync

### Known V1 Limitations

* No Windows support
* No stock quantity tracking
* No customer/credit (Udhaar) records
* No date-range filtering on History
* No daily/summary reporting dashboard
* No automatic scheduled backups

---

## Deployment Context (Evidence Basis)

All V2 decisions are grounded in the following confirmed operational profile:

| Question | Answer |
|---|---|
| Shop type | **Grocery / Kirana store** |
| Stock tracking today | **Eyeball — not a painful problem yet** |
| Credit / Udhaar | **Occasional — a dedicated but lightweight module is acceptable** |
| GST requirement | **None — below GST threshold** |
| Terminal count | **Single counter, always** |
| Reporting need | **Date-range filtering on History is the primary gap** |
| Purchase tracking | **Not required** |
| Windows support | **A real near-term requirement (shop has a Windows PC)** |
| Auto-backup | **Manual backup is sufficient today** |

---

## Real Operational Problems V1 Does Not Solve

### Problem 1 — Windows Support
**Severity: P0**

The shop uses a Windows PC. V1 is macOS-only. This blocks real-world deployment at this shop entirely until resolved.

The Swift native identity helper (`minipos-identity`) is the primary blocker — it is built for macOS Keychain/Secure Enclave. Windows has its own TPM-backed key storage (Windows CNG / DPAPI) that would need a parallel native helper.

**Current workaround:** None. The shop cannot use Mini POS on their primary hardware.

---

### Problem 2 — No Date-Range Filtering on History
**Severity: P1**

The shop owner wants to see today's sales, yesterday's sales, or a specific week. Today the History screen shows all bills. There is no way to filter by date without manually scrolling.

This is the primary reporting gap identified — the owner does not need charts, pivot tables, or profit analysis. They need to quickly answer: *"How much did we sell this week?"*

**Current workaround:** Manual scrolling through history. Becomes worse as history grows.

---

### Problem 3 — No Udhaar (Credit) Tracking
**Severity: P1**

The shop occasionally extends credit to trusted customers. Today there is no way to associate a bill with a customer, track the outstanding balance, or record a repayment.

A dedicated customer module is acceptable — it does not need to be hidden behind a bill workflow. A simple Customers screen with name, phone, and running balance is sufficient.

**Current workaround:** Notebook or memory.

---

### Problem 4 — No Stock Quantity Visibility
**Severity: P2 (not yet painful)**

The shop eyeballs stock. This is confirmed to rarely cause problems today. However, as bill history grows, there will be value in knowing how many units of a product have been sold and inferring restocking needs.

This is a future need, not a current operational crisis.

**Current workaround:** Physical shelf inspection. Works today.

---

## Candidate V2 Feature Analysis

### Feature A — Windows Support

| Attribute | Detail |
|---|---|
| **Problem** | Shop's hardware is a Windows PC; V1 is macOS-only |
| **Who needs it** | The primary deployment target shop |
| **Current workaround** | None. Shop cannot run Mini POS |
| **Frequency** | Permanent blocker |
| **Business value** | Critical — unlocks the actual deployment |
| **Implementation complexity** | High — requires a Windows CNG/DPAPI native identity helper in C++ or Rust; re-validation of the entire licensing stack on Windows; Electron packaging for Windows (NSIS/Squirrel) |
| **Database impact** | None — SQLite is cross-platform |
| **UI complexity** | Low — Electron renderer is already cross-platform |
| **Offline implications** | None — architecture is the same |
| **Licensing implications** | High — the `IDENTITY_FAIL_CLOSED` guard, Keychain integration, and the entire `SwiftHelperIdentityProvider` must be replaced with a Windows-native equivalent. The server-side fingerprinting logic does not change |
| **Hardware implications** | USB scanner/printer work the same on Windows |
| **Classification** | **P0** |

**Architecture Impact:**
- New `WindowsHelperIdentityProvider.ts` implementing `IDeviceIdentityProvider`
- New native Windows helper (C++/Rust) using `CNG NCryptCreatePersistedKey` storing a P-256 key in the TPM-backed Windows key store
- `IDeviceIdentityProvider` factory in `electron/main.ts` must select the correct provider based on `process.platform`
- `electron-builder` config needs Windows NSIS packaging
- Full certification run on Windows equivalent to Stage 38

---

### Feature B — Date-Range Filtering on History

| Attribute | Detail |
|---|---|
| **Problem** | Cannot filter history by date; growing list is unusable for owner queries |
| **Who needs it** | Shop owner (daily closing check, weekly review) |
| **Current workaround** | Manual scrolling |
| **Frequency** | Daily |
| **Business value** | High — answers the #1 reporting question the owner has |
| **Implementation complexity** | Low — adds a date-picker UI component and a WHERE clause to the bills query |
| **Database impact** | Minimal — `created_at` column already exists; add an index on `bills(created_at)` |
| **UI complexity** | Low — date-range picker in the History header |
| **Offline implications** | None — local query |
| **Licensing implications** | None |
| **Hardware implications** | None |
| **Classification** | **P1** |

**Architecture Impact:**
- `BillRepository.getByDateRange(from: Date, to: Date)` new method
- New index: `CREATE INDEX IF NOT EXISTS idx_bills_created_at ON bills(created_at)`
- History IPC handler extended with optional `from`/`to` parameters
- History UI: date-range picker (from/to date inputs) in the header bar
- No schema version bump required (index only); backup/restore unaffected

---

### Feature C — Udhaar / Customer Credit Module

| Attribute | Detail |
|---|---|
| **Problem** | Shop extends credit to occasional customers; tracked in a notebook |
| **Who needs it** | Shop owner; trusted customers |
| **Current workaround** | Notebook |
| **Frequency** | Occasional |
| **Business value** | Medium-High — consolidates a real operational record into the system |
| **Implementation complexity** | Medium — new `customers` and `credit_transactions` tables; new screen; optional linkage from finalized bill to customer |
| **Database impact** | Two new tables; minor backup/restore size increase |
| **UI complexity** | Medium — new Customers nav item; customer picker at bill finalization (optional, must not slow down cashier) |
| **Offline implications** | Fully offline. No sync required |
| **Licensing implications** | None |
| **Hardware implications** | None |
| **Classification** | **P1** |

**Architecture Impact:**
- New tables: `customers(id, name, phone, created_at)`, `credit_transactions(id, customer_id, bill_id NULLABLE, amount_minor, type [CREDIT|REPAYMENT], note, created_at)`
- `bills` table gets optional `customer_id FK` column → schema migration required
- New `CustomerRepository`, `CreditRepository`
- New IPC channels: `customer:list`, `customer:create`, `customer:search`, `customer:getBalance`, `credit:addRepayment`
- New Customers screen accessible from nav sidebar
- At bill finalization: optional "Assign to customer / Udhaar" button (must be skippable in one keypress — no friction to the normal checkout flow)
- Backup/restore: tables included automatically; backup size increase < 1KB per customer for a typical kirana

---

### Feature D — Stock Quantity Tracking

| Attribute | Detail |
|---|---|
| **Problem** | Shop cannot see stock levels inside Mini POS |
| **Who needs it** | Shop owner |
| **Current workaround** | Physical shelf inspection — works today |
| **Frequency** | Not currently a pain point (confirmed) |
| **Business value** | Low-Medium right now; higher as bill volume grows |
| **Implementation complexity** | Medium — new `stock_ledger` table; auto-decrement on finalize; manual stock-in entry; low-stock alert |
| **Database impact** | Significant — every finalized bill generates stock ledger rows |
| **UI complexity** | Medium — stock quantity column in Products; stock-in form; alerts |
| **Offline implications** | Fully offline |
| **Licensing implications** | None |
| **Hardware implications** | None |
| **Classification** | **P2 — Deferred** |

**Rationale for deferral:** Not painful today. Adding a stock ledger to every finalize operation increases the write cost of the most critical path in the application. Should only be added when the shop owner explicitly needs it and is willing to actively maintain stock-in entries.

---

### Feature E — Automatic Scheduled Backup

| Attribute | Detail |
|---|---|
| **Problem** | Backup is manual today |
| **Who needs it** | Shop owner (data safety) |
| **Current workaround** | Manual backup — sufficient today (confirmed) |
| **Frequency** | Not a gap today |
| **Business value** | Low — already addressed manually |
| **Classification** | **Deferred** |

---

### Feature F — Daily/Monthly Sales Dashboard with Charts

| Attribute | Detail |
|---|---|
| **Problem** | Owner wants summary data |
| **Current workaround** | Scrolling history |
| **Classification** | **Deferred** |

**Rationale:** The owner's actual stated need is date-range filtering on History (Feature B). A full charting dashboard goes well beyond the stated problem and adds UI complexity without proportional value for a Kirana shop. Re-evaluate after Feature B ships and the owner's appetite for further reporting is assessed.

---

### Feature G — LAN Multi-Terminal / Cloud Sync

| Attribute | Detail |
|---|---|
| **Problem** | N/A — shop has exactly one counter, always |
| **Classification** | **Rejected** |

**Rationale:** Confirmed single-counter deployment. Multi-terminal sync fundamentally compromises the offline-first, single-source-of-truth SQLite architecture. Would require distributed conflict resolution, a central sync server, and a complete rethink of the licensing model. No business justification exists for this shop.

---

### Feature H — GST / Tax Invoices

| Attribute | Detail |
|---|---|
| **Problem** | N/A — shop is below GST threshold |
| **Classification** | **Rejected** |

**Rationale:** Confirmed below GST threshold. No invoicing requirement. Adding GST fields and invoice templates would add UI complexity (tax-inclusive vs exclusive toggling, GSTIN entry) and a new category of business data with zero benefit for this deployment.

---

### Feature I — Purchase Orders / Supplier Management

| Attribute | Detail |
|---|---|
| **Problem** | N/A — not on the shop's radar |
| **Classification** | **Rejected** |

**Rationale:** Not required. A Kirana shop restocks by telling the distributor what's low; they do not generate formal purchase orders. This is classic ERP feature creep.

---

### Feature J — Advanced Analytics / Profit Reports

| Attribute | Detail |
|---|---|
| **Problem** | Profit analysis requires purchase cost data, which is not tracked |
| **Classification** | **Deferred / Rejected** |

**Rationale:** Profit reporting requires both sale price and purchase cost. Purchase tracking is not required (confirmed). Without that input, profit analysis produces meaningless results. Reject until purchase costs are tracked.

---

## Recommended V2 Scope

The smallest coherent V2 release that solves real operational problems:

| Priority | Feature | Justification |
|---|---|---|
| **P0** | Windows Support | Primary hardware at the shop is Windows; V1 cannot deploy |
| **P1** | History Date-Range Filter | Daily/weekly owner reporting — confirmed #1 gap; trivial implementation |
| **P1** | Udhaar / Customer Credit | Real workflow; notebook is fragile; dedicated module is acceptable |

**Total V2 scope: 3 features.**

This is intentionally small. It solves the three real problems without adding ERP complexity to a Kirana checkout.

---

## Explicitly Rejected Features

| Feature | Reason |
|---|---|
| LAN Multi-Terminal | Confirmed single counter; compromises offline architecture |
| Cloud Sync | No identified need; adds attack surface and network dependency |
| GST / Tax Invoices | Shop is below GST threshold |
| Purchase Orders / Suppliers | Not on the shop's radar; ERP creep |
| Advanced Profit Analytics | Requires purchase cost data that is not tracked |
| Automatic Scheduled Backup | Manual backup is sufficient (confirmed) |
| Full Charting Dashboard | Date-range filter on History solves the stated problem |

---

## Licensing Impact of V2

### Windows Support (P0)
The licensing architecture changes significantly for Windows:
- The `SwiftHelperIdentityProvider` must not be used on Windows
- A new Windows native helper must use **Windows CNG `NCryptCreatePersistedKey`** (TPM-backed, non-exportable P-256 key) — equivalent security properties to macOS Secure Enclave
- The `IDENTITY_FAIL_CLOSED` principle applies equally on Windows: if the TPM/CNG key is unavailable, licensing must fail closed
- Server-side fingerprinting logic (`SHA-256(PEM)`) does not change — remains compatible
- The one-license-one-active-device model is unchanged

### Udhaar / Customers (P1)
No licensing impact. Fully local feature.

### History Filter (P1)
No licensing impact.

---

## Database Growth Estimates

| Feature | New Tables | Rows/Day (estimate) | Backup size impact |
|---|---|---|---|
| History Filter | None (index only) | 0 | Negligible |
| Udhaar/Customers | `customers`, `credit_transactions` | 1–5 for an active Kirana | < 1 KB/day |
| Windows | None | 0 | None |

SQLite remains the correct local source of truth for all V2 features. No architectural change is justified.

---

## Architecture Impact Summary

```
V2 Feature          | Schema? | IPC?  | New Provider? | UI?     | Licensing?
--------------------|---------|-------|---------------|---------|------------
Windows Support     |  None   |  None | YES — Windows |  None   | New identity layer
History Date Filter |  Index  |  Yes  | No            | Minor   | None
Udhaar/Customers    |  Yes    |  Yes  | No            | Medium  | None
```

---

## V2 Release Philosophy

Preserve V1's core principles exactly:

- **Zero Unnecessary Friction** — The Udhaar assignment at finalization must be skippable with a single keypress. History filters must not block the cashier view.
- **Offline-first** — All V2 features work without internet. Customer records, credit balances, and history filters are local.
- **Keyboard/barcode-first** — No V2 feature should require the mouse for the checkout workflow.
- **Fast checkout** — The P0 performance path (scan → bill → finalize) must remain unchanged.
- **Reliable persistence** — All new tables are included in the existing backup/restore system automatically.
- **Simple operator experience** — Customers module is a separate screen; it does not intrude on billing unless the cashier explicitly chooses to use it.

---

## Open Questions

1. **Windows identity helper implementation language:** C++ (with WinSDK) or Rust (with `windows-rs` crate)? Rust is more maintainable but adds a build toolchain dependency; C++ is more conventional for CNG.
2. **Udhaar UX detail:** Should bills finalized as Udhaar be visually distinguished in History? (Recommended: yes — a small badge indicating "Credit" on the bill row.)
3. **Windows packaging & distribution:** Should V2 ship a Windows `.exe` installer (NSIS) or a Microsoft Store MSIX? NSIS is simpler; MSIX requires a Microsoft developer account.
4. **Windows codesigning:** An EV certificate is required for Authenticode signing on Windows. Does the operator have or plan to obtain one?
