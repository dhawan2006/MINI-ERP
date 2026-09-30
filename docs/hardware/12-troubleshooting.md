# Troubleshooting

## Scanner Not Detected

### Symptom
Scanning a barcode does not add a product. Characters appear in the search field instead.

### Diagnosis
1. Open DevTools (Ctrl+Shift+I)
2. Check console for "Scanner detection:" logs
3. If no logs appear, the BarcodeInputService may not be attached

### Solutions
- **Timing too strict**: Increase `maxTimePerCharMs` (default: 50). Some scanners are slower.
- **No Enter suffix**: Verify the scanner is configured to send Enter after the barcode. Check scanner manual.
- **Scanner sends Tab instead of Enter**: Set `suffix: 'Tab'` in the config.
- **Scanner has a prefix**: Set `prefix` in the config to match the scanner's configured prefix character.

## False Positive: Human Typing Triggers Scan

### Symptom
Typing quickly triggers a barcode scan action.

### Solutions
- **Decrease `maxTimePerCharMs`**: Tighten the threshold (e.g., from 50 to 30).
- **Configure scanner prefix**: This eliminates timing heuristics entirely.
- **Slower typing**: This is rarely practical — prefer adjusting the threshold.

## Barcode Characters Appear in Search Field

### Symptom
After a scan, the barcode characters are visible in the search input.

### Diagnosis
In timing-heuristic mode, barcode characters flow to the focused input before the scanner is confirmed. `clearLeakedInput()` should strip them.

### Solutions
- Check that `clearLeakedInput()` runs after scan detection
- Verify React's controlled input is syncing correctly
- Check for React StrictMode double-renders that might interfere

## Quantity Gets Corrupted During Scan

### Symptom
The quantity editor shows the barcode digits appended to the quantity.

### Solutions
- The `clearLeakedInput()` + `blur()` pattern should prevent this
- If the quantity editor uses an uncontrolled input, consider switching to controlled
- Verify `commitEdit` (onBlur handler) reads the value after `clearLeakedInput` has run

## Scanner Works Once, Then Stops

### Symptom
First scan works, subsequent scans are ignored.

### Diagnosis
Possible duplicate subscriptions or failed buffer resets.

### Solutions
- Check that `BarcodeInputService` is a singleton — `getInstance()` should return the same instance
- Check that the `useEffect` cleanup in `useScannerDetector` properly calls `unsubscribe()` and `detach()`
- Verify the buffer resets after each scan (check `this.reset()` is called)

## No Product Found (Valid Barcode)

### Symptom
Scan shows "Product not found" error even though the barcode is correct.

### Solutions
- Verify the product exists in the database with `is_active = 1`
- Verify the barcode column matches exactly (case-sensitive, whitespace-sensitive)
- Check for leading/trailing whitespace in the database barcode field
- Remember: barcodes are strings, not numbers. `00123` ≠ `123`
