# Rapid Scan Testing

## Test Results (E2E — Simulated Scanner)

All tests use Playwright Electron with keyboard events dispatched synchronously within `page.evaluate`, simulating instantaneous scanner input.

### Test B: 10 Scans (alternating 2 products)

- 5× barcode `12345` (Test Coke) + 5× barcode `67890` (Test Water)
- **Result**: Coke ×5, Water ×5 ✓
- **Duration**: ~3.2s (including IPC round-trips and page reloads)

### Test C: 5 Repeated Scans

- 5× barcode `12345` (Test Coke)
- **Result**: Coke ×5, single row ✓
- **Duration**: ~1.7s

### Test H: Rapid Mixed Sequence (with invalid)

- Sequence: `12345, 67890, 12345, UNKNOWN123, 12345, 67890`
- **Result**: Coke ×3, Water ×2, unknown barcode silently ignored ✓
- **Duration**: ~1.9s

## Observations

- No dropped scans in any test
- No duplicated rows
- No concatenated barcode corruption
- Correct quantity merging (domain-owned)
- Correct totals
- No UI freeze

## Physical Hardware Testing

> **Status**: Not yet tested with physical hardware.

When physical scanner hardware is available, the following must be recorded:

| Field | Value |
|-------|-------|
| Scanner model | TBD |
| Operating system | macOS |
| Barcode configuration | TBD |
| Suffix | TBD (expected: Enter) |
| Prefix | TBD (expected: none) |
| Keyboard layout | TBD |
| Tested scan sequences | TBD |
| Observed timing (avg ms/char) | TBD |
| Pass/fail | TBD |

## Performance Budget

Target: < 200ms from scan completion to UI update.

Breakdown:
- Barcode detection: ~0ms (synchronous in-process)
- IPC: ~1-5ms
- SQLite (lookup + persist): ~1-5ms
- React re-render: ~5-20ms
- **Total estimated**: ~10-30ms

Actual measurements with physical hardware are pending.
