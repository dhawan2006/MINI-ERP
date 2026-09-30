import React, { useEffect } from 'react';
import { useHistoryStore, DateFilterOption } from '../../../application/state/historyStore';
import { formatCurrency } from '../../../shared/utils/currency';

export const HistoryListPanel: React.FC = () => {
  const { 
    list, 
    totalCount, 
    loadingList, 
    selectedBillId, 
    selectBill,
    searchBillNumber,
    setSearchBillNumber,
    dateFilter,
    setDateFilter,
    currentPage,
    pageSize,
    setPage,
    loadHistory
  } = useHistoryStore();

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  
  // Create pagination range string
  const startCount = totalCount === 0 ? 0 : ((currentPage - 1) * pageSize) + 1;
  const endCount = Math.min(currentPage * pageSize, totalCount);

  return (
    <div className="flex flex-col h-full bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      
      {/* Header */}
      <div className="px-6 py-5 border-b border-slate-200">
        <h2 className="text-xl font-extrabold text-slate-900 tracking-tight mb-4">Bill History</h2>
        
        <div className="flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
            </div>
            <input 
              type="text"
              placeholder="Search by Bill Number..."
              className="w-full pl-10 pr-4 py-2 border-2 border-slate-200 rounded-lg text-sm font-medium focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-shadow bg-slate-50 placeholder:text-slate-400"
              value={searchBillNumber}
              onChange={(e) => setSearchBillNumber(e.target.value)}
            />
          </div>
          
          <div className="relative">
            <select 
              className="appearance-none bg-slate-50 border-2 border-slate-200 rounded-lg py-2 pl-4 pr-10 text-sm font-semibold text-slate-700 focus:outline-none focus:border-indigo-500 cursor-pointer"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value as DateFilterOption)}
            >
              <option value="ALL_TIME">All Time</option>
              <option value="TODAY">Today</option>
              <option value="YESTERDAY">Yesterday</option>
              <option value="LAST_7_DAYS">Last 7 Days</option>
            </select>
            <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-slate-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
            </div>
          </div>
        </div>
      </div>

      {/* Table Header */}
      <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex items-center text-xs font-bold text-slate-500 uppercase tracking-wider">
        <div className="w-12 shrink-0">#</div>
        <div className="w-24 shrink-0">BILL NO.</div>
        <div className="w-44 shrink-0">DATE & TIME</div>
        <div className="flex-1 min-w-[120px]">CUSTOMER</div>
        <div className="w-16 shrink-0 text-right">ITEMS</div>
        <div className="w-28 shrink-0 text-right">TOTAL</div>
        <div className="w-28 shrink-0 text-center ml-4">STATUS</div>
        <div className="w-24 shrink-0 text-right">ACTION</div>
      </div>

      {/* Table Body */}
      <div className="flex-1 overflow-y-auto bg-white">
        {loadingList && list.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-3">
            <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
            <p className="font-medium">Loading history...</p>
          </div>
        ) : list.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-3">
            <svg className="w-12 h-12 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
            <p className="font-medium text-slate-500">No bills found</p>
            <p className="text-sm">Try changing your search or date filter.</p>
          </div>
        ) : (
          <div className="flex flex-col">
            {list.map((bill, index) => {
              const isSelected = bill.id === selectedBillId;
              const date = new Date(bill.timestamp);
              
              // Formatting
              const formattedDate = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
              const formattedTime = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
              const rowIndex = ((currentPage - 1) * pageSize) + index + 1;

              return (
                <div 
                  key={bill.id}
                  onClick={() => selectBill(bill.id)}
                  className={`
                    px-6 py-4 flex items-center border-b border-slate-100 cursor-pointer transition-colors group
                    ${isSelected ? 'bg-indigo-50/50 relative' : 'hover:bg-slate-50 bg-white'}
                  `}
                >
                  {/* Selection Indicator */}
                  {isSelected && <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-600 rounded-r-full"></div>}
                  
                  <div className="w-12 shrink-0 text-sm font-semibold text-slate-400">
                    {rowIndex}
                  </div>
                  
                  <div className={`w-24 shrink-0 text-sm font-bold tracking-tight ${isSelected ? 'text-indigo-700' : 'text-slate-900'}`}>
                    #{bill.billNumber}
                  </div>
                  
                  <div className="w-44 shrink-0 flex flex-col justify-center">
                    <span className="text-sm font-semibold text-slate-700">{formattedDate}</span>
                    <span className="text-xs font-medium text-slate-500">{formattedTime}</span>
                  </div>
                  
                  <div className="flex-1 min-w-[120px] text-sm font-medium text-slate-600 truncate">
                    Walk-in Customer
                  </div>
                  
                  <div className="w-16 shrink-0 text-sm font-semibold text-slate-600 text-right">
                    {bill.itemCount}
                  </div>
                  
                  <div className={`w-28 shrink-0 text-base font-bold text-right ${isSelected ? 'text-indigo-700' : 'text-slate-900'}`}>
                    {formatCurrency(bill.totalMinor)}
                  </div>
                  
                  <div className="w-28 shrink-0 ml-4 flex justify-center">
                    <span className="px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-emerald-700 bg-emerald-100 rounded-md">
                      Completed
                    </span>
                  </div>
                  
                  <div className="w-24 shrink-0 text-right flex justify-end">
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        selectBill(bill.id);
                      }}
                      className={`
                        px-3 py-1.5 rounded border text-sm font-bold transition-colors
                        ${isSelected 
                          ? 'border-indigo-200 bg-white text-indigo-700 shadow-sm' 
                          : 'border-slate-200 bg-white text-slate-600 hover:text-slate-900 hover:border-slate-300 opacity-0 group-hover:opacity-100'}
                      `}
                    >
                      View
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer / Pagination */}
      <div className="px-6 py-4 bg-white border-t border-slate-200 flex items-center justify-between z-10">
        <div className="text-sm font-medium text-slate-500">
          Showing <strong className="text-slate-700">{startCount}</strong> to <strong className="text-slate-700">{endCount}</strong> of <strong className="text-slate-700">{totalCount}</strong> bills
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setPage(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1 || loadingList}
            className="px-3 py-1.5 border border-slate-200 rounded-md bg-white text-slate-600 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            &larr; Prev
          </button>
          
          <div className="flex items-center px-3 gap-1">
            <span className="text-sm font-bold text-slate-900">{currentPage}</span>
            <span className="text-sm font-medium text-slate-400">/</span>
            <span className="text-sm font-medium text-slate-500">{totalPages}</span>
          </div>

          <button 
            onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages || totalPages === 0 || loadingList}
            className="px-3 py-1.5 border border-slate-200 rounded-md bg-white text-slate-600 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Next &rarr;
          </button>
        </div>
      </div>
      
    </div>
  );
};
