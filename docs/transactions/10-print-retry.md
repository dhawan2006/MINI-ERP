# 10. Print Retry

When a print job fails, the cashier can retry the print operation.

## Mechanism
- Retry uses the exact same `billId`.
- It does NOT create a new bill or duplicate the transaction.
- It simply re-fetches the historical snapshot from the database, regenerates the `ReceiptData`, and attempts a new print job.
