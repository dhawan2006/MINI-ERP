# Printing Architecture
- Renderer sends `printReceipt` IPC and forgets.
- Main process uses `electron-pos-printer` or direct ESC/POS adapter to queue print without blocking the event loop.