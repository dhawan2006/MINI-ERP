# Hardware Test Results

## Status

Physical hardware testing is **pending**. This document will be updated when a USB keyboard-wedge scanner is available.

## Template

When testing, record the following for each scanner:

### Scanner Information

| Field | Value |
|-------|-------|
| Scanner Model | |
| Manufacturer | |
| Interface | USB HID / USB Keyboard Wedge |
| Barcode Types Supported | 1D / 2D / Both |

### Configuration

| Field | Value |
|-------|-------|
| Prefix | None / Character |
| Suffix | Enter / Tab / Other |
| Keyboard Layout | US / UK / Other |
| Operating System | macOS / Windows / Linux |
| Electron Version | |

### Test Results

| Test | Barcode | Expected | Actual | Pass/Fail |
|------|---------|----------|--------|-----------|
| Single scan | | Product added | | |
| Repeated scan (×5) | | Qty merged to 5 | | |
| Unknown barcode | | Error shown, bill unchanged | | |
| Rapid sequence (10) | | All items correct | | |
| Scan during search | | Product added | | |
| Scan during qty edit | | Clean commit + product added | | |

### Timing Observations

| Metric | Value |
|--------|-------|
| Avg ms per character | |
| Min ms per character | |
| Max ms per character | |
| Scan-to-UI latency | |

### Notes

(Free-form observations about the scanner's behavior)

## Disclaimer

Universal scanner compatibility cannot be claimed based solely on simulated keyboard events. Each scanner model may have unique timing, prefix/suffix, and encoding characteristics that require individual validation.
