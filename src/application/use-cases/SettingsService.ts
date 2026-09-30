import { SettingsRepository } from '../../infrastructure/repositories/settings.repository';
import { AppSettingsDTO, PrinterConfig, StoreConfigDTO } from '../../shared/dto';

const SETTINGS_KEY = 'app_settings';

export class SettingsService {
  private cachedSettings: AppSettingsDTO;

  constructor(private readonly settingsRepo: SettingsRepository) {
    this.cachedSettings = this.loadAndValidateSettings();
  }

  private getDefaultSettings(): AppSettingsDTO {
    return {
      store: {
        shopName: 'My Store',
        shopAddress: '',
        shopPhone: '',
      },
      printer: {
        enabled: false,
        transport: 'fake',
        host: '127.0.0.1',
        port: 9100,
        paperWidth: 80,
        charactersPerLine: 48,
        supportsCut: true,
        feedLines: 3,
        encoding: 'cp437',
      }
    };
  }

  private loadAndValidateSettings(): AppSettingsDTO {
    let settings = this.settingsRepo.get<AppSettingsDTO>(SETTINGS_KEY);
    
    if (!settings) {
      settings = this.getDefaultSettings();
    }

    // Merge missing fields with defaults for backward compatibility if schema grows
    const defaults = this.getDefaultSettings();
    const store = { ...defaults.store, ...(settings.store || {}) };
    const printer = { ...defaults.printer, ...(settings.printer || {}) };

    // Validation
    if (!store.shopName || store.shopName.trim() === '') {
      store.shopName = 'My Store';
    }

    if (printer.paperWidth !== 58 && printer.paperWidth !== 80) {
      printer.paperWidth = 80;
    }

    if (printer.feedLines < 0) {
      printer.feedLines = 0;
    }

    if (printer.charactersPerLine <= 0) {
      printer.charactersPerLine = 48;
    }

    if (printer.transport !== 'network' && printer.transport !== 'usb' && printer.transport !== 'fake') {
      printer.transport = 'fake';
    }

    return { store, printer };
  }

  getSettings(): AppSettingsDTO {
    return { ...this.cachedSettings };
  }

  getStoreConfig(): StoreConfigDTO {
    return { ...this.cachedSettings.store };
  }

  getPrinterConfig(): PrinterConfig {
    return { ...this.cachedSettings.printer };
  }

  updateSettings(newSettings: AppSettingsDTO): AppSettingsDTO {
    const store = { ...newSettings.store };
    const printer = { ...newSettings.printer };

    // Validate before saving
    if (!store.shopName || store.shopName.trim() === '') {
      throw new Error('Shop Name is required.');
    }

    if (printer.enabled && printer.transport === 'network') {
      if (!printer.host || printer.host.trim() === '') {
        throw new Error('Printer host IP is required for network transport.');
      }
      if (!printer.port || printer.port <= 0 || printer.port > 65535) {
        throw new Error('Valid printer port is required for network transport.');
      }
    }

    if (printer.paperWidth !== 58 && printer.paperWidth !== 80) {
      throw new Error('Paper width must be 58 or 80.');
    }

    if (printer.feedLines < 0 || printer.charactersPerLine <= 0) {
      throw new Error('Feed lines and characters per line must be valid positive numbers.');
    }

    const validatedSettings: AppSettingsDTO = { store, printer };

    // Persist
    this.settingsRepo.set(SETTINGS_KEY, validatedSettings);
    
    // Update cache
    this.cachedSettings = validatedSettings;

    return this.getSettings();
  }
}
