export class CryptoError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'CryptoError';
  }
}
