# 12. Restart Recovery

The system can safely recover from application crashes at any point.

## Scenarios
- **Crash during active draft**: The draft is recovered from the `drafts` table on restart.
- **Crash before print**: The finalized bill is safely persisted and can be viewed or reprinted manually from the bill history (future feature).
- **Crash during print**: The bill remains finalized. The print job queue (which is in-memory) is lost, but the user can easily reprint the bill if needed.
