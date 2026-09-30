# Detection Strategy

## Priority Order

### Priority 1: Configured Prefix/Suffix (Deterministic)

If the scanner is configured with a known prefix character (e.g., `]`, F-key), the service enters **active scanning mode** immediately upon receiving the prefix. All subsequent characters are buffered until the suffix (Enter) is received. This mode is fully deterministic — no timing heuristics needed.

### Priority 2–3: Reserved

Reserved for future scanner configuration characteristics (e.g., USB HID device identification).

### Priority 4: Timing Heuristic (Fallback)

When no prefix is configured, the service uses timing analysis as a fallback:

- Characters are buffered as they arrive
- When Enter is received, the average time per character is calculated
- If `avgTimePerChar <= maxTimePerCharMs` AND `buffer.length >= minLength`, the input is classified as a scan

**Default configuration:**

| Parameter | Default | Description |
|-----------|---------|-------------|
| `suffix` | `Enter` | Character that terminates a scan |
| `minLength` | `3` | Minimum barcode length |
| `maxTimePerCharMs` | `50` | Maximum average ms per character |
| `maxBufferLength` | `50` | Buffer overflow protection |

## Why Timing Is a Fallback, Not Primary

Timing heuristics are inherently probabilistic. A fast typist or a slow scanner could produce false positives or false negatives. The timing threshold is **configurable** and should be validated against actual scanner hardware before deployment.

The `50ms` default is a conservative starting point. Real scanners typically produce characters in < 5ms each.

## Buffer Management

- Buffer resets when: average time exceeds threshold, a non-printable key is pressed, a scan is emitted, or buffer exceeds `maxBufferLength`
- Buffer never grows indefinitely
- Buffer is character-only (no modifier keys, no special keys except suffix)
