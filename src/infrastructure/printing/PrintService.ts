import { IPrinterAdapter } from './IPrinterAdapter';
import { EscPosPrinterAdapter } from './EscPosPrinterAdapter';
import { FakePrinterAdapter } from './FakePrinterAdapter';
import { PrintJobDTO, PrinterConfig, ReceiptData } from '../../shared/dto';
import { IBillRepository, BillRow, BillItemRow } from '../../application/interfaces/IBillRepository';
import { ReceiptMapper } from '../../application/mappers/ReceiptMapper';
import log from 'electron-log';

export class PrintService {
  private jobs = new Map<string, PrintJobDTO>();
  private jobIdCounter = 1;

  private printerAdapter: IPrinterAdapter;

  constructor(
    config: PrinterConfig,
    private readonly billRepo: IBillRepository
  ) {
    this.printerAdapter = this.createAdapter(config);
  }

  private createAdapter(config: PrinterConfig): IPrinterAdapter {
    if (config.transport === 'fake') {
      return new FakePrinterAdapter();
    }
    return new EscPosPrinterAdapter(config);
  }

  updateConfig(config: PrinterConfig) {
    this.printerAdapter = this.createAdapter(config);
  }

  async executeTestPrint(draftConfig: PrinterConfig): Promise<void> {
    if (!draftConfig.enabled) {
      throw new Error('PRINTER_NOT_CONFIGURED: Printer is disabled.');
    }

    const adapter = this.createAdapter(draftConfig);

    const dummyReceipt: ReceiptData = {
      billId: 0,
      billNumber: 0,
      timestamp: Date.now(),
      totalMinor: 0,
      shopName: 'Printer Test',
      shopAddress: 'Connection: OK',
      shopPhone: '1234567890',
      items: []
    };

    await adapter.print(dummyReceipt);
  }

  async createPrintJob(billId: number): Promise<string> {
    const bill = this.billRepo.getBillById(billId);
    if (!bill) {
      throw new Error(`Cannot create print job: Bill ${billId} not found`);
    }
    
    // Check for existing FAILED jobs to avoid duplicate retries creating new IDs if we want to deduplicate
    // However, the spec says "printing.retry(printJobId) or printing.createPrintJob(billId)"
    // We'll just create a new job ID for simplicity, or use a composite key. Let's use an incrementing ID.
    const jobId = `job-${Date.now()}-${this.jobIdCounter++}`;

    const job: PrintJobDTO = {
      jobId,
      billId,
      state: 'QUEUED',
      createdAt: Date.now()
    };

    this.jobs.set(jobId, job);

    // Fire and forget asynchronous printing
    this.processJob(jobId).catch(err => log.error('[PrintService] Print job process error:', err));

    return jobId;
  }

  async retryPrintJob(billId: number): Promise<string> {
    // Retry uses the same finalized bill. We just create a new print job for it.
    return this.createPrintJob(billId);
  }

  getJobStatus(jobId: string): PrintJobDTO | null {
    return this.jobs.get(jobId) || null;
  }

  private async processJob(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job || job.state !== 'QUEUED') return;

    job.state = 'PRINTING';

    try {
      // Reconstruct receipt data from SQLite
      const billRow = this.billRepo.getBillById(job.billId) as BillRow | null;
      const itemRows = this.billRepo.getBillItems(job.billId) as BillItemRow[];

      if (!billRow) throw new Error('Bill not found during print execution');

      const persistedBill = {
        id: billRow.id,
        billNumber: billRow.bill_number,
        timestamp: billRow.finalized_at,
        totalMinor: billRow.total_minor,
        shopName: billRow.shop_name,
        shopAddress: billRow.shop_address,
        shopPhone: billRow.shop_phone,
        items: itemRows.map(item => ({
          productId: item.product_id,
          snapshotName: item.snapshot_name,
          snapshotPriceMinor: item.snapshot_price_minor,
          quantity: item.quantity,
          lineTotalMinor: item.line_total_minor
        }))
      };

      const receiptData = ReceiptMapper.toReceiptData(persistedBill);

      await this.printerAdapter.print(receiptData);

      job.state = 'ACCEPTED';
      job.error = undefined;
    } catch (error: unknown) {
      job.state = 'FAILED';
      job.error = error instanceof Error ? error.message : 'Unknown print error';
    }
  }
}
