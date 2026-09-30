# Draft Persistence
- On every state change, Zustand throttles a background IPC `saveDraft` call (every 500ms). Crash recovery reads this draft on boot.