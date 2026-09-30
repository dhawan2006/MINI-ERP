import React from 'react';
import { useHistoryStore } from '../../../application/state/historyStore';
import { formatCurrency } from '../../../shared/utils/currency';

export const HistoryDetailsPanel: React.FC = () => {
  const { 
    selectedBillDetail, 
    loadingDetail, 
    reprintSelected, 
    exportSelectedPdf,
    selectBill
  } = useHistoryStore();

  if (loadingDetail) {
    return (
      <div className="flex flex-col h-full bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden items-center justify-center text-slate-400 gap-3">
        <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
        <p className="font-medium">Loading details...</p>
      </div>
    );
  }

  if (!selectedBillDetail) {
    return (
      <div className="flex flex-col h-full bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden items-center justify-center p-8 text-center">
        <div className="w-16 h-16 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-center mb-5 text-slate-300">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
          </svg>
        </div>
        <h3 className="text-lg font-bold text-slate-900 tracking-tight">No Bill Selected</h3>
        <p className="text-slate-500 font-medium mt-1 text-sm">Select a bill from the history<br/>to view its details.</p>
      </div>
    );
  }

  const date = new Date(selectedBillDetail.timestamp);
  const formattedDate = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const formattedTime = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="flex flex-col h-full bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      {/* Details Header */}
      <div className="px-6 py-5 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
        <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">Bill Details</h2>
        <button 
          onClick={() => selectBill(null)}
          className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition-colors"
          title="Clear Selection"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Bill Info Summary */}
        <div className="p-6 border-b border-slate-100 flex flex-col gap-4">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="text-2xl font-bold font-mono tracking-tight text-indigo-700">#{selectedBillDetail.billNumber}</h3>
              <p className="text-slate-500 font-medium text-sm mt-1">{formattedDate} · {formattedTime}</p>
            </div>
            <span className="px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-emerald-700 bg-emerald-100 rounded-md">
              Completed
            </span>
          </div>

          <div className="mt-2 p-4 bg-slate-50 rounded-xl border border-slate-100">
            <div>
              <span className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Customer</span>
              <span className="text-sm font-semibold text-slate-700">Walk-in Customer</span>
            </div>
          </div>
        </div>

        {/* Items List */}
        <div className="p-6">
          <h4 className="text-sm font-bold text-slate-900 tracking-tight mb-4 flex items-center gap-2">
            Items
            <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{selectedBillDetail.items.length}</span>
          </h4>
          
          <div className="flex flex-col gap-3">
            {selectedBillDetail.items.map((item, idx) => (
              <div key={idx} className="flex justify-between items-center text-sm border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                <div className="flex-1 pr-4">
                  <div className="font-semibold text-slate-700 truncate">{item.snapshotName}</div>
                  <div className="text-slate-500 mt-0.5 text-xs font-medium">{item.quantity} × {formatCurrency(item.snapshotPriceMinor)}</div>
                </div>
                <div className="font-bold text-slate-900">
                  {formatCurrency(item.lineTotalMinor)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer / Totals & Actions */}
      <div className="p-6 bg-slate-50 border-t border-slate-200 shrink-0">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-semibold text-slate-500">Subtotal</span>
          <span className="text-sm font-bold text-slate-700">{formatCurrency(selectedBillDetail.totalMinor)}</span>
        </div>
        <div className="flex justify-between items-center mb-6">
          <span className="text-base font-bold uppercase tracking-widest text-slate-900">Total</span>
          <span className="text-2xl font-bold font-mono tracking-tight text-indigo-700">{formatCurrency(selectedBillDetail.totalMinor)}</span>
        </div>
        
        <div className="flex gap-3">
          <button
            onClick={reprintSelected}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-white border border-slate-200 rounded-lg text-sm font-bold text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors shadow-sm"
          >
            <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path>
            </svg>
            Reprint
          </button>
          
          <button
            onClick={exportSelectedPdf}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-white border border-slate-200 rounded-lg text-sm font-bold text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors shadow-sm"
          >
            <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
            </svg>
            Export PDF
          </button>
        </div>
      </div>
    </div>
  );
};
