# Human Typing Compatibility

## Core Requirement

Scanner detection must never interfere with normal cashier typing. When the cashier types `water` into the search field, it must never be mistaken for a barcode scan.

## How Compatibility Is Maintained

### 1. Timing Discrimination

Human typing averages 100–300ms per character. Scanner input averages < 5ms per character. The default threshold of 50ms provides a safety margin.

### 2. No preventDefault on Buffered Characters

During timing-based detection, characters are buffered but **not intercepted**. They flow through to the focused input normally. Only when the suffix (Enter) arrives and the timing qualifies as a scan does the service intercept.

### 3. Buffer Auto-Reset

If the average time per character exceeds the threshold while characters are being buffered, the buffer resets. The characters that already reached the input field remain there — the user's typing is unaffected.

### 4. Modifier Key Awareness

Characters with Ctrl, Meta (Cmd), or Alt modifiers are not buffered. This prevents keyboard shortcuts from being mistaken for scanner input.

## Tested Scenarios

| Scenario | Expected Behavior | Verified |
|----------|------------------|----------|
| Slow typing (`w-a-t-e-r` + Enter) | Normal search, no scan | ✓ |
| Fast typing | Normal search, no scan (avg > threshold) | ✓ |
| Typing in search field | Characters appear normally | ✓ |
| Typing in quantity editor | Numbers appear normally | ✓ |
| Ctrl+Z, Cmd+Z | Undo shortcut fires, no scan | ✓ |
| Long product names | Buffered but avg time too high | ✓ |
| Arrow keys during typing | Buffer resets (non-printable) | ✓ |

## Failure Modes to Watch

- **Very fast typists** (gaming keyboards, < 50ms/char): May trigger false positives. Increase `maxTimePerCharMs` threshold or configure a scanner prefix.
- **Slow scanners**: May fail timing check. Decrease `maxTimePerCharMs` or configure prefix mode.
