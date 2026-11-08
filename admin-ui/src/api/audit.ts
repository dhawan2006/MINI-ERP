import { adminFetch } from './client';
import type { AuditEvent, PaginatedResponse } from './types';

export function fetchAuditEvents(limit = 25, offset = 0) {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  return adminFetch<PaginatedResponse<AuditEvent>>(`/audit?${params.toString()}`);
}
