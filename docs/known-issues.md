# Known Issues

## Overview
This document tracks known issues and architectural limitations.

## Current Issues

### Scanner: Timing heuristic is a fallback, not a guarantee
The `maxTimePerCharMs` threshold (default 50ms) discriminates scanner from human input based on typing speed. Very fast typists or very slow scanners may produce incorrect results. Mitigation: configure a scanner prefix for deterministic detection. See [docs/hardware/03-detection-strategy.md](hardware/03-detection-strategy.md).

### Scanner: Physical hardware not yet validated
All scanner tests use simulated keyboard events via Playwright. Universal scanner compatibility cannot be claimed without testing against physical hardware. See [docs/hardware/11-hardware-test-results.md](hardware/11-hardware-test-results.md).

### Scanner: clearLeakedInput timing in React StrictMode
In development with React StrictMode, effects run twice. This could theoretically cause double-subscription to the BarcodeInputService. The singleton pattern prevents actual duplication, but the cleanup-and-reattach cycle adds minor overhead in dev mode only.

### Printing: Hardware testing deferred
Thermal printing was verified entirely with `FakePrinterAdapter`. Actual ESC/POS thermal printer behavior, line wrapping, char sets, and hardware failures must be verified in Stage 12.

### Printing: In-Memory Print Queue
Print jobs in V1 are orchestrated via an in-memory Queue in Main process. If app crashes while printing, the print job is lost (but bill remains). Cashier will need to manually invoke "reprint" feature (future task) to retry.
