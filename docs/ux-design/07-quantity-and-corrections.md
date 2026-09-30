# Quantity Editing & Corrections

## Quantity Override Flow
1. Cashier scans a bulk item (e.g., Water). It appears at the top of the list with Qty: 1.
2. Cashier presses `F4`.
3. An inline quantity editor overlays the Qty column of the TOP item.
4. Cashier types `24` and presses `Enter`.
5. The line updates to Qty: 24. Total updates. Focus snaps back to Master Input.
6. *Cancel:* Pressing `Esc` during edit aborts the change.

## Item Removal
- **Action:** Cashier presses `Delete` or `Ctrl+Backspace`.
- **Result:** The TOP item in the list is instantly removed from the bill. Total updates. No confirmation dialog.

## Void Bill
- **Action:** Cashier presses `Esc` while the input is empty. A toast appears: "Press Esc again to void bill".
- **Action 2:** Cashier presses `Esc` again within 2 seconds.
- **Result:** Bill is completely erased from draft state. Screen resets.
