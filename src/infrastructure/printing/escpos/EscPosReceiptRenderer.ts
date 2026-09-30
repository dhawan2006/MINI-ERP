import { ReceiptData } from '../../../shared/dto';
import { EscPosEncoder, EscPosEncoding, AsciiEncoding } from './EscPosEncoder';
import { PrinterConfig } from '../../../shared/dto';

export class EscPosReceiptRenderer {
  constructor(private config: PrinterConfig) {}

  render(receipt: ReceiptData): Uint8Array {
    let encoding: EscPosEncoding;
    if (this.config.encoding === 'ascii') {
      encoding = new AsciiEncoding();
    } else {
      // Default fallback
      encoding = new AsciiEncoding();
    }

    const encoder = new EscPosEncoder(encoding);

    encoder.initialize();
    
    // Header
    encoder.alignCenter();
    encoder.bold(true);
    encoder.line(receipt.shopName);
    encoder.bold(false);
    
    if (receipt.shopAddress) {
      encoder.line(receipt.shopAddress);
    }
    if (receipt.shopPhone) {
      encoder.line(`Tel: ${receipt.shopPhone}`);
    }
    
    encoder.line();
    encoder.alignLeft();
    encoder.line(`Bill No: ${receipt.billNumber}`);
    encoder.line(`Date: ${new Date(receipt.timestamp).toLocaleString()}`);
    encoder.line();

    // Line Separator
    const sep = '-'.repeat(this.config.charactersPerLine);
    encoder.line(sep);

    // Columns
    const qtyWidth = 4;
    const amtWidth = 8;
    const spacing = 1;
    const itemWidth = this.config.charactersPerLine - qtyWidth - amtWidth - (spacing * 2);

    encoder.line(this.formatRow('ITEM', 'QTY', 'AMOUNT', itemWidth, qtyWidth, amtWidth, spacing));
    encoder.line(sep);

    // Items
    for (const item of receipt.items) {
      const amtStr = (item.lineTotalMinor / 100).toFixed(2);
      const qtyStr = item.quantity.toString();
      
      const wrappedNameLines = this.wrapText(item.snapshotName, itemWidth);
      
      // First line gets Qty and Amt
      encoder.line(this.formatRow(wrappedNameLines[0], qtyStr, amtStr, itemWidth, qtyWidth, amtWidth, spacing));
      
      // Subsequent lines just get the name part
      for (let i = 1; i < wrappedNameLines.length; i++) {
        encoder.line(this.padRight(wrappedNameLines[i], this.config.charactersPerLine));
      }
    }

    encoder.line(sep);

    // Total
    encoder.alignRight();
    encoder.bold(true);
    encoder.line(`TOTAL: ${(receipt.totalMinor / 100).toFixed(2)}`);
    encoder.bold(false);
    encoder.alignLeft();

    encoder.line(sep);
    encoder.line();
    encoder.alignCenter();
    encoder.line('Thank You');
    
    encoder.feed(this.config.feedLines);

    if (this.config.supportsCut) {
      encoder.cut(false);
    }

    return encoder.getBytes();
  }

  private wrapText(text: string, maxWidth: number): string[] {
    if (text.length <= maxWidth) return [text];
    
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      // If a single word is longer than maxWidth, we must hard-split it
      if (word.length > maxWidth) {
        if (currentLine) {
          lines.push(currentLine);
          currentLine = '';
        }
        let remaining = word;
        while (remaining.length > maxWidth) {
          lines.push(remaining.substring(0, maxWidth));
          remaining = remaining.substring(maxWidth);
        }
        if (remaining) {
          currentLine = remaining;
        }
      } else {
        if (currentLine.length + 1 + word.length <= maxWidth) {
          currentLine = currentLine ? `${currentLine} ${word}` : word;
        } else {
          lines.push(currentLine);
          currentLine = word;
        }
      }
    }
    if (currentLine) {
      lines.push(currentLine);
    }

    return lines;
  }

  private formatRow(col1: string, col2: string, col3: string, w1: number, w2: number, w3: number, spacing: number): string {
    const p1 = this.padRight(col1, w1);
    const p2 = this.padLeft(col2, w2);
    const p3 = this.padLeft(col3, w3);
    const space = ' '.repeat(spacing);
    return `${p1}${space}${p2}${space}${p3}`;
  }

  private padRight(str: string, len: number): string {
    if (str.length >= len) return str.substring(0, len);
    return str + ' '.repeat(len - str.length);
  }

  private padLeft(str: string, len: number): string {
    if (str.length >= len) return str.substring(0, len);
    return ' '.repeat(len - str.length) + str;
  }
}
