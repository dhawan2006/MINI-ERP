import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { initInMemoryDatabase } from '../../src/infrastructure/database/connection';
import { DraftRepository } from '../../src/infrastructure/repositories/draft.repository';
import { ActiveBill } from '../../src/domain/entities/ActiveBill';
import { BillItem } from '../../src/domain/entities/BillItem';

describe('Draft Repository', () => {
  let db: Database.Database;
  let repo: DraftRepository;

  beforeEach(() => {
    db = initInMemoryDatabase();
    repo = new DraftRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it('creates, loads, and updates a draft', () => {
    const id = 'active_draft';
    
    // Create
    repo.saveDraft(id, new ActiveBill([]));
    let loaded = repo.loadDraft(id);
    expect(loaded?.items).toEqual([]);
    
    // Update
    const activeBill = new ActiveBill([
      new BillItem({
        productId: 'p1',
        snapshotName: 'Item 1',
        snapshotPriceMinor: 100,
        quantity: 1
      })
    ]);
    repo.saveDraft(id, activeBill);

    // Load
    loaded = repo.loadDraft(id);
    expect(loaded?.items.length).toBe(1);
    expect(loaded?.items[0].productId).toBe('p1');
  });

  it('deletes drafts safely', () => {
    repo.saveDraft('d1', new ActiveBill([]));
    repo.deleteDraft('d1');
    expect(repo.loadDraft('d1')).toBeNull();
  });
});
