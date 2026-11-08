import { AdminAuthResult, AdminRole, ScopeType } from '../middleware/adminAuth.ts';

export class AdminScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdminScopeError';
  }
}

export class AdminScopeService {
  static isGlobalRole(role: AdminRole): boolean {
    return role === 'SUPPORT' || role === 'SYSTEM';
  }

  static isCustomerScopedRole(role: AdminRole): boolean {
    return role === 'OWNER' || role === 'ADMIN' || role === 'FINANCE' || role === 'AUDITOR';
  }

  static assertGlobalRole(auth: AdminAuthResult): void {
    if (auth.scopeType !== 'GLOBAL') {
      throw new AdminScopeError('Global scope required for this operation');
    }
  }

  static assertCustomerAccess(auth: AdminAuthResult, targetCustomerId: string): void {
    if (auth.scopeType === 'GLOBAL') {
      // Global roles (SUPPORT, SYSTEM) have legitimate cross-customer access
      return;
    }

    if (auth.scopeType === 'CUSTOMER') {
      if (!auth.customerId) {
        throw new AdminScopeError('Customer-scoped admin has no associated customer');
      }
      
      if (auth.customerId !== targetCustomerId) {
        throw new AdminScopeError('Cross-customer access denied');
      }
      return;
    }

    throw new AdminScopeError('Unknown authorization scope');
  }

  // Future foundation for Device Authorization
  static assertDeviceCustomerAccess(auth: AdminAuthResult, targetCustomerId: string): void {
    // Currently aliases assertCustomerAccess
    this.assertCustomerAccess(auth, targetCustomerId);
  }
}
