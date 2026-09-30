import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../../src/infrastructure/database/migrations';
import { SettingsRepository } from '../../../src/infrastructure/repositories/settings.repository';
import { SettingsService } from '../../../src/application/use-cases/SettingsService';

describe('Stage 16 Reliability - Settings Service', () => {
  let db: Database.Database;
  let settingsRepo: SettingsRepository;
  let settingsService: SettingsService;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
    settingsRepo = new SettingsRepository(db);
    settingsService = new SettingsService(settingsRepo);
  });

  afterEach(() => {
    db.close();
  });

  it('gracefully handles corrupted settings JSON on load', () => {
    // Manually insert corrupted JSON
    db.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)').run('app_settings', 'INVALID{JSON', Date.now());

    // It should not throw. It should log an error (if we check logs) and return defaults.
    const settings = settingsService.getSettings();
    expect(settings).toBeDefined();
    
    // Check that defaults were provided instead of throwing
    expect(settings.store.shopName).toBe('My Store');
    expect(settings.printer.enabled).toBe(false);
  });
});
