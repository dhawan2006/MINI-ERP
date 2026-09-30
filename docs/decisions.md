# Decisions Log

## Architecture
- **Framework**: React, Electron, Vite, TypeScript.
- **Styling**: Minimal custom CSS (avoiding large libraries initially for speed and visual calmness).
- **Database**: SQLite (via `better-sqlite3`).
- **Communication**: Strict IPC with `contextBridge`. No direct Node access from the Renderer.

## Stage 10: Barcode Scanner

- **Scanner type**: USB keyboard-wedge only (V1). No serial, camera, or Bluetooth.
- **Detection priority**: Configured prefix/suffix (deterministic) > Timing heuristic (fallback).
- **Timing threshold**: `maxTimePerCharMs = 50` (configurable, not a product guarantee).
- **Event capture**: `window.addEventListener('keydown', handler, { capture: true })` — intercepts before React.
- **Barcode values**: Strings only. Leading zeros preserved. Never converted to numbers.
- **No native dependencies**: No scanner SDKs, USB HID libraries, or hardware-specific code.
- **No software beep**: Scanner's own beep is sufficient for V1 feedback.
- **Buffer protection**: Max 50 characters, auto-reset on overflow or timeout.
- **Leaked input cleanup**: Uses React native value setter pattern for controlled inputs.

## Stage 11: Finalization & Printing
- **Atomic Persistence**: Bill finalization uses a single SQLite transaction encompassing bill header, items, and draft deletion to prevent partial state.
- **Renderer Independence**: Renderer is strictly UI. Main process orchestrates finalization and validates draft contents.
- **Print Decoupling**: Printer failures do not rollback or alter finalized bills. Print job orchestrator is asynchronous.
- **Bill Numbering**: Assigned monotonically right before SQLite insertion, guaranteeing gapless continuous numbering without using sequential PKs across restarts (V1 limits).
- **Restart Recovery**: Active Drafts persist and restore on boot; un-printed Finalized Bills are safely kept in `bills` and `bill_items` schemas.

## Next Stages
All product-specific decisions are deferred to Stage 1 - Product Discovery.
