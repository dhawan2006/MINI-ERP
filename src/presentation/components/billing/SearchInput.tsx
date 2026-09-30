import React, { useCallback } from 'react';
import { useBillingStore } from '../../../application/state/billingStore';

interface SearchInputProps {
  inputRef: React.RefObject<HTMLInputElement | null>;
}

export const SearchInput: React.FC<SearchInputProps> = ({ inputRef }) => {
  const {
    searchText,
    setSearchText,
    searchProducts,
    clearSearch,
    searchError,
    searchSelectedIndex,
    searchResults,
    moveSearchSelection,
    addProduct,
    scanBarcode
  } = useBillingStore();

  React.useEffect(() => {
    const val = searchText.trim();
    if (!val) {
      if (searchResults.length > 0) {
        useBillingStore.setState({ searchResults: [] });
      }
      return;
    }
    const timer = setTimeout(() => {
      searchProducts(val);
    }, 150);
    return () => clearTimeout(timer);
  }, [searchText, searchProducts]);

  const handleKeyDown = useCallback(async (e: React.KeyboardEvent<HTMLInputElement>) => {
    const currentValue = e.currentTarget.value;

    // If the search is completely empty, let global shortcuts (ArrowUp/Down/Enter) handle cart navigation
    if (!currentValue.trim() && searchResults.length === 0) {
      if (['ArrowDown', 'ArrowUp', 'Enter'].includes(e.key)) {
        return;
      }
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveSearchSelection(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveSearchSelection(-1);
    } else if (e.key === 'Enter') {
      e.preventDefault();

      // Add explicitly selected result
      if (searchSelectedIndex !== null && searchResults[searchSelectedIndex]) {
        await addProduct(searchResults[searchSelectedIndex].id);
        clearSearch();
        return;
      }

      const val = currentValue.trim();
      if (!val) return;

      // Scanner wedge typing fast + enter: route through store for consistent error handling
      if (searchResults.length === 0) {
        await scanBarcode(val);
        clearSearch();
        return;
      }

      // If there are search results but none selected, add the top one
      if (searchResults.length > 0) {
        await addProduct(searchResults[0].id);
        clearSearch();
        return;
      }

      await searchProducts(val);
    } else if (e.key === 'Escape') {
      clearSearch();
    }
  }, [searchResults, searchSelectedIndex, searchProducts, clearSearch, moveSearchSelection, addProduct, scanBarcode]);

  return (
    <div className="w-full relative">
      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400">
          <path d="M3 5v14"></path>
          <path d="M8 5v14"></path>
          <path d="M12 5v14"></path>
          <path d="M17 5v14"></path>
          <path d="M21 5v14"></path>
        </svg>
      </div>
      <input
        ref={inputRef}
        type="text"
        value={searchText}
        onChange={(e) => setSearchText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Scan a barcode or type a product name..."
        className="w-full pl-14 pr-40 py-4 text-lg font-semibold text-slate-900 border-2 border-slate-200 rounded-xl outline-none focus:border-indigo-600 focus:ring-4 focus:ring-indigo-100 shadow-sm transition-all placeholder-slate-400"
        autoFocus
        data-context="search-input"
      />
      <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
        <span className="text-sm font-semibold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm">
          Press Enter to add
        </span>
      </div>
      {searchError && (
        <div className="absolute -bottom-7 left-0 text-sm font-medium text-[var(--color-danger)]">
          {searchError}
        </div>
      )}
    </div>
  );
};
