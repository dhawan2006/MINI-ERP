import { adminFetch } from './client';
import type { Customer, CustomerMutation, PaginatedResponse } from './types';

export async function listCustomers(search: string = '', limit: number = 50, offset: number = 0): Promise<PaginatedResponse<Customer>> {
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  params.set('limit', limit.toString());
  params.set('offset', offset.toString());

  const queryString = params.toString();
  return adminFetch<PaginatedResponse<Customer>>(`/customers${queryString ? `?${queryString}` : ''}`);
}

export async function getCustomer(id: string): Promise<Customer> {
  return adminFetch<Customer>(`/customers/${id}`);
}

export async function createCustomer(data: CustomerMutation, idempotencyKey: string): Promise<Customer> {
  return adminFetch<Customer>('/customers', {
    method: 'POST',
    headers: {
      'X-Idempotency-Key': idempotencyKey
    },
    body: JSON.stringify(data),
  });
}

export async function updateCustomer(id: string, data: CustomerMutation, idempotencyKey: string): Promise<Customer> {
  return adminFetch<Customer>(`/customers/${id}`, {
    method: 'PUT',
    headers: {
      'X-Idempotency-Key': idempotencyKey
    },
    body: JSON.stringify(data),
  });
}
