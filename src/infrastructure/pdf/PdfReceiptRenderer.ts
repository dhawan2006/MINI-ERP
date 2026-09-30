import { PDFDocument, rgb, PDFFont } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import * as fs from 'fs';
import { ReceiptData } from '../../shared/dto';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface PdfRenderConfig {
  paperWidth: 58 | 80;
  /** Absolute path to the NotoSans TTF font file to embed. */
  fontPath: string;
}

// Points per mm (1pt = 1/72 inch; 1mm = 1/25.4 inch → pt/mm = 72/25.4)
const PT_PER_MM = 72 / 25.4;

// Paper widths in points
const PAPER_WIDTH_PT: Record<58 | 80, number> = {
  58: Math.round(58 * PT_PER_MM * 100) / 100, // ≈164.41 pt
  80: Math.round(80 * PT_PER_MM * 100) / 100, // ≈226.77 pt
};

// Left/right margin in points
const MARGIN = 10;

// Font sizes
const SIZE_SHOP = 9;
const SIZE_BODY = 7;
const SIZE_HEADER = 7;
const SIZE_TOTAL = 9;

// Line height multiplier
const LINE_HEIGHT = 1.4;

// Column proportions (as fractions of printable width)
// qty col: fixed ~26pt; amount col: fixed ~62pt; name col: remainder
const QTY_COL_WIDTH = 24;
const AMT_COL_WIDTH_80 = 62;
const AMT_COL_WIDTH_58 = 44;

// ---------------------------------------------------------------------------
// PdfReceiptRenderer
// ---------------------------------------------------------------------------

/**
 * Pure renderer: converts ReceiptData + config into PDF bytes (Buffer).
 *
 * Responsibilities:
 *   - Layout computation
 *   - Text wrapping
 *   - pdf-lib draw calls
 *
 * Must NOT:
 *   - show dialogs
 *   - write files
 *   - access SQLite
 *   - access BrowserWindow
 *   - perform financial calculations
 */
export class PdfReceiptRenderer {
  /**
   * Render ReceiptData into a PDF Buffer.
   * Financial values (totalMinor, lineTotalMinor) are used directly from
   * ReceiptData and are never recalculated inside this method.
   */
  async render(receipt: ReceiptData, config: PdfRenderConfig): Promise<Buffer> {
    const fontBytes = fs.readFileSync(config.fontPath);

    // -----------------------------------------------------------------------
    // Font helpers (all sizing uses widthOfTextAtSize for precision layout)
    // -----------------------------------------------------------------------
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    const font = await doc.embedFont(fontBytes);
    const boldFont = await doc.embedFont(fontBytes); // Same font; bold via size emphasis

    const pageWidth = PAPER_WIDTH_PT[config.paperWidth];
    const printableWidth = pageWidth - MARGIN * 2;
    const amtColWidth = config.paperWidth === 80 ? AMT_COL_WIDTH_80 : AMT_COL_WIDTH_58;
    const nameColWidth = printableWidth - QTY_COL_WIDTH - amtColWidth;

    // -----------------------------------------------------------------------
    // Measure all lines before drawing (to compute dynamic page height)
    // -----------------------------------------------------------------------
    type DrawLine =
      | { kind: 'text'; text: string; x: number; size: number; isBold?: boolean }
      | { kind: 'hline' }
      | { kind: 'spacer'; h: number };

    const lines: DrawLine[] = [];
    const lineH = (size: number) => size * LINE_HEIGHT;

    // --- Header ---
    lines.push({ kind: 'text', text: receipt.shopName, x: 0, size: SIZE_SHOP, isBold: true });
    if (receipt.shopAddress) {
      const addrLines = this.wrapText(receipt.shopAddress, nameColWidth + QTY_COL_WIDTH + amtColWidth, font, SIZE_BODY);
      for (const l of addrLines) lines.push({ kind: 'text', text: l, x: 0, size: SIZE_BODY });
    }
    if (receipt.shopPhone) {
      lines.push({ kind: 'text', text: `Tel: ${receipt.shopPhone}`, x: 0, size: SIZE_BODY });
    }
    lines.push({ kind: 'spacer', h: 4 });

    // --- Bill metadata ---
    const dateStr = new Date(receipt.timestamp).toLocaleString('en-IN', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false
    });
    lines.push({ kind: 'text', text: `Bill No: ${receipt.billNumber}`, x: MARGIN, size: SIZE_BODY });
    lines.push({ kind: 'text', text: `Date: ${dateStr}`, x: MARGIN, size: SIZE_BODY });
    lines.push({ kind: 'spacer', h: 4 });

