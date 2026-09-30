# Input Pipeline

## Full Data Flow

```
USB Keyboard-Wedge Scanner
        ↓
Window keydown event (capture phase)
        ↓
BarcodeInputService (buffer + detect)
        ↓
onScan(barcode) callback
        ↓
useScannerDetector hook
        ↓
Zustand store.scanBarcode(barcode)
        ↓
window.api.billing.addByBarcode(barcode) [IPC]
        ↓
Main Process: BillingService.addProductByBarcode(barcode)
        ↓
ProductRepository.findByBarcode(barcode) [SQLite]
        ↓
Domain: ActiveBill.addProduct(product)
        ↓
DraftRepository.saveDraft() [SQLite]
        ↓
ActiveBillDTO returned via IPC
        ↓
Zustand state update
        ↓
React re-render
```

## Key Boundaries

| Layer | Responsibility | Knows About |
|-------|---------------|-------------|
| BarcodeInputService | Capture, buffer, detect, normalize | Keyboard events only |
| useScannerDetector | Bridge service → store | Service + Zustand |
| Zustand billingStore | Route scan to IPC | IPC API |
| Main Process Handler | Orchestrate lookup + domain | BillingService |
| BillingService | Business logic | Domain + Repos |
| ProductRepository | Data access | SQLite |
| ActiveBill (Domain) | Billing rules | Nothing external |

## Latency Budget

The pipeline is designed for sub-200ms end-to-end latency:

- Scanner keystroke capture: ~0ms (synchronous)
- Barcode detection: ~0ms (synchronous)
- IPC round-trip: ~1-5ms
- SQLite lookup + persist: ~1-5ms
- React re-render: ~5-20ms
