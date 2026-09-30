import { PersistedBill } from '../interfaces/IBillRepository';
import { ReceiptData } from '../../shared/dto';

export class ReceiptMapper {
  static toReceiptData(persistedBill: PersistedBill): ReceiptData {
    return {
      billId: persistedBill.id,
      billNumber: persistedBill.billNumber,
      timestamp: persistedBill.timestamp,
      totalMinor: persistedBill.totalMinor,
      shopName: persistedBill.shopName || 'Mini ERP Store',
      shopAddress: persistedBill.shopAddress || undefined,
      shopPhone: persistedBill.shopPhone || undefined,
      items: persistedBill.items.map(item => ({
        snapshotName: item.snapshotName,
        snapshotPriceMinor: item.snapshotPriceMinor,
        quantity: item.quantity,
        lineTotalMinor: item.lineTotalMinor
      }))
    };
  }
}
