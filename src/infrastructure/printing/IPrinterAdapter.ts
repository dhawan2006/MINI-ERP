import { ReceiptData } from '../../shared/dto';

export interface IPrinterAdapter {
  print(receipt: ReceiptData): Promise<void>;
}
