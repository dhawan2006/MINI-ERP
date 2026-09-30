import { create } from 'zustand';
import { ProductDTO } from '../../shared/dto';

interface ProductState {
  products: ProductDTO[];
  searchTerm: string;
  isLoading: boolean;
  error: string | null;
  isEditorOpen: boolean;
  selectedProduct: ProductDTO | null;
  showInactive: boolean;
  
  setProducts: (products: ProductDTO[]) => void;
  setSearchTerm: (term: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  openEditor: (product?: ProductDTO) => void;
  closeEditor: () => void;
  setShowInactive: (show: boolean) => void;
  setSelectedProduct: (product: ProductDTO | null) => void;
}

export const useProductStore = create<ProductState>((set) => ({
  products: [],
  searchTerm: '',
  isLoading: false,
  error: null,
  isEditorOpen: false,
  selectedProduct: null,
  showInactive: false,

  setProducts: (products) => set({ products }),
  setSearchTerm: (searchTerm) => set({ searchTerm }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  openEditor: (product) => set({ isEditorOpen: true, selectedProduct: product || null, error: null }),
  closeEditor: () => set({ isEditorOpen: false, error: null }), // Don't clear selectedProduct here!
  setShowInactive: (showInactive) => set({ showInactive }),
  setSelectedProduct: (product) => set({ selectedProduct: product }),
}));
