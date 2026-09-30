# Cashier Task Benchmarks

## Target Metrics
1. **Single-Item Transaction**
   - Goal: 2 actions (1 Scan, 1 Keystroke `F12`).
   - Time: <1.5s.
2. **10-Item Transaction (Barcode)**
   - Goal: 11 actions (10 Scans, 1 Keystroke `F12`).
   - Focus Changes: 0.
3. **Keyboard Search Transaction**
   - Goal: Type + `Down` + `Enter`.
   - Focus Changes: 0. (Dropdown appears inline).
4. **Quantity Change Transaction**
   - Goal: Scan + `F4` + Num + `Enter`.
   - Focus Changes: 2 (To Qty field, back to Master Input).

## Interaction Limits
- Mouse Clicks for Checkout: 0.
- Confirmation Modals for Delete: 0.
