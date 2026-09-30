import { ipcMain } from 'electron';
import { ProductService } from '../../src/application/use-cases/ProductService';
import { IpcResponse } from '../../src/shared/ipc-contracts';
import { ProductDTO } from '../../src/shared/dto';
import { translateError, mapProductToDTO } from './mappers';
import { validateString, validateNumber, validateBoolean } from './validation';

export function registerProductHandlers(productService: ProductService) {
  
  ipcMain.handle('products:findByBarcode', async (_, barcode: string): Promise<IpcResponse<ProductDTO | null>> => {
    try {
      validateString(barcode, 'barcode');
      const product = productService.searchProducts(barcode, 1).find(p => p.barcode === barcode && p.isActive);
      return {
        success: true,
        data: product ? mapProductToDTO(product) : null
      };
    } catch (error) {
      return {
        success: false,
        error: translateError(error)
      };
    }
  });

  ipcMain.handle('products:searchActiveByPrefix', async (_, prefix: string): Promise<IpcResponse<ProductDTO[]>> => {
    try {
      validateString(prefix, 'prefix');
      const products = productService.searchProducts(prefix, 20, false);
      return {
        success: true,
        data: products.map(mapProductToDTO)
      };
    } catch (error) {
      return {
        success: false,
        error: translateError(error)
      };
    }
  });

  ipcMain.handle('products:create', async (_, name: string, priceMinor: number, barcode?: string | null): Promise<IpcResponse<ProductDTO>> => {
    try {
      validateString(name, 'name');
      validateNumber(priceMinor, 'priceMinor');
      const product = productService.createProduct(name, priceMinor, barcode);
      return { success: true, data: mapProductToDTO(product) };
    } catch (error) {
      return { success: false, error: translateError(error) };
    }
  });

  ipcMain.handle('products:update', async (_, id: string, name?: string, priceMinor?: number, barcode?: string | null): Promise<IpcResponse<ProductDTO>> => {
    try {
      validateString(id, 'id');
      if (name !== undefined) validateString(name, 'name');
      if (priceMinor !== undefined) validateNumber(priceMinor, 'priceMinor');
      if (barcode !== undefined && barcode !== null) validateString(barcode, 'barcode');
      
      const product = productService.updateProduct(id, name, priceMinor, barcode);
      return { success: true, data: mapProductToDTO(product) };
    } catch (error) {
      return { success: false, error: translateError(error) };
    }
  });

  ipcMain.handle('products:setActive', async (_, id: string, isActive: boolean): Promise<IpcResponse<void>> => {
    try {
      validateString(id, 'id');
      validateBoolean(isActive, 'isActive');
      productService.setProductActive(id, isActive);
      return { success: true };
    } catch (error) {
      return { success: false, error: translateError(error) };
    }
  });

  ipcMain.handle('products:list', async (_, limit: number, offset: number, includeInactive?: boolean): Promise<IpcResponse<ProductDTO[]>> => {
    try {
      validateNumber(limit, 'limit');
      validateNumber(offset, 'offset');
      const products = productService.listProducts(limit, offset, includeInactive);
      return { success: true, data: products.map(mapProductToDTO) };
    } catch (error) {
      return { success: false, error: translateError(error) };
    }
  });

  ipcMain.handle('products:search', async (_, term: string, limit: number, includeInactive?: boolean): Promise<IpcResponse<ProductDTO[]>> => {
    try {
      validateString(term, 'term');
      validateNumber(limit, 'limit');
      const products = productService.searchProducts(term, limit, includeInactive);
      return { success: true, data: products.map(mapProductToDTO) };
    } catch (error) {
      return { success: false, error: translateError(error) };
    }
  });

  ipcMain.handle('products:deleteAll', async (): Promise<IpcResponse<void>> => {
    try {
      productService.deleteAllProducts();
      return { success: true };
    } catch (error) {
      return { success: false, error: translateError(error) };
    }
  });
}
