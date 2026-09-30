import { IBillRepository, HistoryListRow } from '../interfaces/IBillRepository';
import { BillHistoryListItemDTO, BillHistoryDetailDTO } from '../../shared/dto';

export class HistoryService {
  constructor(private readonly billRepo: IBillRepository) {}

  async getHistoryList(
    offset: number,
    limit: number,
    filters?: { startDate?: number; endDate?: number }
  ): Promise<{ items: BillHistoryListItemDTO[]; totalCount: number }> {
    if (limit <= 0) throw new Error('Limit must be greater than 0');
    if (offset < 0) throw new Error('Offset must be non-negative');

    const result = this.billRepo.getHistoryList(offset, limit, filters);

    const items: BillHistoryListItemDTO[] = result.items.map((row: HistoryListRow) => ({
      id: row.id,
      billNumber: row.bill_number,
      timestamp: row.finalized_at,
      totalMinor: row.total_minor,
      itemCount: row.item_count,
    }));

    return { items, totalCount: result.totalCount };
  }

  async getBillDetails(billId: number): Promise<BillHistoryDetailDTO | null> {
    const details = this.billRepo.getBillDetails(billId);
    if (!details) return null;

    return {
      id: details.id,
      billNumber: details.billNumber,
      timestamp: details.timestamp,
      totalMinor: details.totalMinor,
      shopName: details.shopName || 'Mini ERP Store', // Fallback for legacy bills
      shopAddress: details.shopAddress || undefined,
      shopPhone: details.shopPhone || undefined,
      items: details.items.map(item => ({
        snapshotName: item.snapshotName,
        snapshotPriceMinor: item.snapshotPriceMinor,
        quantity: item.quantity,
        lineTotalMinor: item.lineTotalMinor,
      })),
    };
  }

  async searchByBillNumber(billNumber: number): Promise<BillHistoryDetailDTO | null> {
    const billRow = this.billRepo.getBillByNumber(billNumber);
    if (!billRow) return null;

    return this.getBillDetails(billRow.id);
  }
}
