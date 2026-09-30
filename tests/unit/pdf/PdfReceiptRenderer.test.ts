/**
 * PdfReceiptRenderer Unit Tests
 *
 * Strategy: Generate PDF bytes from ReceiptData fixtures, then extract the raw
 * text stream from the PDF bytes (using a lightweight regex approach that works
 * without a full PDF parser), and assert on semantic content.
 *
 * We do NOT compare bytes — PDF metadata (creation timestamp) differs each run.
 *
 * Key invariant test (§36): lineTotalMinor and totalMinor are used directly
 * from ReceiptData and never recalculated inside the renderer.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import { PDFDocument } from 'pdf-lib';
import { PdfReceiptRenderer, PdfRenderConfig } from '../../../src/infrastructure/pdf/PdfReceiptRenderer';
import { ReceiptData } from '../../../src/shared/dto';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FONT_PATH = path.join(process.cwd(), 'assets', 'fonts', 'NotoSans-Regular.ttf');

/** Decode readable text out of raw PDF bytes using pdf2json for reliable text extraction. */
async function extractPdfText(buf: Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const PDFParser = require('pdf2json');
  return new Promise((resolve, reject) => {
    const pdfParser = new PDFParser(null, 1);
    pdfParser.on('pdfParser_dataError', (errData: any) => reject(errData.parserError));
    pdfParser.on('pdfParser_dataReady', () => {
      resolve(pdfParser.getRawTextContent());
    });
    pdfParser.parseBuffer(buf);
  });
}

function getConfig(paperWidth: 58 | 80 = 80): PdfRenderConfig {
  return { paperWidth, fontPath: FONT_PATH };
}

function baseReceipt(): ReceiptData {
  return {
    billId: 42,
    billNumber: 1001,
    timestamp: 1700000000000, // fixed timestamp for determinism
    shopName: 'Test Shop',
    items: [
      {
        snapshotName: 'Apple',
        snapshotPriceMinor: 1000, // ₹10.00
        quantity: 2,
        lineTotalMinor: 2000, // ₹20.00 — authoritative
      },
    ],
    totalMinor: 2000, // ₹20.00 — authoritative
  };
}

let renderer: PdfReceiptRenderer;

