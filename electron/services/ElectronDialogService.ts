import { dialog } from 'electron';
import { IDialogService, SaveDialogOptions, OpenDialogOptions } from '../../src/application/interfaces/IDialogService';

export class ElectronDialogService implements IDialogService {
  public  async showSaveDialog(options: SaveDialogOptions): Promise<{ canceled: boolean; filePath?: string }> {
    const { canceled, filePath } = await dialog.showSaveDialog(options);
    return { canceled, filePath };
  }

  async showOpenDialog(options: OpenDialogOptions): Promise<{ canceled: boolean; filePaths: string[] }> {
    const { canceled, filePaths } = await dialog.showOpenDialog(options);
    return { canceled, filePaths };
  }
}
