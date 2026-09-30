# Barcode Architecture

## Overview

The barcode scanner subsystem integrates USB keyboard-wedge scanners into the Mini Billing System without requiring native hardware drivers or vendor-specific SDKs.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    RENDERER PROCESS                         │
│                                                             │
│  ┌──────────────────────────────────┐                       │
│  │     BarcodeInputService          │                       │
│  │  ┌────────────┐                  │                       │
│  │  │ Key Buffer │ → Detect → Emit │                       │
│  │  └────────────┘                  │                       │
│  └──────────┬───────────────────────┘                       │
│             │ onScan(barcode)                                │
│  ┌──────────▼───────────────────────┐                       │
│  │     useScannerDetector hook      │                       │
│  └──────────┬───────────────────────┘                       │
│             │                                                │
│  ┌──────────▼───────────────────────┐                       │
│  │     Zustand billingStore         │                       │
│  │     scanBarcode(barcode)         │                       │
│  └──────────┬───────────────────────┘                       │
│             │ IPC                                            │
├─────────────┼───────────────────────────────────────────────┤
│             │          MAIN PROCESS                         │
│  ┌──────────▼───────────────────────┐                       │
│  │   billing:addByBarcode handler   │                       │
│  └──────────┬───────────────────────┘                       │
│  ┌──────────▼───────────────────────┐                       │
│  │   BillingService                 │                       │
│  │   addProductByBarcode(barcode)   │                       │
│  └──────────┬───────────────────────┘                       │
│  ┌──────────▼───────────────────────┐                       │
│  │   ProductRepository             │                       │
│  │   findByBarcode(barcode) → SQLite│                       │
│  └──────────────────────────────────┘                       │
└─────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

### BarcodeInputService (Presentation Layer)

- Captures `keydown` events on `window` (capture phase)
- Buffers characters and detects scanner patterns
- Normalizes barcode output (trim whitespace only)
- Emits `onScan(barcode)` to subscribers
- Does NOT know about products, billing, SQLite, or IPC

### useScannerDetector (Presentation Hook)

- Bridges BarcodeInputService → Zustand store
- Subscribes to scan events, calls `scanBarcode(barcode)`
- Manages lifecycle (attach/detach) via React `useEffect`

### billingStore.scanBarcode (Application State)

- Sends barcode to main process via `window.api.billing.addByBarcode(barcode)`
- Updates UI state with response
- Handles errors via `scanError` (transient, auto-clears)

### billing:addByBarcode IPC Handler (Main Process)

- Calls `BillingService.addProductByBarcode(barcode)`
- Returns `IpcResponse<ActiveBillDTO>`
- Translates domain errors to IPC error format

### BillingService.addProductByBarcode (Application Layer)

- Finds product by barcode via `ProductRepository`
- Throws `ProductNotFoundError` if not found
- Delegates to `ActiveBill.addProduct(product)` (domain)
- Persists draft state

## Security

- Scanner input is untrusted data
- All database queries use parameterized SQL
- Barcode values are never interpreted as code, SQL, URLs, or commands
- Context isolation is enforced (renderer has no Node.js access)

## Configuration

See [04-prefix-suffix.md](../hardware/04-prefix-suffix.md) for scanner configuration options.