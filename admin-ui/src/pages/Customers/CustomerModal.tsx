import { useState } from 'react';
import { ApiError } from '../../api/types';
import type { Customer, CustomerMutation } from '../../api/types';
import { createCustomer, updateCustomer } from '../../api/customers';
import { AlertTriangle, Loader2 } from 'lucide-react';

interface CustomerModalProps {
  customer?: Customer; // if provided, it's edit mode
  onClose: () => void;
  onSuccess: () => void;
}

export function CustomerModal({ customer, onClose, onSuccess }: CustomerModalProps) {
  const [formData, setFormData] = useState<CustomerMutation>({
    business_name: customer?.business_name || '',
    contact_name: customer?.contact_name || '',
    email: customer?.email || '',
    phone: customer?.phone || ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const idempotencyKey = crypto.randomUUID();
      if (customer) {
        await updateCustomer(customer.id, formData, idempotencyKey);
      } else {
        await createCustomer(formData, idempotencyKey);
      }
      onSuccess();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err);
      } else {
        setError(new ApiError(0, 'UNKNOWN', 'An unknown error occurred'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center',
      justifyContent: 'center', zIndex: 50, padding: '1rem'
    }}>
      <div className="glass-panel" style={{ width: '100%', maxWidth: '500px', backgroundColor: 'var(--bg-primary)', padding: '2rem' }}>
        <h3 style={{ marginBottom: '1.5rem', marginTop: 0 }}>
          {customer ? 'Edit Customer' : 'Create Customer'}
        </h3>

        {error && (
          <div style={{ padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderRadius: '8px', marginBottom: '1.5rem', display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
            <AlertTriangle size={20} style={{ flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: 600 }}>{error.message}</div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label htmlFor="business_name" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Business Name</label>
            <input 
              id="business_name"
              type="text" 
              className="input-field" 
              value={formData.business_name || ''} 
              onChange={e => setFormData({ ...formData, business_name: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="contact_name" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Contact Name</label>
            <input 
              id="contact_name"
              type="text" 
              className="input-field" 
              value={formData.contact_name || ''} 
              onChange={e => setFormData({ ...formData, contact_name: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="email" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Email</label>
            <input 
              id="email"
              type="email" 
              className="input-field" 
              value={formData.email || ''} 
              onChange={e => setFormData({ ...formData, email: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="phone" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Phone</label>
            <input 
              id="phone"
              type="text" 
              className="input-field" 
              value={formData.phone || ''} 
              onChange={e => setFormData({ ...formData, phone: e.target.value })}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem' }}>
            <button 
              type="button" 
              onClick={onClose} 
              disabled={loading}
              style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '0.5rem 1rem', borderRadius: '4px', cursor: 'pointer' }}
            >
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={loading} 
              className="btn-primary" 
              style={{ padding: '0.5rem 1.5rem', width: 'auto' }}
            >
              {loading ? <Loader2 size={16} className="loader" /> : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
