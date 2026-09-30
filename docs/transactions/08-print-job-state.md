# 08. Print Job State

Print jobs transition through a simple state machine.

## States
- **QUEUED**: The print job has been created and is waiting to be processed.
- **PRINTING**: The adapter is currently attempting to print the receipt.
- **COMPLETED**: The adapter successfully printed the receipt.
- **FAILED**: The adapter failed to print (e.g., printer offline, paper out).

## UI Reflection
Zustand tracks the active print job ID and periodically polls the Main process for status updates, displaying non-blocking Toast notifications to the user.
