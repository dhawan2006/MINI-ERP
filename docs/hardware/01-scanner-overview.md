# Scanner Overview

## Purpose

The Mini Billing System integrates USB keyboard-wedge barcode scanners to enable rapid product entry during cashier billing workflows.

## Hardware Scope (V1)

### Supported

- USB keyboard-wedge barcode scanners
- Keyboard-emulating scanners (any brand)
- Scanners configurable to append Enter as suffix
- Optionally configurable prefix/suffix strings

### Not Supported (V1)

- Serial/COM port scanners
- Camera-based scanning
- Proprietary scanner SDKs
- Bluetooth-specific protocols
- Vendor-specific native integrations

## How It Works

USB keyboard-wedge scanners emulate a keyboard. When a barcode is scanned, the scanner "types" the barcode characters rapidly into the active application, followed by a configurable suffix (typically Enter).

The application captures these keyboard events at the global `window` level and distinguishes them from human typing using:

1. **Configured prefix/suffix** (deterministic, Priority 1)
2. **Timing heuristics** (fallback, Priority 4) — configurable threshold

## Data Integrity

- Barcode values are treated as **strings**, never numbers
- **Leading zeros are preserved** (e.g., `00123456` stays `00123456`)
- Scanner input is treated as **untrusted input** — never interpreted as code, SQL, or commands
- All database operations use parameterized queries

## Currency

V1 currency is INR. All monetary values are stored as integer paise (minor currency units).
