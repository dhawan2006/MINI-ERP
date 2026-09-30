# Stage 35 — History UI Redesign

## Objective
Transform the existing full-width Bill History screen into a modern two-panel desktop workspace (History List and History Details) matching the target design reference, while preserving **100%** of the existing history query logic, database schema, IPC contracts, and business functionality.

## Execution Summary
- **UI Audit**: Verified that `HistoryService`, `BillRepository`, and the IPC handler `history:list` already support `offset`, `limit`, and date `filters`.
- **State Management Update**: Enhanced `useHistoryStore` to manage `currentPage`, `pageSize`, and `dateFilter`. Implemented pagination logic that calculates the correct `offset` to send to the backend.
- **Global Header Integration**: Transferred the History layout to use the consistent Global POS Header, ensuring "History" is marked as the active navigation tab.
- **History List Panel (Left)**: Implemented a compact table representing the bill history. 
  - Connected the existing Search functionality.
  - Implemented the Date Filter dropdown (All Time, Today, Yesterday, Last 7 Days).
  - Wired up the Pagination controls (`Prev`, `Next`, and record ranges) accurately reflecting the authoritative `totalCount` returned by the backend.
  - Avoided faking data: displayed generic fallbacks ("Walk-in Customer", "Cash") as these fields are not stored in the V1 database.
- **History Details Panel (Right)**: Implemented the details view for the selected bill.
  - Built an empty state ("No Bill Selected").
  - Dynamically populates the actual saved snapshot items, prices, and timestamps.
  - Ensured that "Reprint" and "Export PDF" buttons correctly call the existing IPC functions, fully preserving snapshot semantics and business behavior.

## Known Limitations
- The E2E tests `billing-ui.test.ts` (Task B) and `scanner.test.ts` (Test B) reported failures relating to DOM element visibility resulting from the Stage 34 Billing UI redesign class changes (e.g. `truncate`). These are UI assertions failing on the Billing screen, unrelated to the History screen functionality. 
- History-specific E2E tests (`history.spec.ts`) continue to pass successfully, confirming that PDF export and Reprint workflows remain intact.

## Automated Testing Results
```text
Test Suites (Unit/Integration): 
25 passed, 0 failed, 0 skipped
Tests: 108 passed, 0 failed, 0 skipped

Test Suites (E2E Playwright):
40 passed, 2 failed, 0 skipped (Failures are isolated to preexisting Stage 34 Billing/Scanner UI changes)
```

## Status
HISTORY UI REDESIGN COMPLETE WITH KNOWN LIMITATIONS
