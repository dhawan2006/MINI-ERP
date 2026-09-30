# Product Requirements

## Status
CONFIRMED (Stage 1)

## Product North Star
**Mission:** Enable a retail cashier to create and print a bill faster than a traditional mechanical cash register, with zero network dependencies.
**Governing Principle:** "Zero Unnecessary Friction." Every click, keypress, confirmation dialog, or visual distraction that does not directly contribute to printing the current receipt is a defect.

## Core Workflows
- **Line Item Addition:** Chronological Appending. Every physical scan or search selection creates a new physical line on the screen. Identical products do NOT automatically merge.
- **Quantity Override:** Modifies the most recently added line item.
- **Finalization:** Separated from printing. `Enter` finalizes the bill (saves to DB, readies next bill). `F12` finalizes AND prints.
- **Empty Bills:** Ignored. Finalization or print commands on 0-item bills do nothing and emit an error buzz.
- **Print Failure:** Non-blocking. A failed print clears the screen for the next customer but displays a persistent banner allowing the failed print to be retried via `F8`.
- **Application Audio:** The system must emit its own success beep and error buzz to decouple feedback from generic barcode hardware sounds.

## Resilience
- **Crash Recovery:** Uses SQLite WAL mode. On restart, any unfinished active draft triggers a blocking prompt: "Recover unfinished bill from [Time]? (Enter to Restore, Esc to Discard)".
- **Network:** 100% offline core. External sharing fails gracefully without blocking the UI.
