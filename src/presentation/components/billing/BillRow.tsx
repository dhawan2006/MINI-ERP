import React, { useState, useRef, useEffect } from 'react';
import { BillItemDTO } from '../../../shared/dto';
import { useBillingStore } from '../../../application/state/billingStore';

interface BillRowProps {
  item: BillItemDTO;
  index: number;
}

export const BillRow: React.FC<BillRowProps> = ({ item, index }) => {
  const selectedBillItemId = useBillingStore(state => state.selectedBillItemId);
  const setSelectedBillItemId = useBillingStore(state => state.setSelectedBillItemId);
  const editingBillItemId = useBillingStore(state => state.editingBillItemId);
  const setEditingBillItemId = useBillingStore(state => state.setEditingBillItemId);
  const setQuantity = useBillingStore(state => state.setQuantity);
  const removeItem = useBillingStore(state => state.removeItem);
  const isSelected = selectedBillItemId === item.productId;
  const isGlobalEditing = editingBillItemId === item.productId;
  
  const [isEditingQty, setIsEditingQty] = useState(false);
  const [editQtyValue, setEditQtyValue] = useState(item.quantity.toString());
  const inputRef = useRef<HTMLInputElement>(null);

  const handleRowClick = () => {
    setSelectedBillItemId(item.productId);
  };

  const startEdit = () => {
    setEditQtyValue(item.quantity.toString());
    setIsEditingQty(true);
  };

  useEffect(() => {
    if (isGlobalEditing && !isEditingQty) {
      startEdit();
    }
  }, [isGlobalEditing]);

  useEffect(() => {
    if (isEditingQty && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditingQty]);

  const refocusSearch = () => {
    setTimeout(() => {
      const searchInput = document.querySelector('[data-context="search-input"]') as HTMLInputElement;
      if (searchInput) searchInput.focus();
    }, 10);
  };

  const commitEdit = async (e?: React.FocusEvent<HTMLInputElement>) => {
    if (!isEditingQty) return;

    if (e?.target.dataset.scannerBlur === 'true') {
      setIsEditingQty(false);
      setEditingBillItemId(null);
      setEditQtyValue(item.quantity.toString());
      e.target.removeAttribute('data-scannerBlur');
      return;
    }

    setIsEditingQty(false);
    setEditingBillItemId(null);
    
    const num = parseInt(editQtyValue, 10);
    if (!isNaN(num) && num !== item.quantity && num > 0) {
      await setQuantity(item.productId, num);
    } else {
      setEditQtyValue(item.quantity.toString());
    }
    
    refocusSearch();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.stopPropagation();
      commitEdit();
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      setIsEditingQty(false);
      setEditingBillItemId(null);
      setEditQtyValue(item.quantity.toString());
      refocusSearch();
    }
  };

  const decreaseQty = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (item.quantity > 1) {
      await setQuantity(item.productId, item.quantity - 1);
    }
  };

  const increaseQty = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await setQuantity(item.productId, item.quantity + 1);
  };

  return (
    <div 
      data-testid={`bill-row-${item.productId}`}
      onClick={handleRowClick}
      onDoubleClick={startEdit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          startEdit();
        } else if (e.key === 'Backspace' || e.key === 'Delete') {
          e.preventDefault();
          removeItem(item.productId);
        }
      }}
      tabIndex={0}
      className={`bill-row grid grid-cols-[28px_minmax(0,1fr)_96px_76px_88px_32px] gap-2 items-center px-3 py-3 rounded-xl transition-all cursor-pointer select-none focus:outline-none group border ${
        isSelected 
          ? 'bg-indigo-50/50 border-indigo-200 shadow-sm ring-1 ring-indigo-200' 
          : 'bg-white border-transparent hover:bg-slate-50 hover:border-slate-200'
      }`}
    >
      <div className="text-left text-xs font-bold text-slate-400">
        {index}
      </div>

      <div className="min-w-0 pr-2">
        <div className={`product-name font-bold text-[15px] ${isSelected ? 'text-indigo-700' : 'text-slate-800'}`}>
          {item.snapshotName}
        </div>
      </div>
      
      <div className="flex items-center justify-center">
        {isEditingQty ? (
          <input
            ref={inputRef}
            type="number"
            data-context="quantity-editor"
            value={editQtyValue}
            onChange={e => setEditQtyValue(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={handleKeyDown}
            className="w-14 text-center text-sm font-bold border-2 border-indigo-500 rounded-md outline-none py-1 shadow-sm text-indigo-700"
          />
        ) : (
          <div className={`flex items-center gap-1 bg-white border rounded-md shadow-sm overflow-hidden ${isSelected ? 'border-indigo-200' : 'border-slate-200'}`}>
            <button 
              onClick={decreaseQty}
              className="w-7 h-7 flex items-center justify-center text-slate-500 hover:text-indigo-600 hover:bg-slate-50 active:bg-slate-100 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            </button>
            <span 
              className={`qty-display w-6 text-center text-[13px] font-bold cursor-text hover:text-indigo-600 ${isSelected ? 'text-indigo-700' : 'text-slate-700'}`}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedBillItemId(item.productId);
                startEdit();
              }}
            >
              {item.quantity}
            </span>
            <button 
              onClick={increaseQty}
              className="w-7 h-7 flex items-center justify-center text-slate-500 hover:text-indigo-600 hover:bg-slate-50 active:bg-slate-100 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            </button>
          </div>
        )}
      </div>

      <div className="text-right font-mono font-medium text-slate-500 text-[13px]">
        ₹{(item.snapshotPriceMinor / 100).toFixed(2)}
      </div>

      <div className={`text-right font-mono font-bold text-[14.5px] ${isSelected ? 'text-indigo-700' : 'text-slate-800'}`}>
        ₹{(item.lineTotalMinor / 100).toFixed(2)}
      </div>
      
      <div className="flex justify-end pr-1">
        <button 
          onClick={(e) => {
            e.stopPropagation();
            removeItem(item.productId);
          }}
          className={`w-7 h-7 flex items-center justify-center rounded-lg border border-red-200 text-red-500 hover:text-red-700 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100 ${isSelected ? 'opacity-100' : ''}`}
          title="Remove item"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        </button>
      </div>
    </div>
  );
};
