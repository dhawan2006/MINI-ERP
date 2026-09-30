import Database from 'better-sqlite3';
import log from 'electron-log';

export class SettingsRepository {
  constructor(private db: Database.Database) {}

  get<T>(key: string): T | null {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
    if (!row) return null;

    try {
      return JSON.parse(row.value) as T;
    } catch (e) {
      log.error(`[SettingsRepository] Failed to parse settings for key '${key}'`, e);
      return null;
    }
  }

  set<T>(key: string, value: T): void {
    const serialized = JSON.stringify(value);
    const now = Date.now();

    this.db.prepare(
      `INSERT INTO settings (key, value, updated_at) 
       VALUES (?, ?, ?) 
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    ).run(key, serialized, now);
  }
}
