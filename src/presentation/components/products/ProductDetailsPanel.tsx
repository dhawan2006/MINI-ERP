import { useProductStore } from '../../state/productStore';
import { Button } from '../ui/Button';

export function ProductDetailsPanel() {
  const { selectedProduct, openEditor } = useProductStore();

  if (!selectedProduct) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-50/30">
        <div className="w-16 h-16 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-slate-300 shadow-sm mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
        </div>
        <h3 className="text-lg font-bold text-slate-900 mb-2">Select a product</h3>
        <p className="text-sm text-slate-500 max-w-[200px] leading-relaxed">
          Choose a product from the catalog to view its details.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white">
      {/* Detail Header / Image */}
      <div className="flex-none p-6 pb-0 flex flex-col items-center">
        <div className="w-32 h-32 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 mb-6 shadow-sm">
          <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
        </div>
        <h2 className="text-xl font-extrabold text-slate-900 text-center leading-tight mb-2">
          {selectedProduct.name}
        </h2>
        <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider ${selectedProduct.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
          {selectedProduct.isActive ? 'Active' : 'Inactive'}
        </span>
      </div>

      {/* Detail Info */}
      <div className="flex-1 overflow-auto p-6 mt-4">
        <div className="space-y-6">
          
          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              Barcode
            </label>
            <div className="text-base font-mono font-semibold text-slate-800">
              {selectedProduct.barcode || 'Not assigned'}
            </div>
          </div>
          
          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              Selling Price
            </label>
            <div className="text-2xl font-mono font-bold text-indigo-600">
              ₹{(selectedProduct.priceMinor / 100).toFixed(2)}
            </div>
          </div>
          
        </div>
      </div>

      {/* Actions */}
      <div className="flex-none p-6 border-t border-slate-100 bg-slate-50/50">
        <Button 
          className="w-full justify-center shadow-sm"
          onClick={() => openEditor(selectedProduct)}
        >
          Edit Product
        </Button>
      </div>
    </div>
  );
}
