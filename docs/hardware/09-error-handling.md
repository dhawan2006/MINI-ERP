# Error Handling

## Error Categories

### Unknown Barcode

```
barcode → ProductRepository.findByBarcode() → null
        → ProductNotFoundError thrown
        → BillingService catches, IPC returns { success: false, error: { code: 'PRODUCT_NOT_FOUND', message: '...' } }
        → Zustand sets scanError (transient, auto-clears after 3s)
        → Bill remains unchanged
        → Next scan immediately possible
```

### Inactive Product

```
barcode → ProductRepository.findByBarcode() → returns only active products (is_active = 1)
        → null for inactive → same as unknown barcode flow
        → Bill unchanged
        → Next scan immediately possible
```

### Database Failure

```
scanner → mutation attempt → SQLite error
        → IPC returns { success: false, error: { code: 'INTERNAL_ERROR', message: '...' } }
        → Zustand sets error state
        → No successful billing reported
        → Recoverable — next scan can retry
```

## Error Display

- **scanError**: Displayed as a transient notification. Auto-clears after 3 seconds. Does not use a modal dialog.
- **error**: Displayed as an inline error in the bill panel. Persists until the next successful operation clears it.
- **No blocking modals**: The cashier is never blocked from scanning.

## Recovery Guarantees

| Failure | Bill State | Scanner State | Next Action |
|---------|-----------|---------------|-------------|
| Unknown barcode | Unchanged | Buffer reset | Scan again |
| Inactive product | Unchanged | Buffer reset | Scan again |
| DB write failure | Unchanged | Buffer reset | Scan again |
| IPC timeout | Unchanged | Buffer reset | Scan again |
| Malformed barcode (< minLength) | Unchanged | Buffer reset | Scan again |

## Principle

A failed scan must never leave the billing workflow inoperable. The cashier should always be able to scan the next item without manual recovery.