    // --- Column headers ---
    lines.push({ kind: 'hline' });
    lines.push({ kind: 'text', text: '__COLHEADER__', x: 0, size: SIZE_HEADER, isBold: true });
    lines.push({ kind: 'hline' });

    // --- Items ---
    for (const item of receipt.items) {
      // Use lineTotalMinor directly — never recalculate
      const amtStr = this.formatMinor(item.lineTotalMinor);
      const qtyStr = String(item.quantity);
      const nameLines = this.wrapText(item.snapshotName, nameColWidth, font, SIZE_BODY);

      // First line: name + qty + amount
      lines.push({
        kind: 'text',
        text: `__ITEM__${nameLines[0]}|||${qtyStr}|||${amtStr}`,
        x: 0,
        size: SIZE_BODY,
      });
      // Continuation lines: name only
      for (let i = 1; i < nameLines.length; i++) {
        lines.push({ kind: 'text', text: `__ITEMCONT__${nameLines[i]}`, x: 0, size: SIZE_BODY });
      }
    }

    lines.push({ kind: 'hline' });

    // --- Total — use totalMinor directly, never sum items ---
    lines.push({
      kind: 'text',
      text: `__TOTAL__${this.formatMinor(receipt.totalMinor)}`,
      x: 0,
      size: SIZE_TOTAL,
      isBold: true,
    });

    lines.push({ kind: 'hline' });

    // --- Footer ---
    lines.push({ kind: 'spacer', h: 3 });
    lines.push({ kind: 'text', text: 'Thank you for your purchase!', x: 0, size: SIZE_BODY });
    lines.push({ kind: 'spacer', h: 8 });

    // -----------------------------------------------------------------------
    // Compute total page height
    // -----------------------------------------------------------------------
    let totalHeight = MARGIN * 2; // top + bottom margins
    for (const line of lines) {
      if (line.kind === 'text') {
        totalHeight += lineH(line.size);
      } else if (line.kind === 'hline') {
        totalHeight += 6; // hline padding above/below + 1pt rule
      } else if (line.kind === 'spacer') {
        totalHeight += line.h;
      }
    }

    const pageHeight = Math.max(totalHeight, 100); // minimum 100pt

    // -----------------------------------------------------------------------
    // Draw everything on a single page
    // -----------------------------------------------------------------------
    const page = doc.addPage([pageWidth, pageHeight]);
    let y = pageHeight - MARGIN; // current y cursor, descending

    const drawText = (text: string, x: number, size: number, bold = false, alignRight = false) => {
      const f = bold ? boldFont : font;
      if (alignRight) {
        const w = f.widthOfTextAtSize(text, size);
        x = pageWidth - MARGIN - w;
      }
      page.drawText(text, { x, y: y - size, size, font: f, color: rgb(0, 0, 0) });
    };

    const advanceLine = (size: number) => {
      y -= lineH(size);
    };

    const drawHLine = () => {
      y -= 3;
      page.drawLine({
        start: { x: MARGIN, y },
        end: { x: pageWidth - MARGIN, y },
        thickness: 0.5,
        color: rgb(0.4, 0.4, 0.4),
      });
      y -= 3;
    };

