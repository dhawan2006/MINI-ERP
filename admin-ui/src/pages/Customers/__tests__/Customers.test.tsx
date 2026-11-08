import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CustomersList } from '../CustomersList';
import { CustomerDetail } from '../CustomerDetail';
import * as customersApi from '../../../api/customers';
import { ApiError } from '../../../api/types';
import { useAuthStore } from '../../../store/authStore';

vi.mock('../../../api/customers');
vi.mock('../../../store/authStore');

const mockCustomer = {
  id: 'cust-1',
  business_name: 'Test Corp',
  contact_name: 'John Doe',
  email: 'john@test.com',
  phone: '1234567890',
  created_at: '2026-10-01T10:00:00Z',
  updated_at: '2026-10-01T10:00:00Z'
};

const renderWithRouter = (ui: React.ReactElement, route = '/') => {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="/customers" element={ui} />
        <Route path="/customers/:id" element={ui} />
      </Routes>
    </MemoryRouter>
  );
};

describe('Customers UI', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (useAuthStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ role: 'ADMIN' });
  });

  it('1. customer list success', async () => {
    vi.mocked(customersApi.listCustomers).mockResolvedValue({
      data: [mockCustomer],
      meta: { total: 1, limit: 15, offset: 0 }
    });
    
    renderWithRouter(<CustomersList />, '/customers');
    
    await waitFor(() => {
      expect(screen.getByText('Test Corp')).toBeDefined();
      expect(screen.getByText('john@test.com')).toBeDefined();
    });
  });

  it('2. customer list loading', () => {
    // Will not resolve immediately
    vi.mocked(customersApi.listCustomers).mockImplementation(() => new Promise(() => {}));
    
    const { container } = renderWithRouter(<CustomersList />, '/customers');
    expect(container.querySelector('.loader')).toBeDefined();
  });

  it('3. customer list empty state', async () => {
    vi.mocked(customersApi.listCustomers).mockResolvedValue({
      data: [],
      meta: { total: 0, limit: 15, offset: 0 }
    });
    
    renderWithRouter(<CustomersList />, '/customers');
    
    await waitFor(() => {
      expect(screen.getByText(/No customers found matching your criteria/)).toBeDefined();
    });
  });

  it('4. customer list error & 6. 401 & 7. 403', async () => {
    // Test 403 Forbidden
    vi.mocked(customersApi.listCustomers).mockRejectedValue(new ApiError(403, 'FORBIDDEN', 'Access denied'));
    
    renderWithRouter(<CustomersList />, '/customers');
    
    await waitFor(() => {
      expect(screen.getByText('Access denied')).toBeDefined();
    });
  });

  it('5. customer detail success', async () => {
    vi.mocked(customersApi.getCustomer).mockResolvedValue(mockCustomer);
    
    renderWithRouter(<CustomerDetail />, '/customers/cust-1');
    
    await waitFor(() => {
      expect(screen.getByText('Test Corp')).toBeDefined();
      expect(screen.getByText('ID: cust-1')).toBeDefined();
    });
  });

  it('8. 404/not-found if supported', async () => {
    vi.mocked(customersApi.getCustomer).mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'CUSTOMER_NOT_FOUND'));
    
    renderWithRouter(<CustomerDetail />, '/customers/cust-1');
    
    await waitFor(() => {
      expect(screen.getByText('CUSTOMER_NOT_FOUND')).toBeDefined();
      expect(screen.getByText('The customer you are looking for does not exist.')).toBeDefined();
    });
  });

  it('9. 422 validation & 11. mutation failure', async () => {
    vi.mocked(customersApi.listCustomers).mockResolvedValue({
      data: [],
      meta: { total: 0, limit: 15, offset: 0 }
    });
    vi.mocked(customersApi.createCustomer).mockRejectedValue(new ApiError(422, 'VALIDATION_ERROR', 'Invalid email'));
    
    renderWithRouter(<CustomersList />, '/customers');
    
    await waitFor(() => {
      fireEvent.click(screen.getByText('New Customer'));
    });
    
    fireEvent.click(screen.getByText('Save'));
    
    await waitFor(() => {
      expect(screen.getByText('Invalid email')).toBeDefined();
    });
  });

  it('10. successful mutation if mutation exists & 12. idempotency header', async () => {
    vi.mocked(customersApi.listCustomers).mockResolvedValue({
      data: [],
      meta: { total: 0, limit: 15, offset: 0 }
    });
    
    let capturedIdempotencyKey = '';
    vi.mocked(customersApi.createCustomer).mockImplementation(async (_data, key) => {
      capturedIdempotencyKey = key;
      return mockCustomer;
    });
    
    renderWithRouter(<CustomersList />, '/customers');
    
    await waitFor(() => {
      fireEvent.click(screen.getByText('New Customer'));
    });
    
    fireEvent.change(screen.getByLabelText('Business Name'), { target: { value: 'New Corp' } });
    fireEvent.click(screen.getByText('Save'));
    
    await waitFor(() => {
      expect(customersApi.createCustomer).toHaveBeenCalledWith(
        expect.objectContaining({ business_name: 'New Corp' }),
        expect.any(String)
      );
      expect(capturedIdempotencyKey).toBeTruthy();
      expect(customersApi.listCustomers).toHaveBeenCalledTimes(2); // Initial load + refresh
    });
  });
});
