import { useEffect, useRef } from 'react';
import { useBillingStore } from '../../application/state/billingStore';

/**
 * Ensures the primary input reclaims focus after disruptive events.
 */
export function useFocusManager() {
  const inputRef = useRef<HTMLInputElement>(null);
  
  // We want to reclaim focus if:
  // - Selection changes? Maybe not, user might be navigating.
  // - Error occurs.
  // - Item is removed.
  // We can just rely on the layout passing this ref, and specific events can trigger a focus reset.

  const { error, currentBill } = useBillingStore();

  useEffect(() => {
    // If an error pops up, we make sure they can still type.
    if (error && inputRef.current) {
      inputRef.current.focus();
    }
  }, [error]);

  useEffect(() => {
    // When the bill changes (e.g. item removed or added), ensure we can scan again immediately.
    // If they are focusing a quantity editor, we shouldn't steal it! 
    // We can check if the active element is an input of type number.
    if (inputRef.current && document.activeElement) {
      const activeEl = document.activeElement as HTMLElement;
      if (activeEl.tagName === 'INPUT' && (activeEl as HTMLInputElement).type === 'number') {
        return; // Don't steal focus from quantity editor
      }
      inputRef.current.focus();
    }
  }, [currentBill]);

  return inputRef;
}
