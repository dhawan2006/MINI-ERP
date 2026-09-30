# Performance Architecture
- IPC calls are fire-and-forget for non-blocking actions (like Print).
- React lists are virtualized only if exceeding 100 items (rare for bills).