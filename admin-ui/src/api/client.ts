import { supabase } from '../supabase';
import { ApiError, type ApiErrorResponse } from './types';

// Distinguish environments
const getBaseUrl = () => {
  if (import.meta.env.PROD) {
    return import.meta.env.VITE_ADMIN_API_URL || 'https://api.production.com/functions/v1/admin';
  }
  // Fallback to local development Supabase Edge Function URL
  return import.meta.env.VITE_ADMIN_API_URL || 'http://127.0.0.1:54321/functions/v1/admin';
};

export const API_BASE_URL = getBaseUrl();

export async function adminFetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session) {
    throw new ApiError(401, 'UNAUTHORIZED', 'No active session found.');
  }

  const headers = new Headers(options?.headers);
  headers.set('Authorization', `Bearer ${session.access_token}`);
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const url = `${API_BASE_URL}${endpoint}`;
  let response: Response;

  try {
    response = await fetch(url, { ...options, headers });
  } catch (err: any) {
    throw new ApiError(0, 'NETWORK_ERROR', 'Unable to reach the admin service.');
  }

  if (!response.ok) {
    if (response.status === 401) {
      // Allow caller to intercept 401s
      throw new ApiError(401, 'UNAUTHORIZED', 'Your session has expired. Please sign in again.');
    }
    if (response.status === 403) {
      throw new ApiError(403, 'FORBIDDEN', 'You do not have permission to access this information.');
    }
    if (response.status >= 500) {
      throw new ApiError(response.status, 'SERVER_ERROR', 'The admin service is temporarily unavailable.');
    }

    let errorData: ApiErrorResponse = { error: 'UNKNOWN_ERROR', message: 'An unknown error occurred.' };
    try {
      errorData = await response.json();
    } catch (e) {
      // Ignored
    }

    throw new ApiError(response.status, errorData.error, errorData.message || errorData.error);
  }

  return response.json();
}
