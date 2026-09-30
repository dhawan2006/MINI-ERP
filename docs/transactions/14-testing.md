# 14. Testing Strategy

The finalization and printing implementation is heavily tested across three layers.

## Unit Tests
- Tested `ReceiptMapper` serialization.
- Tested `PrintService` state machine.

## Integration Tests
- Validated atomic persistence with `BillRepository`.
- Validated error injection during finalization (verifying rollbacks).
- Validated monotonic bill numbering.

## End-to-End Tests
- **Scenario A**: Verified happy-path finalization and immediate transition to the next bill.
- **Scenario C**: Verified printer failure simulation, ensuring the bill remains saved and the UI remains unblocked.
