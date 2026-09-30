# 09. Print Failure

Handling printer failures safely is critical for a high-throughput retail environment.

## Behavior
If the printer fails:
1. The finalized bill remains safely stored in the database.
2. The print job state becomes `FAILED`.
3. The renderer displays a non-blocking error notification (Toast).
4. The cashier can immediately start billing the next customer without waiting.

The system does not force a blocking modal or crash the application on print failures.
