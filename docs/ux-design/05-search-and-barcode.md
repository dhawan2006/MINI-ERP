# Search and Barcode UX

## Barcode Scanning Experience
- **Successful Scan:** Soft high-pitch "Ding". The item instantly appears at the top of the Bill Area. The input field instantly clears. Focus remains in the input field. Time to next scan: <10ms.
- **Repeated Scan:** Same as above. A new chronological line item is added.
- **Unknown Barcode:** Loud, harsh "Buzz". Input field turns red momentarily, text remains so cashier can see what was scanned. A red toast says "Unknown Barcode: X". Cashier hits `Esc` to clear it and continue.
- **Invalid Input:** Ignored.

## Product Search Experience
- **Activation:** The cashier types letters instead of numbers into the master input.
- **Matching:** Strict prefix matching (e.g., "Mil" matches "Milk", not "Buttermilk").
- **Results:** A dropdown panel appears immediately under the input.
- **Selection:** Use Up/Down arrows. Press `Enter` to add to bill. Dropdown vanishes, focus stays in input.
- **No Results:** Empty state in dropdown: "No products match [text]".
