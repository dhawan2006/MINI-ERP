# System Overview
The system separates React UI (Renderer) from the OS (Main Process) via a strict Preload IPC boundary. React handles state and UX. Main handles SQLite and Printers.