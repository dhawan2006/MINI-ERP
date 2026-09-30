import * as fs from 'fs';
import * as path from 'path';
import { app, dialog } from 'electron';
import { IBillRepository, BillItemRow } from '../../application/interfaces/IBillRepository';
import { ReceiptMapper } from '../../application/mappers/ReceiptMapper';
import { PdfReceiptRenderer, PdfRenderConfig } from './PdfReceiptRenderer';

// ---------------------------------------------------------------------------
// Result / Error types
// ---------------------------------------------------------------------------

export type PdfExportErrorCode =
  | 'PDF_BILL_NOT_FOUND'
  | 'PDF_GENERATION_FAILED'
  | 'PDF_SAVE_CANCELLED'
  | 'PDF_WRITE_FAILED'
  | 'PDF_OUTPUT_PERMISSION_DENIED'
  | 'PDF_DISK_FULL';

export class PdfExportError extends Error {
  constructor(
    public readonly code: PdfExportErrorCode,
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'PdfExportError';
  }
}

export interface PdfExportResult {
  filePath: string;
  billNumber: number;
}

/**
 * Session-scoped registry of successfully exported PDFs.
 * Used by openExportedFile to validate open requests (§30 security).
 */
const _exportedFiles = new Set<string>();

// ---------------------------------------------------------------------------
// PdfExportService
// ---------------------------------------------------------------------------

/**
 * Orchestrates PDF export for a finalized bill.
 *
 * Flow:
 *   billId → DB lookup → ReceiptMapper → PdfReceiptRenderer → save dialog → fs.writeFile
 *
 * Responsibilities:
 *   - Authoritative DB-based receipt retrieval (same pattern as PrintService)
 *   - PDF generation via PdfReceiptRenderer
 *   - OS save dialog via Electron dialog API
 *   - Filesystem write
 *   - Session-scoped export registry for secure shell.openPath gating
 *
 * Does NOT:
 *   - Perform financial calculations
 *   - Mutate bill or draft state
 *   - Expose shell or FS APIs to the renderer directly
 */
export class PdfExportService {
  private readonly renderer: PdfReceiptRenderer;

  constructor(
    private readonly billRepo: IBillRepository,
    private readonly renderConfig: PdfRenderConfig
  ) {
    this.renderer = new PdfReceiptRenderer();
  }

  /**
   * Export a finalized bill to PDF via OS save dialog.
   * Cancellation results in PdfExportError with code PDF_SAVE_CANCELLED.
   * All other errors are categorised with appropriate codes.
   */
  async exportBill(billId: number): Promise<PdfExportResult> {
    // 1. Authoritative bill fetch from DB
    const billRow = this.billRepo.getBillById(billId);
    if (!billRow) {
      throw new PdfExportError('PDF_BILL_NOT_FOUND', `Bill ${billId} not found in database`);
    }

    const items = this.billRepo.getBillItems(billId) as BillItemRow[];

    // 2. Map to ReceiptData via canonical mapper
    const persistedBill = {
      id: billRow.id,
      billNumber: billRow.bill_number,
      timestamp: billRow.finalized_at,
      totalMinor: billRow.total_minor,
      shopName: billRow.shop_name,
      shopAddress: billRow.shop_address,
      shopPhone: billRow.shop_phone,
      items: items.map((item: BillItemRow) => ({
        productId: item.product_id,
        snapshotName: item.snapshot_name,
        snapshotPriceMinor: item.snapshot_price_minor,
        quantity: item.quantity,
        lineTotalMinor: item.line_total_minor,
      })),
    };

    const receiptData = ReceiptMapper.toReceiptData(persistedBill);

    // 3. Generate PDF bytes — pure rendering, no financial recalculation
    let pdfBytes: Buffer;
    try {
      pdfBytes = await this.renderer.render(receiptData, this.renderConfig);
    } catch (err: unknown) {
      throw new PdfExportError(
        'PDF_GENERATION_FAILED',
        'PDF generation failed',
        err
      );
    }

    // 4. Determine default filename: Bill-001234.pdf
    const paddedNum = String(receiptData.billNumber).padStart(6, '0');
    const defaultFileName = `Bill-${paddedNum}.pdf`;

    // 5. OS save dialog — Main owns this, renderer never sees raw paths
    const downloadsPath = app.getPath('downloads');
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Export PDF Receipt',
      defaultPath: path.join(downloadsPath, defaultFileName),
      filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
      buttonLabel: 'Save PDF',
    });

    if (canceled || !filePath) {
      throw new PdfExportError('PDF_SAVE_CANCELLED', 'Save cancelled by user');
    }

    // 6. Write file
    try {
      await fs.promises.writeFile(filePath, pdfBytes);
    } catch (err: unknown) {
      if (err instanceof Error) {
        const nodeErr = err as NodeJS.ErrnoException;
        if (nodeErr.code === 'EACCES' || nodeErr.code === 'EPERM') {
          throw new PdfExportError('PDF_OUTPUT_PERMISSION_DENIED', 'Permission denied when saving PDF. Please choose a different folder.', err);
        }
        if (nodeErr.code === 'ENOSPC') {
          throw new PdfExportError('PDF_DISK_FULL', 'Not enough disk space to save the PDF.', err);
        }
      }
      throw new PdfExportError(
        'PDF_WRITE_FAILED',
        'Failed to write PDF file',
        err
      );
    }

    // 7. Register as a trusted exported file (for secure open gating)
    _exportedFiles.add(filePath);

    return { filePath, billNumber: receiptData.billNumber };
  }

  /**
   * Returns the session-scoped set of successfully exported file paths.
   * Used by the IPC handler to validate open requests.
   */
  static isTrustedExport(filePath: string): boolean {
    return _exportedFiles.has(filePath);
  }
}
