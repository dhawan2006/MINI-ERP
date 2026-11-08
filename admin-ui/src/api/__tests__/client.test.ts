import { describe, it, expect, vi, beforeEach } from 'vitest';
import { adminFetch } from '../client';
import { ApiError } from '../types';
import { supabase } from '../../supabase';

vi.mock('../../supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
    }
  }
}));

describe('Admin API Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn();
  });

  it('throws UNAUTHORIZED when no session exists', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: null }, error: null });
    await expect(adminFetch('/test')).rejects.toThrowError(new ApiError(401, 'UNAUTHORIZED', 'No active session found.'));
  });

  it('attaches Authorization header correctly', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({ 
      data: { session: { access_token: 'fake-jwt' } as any }, 
      error: null 
    });
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true })
    } as any);

    await adminFetch('/test');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/test'),
      expect.objectContaining({
        headers: expect.any(Headers)
      })
    );
  });

  it('handles 401 response correctly', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({ 
      data: { session: { access_token: 'fake-jwt' } as any }, 
      error: null 
    });
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Expired' })
    } as any);

    await expect(adminFetch('/test')).rejects.toThrowError('Your session has expired. Please sign in again.');
  });

  it('handles 403 response correctly', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({ 
      data: { session: { access_token: 'fake-jwt' } as any }, 
      error: null 
    });
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: 'Forbidden' })
    } as any);

    await expect(adminFetch('/test')).rejects.toThrowError('You do not have permission to access this information.');
  });

  it('handles network failure', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({ 
      data: { session: { access_token: 'fake-jwt' } as any }, 
      error: null 
    });
    vi.mocked(globalThis.fetch).mockRejectedValue(new Error('Network offline'));

    await expect(adminFetch('/test')).rejects.toThrowError('Unable to reach the admin service.');
  });

  it('handles JSON errors gracefully', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({ 
      data: { session: { access_token: 'fake-jwt' } as any }, 
      error: null 
    });
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => { throw new Error('Bad JSON'); }
    } as any);

    await expect(adminFetch('/test')).rejects.toThrowError('An unknown error occurred.');
  });
});
