import { useEffect, useRef } from 'react';
import { useBillingStore } from '../../application/state/billingStore';

export function useKeyboardShortcuts(inputRef: React.RefObject<HTMLInputElement | null>) {
  const store = useBillingStore();
  const stateRef = useRef(store);
  
  // Keep ref fresh without re-binding event listener
  useEffect(() => {
    stateRef.current = store;
  }, [store]);

  useEffect(() => {
    let escapeCount = 0;
    let escapeTimer: ReturnType<typeof setTimeout> | null = null;

    const handleKeyDown = async (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      
      const { currentBill, selectedBillItemId, setSelectedBillItemId, removeItem, clear } = stateRef.current;
      const isAnyInputFocused = document.activeElement?.tagName === 'INPUT';
      
      // Escape for VOID/CLEAR (Double-Tap)
      const activeContext = document.activeElement?.getAttribute('data-context');
      // Allow escape if no input is focused, OR if the focused input is specifically the search box
      if (e.key === 'Escape' && (!isAnyInputFocused || activeContext === 'search-input')) {
        escapeCount++;
        if (escapeCount === 2) {
          await clear();
          escapeCount = 0;
          if (inputRef.current) inputRef.current.focus();
        } else {
          clearTimeout(escapeTimer!);
          escapeTimer = setTimeout(() => { escapeCount = 0; }, 500); // Reset after 500ms
        }
        return;
      }

      // Undo (Ctrl+Z or Cmd+Z)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        await stateRef.current.undo();
        return;
      }

      // Finalize (Ctrl+Enter or Cmd+Enter)
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if (stateRef.current.currentBill && !stateRef.current.currentBill.isEmpty) {
          const success = await stateRef.current.finalize();
          if (success && inputRef.current) {
            inputRef.current.focus();
          }
        }
        return;
      }
      
      // Enter to edit quantity of selected item
      if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
        // Only intercept if we are on the search input (which allowed it to propagate because it's empty)
        // or if nothing is focused.
        const activeContext = document.activeElement?.getAttribute('data-context');
        if (selectedBillItemId && (activeContext === 'search-input' || !isAnyInputFocused)) {
          e.preventDefault();
          stateRef.current.setEditingBillItemId(selectedBillItemId);
        }
        return;
      }

      // If they are in a quantity editor, don't intercept arrow keys or delete
      if (document.activeElement?.tagName === 'INPUT' && (document.activeElement as HTMLInputElement).type === 'number') {
        return;
      }

      const items = currentBill?.items || [];
      if (items.length === 0) return;

      const currentIndex = items.findIndex(i => i.productId === selectedBillItemId);

      // Arrow Down
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const nextIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
        setSelectedBillItemId(items[nextIndex].productId);
      }
      
      // Arrow Up
      else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const nextIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
        setSelectedBillItemId(items[nextIndex].productId);
      }
      
      // Delete (Remove Item)
      // We explicitly check for 'Delete' not 'Backspace' when input is focused to prevent deleting text.
      // If no input is focused, 'Backspace' could also act as delete, but 'Delete' is safer.
      else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedBillItemId) {
        // Only allow Backspace to delete items if NO input is focused at all
        if (e.key === 'Backspace' && isAnyInputFocused) {
          return; 
        }
        e.preventDefault();
        await removeItem(selectedBillItemId);
        if (inputRef.current) inputRef.current.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (escapeTimer !== null) clearTimeout(escapeTimer);
    };
  }, [inputRef]);
}
