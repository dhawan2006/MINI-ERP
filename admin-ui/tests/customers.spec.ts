import { test, expect } from '@playwright/test';

test.describe('Admin Customers UI', () => {
  test.beforeEach(async ({ page }) => {
    // Mock the Supabase auth response
    await page.route('**/auth/v1/settings', async route => {
      await route.fulfill({ status: 200, json: {} });
    });
    
    await page.route('**/auth/v1/token*', async route => {
      await route.fulfill({
        status: 200,
        json: {
          access_token: 'fake-jwt',
          token_type: 'bearer',
          expires_in: 3600,
          refresh_token: 'fake-refresh',
          user: { 
            id: 'admin-id', 
            email: 'admin@example.com',
            aud: 'authenticated',
            role: 'authenticated',
            app_metadata: {},
            user_metadata: {}
          }
        }
      });
    });

    await page.route('**/admin/me', async route => {
      await route.fulfill({
        status: 200,
        json: { role: 'OWNER', aal: 'aal2' }
      });
    });

    await page.route('**/admin/dashboard/summary', async route => {
      await route.fulfill({
        status: 200,
        json: { total_customers: 15, active_licenses: 42, revoked_licenses: 3, active_bindings: 38, recent_checkins: 110, overdue_checkins: 2 }
      });
    });

    // Sign in and go to customers
    await page.goto('/login');
    await page.fill('input[type="email"]', 'admin@example.com');
    await page.fill('input[type="password"]', 'secure-password');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/');
  });

  test('customers list loads and handles search', async ({ page }) => {
    await page.route('**/admin/customers*', async route => {
      await route.fulfill({
        status: 200,
        json: {
          data: [
            { id: 'cust-1', business_name: 'Acme Corp', contact_name: 'Wile E.', email: 'wile@acme.com', created_at: '2026-10-01T10:00:00Z', updated_at: '2026-10-01T10:00:00Z' }
          ],
          meta: { total: 1, limit: 15, offset: 0 }
        }
      });
    });

    await page.click('a:has-text("Customers")');
    await expect(page).toHaveURL('/customers');

    await expect(page.locator('text=Acme Corp')).toBeVisible();
    await expect(page.locator('text=wile@acme.com')).toBeVisible();

    // Test search
    const searchInput = page.locator('input[placeholder*="Search"]');
    await searchInput.fill('Acme');
    // The debounce will trigger another request, we just verify it doesn't crash and still shows results
    await expect(page.locator('text=Acme Corp')).toBeVisible();
  });

  test('customer detail loads correctly', async ({ page }) => {
    await page.route('**/admin/customers*', async route => {
      await route.fulfill({
        status: 200,
        json: {
          data: [
            { id: 'cust-1', business_name: 'Acme Corp', contact_name: 'Wile E.', email: 'wile@acme.com', created_at: '2026-10-01T10:00:00Z', updated_at: '2026-10-01T10:00:00Z' }
          ],
          meta: { total: 1, limit: 15, offset: 0 }
        }
      });
    });

    await page.route('**/admin/customers/cust-1', async route => {
      await route.fulfill({
        status: 200,
        json: { id: 'cust-1', business_name: 'Acme Corp', contact_name: 'Wile E.', email: 'wile@acme.com', created_at: '2026-10-01T10:00:00Z', updated_at: '2026-10-01T10:00:00Z' }
      });
    });

    await page.goto('/customers');
    await page.click('text=Acme Corp');
    await expect(page).toHaveURL('/customers/cust-1');

    await expect(page.locator('h2:has-text("Acme Corp")')).toBeVisible();
    await expect(page.locator('text=ID: cust-1')).toBeVisible();
    await expect(page.locator('text=Wile E.')).toBeVisible();
  });

  test('can create a new customer', async ({ page }) => {
    let requests = 0;
    await page.route('**/admin/customers*', async route => {
      if (route.request().method() === 'POST') {
        const payload = JSON.parse(route.request().postData() || '{}');
        expect(payload.business_name).toBe('New Business');
        expect(route.request().headers()['x-idempotency-key']).toBeTruthy();
        await route.fulfill({
          status: 201,
          json: { id: 'cust-2', business_name: 'New Business', created_at: '2026-10-01T10:00:00Z' }
        });
      } else {
        requests++;
        await route.fulfill({
          status: 200,
          json: {
            data: requests === 1 ? [] : [{ id: 'cust-2', business_name: 'New Business', created_at: '2026-10-01T10:00:00Z' }],
            meta: { total: requests === 1 ? 0 : 1, limit: 15, offset: 0 }
          }
        });
      }
    });

    await page.goto('/customers');
    
    // Open modal
    await page.click('button:has-text("New Customer")');
    await expect(page.locator('h3:has-text("Create Customer")')).toBeVisible();

    // Fill form
    await page.fill('input#business_name', 'New Business');
    await page.fill('input#email', 'test@new.com');

    // Submit
    await page.click('button:has-text("Save")');

    // Modal should close and table should update
    await expect(page.locator('h3:has-text("Create Customer")')).not.toBeVisible();
    await expect(page.locator('text=New Business')).toBeVisible();
  });
});
