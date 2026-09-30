import { describe, it, expect } from 'vitest';
import { EscPosReceiptRenderer } from '../../../src/infrastructure/printing/escpos/EscPosReceiptRenderer';
import { PrinterConfig, ReceiptData } from '../../../src/shared/dto';

describe('EscPosReceiptRenderer', () => {
  const getBaseConfig = (): PrinterConfig => ({
    enabled: true,
    transport: 'network',
    host: '127.0.0.1',
    port: 9100,
    paperWidth: 80,
    charactersPerLine: 48,
    supportsCut: true,
    feedLines: 3,
    encoding: 'ascii'
  });

  const getReceipt = (): ReceiptData => ({
    billId: 1,
    billNumber: 100,
    timestamp: 1672531200000,
    shopName: 'Mini Mart',
    shopAddress: '123 Main St',
    items: [
      { snapshotName: 'Apple', snapshotPriceMinor: 10000, quantity: 2, lineTotalMinor: 20000 },
    ],
    totalMinor: 20000
  });

  it('renders a short receipt deterministically (48 chars width)', () => {
    const config = getBaseConfig();
    const renderer = new EscPosReceiptRenderer(config);
    const receipt = getReceipt();
    
    const bytes = renderer.render(receipt);
    
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(0);
    
    // Check for init command
    expect(bytes[0]).toBe(0x1B);
    expect(bytes[1]).toBe(0x40);

    // Instead of asserting exact bytes array (which is fragile for timestamps), 
    // we'll decode and check the text structure, but the renderer is deterministic for given ReceiptData.
    const text = new TextDecoder().decode(bytes);
    
    // Header
    expect(text).toContain('Mini Mart');
    expect(text).toContain('123 Main St');
    
    // Line separator is exactly 48 dashes
    expect(text).toContain('-'.repeat(48));
    
    // Items column format
    expect(text).toContain('ITEM');
    expect(text).toContain('QTY');
    expect(text).toContain('AMOUNT');
    
    // Item formatting: "Apple" + padding
    expect(text).toContain('Apple');
    
    // Total formatting
    expect(text).toContain('TOTAL: 200.00');

    // Cut command (if supportsCut = true)
    // 0x1D 0x56 0x01 (Partial cut) -> in string representation it's tricky, we can check bytes directly
    expect(bytes[bytes.length - 3]).toBe(0x1D);
    expect(bytes[bytes.length - 2]).toBe(0x56);
    expect(bytes[bytes.length - 1]).toBe(0x01); // partial cut
  });

  it('wraps long product names without breaking columns', () => {
    const config = getBaseConfig();
    const renderer = new EscPosReceiptRenderer(config);
    const receipt = getReceipt();
    receipt.items[0].snapshotName = 'Extremely Long Product Name That Will Need Wrapping On Paper';
    
    const text = new TextDecoder().decode(renderer.render(receipt));
    
    // Check it breaks up the name nicely
    expect(text).toContain('Extremely Long Product Name That');
    expect(text).toContain('Will Need Wrapping On Paper');
  });

  it('adjusts width correctly for 58mm profiles', () => {
    const config = getBaseConfig();
    config.paperWidth = 58;
    config.charactersPerLine = 32;
    
    const renderer = new EscPosReceiptRenderer(config);
    const receipt = getReceipt();
    receipt.items[0].snapshotName = 'A Somewhat Long Name For Small Paper';
    
    const text = new TextDecoder().decode(renderer.render(receipt));
    
    // 32 dashed line
    expect(text).toContain('-'.repeat(32));
    expect(text).not.toContain('-'.repeat(33));

    // Name wraps earlier
    expect(text).toContain('A Somewhat Long');
  });

  it('replaces unsupported Rupee symbol with fallback in ascii mode', () => {
    const config = getBaseConfig();
    config.encoding = 'ascii';
    const renderer = new EscPosReceiptRenderer(config);
    
    const receipt = getReceipt();
    receipt.items[0].snapshotName = 'Product with ₹ inside';
    
    const text = new TextDecoder().decode(renderer.render(receipt));
    expect(text).toContain('Product with Rs. inside');
    expect(text).not.toContain('₹');
  });
});
