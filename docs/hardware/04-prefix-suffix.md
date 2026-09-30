# Prefix / Suffix Configuration

## Default V1 Configuration

```
Prefix: none (timing heuristic mode)
Suffix: Enter
```

## How to Configure a Scanner Prefix

If your scanner supports configurable prefix characters, you can pass configuration to the `BarcodeInputService`:

```typescript
// In useScannerDetector or wherever the service is initialized
useScannerDetector({
  prefix: ']',        // Scanner sends ']' before barcode
  suffix: 'Enter',    // Scanner sends Enter after barcode
  minLength: 3,
  maxTimePerCharMs: 50
});
```

When a prefix is configured, the service enters **deterministic mode**: it captures all characters between the prefix and suffix without relying on timing.

## Common Scanner Configurations

| Scanner Brand | Typical Prefix | Suffix | Notes |
|--------------|---------------|--------|-------|
| Generic HID | None | Enter | Most common |
| Honeywell | Configurable | Enter/Tab | Program via barcode manual |
| Zebra/Symbol | Configurable | Enter | Program via 123Scan utility |
| Datalogic | Configurable | Enter/CR | Program via Aladdin utility |

## Suffix Options

The `suffix` config accepts any key name recognized by `KeyboardEvent.key`:

- `'Enter'` — most common (default)
- `'Tab'` — some scanners use Tab
- Custom strings for scanners with unusual suffix behavior

## Adapting to a New Scanner

1. Connect the scanner to the computer
2. Open a text editor and scan a barcode
3. Observe: Does it add a prefix character? Does it end with Enter or Tab?
4. Configure `BarcodeInputConfig` accordingly
5. Adjust `maxTimePerCharMs` if the scanner is unusually slow

## Important Notes

- Not every scanner uses the same configuration
- Always test with the actual scanner hardware before deployment
- The timing threshold is a **fallback**, not a guarantee
