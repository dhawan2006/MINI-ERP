import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getCustomer } from '../../api/customers';
import { ApiError, type Customer } from '../../api/types';
import { CustomerModal } from './CustomerModal';
import { AlertTriangle, Loader2, Edit, ChevronLeft } from 'lucide-react';

export function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [showModal, setShowModal] = useState(false);

  const fetchCustomer = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getCustomer(id);
      setCustomer(data);
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

  useEffect(() => {
    fetchCustomer();
  }, [id]);

  const canEdit = true;

  const formatDateTime = (dateString?: string) => {
    if (!dateString) return '-';
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    }).format(new Date(dateString));
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
        <Loader2 size={32} className="loader" color="var(--primary-brand)" />
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <Link to="/customers" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)', textDecoration: 'none', marginBottom: '2rem' }}>
          <ChevronLeft size={16} /> Back to Customers
        </Link>
        <div style={{ padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderRadius: '8px', display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
          <AlertTriangle size={20} style={{ flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 600 }}>{error.message}</div>
            {error.status === 404 ? (
              <div style={{ fontSize: '0.875rem', marginTop: '0.25rem' }}>The customer you are looking for does not exist.</div>
            ) : (
              <button onClick={fetchCustomer} style={{ background: 'none', border: 'none', color: 'inherit', textDecoration: 'underline', cursor: 'pointer', padding: 0, marginTop: '0.25rem', fontSize: '0.875rem' }}>Try again</button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!customer) return null;

  return (
    <div>
      <Link to="/customers" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)', textDecoration: 'none', marginBottom: '2rem' }}>
        <ChevronLeft size={16} /> Back to Customers
      </Link>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem' }}>
        <div>
          <h2 style={{ marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {customer.business_name || 'Unnamed Customer'}
          </h2>
          <p style={{ color: 'var(--text-secondary)', margin: 0, fontFamily: 'monospace', fontSize: '0.875rem' }}>ID: {customer.id}</p>
        </div>
        {canEdit && (
          <button 
            onClick={() => setShowModal(true)}
            className="btn-primary" 
            style={{ width: 'auto', padding: '0.5rem 1rem', background: 'var(--bg-accent)', color: 'var(--text-primary)' }}
          >
            <Edit size={16} />
            Edit Customer
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <h3 style={{ marginTop: 0, marginBottom: '1.5rem', fontSize: '1rem', color: 'var(--text-secondary)' }}>Contact Information</h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Contact Name</div>
              <div style={{ fontWeight: 500 }}>{customer.contact_name || '-'}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Email Address</div>
              <div style={{ fontWeight: 500 }}>{customer.email ? <a href={`mailto:${customer.email}`} style={{ color: 'var(--primary-brand)' }}>{customer.email}</a> : '-'}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Phone Number</div>
              <div style={{ fontWeight: 500 }}>{customer.phone || '-'}</div>
            </div>
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <h3 style={{ marginTop: 0, marginBottom: '1.5rem', fontSize: '1rem', color: 'var(--text-secondary)' }}>System Metadata</h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Created At</div>
              <div style={{ fontWeight: 500 }}>{formatDateTime(customer.created_at)}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Last Updated</div>
              <div style={{ fontWeight: 500 }}>{formatDateTime(customer.updated_at)}</div>
            </div>
          </div>
        </div>
      </div>

      {showModal && <CustomerModal customer={customer} onClose={() => setShowModal(false)} onSuccess={() => {
        setShowModal(false);
        fetchCustomer();
      }} />}
    </div>
  );
}
