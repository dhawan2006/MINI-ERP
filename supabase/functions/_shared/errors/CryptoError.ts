/**
 * CryptoError — portable error type for the licensing crypto subsystem.
 * Used identically in both Node (server) and Deno (Edge) runtimes.
 * DO NOT import Node-only or Deno-only APIs here.
 */
export class CryptoError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'CryptoError';
  }
}
