import { adminFetch } from './client';
import type { AdminContext } from './types';

export async function getAdminContext(): Promise<AdminContext> {
  return adminFetch<AdminContext>('/me');
}
