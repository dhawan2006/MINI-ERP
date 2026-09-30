# Focus Behavior

## Design Principle

The cashier should never need to think about focus. Scanning works regardless of which UI element is focused.

## How It Works

The `BarcodeInputService` listens on the `window` object with `capture: true`. This means it intercepts keyboard events **before** they reach any focused element. The scanner detection operates independently of DOM focus.

## After a Successful Scan

1. If barcode characters leaked into a focused input, `clearLeakedInput()` strips them
2. The focused input is blurred (to commit any pending edits)
3. The React UI updates via Zustand state change
4. The search input receives focus via the `useFocusManager` hook (ready for next scan)

## Focus Recovery

The application does **not** use aggressive OS-level focus stealing. It does not:

- Call `BrowserWindow.focus()` or `BrowserWindow.moveTop()` repeatedly
- Steal focus from other applications
- Flash the taskbar or dock

Focus management stays within the application window.

## Tested Scenarios

| Scenario | Focus Before Scan | Focus After Scan | Behavior |
|----------|------------------|-----------------|----------|
| Search focused | Search input | Search input | Scan works, leaked chars cleaned |
| Bill row selected | Bill panel | Search input | Scan works |
| Quantity editor open | Quantity input | Search input | Editor commits, scan works |
| No input focused | Body/div | Search input | Scan works |
