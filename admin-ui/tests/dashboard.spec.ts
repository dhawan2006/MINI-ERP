import { test, expect } from '@playwright/test';

test.describe('Admin Dashboard UI', () => {
  test('unauthorized users are redirected to login', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/.*\/login/);
  });

  test('login flow handles authentication and displays dashboard', async ({ page }) => {
    // Mock the Supabase auth response and dashboard API
    // Intercept settings request
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
        json: {
          total_customers: 15,
          active_licenses: 42,
          revoked_licenses: 3,
          active_bindings: 38,
          recent_checkins: 110,
          overdue_checkins: 2
        }
      });
    });

    // Sign in
    await page.goto('/login');
    
    // Log console messages to help debug
    page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
    
    await page.fill('input[type="email"]', 'admin@example.com');
    await page.fill('input[type="password"]', 'secure-password');
    await page.click('button[type="submit"]');
    
    // Check if error message appeared on screen instead of just waiting for URL
    const errorDiv = page.locator('.login-card div').filter({ hasText: /error|invalid/i });
    if (await errorDiv.isVisible({ timeout: 1000 })) {
      console.log('LOGIN UI ERROR:', await errorDiv.textContent());
    }

    // Should redirect to dashboard
    await expect(page).toHaveURL('/');
    
    // Header should display email and role
    await expect(page.locator('header')).toContainText('admin@example.com');
    await expect(page.locator('header')).toContainText('OWNER');

    // Dashboard metrics should be visible
    await expect(page.locator('.dashboard-grid')).toBeVisible();
    await expect(page.locator('text=42')).toBeVisible(); // Active licenses
    await expect(page.locator('text=15')).toBeVisible(); // Customers
    await expect(page.locator('text=110')).toBeVisible(); // Checkins
    
    // Test Refresh behavior (triggers loading state)
    await page.click('button:has-text("Refresh")');
    await expect(page.locator('button:has-text("Refresh")')).not.toBeDisabled();
    
    // Logout works
    await page.route('**/auth/v1/logout', async route => {
      await route.fulfill({ status: 200 });
    });
    await page.click('button:has-text("Sign Out")');
    await expect(page).toHaveURL(/.*\/login/);
  });
});