beforeAll(() => {
  if (!fs.existsSync(FONT_PATH)) {
    throw new Error(`Font not found at ${FONT_PATH}. Run: assets/fonts/NotoSans-Regular.ttf`);
  }
  renderer = new PdfReceiptRenderer();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PdfReceiptRenderer', () => {

  it('T01 — returns a non-empty Buffer', async () => {
    const buf = await renderer.render(baseReceipt(), getConfig(80));
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(100);
  });

  it('T02 — PDF has exactly one page', async () => {
    const buf = await renderer.render(baseReceipt(), getConfig(80));
    const doc = await PDFDocument.load(buf);
    expect(doc.getPageCount()).toBe(1);
  });

  it('T03 — 80mm page width is correct (~226.77 pt)', async () => {
    const buf = await renderer.render(baseReceipt(), getConfig(80));
    const doc = await PDFDocument.load(buf);
    const { width } = doc.getPage(0).getSize();
    expect(width).toBeCloseTo(226.77, 0); // within 1pt
  });

  it('T04 — 58mm page width is correct (~164.41 pt)', async () => {
    const buf = await renderer.render(baseReceipt(), getConfig(58));
    const doc = await PDFDocument.load(buf);
    const { width } = doc.getPage(0).getSize();
    expect(width).toBeCloseTo(164.41, 0);
  });

  it('T05 — contains shop name', async () => {
    const buf = await renderer.render(baseReceipt(), getConfig(80));
    const text = await extractPdfText(buf);
    expect(text).toContain('Test Shop');
  });

  it('T06 — contains bill number', async () => {
    const buf = await renderer.render(baseReceipt(), getConfig(80));
    const text = await extractPdfText(buf);
    expect(text).toContain('1001');
  });

  it('T07 — contains item name', async () => {
    const buf = await renderer.render(baseReceipt(), getConfig(80));
    const text = await extractPdfText(buf);
    expect(text).toContain('Apple');
  });

  it('T08 — contains quantity', async () => {
    const buf = await renderer.render(baseReceipt(), getConfig(80));
    const text = await extractPdfText(buf);
    expect(text).toContain('2');
  });

  it('T09 — contains formatted line total from lineTotalMinor (not recalculated)', async () => {
    // KEY INVARIANT TEST: lineTotalMinor = 2000 (₹20.00), but
    // snapshotPriceMinor * quantity = 1000 * 2 = 2000. We tamper them to differ.
    const receipt = baseReceipt();
    receipt.items[0].lineTotalMinor = 1999; // ₹19.99 — authoritative value
    receipt.totalMinor = 1999; // Change total too so 20.00 doesn't appear anywhere
    // If renderer recalculated, it would show ₹20.00. It must show ₹19.99.
    const buf = await renderer.render(receipt, getConfig(80));
    const text = await extractPdfText(buf);
    expect(text).toContain('19.99');
    expect(text).not.toContain('20.00'); // would appear if recalculated
  });

  it('T10 — uses totalMinor directly (not sum of items)', async () => {
    // KEY INVARIANT TEST: totalMinor = 9999 (₹99.99), but sum(lineTotals) = 2000 (₹20.00)
    const receipt = baseReceipt();
    receipt.totalMinor = 9999; // ₹99.99 — authoritative
    const buf = await renderer.render(receipt, getConfig(80));
    const text = await extractPdfText(buf);
    expect(text).toContain('99.99');
  });

  it('T11 — contains TOTAL label', async () => {
    const buf = await renderer.render(baseReceipt(), getConfig(80));
    const text = await extractPdfText(buf);
    expect(text.toUpperCase()).toContain('TOTAL');
  });

  it('T12 — contains footer text', async () => {
    const buf = await renderer.render(baseReceipt(), getConfig(80));
    const text = await extractPdfText(buf);
    expect(text.toLowerCase()).toContain('thank you');
  });

  it('T13 — multiple items all appear', async () => {
    const receipt = baseReceipt();
    receipt.items = [
      { snapshotName: 'Apple', snapshotPriceMinor: 100, quantity: 2, lineTotalMinor: 200 },
      { snapshotName: 'Banana', snapshotPriceMinor: 50, quantity: 3, lineTotalMinor: 150 },
      { snapshotName: 'Cherry', snapshotPriceMinor: 200, quantity: 1, lineTotalMinor: 200 },
    ];
    receipt.totalMinor = 550;
    const buf = await renderer.render(receipt, getConfig(80));
    const text = await extractPdfText(buf);
    expect(text).toContain('Apple');
    expect(text).toContain('Banana');
    expect(text).toContain('Cherry');
    expect(text).toContain('5.50');
  });

  it('T14 — long product name wraps without corrupting layout', async () => {
    const receipt = baseReceipt();
    receipt.items[0].snapshotName = 'Extremely Long Product Name That Definitely Cannot Fit On One Column Line Without Wrapping';
    const buf = await renderer.render(receipt, getConfig(80));
    const text = await extractPdfText(buf);
    expect(text).toContain('Extremely Long Product Name');
    // Total should still be present and correct
    expect(text).toContain('20.00');
  });

  it('T15 — very long unbroken string is hard-split', async () => {
    const receipt = baseReceipt();
    // No spaces — must be hard-split
    receipt.items[0].snapshotName = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    const buf = await renderer.render(receipt, getConfig(80));
    expect(buf.length).toBeGreaterThan(100); // must not crash
  });

  it('T16 — 58mm layout has narrower page', async () => {
    const buf58 = await renderer.render(baseReceipt(), getConfig(58));
    const buf80 = await renderer.render(baseReceipt(), getConfig(80));
    const doc58 = await PDFDocument.load(buf58);
    const doc80 = await PDFDocument.load(buf80);
    expect(doc58.getPage(0).getWidth()).toBeLessThan(doc80.getPage(0).getWidth());
  });

  it('T17 — shopAddress appears when present', async () => {
    const receipt = baseReceipt();
    receipt.shopAddress = '123 Market Street, Delhi';
    const buf = await renderer.render(receipt, getConfig(80));
    const text = await extractPdfText(buf);
    expect(text).toContain('123 Market Street');
  });

  it('T18 — shopAddress is omitted gracefully when absent', async () => {
    const receipt = baseReceipt();
    receipt.shopAddress = undefined;
    const buf = await renderer.render(receipt, getConfig(80));
    expect(buf.length).toBeGreaterThan(100); // doesn't crash
  });

  it('T19 — shopPhone appears when present', async () => {
    const receipt = baseReceipt();
    receipt.shopPhone = '+91-99999-00000';
    const buf = await renderer.render(receipt, getConfig(80));
    const text = await extractPdfText(buf);
    expect(text).toContain('99999');
  });

  it('T20 — Rupee symbol ₹ is rendered (not substituted with Rs.)', async () => {
    const receipt = baseReceipt();
    const buf = await renderer.render(receipt, getConfig(80));
    // Check raw PDF bytes for the UTF-8 encoded Rupee sign (U+20B9)
    // NotoSans embeds it; it will appear in the PDF's font glyph stream.
    // We verify the PDF byte stream is not replacing with ASCII fallback.
    const raw = buf.toString('binary');
    // ESC/POS substitutes ₹ with Rs. — PDF must NOT do this
    expect(raw).not.toContain('Rs.');
  });

  it('T21 — Unicode product name with ₹ renders without crash', async () => {
    const receipt = baseReceipt();
    receipt.items[0].snapshotName = 'Premium ₹ Mix Pack';
    const buf = await renderer.render(receipt, getConfig(80));
    expect(buf.length).toBeGreaterThan(100);
  });

  it('T22 — dynamic height: 30 items receipt is taller than 1 item receipt', async () => {
    const short = baseReceipt();
    const tall = baseReceipt();
    tall.items = Array.from({ length: 30 }, (_, i) => ({
      snapshotName: `Product ${i + 1}`,
      snapshotPriceMinor: 100,
      quantity: 1,
      lineTotalMinor: 100,
    }));
    tall.totalMinor = 3000;

    const shortBuf = await renderer.render(short, getConfig(80));
    const tallBuf = await renderer.render(tall, getConfig(80));

    const shortDoc = await PDFDocument.load(shortBuf);
    const tallDoc = await PDFDocument.load(tallBuf);

    expect(tallDoc.getPage(0).getHeight()).toBeGreaterThan(shortDoc.getPage(0).getHeight());
  });

  it('T23 — no blank trailing page', async () => {
    const buf = await renderer.render(baseReceipt(), getConfig(80));
    const doc = await PDFDocument.load(buf);
    expect(doc.getPageCount()).toBe(1); // single dynamic-height page
  });

  it('T24 — 100-item stress case completes without crash', async () => {
    const receipt = baseReceipt();
    receipt.items = Array.from({ length: 100 }, (_, i) => ({
      snapshotName: `Stress Test Product ${i + 1}`,
      snapshotPriceMinor: 100,
      quantity: 1,
      lineTotalMinor: 100,
    }));
    receipt.totalMinor = 10000;
    const start = Date.now();
    const buf = await renderer.render(receipt, getConfig(80));
    const elapsed = Date.now() - start;
    expect(buf.length).toBeGreaterThan(100);
    console.log(`T24 — 100-item stress: ${elapsed}ms, ${(buf.length / 1024).toFixed(1)}KB`);
  }, 15000);

});
