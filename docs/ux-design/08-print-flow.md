# Print Flow & Empty Bill Behavior

## Print Execution Flow
1. **Trigger:** `F12` is pressed.
2. **Finalization:** The current bill array is serialized and saved to the SQLite `bills` table. The `active_draft` is cleared.
3. **Dispatch:** An IPC call `window.api.printReceipt(billId)` is sent.
4. **Instant Reset:** The UI does NOT wait for the IPC call to resolve. It instantly resets the bill to empty. Customer 2 can begin scanning immediately.

## Print Failure
- If the IPC call returns an error (printer offline/out of paper), a red toast banner drops down from the top: "Print Failed: Bill #123. Press F8 to Retry."
- This banner persists until `F8` is pressed or it is manually dismissed via an 'x' button. It does not block the master input.

## Empty Bill Behavior
- **Triggering Print on Empty:** If the bill has 0 items and `F12` is pressed.
- **Response:** System emits an Error Buzz. Nothing happens. No database entry is created. No print command is dispatched.
