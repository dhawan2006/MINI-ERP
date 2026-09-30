import { useEffect } from 'react';
import { BarcodeInputService, BarcodeInputConfig } from '../services/BarcodeInputService';
import { useBillingStore } from '../../application/state/billingStore';

/**
 * React hook that attaches the global BarcodeInputService
 * and routes detected scans through the Zustand billing store.
 * 
 * The service captures keyboard events at the window level,
 * detects scanner patterns, and emits normalized barcodes.
 * This hook bridges that into the application layer.
 */
export function useScannerDetector(config?: Partial<BarcodeInputConfig>) {
  useEffect(() => {
    const service = BarcodeInputService.getInstance(config);
    service.attach();

    const unsubscribe = service.subscribe(async (barcode: string) => {
      try {
        await useBillingStore.getState().scanBarcode(barcode);
      } catch (_) {
        // scanBarcode handles its own error state via scanError
        // No additional action needed here
      }
    });

    return () => {
      unsubscribe();
      service.detach();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // BarcodeInputService is a singleton; config is applied once at initialization
}
