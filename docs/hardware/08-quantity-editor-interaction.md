# Quantity Editor Interaction

## The Problem

When the cashier is editing a quantity (e.g., typing "10" into the quantity input), a scanner event fires. The scanner characters could leak into the quantity field, corrupting the value (e.g., "10" becomes "1067890").

## The Policy

```
Scanner detected while quantity editor is active
        ↓
1. clearLeakedInput() strips scanner chars from the input
        ↓
2. input.blur() fires
        ↓
3. BillRow.commitEdit() runs (onBlur handler)
        ↓
4. Commits the CLEAN quantity value (before scanner chars)
        ↓
5. Scan is processed normally
        ↓
6. Bill state is deterministic
```

## Implementation Details

### clearLeakedInput()

When a scan is detected via timing heuristic, some barcode characters may have already typed into the focused input. `clearLeakedInput()`:

1. Checks if `document.activeElement` is an INPUT or TEXTAREA
2. If the input's value ends with the scanned barcode string, strips those characters
3. Uses React's native value setter to properly update controlled inputs
4. Dispatches an `input` event to sync React state
5. Calls `input.blur()` to commit the edit

### BillRow.commitEdit()

The quantity editor's `onBlur` handler (`commitEdit`) reads the current input value, parses it as an integer, and calls `setQuantity()` if changed. Since `clearLeakedInput()` already restored the clean value, the committed quantity is correct.

## Tested Behavior

| Initial Qty | User Types | Scanner Fires | Final Qty | New Product Added |
|-------------|-----------|---------------|-----------|-------------------|
| 1 | "10" | 67890 (Water) | 10 | ✓ Water added |
| 1 | "5" | 12345 (Coke) | 5 | ✓ Coke qty increased |
| 1 | (no change) | 67890 | 1 | ✓ Water added |

## Edge Cases

- **Scanner chars don't match input suffix**: `clearLeakedInput` only strips if the input value ends with the exact barcode string. If characters didn't leak (e.g., input wasn't focused), nothing is stripped.
- **Empty quantity after strip**: If stripping leaves an empty or invalid value, `commitEdit` falls back to the original quantity (no change).
