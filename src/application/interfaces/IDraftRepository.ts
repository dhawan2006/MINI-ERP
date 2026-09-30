import { ActiveBill } from '../../domain/entities/ActiveBill';

export interface IDraftRepository {
  saveDraft(id: string, activeBill: ActiveBill): void;
  loadDraft(id: string): ActiveBill | null;
  deleteDraft(id: string): void;
}
