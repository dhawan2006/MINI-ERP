import { IPrinterTransport } from './IPrinterTransport';
import { PrinterConfig } from '../../../shared/dto';

export class UsbPrinterTransport implements IPrinterTransport {
  constructor(_config: PrinterConfig) {}

  async write(_data: Uint8Array): Promise<void> {
    // Stage 12 explicitly states USB transport should remain an isolated stub 
    // unless reliable physical hardware testing is possible in this environment.
    throw new Error('PRINTER_UNSUPPORTED: USB transport architecture implemented, but requires physical hardware validation to enable in production.');
  }
}
