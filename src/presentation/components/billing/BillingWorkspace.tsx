import React from 'react';
import { SearchInput } from './SearchInput';
import { SearchResults } from './SearchResults';
import { useBillingStore } from '../../../application/state/billingStore';

interface BillingWorkspaceProps {
  inputRef: React.RefObject<HTMLInputElement | null>;
}

export const BillingWorkspace: React.FC<BillingWorkspaceProps> = ({ inputRef }) => {
  const { searchResults, searchText } = useBillingStore();
  
  return (
    <div className="flex flex-col h-full bg-white">
      {/* Search Header Area */}
      <div className="p-6 pb-2">
        <SearchInput inputRef={inputRef} />
      </div>
      
      {/* Search Results / Empty State Area */}
      <div className="flex-1 overflow-y-auto px-6 pb-4 flex flex-col">
        {searchResults.length > 0 && (
          <div className="flex items-center justify-between mb-4 mt-2">
            <h3 className="text-lg font-bold text-slate-800 tracking-tight">Products</h3>
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium text-slate-500">Showing {searchResults.length} results for "{searchText}"</span>
              <div className="flex items-center gap-2 text-xs font-medium text-slate-400 bg-slate-50 px-2 py-1 rounded">
                <span>↑ ↓ to navigate</span>
                <span className="w-px h-3 bg-slate-300"></span>
                <span>Enter to add</span>
              </div>
            </div>
          </div>
        )}
        
        <SearchResults />
      </div>

      {/* Quick Actions (Bottom) */}
      <div className="px-6 pb-6 pt-4 mt-auto">
        <div className="grid grid-cols-3 gap-3">
          <button 
            onClick={() => inputRef.current?.focus()}
            className="flex items-center justify-center gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-xl hover:border-indigo-300 hover:shadow-sm transition-all group"
          >
            <div className="text-indigo-600">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 5v14"></path>
                <path d="M8 5v14"></path>
                <path d="M12 5v14"></path>
                <path d="M17 5v14"></path>
                <path d="M21 5v14"></path>
              </svg>
            </div>
            <span className="text-sm font-semibold text-slate-700 group-hover:text-indigo-700">Scan Product</span>
          </button>

          <button 
            onClick={() => inputRef.current?.focus()}
            className="flex items-center justify-center gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-xl hover:border-indigo-300 hover:shadow-sm transition-all group"
          >
            <div className="text-indigo-600">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
            </div>
            <span className="text-sm font-semibold text-slate-700 group-hover:text-indigo-700">Search</span>
          </button>

          <button 
            onClick={() => {
              // Add to bill action (handled by selection in SearchResults usually, but we focus for now to enable workflow)
              inputRef.current?.focus();
            }}
            className="flex items-center justify-center gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-xl hover:border-indigo-300 hover:shadow-sm transition-all group"
          >
            <div className="text-indigo-600">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
            </div>
            <span className="text-sm font-semibold text-slate-700 group-hover:text-indigo-700">Add to Bill</span>
          </button>
        </div>
      </div>
    </div>
  );
};
