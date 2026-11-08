import { adminFetch } from './client';
import type { DashboardSummary } from './types';

export async function getDashboardSummary(): Promise<DashboardSummary> {
  return adminFetch<DashboardSummary>('/dashboard/summary');
}
