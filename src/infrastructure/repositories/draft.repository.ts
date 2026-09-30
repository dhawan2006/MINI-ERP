import Database from 'better-sqlite3';
import { IDraftRepository } from '../../application/interfaces/IDraftRepository';
import { ActiveBill } from '../../domain/entities/ActiveBill';
import { BillItem } from '../../domain/entities/BillItem';

export interface DraftRow {
  id: string;
  version: number;
  serialized_state: string;
  updated_at: number;
}

export class DraftRepository implements IDraftRepository {
  constructor(private db: Database.Database) {}

  saveDraft(id: string, activeBill: ActiveBill): void {
    const now = Date.now();
    // Serialize ActiveBill state into JSON. We only persist the items array.
    const state = JSON.stringify(activeBill.items.map(item => ({
      productId: item.productId,
      snapshotName: item.snapshotName,
      snapshotPriceMinor: item.snapshotPriceMinor,
      quantity: item.quantity
    })));
    
    this.db.transaction(() => {
      const existing = this._loadRaw(id);
      
      if (!existing) {
        this.db.prepare(
          'INSERT INTO drafts (id, version, serialized_state, updated_at) VALUES (?, 1, ?, ?)'
        ).run(id, state, now);
      } else {
        this.db.prepare(
          'UPDATE drafts SET serialized_state = ?, version = version + 1, updated_at = ? WHERE id = ?'
        ).run(state, now, id);
      }
    })();
  }

  loadDraft(id: string): ActiveBill | null {
    const row = this._loadRaw(id);
    if (!row) return null;

    try {
      const parsedItems = JSON.parse(row.serialized_state) as any[];
      const items = parsedItems.map(item => new BillItem({
        productId: item.productId,
        snapshotName: item.snapshotName,
        snapshotPriceMinor: item.snapshotPriceMinor,
        quantity: item.quantity
      }));
      return new ActiveBill(items);
    } catch {
      return null;
    }
  }

  deleteDraft(id: string): void {
    this.db.prepare('DELETE FROM drafts WHERE id = ?').run(id);
  }

  private _loadRaw(id: string): DraftRow | null {
    const row = this.db.prepare('SELECT * FROM drafts WHERE id = ?').get(id) as DraftRow | undefined;
    return row || null;
  }
}
