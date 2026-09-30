# Keyboard Interaction & Focus Management

## Focus Architecture
- **Startup:** Master input is auto-focused immediately.
- **Background Clicks:** If the app window is active but focus is lost, a React `useEffect` listener on `document.body` reclaims focus to the master input within 10ms.
- **The Only Exception:** Focus leaves the master input *only* when the cashier presses a shortcut that opens a specific modal or edit field (e.g., `F4` to edit quantity). When that action completes or is cancelled, focus snaps back to the master input.

## Global Keyboard Map
- `F12` or `Ctrl+P`: Commit Bill & Print.
- `Enter` (Empty Search): Commit Bill (No Print).
- `F1` or `/`: Force focus to master input.
- `F4` or `*`: Edit quantity.
- `Delete` or `Ctrl+Backspace`: Remove selected item.
- `Esc`: Clear search / Cancel modal.
- `Esc` (Double-tap within 2s): Void entire bill.
- `F8`: Retry failed print.
- `F2`: Open History.
- `F3`: Open Products.

## Conflicts
- `F12` is often Chrome DevTools. In production Electron, we must intercept `F12` and prevent default OS behavior.
