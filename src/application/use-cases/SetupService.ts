import { SettingsRepository } from '../../infrastructure/repositories/settings.repository';
import { IProductRepository } from '../interfaces/IProductRepository';
import { SetupStateDTO } from '../../shared/setup-dto';
import log from 'electron-log';
import { SettingsService } from './SettingsService';

const SETUP_KEY = 'app_setup';

export class SetupService {
  constructor(
    private readonly settingsRepo: SettingsRepository,
    private readonly productRepo: IProductRepository,
    private readonly settingsService: SettingsService
  ) {}

  getState(): SetupStateDTO {
    let state = this.settingsRepo.get<SetupStateDTO>(SETUP_KEY);

    if (!state) {
      // Compatibility heuristic for existing installations
      const hasExplicitSettings = this.settingsRepo.get<any>('app_settings') !== null;
      const hasProducts = this.productRepo.listProducts(1, 0, true).length > 0;
      
      if (hasExplicitSettings || hasProducts) {
        log.info('[SetupService] Existing installation detected. Auto-migrating setup to COMPLETED.');
        state = { status: 'COMPLETED' };
        this.settingsRepo.set(SETUP_KEY, state);
      } else {
        state = { status: 'NOT_STARTED' };
      }
    }

    return state;
  }

  saveStoreProfile(shopName: string): SetupStateDTO {
    const trimmedName = shopName.trim();
    
    // Validation
    if (!trimmedName) {
      throw new Error('Store name cannot be empty.');
    }
    if (trimmedName.length > 50) {
      throw new Error('Store name is too long.');
    }
    // Reject control characters
    if (/[\x00-\x1F\x7F]/.test(trimmedName)) {
      throw new Error('Store name contains invalid characters.');
    }

    const state = this.getState();
    if (state.status === 'COMPLETED') {
      // Idempotent or just logging if already completed
      log.warn('[SetupService] Attempted to save store profile after setup was already completed.');
    } else {
      this.settingsRepo.set(SETUP_KEY, { status: 'IN_PROGRESS' });
    }

    // Save to actual settings
    const currentSettings = this.settingsService.getSettings();
    currentSettings.store.shopName = trimmedName;
    this.settingsService.updateSettings(currentSettings);

    return this.getState();
  }

  complete(): SetupStateDTO {
    const state = this.getState();
    if (state.status === 'COMPLETED') {
      return state; // Idempotent
    }

    this.settingsRepo.set(SETUP_KEY, { status: 'COMPLETED' });
    return this.getState();
  }
}
