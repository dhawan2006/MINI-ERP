import { useEffect } from 'react';
import { useProductStore } from '../../state/productStore';
import { Button } from '../ui/Button';

export function ProductCatalogPanel() {
  const { 
    products, 
    searchTerm, 
    setSearchTerm, 
    isLoading, 
    error,
    openEditor,
    showInactive,
    setShowInactive,
    selectedProduct,
    setSelectedProduct,
    setProducts,
    setLoading,
    setError
  } = useProductStore();

  useEffect(() => {
    let mounted = true;

    async function loadProducts() {
      try {
        setLoading(true);
        setError(null);
        
        let result;
        if (searchTerm.trim() === '') {
          result = await window.api.products.list(1000, 0, showInactive);
        } else {
          result = await window.api.products.search(searchTerm, 1000, showInactive);
        }

        if (mounted) {
          if (result.success && result.data) {
            setProducts(result.data);
          } else {
            setError(result.error?.message || 'Failed to fetch products');
          }
        }
      } catch (err: any) {
        if (mounted) {
          setError(err.message || 'An unexpected error occurred');
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    loadProducts();

    return () => {
      mounted = false;
    };
  }, [searchTerm, showInactive, setProducts, setLoading, setError]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-none p-6 pb-4 border-b border-slate-100 flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">Product Catalog</h2>
        <Button onClick={() => openEditor()}>
          + Add Product
        </Button>
      </div>
      
      {/* Search & Filter */}
      <div className="flex-none px-6 py-4 bg-slate-50/50 border-b border-slate-100 flex items-center gap-4">
        <div className="flex-1 relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search products..."
            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-shadow"
          />
        </div>
        
        <div className="w-40">
          <select
            value={showInactive ? 'all' : 'active'}
            onChange={(e) => setShowInactive(e.target.value === 'all')}
            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-shadow cursor-pointer appearance-none"
            style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`, backgroundPosition: 'right .5rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.5em 1.5em', paddingRight: '2.5rem' }}
          >
            <option value="active">Active Only</option>
            <option value="all">All Status</option>
          </select>
        </div>
      </div>

      {/* Table Content */}
      <div className="flex-1 overflow-auto">
        {error && (
          <div className="m-6 bg-red-50 text-red-600 p-4 rounded-lg border border-red-100 font-medium text-sm">
            {error}
          </div>
        )}
        
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-white sticky top-0 z-10 shadow-sm">
            <tr>
              <th scope="col" className="px-6 py-3.5 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider w-16">
                Image
              </th>
              <th scope="col" className="px-6 py-3.5 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Name
              </th>
              <th scope="col" className="px-6 py-3.5 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Barcode
              </th>
              <th scope="col" className="px-6 py-3.5 text-right text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Price
              </th>
              <th scope="col" className="px-6 py-3.5 text-center text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Status
              </th>
              <th scope="col" className="px-6 py-3.5 text-right text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Action
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-100">
            {isLoading && products.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-slate-500 font-medium">
                  Loading products...
                </td>
              </tr>
            ) : products.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-slate-500 font-medium">
                  No products found.
                </td>
              </tr>
            ) : (
              products.map((product) => {
                const isSelected = selectedProduct?.id === product.id;
                return (
                  <tr 
                    key={product.id} 
                    onClick={() => setSelectedProduct(product)}
                    className={`
                      cursor-pointer transition-colors group
                      ${!product.isActive ? 'opacity-60' : ''}
                      ${isSelected ? 'bg-indigo-50/60' : 'hover:bg-slate-50'}
                    `}
                  >
                    <td className="px-6 py-3 whitespace-nowrap">
                      <div className="w-10 h-10 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
                      </div>
                    </td>
                    <td className="px-6 py-3 whitespace-nowrap">
                      <div className={`text-sm font-semibold ${isSelected ? 'text-indigo-900' : 'text-slate-900'}`}>
                        {product.name}
                      </div>
                    </td>
                    <td className="px-6 py-3 whitespace-nowrap">
                      <div className="text-sm font-mono text-slate-500">
                        {product.barcode || '-'}
                      </div>
                    </td>
                    <td className="px-6 py-3 whitespace-nowrap text-right">
                      <div className={`text-sm font-mono font-bold ${isSelected ? 'text-indigo-700' : 'text-slate-900'}`}>
                        ₹{(product.priceMinor / 100).toFixed(2)}
                      </div>
                    </td>
                    <td className="px-6 py-3 whitespace-nowrap text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${product.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                        {product.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-3 whitespace-nowrap text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="!px-3 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
                          onClick={() => openEditor(product)}
                        >
                          Edit
                        </Button>
                        <button className="w-8 h-8 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="flex-none px-6 py-4 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between">
        <span className="text-sm font-medium text-slate-500">
          Showing {products.length} products
        </span>
      </div>
    </div>
  );
}
