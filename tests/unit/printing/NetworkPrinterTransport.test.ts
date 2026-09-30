import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as net from 'net';
import { NetworkPrinterTransport } from '../../../src/infrastructure/printing/escpos/NetworkPrinterTransport';
import { PrinterConfig } from '../../../src/shared/dto';

describe('NetworkPrinterTransport', () => {
  const getBaseConfig = (): PrinterConfig => ({
    enabled: true,
    transport: 'network',
    host: '127.0.0.1',
    port: 39100, // random high port for tests
    paperWidth: 80,
    charactersPerLine: 48,
    supportsCut: true,
    feedLines: 3,
    encoding: 'ascii'
  });

  let server: net.Server;

  afterEach(() => {
    if (server) {
      server.close();
    }
  });

  it('successfully connects, writes data, and resolves', async () => {
    const config = getBaseConfig();
    const transport = new NetworkPrinterTransport(config);
    const testData = new Uint8Array([0x01, 0x02, 0x03]);

    // Create a mock TCP server
    let receivedData: Buffer | null = null;
    server = net.createServer((socket) => {
      socket.on('data', (data) => {
        receivedData = data;
      });
    });

    await new Promise<void>((resolve) => {
      server.listen(config.port, config.host, () => resolve());
    });

    await expect(transport.write(testData)).resolves.toBeUndefined();
    
    // The server should have received the exact bytes
    expect(receivedData).toBeInstanceOf(Buffer);
    expect(receivedData![0]).toBe(0x01);
    expect(receivedData![1]).toBe(0x02);
    expect(receivedData![2]).toBe(0x03);
  });

  it('rejects with PRINTER_CONNECTION_FAILED if connection is refused', async () => {
    const config = getBaseConfig();
    // Use an unused port
    config.port = 49100; 
    const transport = new NetworkPrinterTransport(config);
    const testData = new Uint8Array([0x01]);

    await expect(transport.write(testData)).rejects.toThrow(/PRINTER_CONNECTION_FAILED/);
  });
  
  it('rejects with PRINTER_CONFIGURATION_INVALID if host/port are missing', async () => {
    const config = getBaseConfig();
    delete config.host;
    const transport = new NetworkPrinterTransport(config);
    const testData = new Uint8Array([0x01]);

    await expect(transport.write(testData)).rejects.toThrow(/PRINTER_CONFIGURATION_INVALID/);
  });
});
