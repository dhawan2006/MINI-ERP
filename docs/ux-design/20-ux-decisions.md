# UX Decisions & Non-Modal Design

## Decision Matrix
| Decision | Options | Recommendation | Reason | Trade-off |
| --- | --- | --- | --- | --- |
| Focus | Rely on Cashier vs Auto-Focus | Auto-Focus | Eliminates "I scanned but focus was lost" errors. | Slightly complex `useEffect` logic. |
| Print Feedback | Modal vs Instant Clear | Instant Clear | Enables continuous queue processing. | Cashier relies entirely on physical printer noise for confirmation. |

## Non-Modal Substitutions
| Situation | Traditional Modal | Recommended UX | Reason |
| --- | --- | --- | --- |
| Unknown Barcode | Dialog: "Item not found [OK]" | Red Toast + Error Buzz | Modals steal focus and block the queue. |
| Printer Offline | Dialog: "Printer error [Retry]" | Red Top-Banner + `F8` Retry | Allows next customer to be billed while the problem is sorted. |
