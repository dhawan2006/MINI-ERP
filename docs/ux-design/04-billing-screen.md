# Billing Screen Layout

## Layout Strategy: Compact Split-Pane (Bill-Left / Input-Right)
- **Why:** Cashiers read left-to-right. The running list of items is the historical truth, placed securely on the left (taking up 70% width). The active input, total, and actions are anchored on the right (30% width). This minimizes eye travel from the scanner (usually held right) to the screen.

## Screen Zones
### 1. Product Input Area (Right Top)
- Massive typography.
- Displays the current barcode being typed/scanned.

### 2. Current Bill Area (Left)
- Chronological list of scanned items.
- The most recent item is at the TOP (reverse chronological) so the cashier's eyes never have to track downward as the list grows.

### 3. Total Area (Right Middle)
- The largest text on the screen. High contrast.

### 4. Feedback Area (Header/Overlay)
- Inline toasts at the top. Never obscures the input field.
