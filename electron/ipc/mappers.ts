import { DomainError } from '../../src/domain/errors';
import { IpcError } from '../../src/shared/ipc-contracts';
import { ActiveBill } from '../../src/domain/entities/ActiveBill';
import { Product } from '../../src/domain/entities/Product';
import { ActiveBillDTO, ProductDTO } from '../../src/shared/dto';

export function translateError(error: unknown): IpcError {

  if (error instanceof DomainError) {
    // We send back the exact class name as the error code, e.g., 'InvalidQuantityError'
    return {
      code: error.constructor.name,
      message: error.message
    };
  }

  if (error instanceof Error && (error as any).code === 'RESTORE_IN_PROGRESS') {
    return { code: 'RESTORE_IN_PROGRESS', message: error.message };
  }

  // Fallback for infrastructure errors (SQLite) or unexpected errors
  // We NEVER send raw SQLite errors or stack traces to the renderer!
  return {
    code: 'INTERNAL_ERROR',
    message: 'An internal application error occurred.'
  };
}

export function mapActiveBillToDTO(bill: ActiveBill): ActiveBillDTO {
  return {
    items: bill.items.map(item => ({
      productId: item.productId,
      snapshotName: item.snapshotName,
      snapshotPriceMinor: item.snapshotPriceMinor,
      quantity: item.quantity,
      lineTotalMinor: item.lineTotalMinor
    })),
    totalMinor: bill.totalMinor,
    isEmpty: bill.isEmpty
  };
}

export function mapProductToDTO(product: Product): ProductDTO {
  return {
    id: product.id,
    name: product.name,
    barcode: product.barcode,
    priceMinor: product.priceMinor,
    isActive: product.isActive
  };
}