    for (const line of lines) {
      if (line.kind === 'spacer') {
        y -= line.h;
        continue;
      }

      if (line.kind === 'hline') {
        drawHLine();
        continue;
      }

      // --- text line ---
      const { text, size, isBold } = line;

      if (text === '__COLHEADER__') {
        // Item | Qty | Amount header row
        drawText('ITEM', MARGIN, size, true);
        const qtyX = MARGIN + nameColWidth + QTY_COL_WIDTH - font.widthOfTextAtSize('QTY', size);
        drawText('QTY', qtyX, size, true);
        const amtX = pageWidth - MARGIN - font.widthOfTextAtSize('AMOUNT', size);
        drawText('AMOUNT', amtX, size, true);
        advanceLine(size);

      } else if (text.startsWith('__ITEM__')) {
        // Item data row — name | qty | amount
        const payload = text.slice('__ITEM__'.length);
        const [namePart, qtyPart, amtPart] = payload.split('|||');
        drawText(namePart, MARGIN, size, false);

        // Qty: right-aligned within qty column area
        const qtyAreaRight = MARGIN + nameColWidth + QTY_COL_WIDTH;
        const qtyW = font.widthOfTextAtSize(qtyPart, size);
        drawText(qtyPart, qtyAreaRight - qtyW, size, false);

        // Amount: right-aligned to page right margin
        const amtW = font.widthOfTextAtSize(amtPart, size);
        drawText(amtPart, pageWidth - MARGIN - amtW, size, false);

        advanceLine(size);

      } else if (text.startsWith('__ITEMCONT__')) {
        // Continuation line for wrapped item name
        const namePart = text.slice('__ITEMCONT__'.length);
        drawText(namePart, MARGIN, size, false);
        advanceLine(size);

      } else if (text.startsWith('__TOTAL__')) {
        // Total row: right-aligned
        const totalStr = `TOTAL: ${text.slice('__TOTAL__'.length)}`;
        const totalW = boldFont.widthOfTextAtSize(totalStr, size);
        drawText(totalStr, pageWidth - MARGIN - totalW, size, true);
        advanceLine(size);

      } else {
        // Generic centered or left text
        const isCenter = line.x === 0 && (
          text === receipt.shopName ||
          text === receipt.shopAddress ||
          (receipt.shopPhone && text === `Tel: ${receipt.shopPhone}`) ||
          text === 'Thank you for your purchase!'
        );

        if (isCenter) {
          const textW = font.widthOfTextAtSize(text, size);
          const cx = (pageWidth - textW) / 2;
          drawText(text, cx, size, isBold);
        } else {
          drawText(text, MARGIN, size, isBold);
        }
        advanceLine(size);
      }
    }

    const pdfBytes = await doc.save();
    return Buffer.from(pdfBytes);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Wraps text to fit within maxWidth points using the provided font at the
   * given size. Handles long unbreakable strings by hard-splitting.
   */
  private wrapText(text: string, maxWidth: number, font: PDFFont, size: number): string[] {
    if (font.widthOfTextAtSize(text, size) <= maxWidth) return [text];

    const words = text.split(' ');
    const lines: string[] = [];
    let current = '';

    for (const word of words) {
      if (font.widthOfTextAtSize(word, size) > maxWidth) {
        // Hard-split an unbreakable word
        if (current) { lines.push(current); current = ''; }
        let rem = word;
        while (font.widthOfTextAtSize(rem, size) > maxWidth) {
          // Binary search for split point
          let lo = 1, hi = rem.length;
          while (lo < hi) {
            const mid = Math.floor((lo + hi + 1) / 2);
            if (font.widthOfTextAtSize(rem.slice(0, mid), size) <= maxWidth) lo = mid;
            else hi = mid - 1;
          }
          lines.push(rem.slice(0, lo));
          rem = rem.slice(lo);
        }
        current = rem;
      } else {
        const candidate = current ? `${current} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
          current = candidate;
        } else {
          lines.push(current);
          current = word;
        }
      }
    }
    if (current) lines.push(current);
    return lines.length > 0 ? lines : [''];
  }

  /** Format paise amount as ₹XX.XX — display only, never recalculates. */
  private formatMinor(amountMinor: number): string {
    return `\u20b9${(amountMinor / 100).toFixed(2)}`;
  }
}
