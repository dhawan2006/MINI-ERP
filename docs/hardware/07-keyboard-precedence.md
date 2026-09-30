# Keyboard Event Precedence

## Event Flow

```
Physical key press
        ↓
Window keydown (capture phase)
        ↓
BarcodeInputService.handleKeyDown()
        ↓
Decision: Is this part of a scanner sequence?
        ↓
┌──── YES (confirmed scan) ────┐     ┌──── NO (normal input) ────┐
│ preventDefault()              │     │ Let event propagate       │
│ stopPropagation()            │     │ Normal keyboard behavior  │
│ clearLeakedInput()           │     │ continues through DOM     │
│ emitScan(barcode)            │     │                           │
│ reset buffer                 │     │                           │
└──────────────────────────────┘     └───────────────────────────┘
```

## Precedence Rules

### 1. Scanner Prefix Mode (Highest Priority)

If a configured prefix is detected, all subsequent characters are captured until the suffix arrives. `preventDefault()` and `stopPropagation()` are called on every captured key to prevent any other handler from seeing them.

### 2. Timing-Heuristic Mode

During buffering, characters are **not** intercepted — they flow to the focused input normally. Only the suffix key (Enter) is intercepted if the buffer qualifies as a scan.

### 3. Application Keyboard Shortcuts

The `useKeyboardShortcuts` hook listens on `window` at the **bubble** phase (default). Since the scanner listens at the **capture** phase, scanner detection runs first. If a scanner suffix is consumed, it never reaches the shortcut handler.

### 4. React Component Handlers

Component-level `onKeyDown` handlers fire after both the scanner service and the shortcut handler. If the scanner consumed the event, components never see it.

## What the Scanner Suffix Does NOT Trigger

When a scan is detected, the Enter suffix is consumed. It does **not**:

- Submit the search form
- Select a search result
- Commit a quantity edit
- Trigger any keyboard shortcut
- Navigate to a different view
