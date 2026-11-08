export type AdminRole = 'OWNER' | 'ADMIN' | 'SUPPORT' | 'FINANCE' | 'AUDITOR';

export interface AdminContext {
  adminId: string;
  role: AdminRole;
  aal: string;
  environment?: 'QA' | 'UNVERIFIED';
  projectRef?: string;
}

export interface DashboardSummary {
  total_customers: number;
}

export interface ApiErrorResponse {
  error: string;
  message?: string | any;
}

export class ApiError extends Error {
  public code: string;
  public status: number;
  
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    limit: number;
    offset: number;
  };
}

export interface AuditEvent {
  id: string;
  event_type: string;
  admin_id: string | null;
  created_at: string;
}

export interface Customer {
  id: string;
  business_name: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  created_at: string;
  updated_at: string;
}

export interface CustomerMutation {
  business_name?: string | null;
  contact_name?: string | null;
  email?: string | null;
  phone?: string | null;
}
