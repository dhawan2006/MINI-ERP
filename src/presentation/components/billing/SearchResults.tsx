import React from 'react';
import { useBillingStore } from '../../../application/state/billingStore';
import { ProductDTO } from '../../../shared/dto';


export const SearchResults: React.FC = () => {
  const { searchResults, searchSelectedIndex, addProduct, clearSearch, setSearchSelectedIndex } = useBillingStore();

  if (searchResults.length === 0) {
    return (
      <div className="flex flex-col items-center py-12 text-slate-500 space-y-4">
        <div className="p-5 bg-slate-100 rounded-full border border-slate-200 shadow-sm">
          <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400">
            <path d="M3 5v14"></path>
            <path d="M8 5v14"></path>
            <path d="M12 5v14"></path>
            <path d="M17 5v14"></path>
            <path d="M21 5v14"></path>
          </svg>
        </div>
        <div className="text-center">
          <p className="font-bold text-slate-700 text-base">Scan or search for a product</p>
          <p className="text-sm mt-1 max-w-sm mx-auto text-slate-500">Start by scanning a barcode or searching by product name</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {searchResults.map((product: ProductDTO, index: number) => {
        const isSelected = searchSelectedIndex === index;
        return (
          <button
            key={product.id}
            onMouseEnter={() => setSearchSelectedIndex(index)}
            onClick={async () => {
              await addProduct(product.id);
              clearSearch();
            }}
            className={`flex items-center w-full p-3.5 border rounded-xl focus:outline-none transition-all text-left group ${
              isSelected
                ? 'bg-indigo-50/40 border-indigo-300 shadow-sm ring-1 ring-indigo-200'
                : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm'
            }`}
          >
            {/* Image Placeholder */}
            <div className={`w-12 h-12 rounded-lg flex items-center justify-center mr-4 shrink-0 transition-colors border ${isSelected ? 'bg-white border-indigo-100 text-indigo-500 shadow-sm' : 'bg-slate-50 border-slate-100 text-slate-300'}`}>
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <circle cx="8.5" cy="8.5" r="1.5"></circle>
                <polyline points="21 15 16 10 5 21"></polyline>
              </svg>
            </div>
            
            {/* Product Details */}
            <div className="flex flex-col flex-1 min-w-0 pr-4">
              <span className={`font-bold text-base truncate ${isSelected ? 'text-indigo-900' : 'text-slate-800'}`}>
                {product.name}
              </span>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs font-mono font-medium text-slate-500 truncate bg-slate-100 px-1.5 py-0.5 rounded">
                  {product.barcode || 'NO BARCODE'}
                </span>
              </div>
            </div>
            
            {/* Price & Action */}
            <div className="flex items-center gap-5 shrink-0">
              <span className={`font-mono font-extrabold text-lg ${isSelected ? 'text-indigo-700' : 'text-slate-700'}`}>
                ₹{(product.priceMinor / 100).toFixed(2)}
              </span>
              
              <div className="flex items-center gap-3">
                {product.isActive ? (
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full uppercase tracking-wider">
                    Active
                  </span>
                ) : (
                  <span className="text-[10px] font-bold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full uppercase tracking-wider">
                    Inactive
                  </span>
                )}
                
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-semibold text-xs transition-all ${isSelected ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-slate-50 text-slate-400 border-slate-200 group-hover:bg-white group-hover:text-indigo-600 group-hover:border-indigo-200'}`}>
                  <span>Enter</span>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 10 4 15 9 20"></polyline>
                    <path d="M20 4v7a4 4 0 0 1-4 4H4"></path>
                  </svg>
                </div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
};
