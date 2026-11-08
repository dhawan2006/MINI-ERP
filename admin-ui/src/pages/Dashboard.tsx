import { useEffect, useState } from 'react';
import { getDashboardSummary } from '../api/dashboard';
import { ApiError, type DashboardSummary } from '../api/types';
import { RefreshCw, AlertTriangle, Loader2 } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

export function Dashboard() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const context = useAuthStore(state => state.context);

  const fetchSummary = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getDashboardSummary();
      setSummary(data);
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
    fetchSummary();
  }, []);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h2>Overview Dashboard</h2>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          {context?.role && (
            <span style={{ padding: '0.5rem 1rem', background: 'var(--bg-accent)', color: 'var(--text-secondary)', borderRadius: '20px', fontSize: '0.875rem', fontWeight: 600 }}>
              Role: {context.role}
            </span>
          )}
          <button 
            onClick={fetchSummary}
            disabled={loading}
            className="btn-primary" 
            style={{ width: 'auto', padding: '0.5rem 1rem', background: 'var(--bg-accent)', color: 'var(--text-primary)' }}
          >
            <RefreshCw size={16} className={loading ? 'loader' : ''} />
            Refresh
          </button>
        </div>
      </div>
      
      {error && (
        <div style={{ padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderRadius: '8px', marginBottom: '2rem', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <AlertTriangle size={20} />
          <div>
            <div style={{ fontWeight: 600 }}>{error.message}</div>
          </div>
        </div>
      )}

      {loading && !summary && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
          <Loader2 size={32} className="loader" color="var(--primary-brand)" />
        </div>
      )}

      {summary && (
        <div className="dashboard-grid">
          <div className="stat-card glass-panel">
            <span className="title">Total Customers</span>
            <span className="value">{summary.total_customers}</span>
          </div>
        </div>
      )}
    </div>
  );
}
