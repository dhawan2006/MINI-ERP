import { ReceiptData } from '../../shared/dto';
import { IPrinterAdapter } from './IPrinterAdapter';

export class FakePrinterAdapter implements IPrinterAdapter {
  private simulateFailure = false;
  private delayMs = 1000;

  setFailureMode(shouldFail: boolean) {
    this.simulateFailure = shouldFail;
  }

  setDelay(ms: number) {
    this.delayMs = ms;
  }

  async print(_receipt: ReceiptData): Promise<void> {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (this.simulateFailure) {
          reject(new Error('Fake printer hardware failure'));
        } else {
          resolve();
        }
      }, this.delayMs);
    });
  }
}
