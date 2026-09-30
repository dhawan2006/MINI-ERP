import * as net from 'net';
import { IPrinterTransport } from './IPrinterTransport';
import { PrinterConfig } from '../../../shared/dto';

export class NetworkPrinterTransport implements IPrinterTransport {
  constructor(private config: PrinterConfig) {}

  async write(data: Uint8Array): Promise<void> {
    if (!this.config.host || !this.config.port) {
      throw new Error('PRINTER_CONFIGURATION_INVALID: Network printer requires host and port');
    }

    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      
      const cleanup = () => {
        socket.destroy();
      };

      const handleFailure = (err: Error, category: string) => {
        cleanup();
        reject(new Error(`${category}: ${err.message}`));
      };

      // Connect timeout
      socket.setTimeout(5000, () => {
        handleFailure(new Error('Connection timed out'), 'PRINTER_TIMEOUT');
      });

      socket.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'ECONNREFUSED') {
          handleFailure(err, 'PRINTER_CONNECTION_FAILED');
        } else if (err.code === 'EHOSTUNREACH') {
          handleFailure(err, 'PRINTER_CONNECTION_FAILED');
        } else {
          handleFailure(err, 'PRINTER_WRITE_FAILED');
        }
      });

      socket.connect(this.config.port!, this.config.host!, () => {
        // Connected, remove connect timeout and write data
        socket.setTimeout(0);
        
        socket.write(data, (err) => {
          if (err) {
            handleFailure(err, 'PRINTER_WRITE_FAILED');
            return;
          }
          
          // Wait briefly to ensure data flush, then clean up and resolve
          // (Some raw transports don't provide application-level ACKs)
          setTimeout(() => {
            cleanup();
            resolve();
          }, 100);
        });
      });
    });
  }
}
