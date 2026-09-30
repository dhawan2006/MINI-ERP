export interface IPrinterTransport {
  write(data: Uint8Array): Promise<void>;
}
