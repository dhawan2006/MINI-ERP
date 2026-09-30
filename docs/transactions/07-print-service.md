# 07. Print Service

The `PrintService` orchestrates the printing process.

## Responsibilities
- Receives a request to print a specific finalized bill.
- Fetches the finalized bill from the repository.
- Uses `ReceiptMapper` to generate canonical `ReceiptData`.
- Tracks print job state (QUEUED, PRINTING, COMPLETED, FAILED).
- Dispatches the job to the `IPrinterAdapter`.

## Asynchronous Execution
The print service executes asynchronously. It does not block the main process or the renderer.
