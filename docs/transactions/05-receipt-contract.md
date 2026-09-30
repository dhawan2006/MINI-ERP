# 05. Receipt Contract

The `ReceiptData` is a canonical, serializable representation of a finalized bill, containing all necessary data to physically print the receipt.

## Structure
```typescript
interface ReceiptData {
  billNumber: number;
  timestamp: number;
  items: Array<{
    snapshotName: string;
    quantity: number;
    unitPriceMinor: number;
    lineTotalMinor: number;
  }>;
  totalMinor: number;
  shopDetails?: {
    name: string;
    address: string;
  };
}
```

## Source of Truth
The `ReceiptData` is derived entirely from the Finalized Bill in the Main Process. The renderer is never trusted to construct or provide `ReceiptData`.
