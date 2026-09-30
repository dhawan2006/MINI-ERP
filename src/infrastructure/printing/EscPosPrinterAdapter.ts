import { IPrinterAdapter } from './IPrinterAdapter';
import { ReceiptData, PrinterConfig } from '../../shared/dto';
import { EscPosReceiptRenderer } from './escpos/EscPosReceiptRenderer';
import { IPrinterTransport } from './escpos/IPrinterTransport';
import { NetworkPrinterTransport } from './escpos/NetworkPrinterTransport';
import { UsbPrinterTransport } from './escpos/UsbPrinterTransport';

export class EscPosPrinterAdapter implements IPrinterAdapter {
  private renderer: EscPosReceiptRenderer;
  private transport: IPrinterTransport;

  constructor(private config: PrinterConfig) {
    this.renderer = new EscPosReceiptRenderer(this.config);

    if (this.config.transport === 'network') {
      this.transport = new NetworkPrinterTransport(this.config);
    } else if (this.config.transport === 'usb') {
      this.transport = new UsbPrinterTransport(this.config);
    } else {
      throw new Error(`PRINTER_CONFIGURATION_INVALID: Unsupported transport type '${this.config.transport}'`);
    }
  }

  async print(receipt: ReceiptData): Promise<void> {
    if (!this.config.enabled) {
      throw new Error('PRINTER_NOT_CONFIGURED: Printer is disabled in configuration');
    }

    try {
      // 1. Render receipt to bytes
      const bytes = this.renderer.render(receipt);

      // 2. Send via transport
      await this.transport.write(bytes);
    } catch (error: any) {
      // The transport already categorizes errors natively (e.g. PRINTER_CONNECTION_FAILED)
      // If it's a generic Error without category, we prepend a category
      if (!error.message.startsWith('PRINTER_')) {
        throw new Error(`PRINTER_WRITE_FAILED: ${error.message}`);
      }
      throw error;
    }
  }
}
