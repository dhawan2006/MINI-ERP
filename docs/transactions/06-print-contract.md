# 06. Print Contract

Printing is strictly decoupled from billing correctness.

## Core Invariant
> Printing is an output side effect of a finalized bill, not the operation that creates the bill.

If printing fails, the finalized bill still exists permanently. A `Finalized Bill + Print Failure` is a perfectly valid and recoverable system state.

## IPrinterAdapter
The printer infrastructure is abstracted behind `IPrinterAdapter`:
- `printReceipt(data: ReceiptData): Promise<boolean>`
- It knows nothing about SQLite, domain logic, or finalization. It solely receives canonical receipt data and interfaces with the physical hardware (or fake implementation).
