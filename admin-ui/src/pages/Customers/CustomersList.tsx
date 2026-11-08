import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listCustomers } from '../../api/customers';
import { ApiError, type Customer, type PaginatedResponse } from '../../api/types';
import { CustomerModal } from './CustomerModal';
import { AlertTriangle, Loader2, Search, Plus, ChevronLeft, ChevronRight } from 'lucide-react';

export function CustomersList() {
  const navigate = useNavigate();
  
  const [data, setData] = useState<PaginatedResponse<Customer> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  
  const [search, setSearch] = useState('');
  const [limit] = useState(15);
  const [offset, setOffset] = useState(0);
  const [showModal, setShowModal] = useState(false);

  const fetchCustomers = async (currentSearch: string, currentOffset: number) => {
    setLoading(true);
    setError(null);
    try {
      const response = await listCustomers(currentSearch, limit, currentOffset);
      setData(response);
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
    // Debounce search
    const timer = setTimeout(() => {
      setOffset(0); // reset page on search
      fetchCustomers(search, 0);
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  // Handle pagination without triggering search debounce again
  const handlePageChange = (newOffset: number) => {
    setOffset(newOffset);
    fetchCustomers(search, newOffset);
  };

  const handleSuccess = () => {
    setShowModal(false);
    fetchCustomers(search, offset); // Refresh current view
  };

  const canCreate = true;

  const formatDateTime = (dateString: string) => {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    }).format(new Date(dateString));
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h2 style={{ marginBottom: '0.25rem' }}>Customers</h2>
          <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Manage customer accounts and contact information.</p>
        </div>
        {canCreate && (
          <button 
            onClick={() => setShowModal(true)}
            className="btn-primary" 
            style={{ width: 'auto', padding: '0.5rem 1rem' }}
          >
            <Plus size={16} />
            New Customer
          </button>
        )}
      </div>

      <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
        <div style={{ position: 'relative', flexGrow: 1, maxWidth: '400px' }}>
          <Search size={16} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
          <input 
            type="text" 
            placeholder="Search by business name, contact, or email..."
            className="input-field"
            style={{ paddingLeft: '2.5rem' }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {error && (
        <div style={{ padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderRadius: '8px', marginBottom: '2rem', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <AlertTriangle size={20} style={{ flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 600 }}>{error.message}</div>
            <button onClick={() => fetchCustomers(search, offset)} style={{ background: 'none', border: 'none', color: 'inherit', textDecoration: 'underline', cursor: 'pointer', padding: 0, marginTop: '0.25rem', fontSize: '0.875rem' }}>Try again</button>
          </div>
        </div>
      )}

      <div className="glass-panel" style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                <th style={{ padding: '1rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Business Name</th>
                <th style={{ padding: '1rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Contact</th>
                <th style={{ padding: '1rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Email</th>
                <th style={{ padding: '1rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Created</th>
              </tr>
            </thead>
            <tbody>
              {loading && !data?.data ? (
                <tr>
                  <td colSpan={4} style={{ padding: '4rem', textAlign: 'center' }}>
                    <Loader2 size={32} className="loader" color="var(--primary-brand)" style={{ margin: '0 auto' }} />
                  </td>
                </tr>
              ) : data?.data.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    No customers found matching your criteria.
                  </td>
                </tr>
              ) : (
                data?.data.map((customer) => (
                  <tr 
                    key={customer.id} 
                    style={{ borderBottom: '1px solid var(--border-color)', cursor: 'pointer' }}
                    onClick={() => navigate(`/customers/${customer.id}`)}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-accent)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <td style={{ padding: '1rem', fontWeight: 500 }}>{customer.business_name || '-'}</td>
                    <td style={{ padding: '1rem' }}>{customer.contact_name || '-'}</td>
                    <td style={{ padding: '1rem' }}>{customer.email || '-'}</td>
                    <td style={{ padding: '1rem', color: 'var(--text-secondary)' }}>{formatDateTime(customer.created_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination Header / Footer */}
        {data && (
          <div style={{ padding: '1rem', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              Showing {data.data.length > 0 ? offset + 1 : 0} to {Math.min(offset + limit, data.meta.total)} of {data.meta.total} results
            </span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button 
                disabled={offset === 0 || loading}
                onClick={() => handlePageChange(offset - limit)}
                style={{ padding: '0.5rem', background: 'var(--bg-accent)', border: '1px solid var(--border-color)', borderRadius: '4px', cursor: (offset === 0 || loading) ? 'not-allowed' : 'pointer', color: 'var(--text-primary)', opacity: (offset === 0 || loading) ? 0.5 : 1 }}
              >
                <ChevronLeft size={16} />
              </button>
              <button 
                disabled={offset + limit >= data.meta.total || loading}
                onClick={() => handlePageChange(offset + limit)}
                style={{ padding: '0.5rem', background: 'var(--bg-accent)', border: '1px solid var(--border-color)', borderRadius: '4px', cursor: (offset + limit >= data.meta.total || loading) ? 'not-allowed' : 'pointer', color: 'var(--text-primary)', opacity: (offset + limit >= data.meta.total || loading) ? 0.5 : 1 }}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {showModal && <CustomerModal onClose={() => setShowModal(false)} onSuccess={handleSuccess} />}
    </div>
  );
}
