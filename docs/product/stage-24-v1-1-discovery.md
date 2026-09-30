# Stage 24 — V1.1 Discovery & Planning

## Current V1 Status
Mini POS V1 is structurally complete and validated. It successfully executes high-speed barcode scanning, fixed-price billing, quantity aggregation, bill finalization, bill history retrieval, draft recovery, PDF export, and basic offline persistence.
However, it remains unreleased to the public due to pending physical hardware QA and platform signing requirements.

## Remaining V1 Release Blockers
- **Hardware**: Physical USB wedge scanner debouncing and physical ESC/POS thermal printer encoding/wrapping remain completely unverified.
- **Distribution**: The macOS artifact remains unsigned and unnotarized (fails Gatekeeper).

## Real-World Feedback Sources
- Automated CI/CD QA runs.
- Developer / Testing Simulation (e.g., recent user query indicating confusion over product management).
- *Pending*: Real retail cashiers in a physical lab environment.

## Observed Problems
- **Product Management**: The most glaring operational deficiency discovered is the complete lack of a Product Management UI. The user correctly identified that there is currently no way to view the catalog of available products or add new products to the system without executing raw SQLite SQL queries against the local database.

## Reliability Findings
- The `better-sqlite3` database engine successfully handles sequential atomic transactions.
- A transient timeout in automated Playwright E2E testing demonstrated that heavy concurrent I/O (running multiple parallel test workers against the same local `.db` file) can cause lock timeouts. This is an artifact of the test runner, but highlights that the system is strictly single-user desktop-bound.

## Hardware Findings
- *Pending Real Evidence.*

## Platform Findings
- macOS ARM64 is the strongest validated target.
- Native ABI rebuilds for `better-sqlite3` create high packaging friction on Windows without a pristine build environment. Windows support should not be prioritized until actual operator demand exists.

## Usability Findings
- **Missing Catalog**: Operators cannot "see what products are available." The search bar works if the user knows the name, but there is no fallback index/list UI.
- **Missing Setup Workflow**: New operators cannot add their first product.

## Performance Findings
- The application is incredibly fast and memory-efficient due to strict offline constraints and the lack of network round-trips.

## Technical Debt
- Unsigned macOS distribution artifacts.
- Hard dependency on a `prebuild-check.js` path-space safeguard for native module compilation.
- Backup strategy is strictly manual file copying.

## V1.1 Candidate Improvements
### 1. Product Management UI (P0)
- **Problem**: Users cannot add, edit, or view products.
- **Evidence**: Direct user feedback ("how can i came to know products name to search here and what are the products available or isn't there any add product feature added right now?").
- **Proposed Improvement**: Add a dedicated "Products" screen accessible from the main navigation to list the catalog and provide a simple "Add Product" (Name, Barcode, Price) modal.

### 2. Automated DB Backup/Export Trigger (P2)
- **Problem**: Manual OS-level file copying of `billing.db` is fragile for non-technical retail users.
- **Proposed Improvement**: Add a "Backup Database" button in Settings that triggers an OS save dialog to export a safe copy of the database.

## Rejected / Deferred Ideas
- **Inventory Tracking**: Rejected. Tracking stock quantities introduces complex reconciliation workflows.
- **GST / Tax**: Rejected. V1 strategy relies strictly on fixed inclusive prices.
- **Cloud Sync**: Rejected. Breaks the offline-first zero-latency guarantee.
- **Payment Processing**: Rejected. Introduces massive security/compliance debt.

## Architecture Constraints
- V1.1 must continue to strictly isolate business logic in the Main process (Application Services/Domain/Repositories).
- The Renderer (React) must remain a pure presentation layer communicating solely via strongly-typed IPC contracts.
- No direct filesystem access from the Renderer.

## Priority Ranking
1. **[P0] Product Management UI**: Operators must be able to add and list products.
2. **[P2] Safe Backup Export**: Reduce manual filesystem backup friction.
3. **[P3] Universal Search Index**: Let the search bar act as a visual dropdown of the catalog when empty.

## Recommended V1.1 Scope
- Wait for **Hardware QA** to finish blocking V1.
- Once V1 is unblocked, the immediate V1.1 focus MUST be building the **Product Management UI** (Listing, Adding, and Editing basic products).

## Explicitly Deferred Scope
- Any form of inventory math, supplier management, or complex ERP features.

## Final Recommendation
**V1.1 DISCOVERY ONLY**

*(We have identified a critical missing capability—Product Management—based on real testing feedback. However, because V1 Release Blockers [Hardware/Signing] remain unresolved and we have zero actual cashier throughput data, we must not jump into V1.1 implementation yet. We remain in discovery.)*
