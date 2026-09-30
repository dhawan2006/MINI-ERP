# Architecture

## Status
CONFIRMED (Stage 0 Bootstrap)

## Overview
The architecture separates the React UI from system resources using an Electron Preload script and IPC. 

### Conceptual Boundary
React Renderer
↓
Preload / contextBridge
↓
Electron IPC
↓
Electron Main Process
↓
Application Services
↓
SQLite / File System / Printer / OS

### Fixed Technology Decisions
- React
- TypeScript
- Electron
- Vite
- SQLite (via `better-sqlite3`)
- secure Electron preload + IPC
- Vitest
- minimal custom CSS
