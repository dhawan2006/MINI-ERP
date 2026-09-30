# 13. Performance

The primary performance metric for the checkout process is the time from clicking "Finalize Bill" to the UI being ready for the next customer.

## Optimization
- Finalization is extremely fast because it uses a single atomic SQLite transaction and operates strictly in-memory before disk sync.
- Printing is entirely asynchronous and detached from the UI thread.
- The UI transitions instantly without waiting for the physical printer adapter.
