import { useState, useEffect, useRef } from 'react';
import { useProductStore } from '../../state/productStore';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

export function ProductEditor() {
  const { isEditorOpen, selectedProduct, closeEditor, setProducts, searchTerm, showInactive, setError } = useProductStore();
  const [name, setName] = useState('');
  const [barcode, setBarcode] = useState('');
  const [price, setPrice] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [localError, setLocalError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditorOpen) {
      if (selectedProduct) {
        setName(selectedProduct.name);
        setBarcode(selectedProduct.barcode || '');
        setPrice((selectedProduct.priceMinor / 100).toFixed(2));
        setIsActive(selectedProduct.isActive);
      } else {
        setName('');
        setBarcode('');
        setPrice('');
        setIsActive(true);
      }
      setLocalError(null);
      // Focus barcode on open
      setTimeout(() => barcodeInputRef.current?.focus(), 50);
    }
  }, [isEditorOpen, selectedProduct]);

  if (!isEditorOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    setLocalError(null);
    setError(null);
    setIsSaving(true);
    
    try {
      const priceMinor = Math.round(parseFloat(price) * 100);
      if (isNaN(priceMinor) || priceMinor < 0) {
        setLocalError('Invalid price format');
        return;
      }
      if (!name.trim()) {
        setLocalError('Product name is required');
        return;
      }
      
      const barcodeValue = barcode.trim() || null;
      let response;
      
      if (selectedProduct) {
        response = await window.api.products.update(selectedProduct.id, name.trim(), priceMinor, barcodeValue);
        if (response.success && selectedProduct.isActive !== isActive) {
          await window.api.products.setActive(selectedProduct.id, isActive);
        }
      } else {
        response = await window.api.products.create(name.trim(), priceMinor, barcodeValue);
        if (response.success && !isActive && response.data) {
           await window.api.products.setActive(response.data.id, false);
        }
      }
      
      if (!response.success) {
        setLocalError(response.error?.message || 'Failed to save product');
        return;
      }

      // Reload products
      const searchRes = await window.api.products.search(searchTerm, 50, showInactive);
      if (searchRes.success && searchRes.data) {
        setProducts(searchRes.data);
      }
      
      closeEditor();
    } catch (err: any) {
      setLocalError(err.message || 'An unexpected error occurred');
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      closeEditor();
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onKeyDown={handleKeyDown}>
      <div className="bg-[var(--color-bg-panel)] rounded-xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-full border border-slate-200">
        <div className="flex-none px-6 py-5 border-b border-[var(--color-border)]">
          <h2 className="text-xl font-bold text-[var(--color-text-primary)]">
            {selectedProduct ? 'Edit Product' : 'Add Product'}
          </h2>
        </div>
        
        <form id="product-form" onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 flex flex-col gap-5">
          {localError && (
            <div className="bg-[var(--color-danger-light)] border border-red-100 text-[var(--color-danger)] px-4 py-3 rounded-md text-sm font-medium">
              {localError}
            </div>
          )}
          
          <Input
            ref={barcodeInputRef}
            id="barcode"
            label="Barcode"
            type="text"
            value={barcode}
            onChange={e => setBarcode(e.target.value)}
            placeholder="Scan or type barcode (optional)"
            autoComplete="off"
          />
          
          <Input
            id="name"
            label="Product Name *"
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Milk 1L"
            autoComplete="off"
            required
          />
          
          <Input
            id="price"
            label="Selling Price *"
            type="number"
            step="0.01"
            min="0"
            value={price}
            onChange={e => setPrice(e.target.value)}
            placeholder="0.00"
            className="font-mono"
            required
          />
          
          {selectedProduct && (
            <div className="flex items-center gap-3 mt-2">
              <input
                id="isActive"
                type="checkbox"
                checked={isActive}
                onChange={e => setIsActive(e.target.checked)}
                className="w-4 h-4 text-[var(--color-brand)] border-slate-300 rounded focus:ring-[var(--color-brand)]"
              />
              <label htmlFor="isActive" className="text-sm font-medium text-[var(--color-text-primary)] cursor-pointer">
                Active Product
              </label>
            </div>
          )}
        </form>
        
        <div className="flex-none p-6 bg-slate-50 border-t border-[var(--color-border)] flex justify-end gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={closeEditor}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="product-form"
            disabled={isSaving}
          >
            {isSaving ? 'Saving...' : 'Save Product'}
          </Button>
        </div>
      </div>
    </div>
  );
}
