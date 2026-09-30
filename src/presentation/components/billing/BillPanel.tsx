import React from 'react';
import { useBillingStore } from '../../../application/state/billingStore';
import { BillRow } from './BillRow';


export const BillPanel: React.FC = () => {
  const currentBill = useBillingStore(state => state.currentBill);
  const error = useBillingStore(state => state.error);
  const isLoading = useBillingStore(state => state.isLoading);
  const finalize = useBillingStore(state => state.finalize);
  const clear = useBillingStore(state => state.clear);

  const totalMinor = currentBill?.totalMinor ?? 0;
  const formattedTotal = (totalMinor / 100).toFixed(2);
  const itemCount = currentBill?.items.reduce((sum, item) => sum + item.quantity, 0) || 0;

  return (
    <div className="flex flex-col h-full bg-white relative">
      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-white/70 z-20 flex items-center justify-center backdrop-blur-sm">
          <div className="text-indigo-600 font-semibold text-lg flex items-center gap-3 bg-white px-6 py-4 rounded-2xl shadow-xl border border-indigo-100">
            <svg className="animate-spin h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Processing...
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-5 border-b border-slate-200 shrink-0">
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">Current Bill</h2>
        <button 
          onClick={() => clear()}
          disabled={!currentBill || currentBill.isEmpty || isLoading}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 border border-slate-200 hover:border-slate-300 hover:bg-slate-50 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 disabled:pointer-events-none"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
          Clear
        </button>
      </div>

      <div className="flex-1 flex flex-col min-h-0">
        {/* Table Header */}
        <div className="px-6 py-3 border-b border-slate-100 bg-slate-50 text-[11px] font-bold text-slate-400 uppercase tracking-widest shrink-0">
          <div className="grid grid-cols-[28px_minmax(0,1fr)_96px_76px_88px_32px] gap-2 items-center">
            <div className="text-left">#</div>
            <div className="text-left">Product</div>
            <div className="text-center">Qty</div>
            <div className="text-right">Price</div>
            <div className="text-right">Total</div>
            <div></div> {/* Delete spacer */}
          </div>
        </div>

        {/* Bill Items Area */}
        <div className="flex-1 overflow-y-auto px-4 py-2 relative">
          {error && (
            <div className="bg-red-50 text-red-700 p-3 mb-4 rounded-xl border border-red-200 text-sm font-medium shadow-sm">
              {error}
            </div>
          )}

          {(!currentBill || currentBill.isEmpty) ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-4">
              <div className="p-4 bg-slate-50 rounded-full border border-slate-100">
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-40">
                  <circle cx="9" cy="21" r="1"></circle>
                  <circle cx="20" cy="21" r="1"></circle>
                  <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                </svg>
              </div>
              <div className="text-center">
                <p className="font-semibold text-slate-700 text-base">No items in current bill</p>
                <p className="text-sm mt-1">Add items to start a new bill</p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {currentBill.items.map((item, index) => (
                <BillRow key={item.productId} item={item} index={index + 1} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Summary & Actions Area */}
      <div className="border-t border-slate-200 bg-white shrink-0 z-10">
        <div className="p-6">
          <div className="flex justify-between items-center mb-4 text-base font-semibold text-slate-700">
            <span>Subtotal ({itemCount} items)</span>
            <span>₹{formattedTotal}</span>
          </div>
          
          <div className="w-full h-px bg-slate-200 mb-4"></div>
          
          <div className="flex justify-between items-end mb-6">
            <div className="text-lg font-bold text-slate-900 tracking-tight">Total</div>
            <div className="text-4xl font-extrabold text-slate-900 tracking-tight">₹{formattedTotal}</div>
          </div>
          
          <div className="flex flex-col gap-3">
            <button 
              disabled={!currentBill || currentBill.isEmpty || isLoading}
              onClick={() => finalize()}
              className="w-full flex items-center justify-center gap-2 py-4 rounded-xl text-lg font-bold shadow-md hover:shadow-lg transition-all bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 disabled:pointer-events-none"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 6 2 18 2 18 9"></polyline>
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
                <rect x="6" y="14" width="12" height="8"></rect>
              </svg>
              Finalize & Print
            </button>

            <button 
              onClick={() => clear()}
              disabled={!currentBill || currentBill.isEmpty || isLoading}
              className="w-full py-3.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 hover:text-slate-900 transition-colors disabled:opacity-50 disabled:pointer-events-none"
            >
              Clear Bill
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
