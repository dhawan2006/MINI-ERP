import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { fetchAuditEvents } from '../api/audit';
import type { AuditEvent } from '../api/types';
import { ApiError } from '../api/types';
import { useAuthStore } from '../store/authStore';

const PAGE_SIZE = 25;

export function AuditLogs() {
  const role = useAuthStore(state => state.context?.role);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await fetchAuditEvents(PAGE_SIZE, offset);
      setEvents(result.data);
      setTotal(result.meta.total);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 403
        ? 'Your administrator role cannot view audit history.'
        : err instanceof Error ? err.message : 'Unable to load audit history.');
    } finally {
      setLoading(false);
    }
  }, [offset]);

  useEffect(() => { void load(); }, [load]);

  if (role === 'FINANCE' || role === 'SUPPORT') {
    return <div role="status" className="glass-panel" style={{ padding: '2rem' }}>Your administrator role does not include audit history access.</div>;
  }

  return <section style={{ maxWidth: 1200, margin: '0 auto' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
      <div><h2 style={{ marginBottom: '.25rem' }}>Audit Logs</h2><p style={{ color: 'var(--text-secondary)', marginTop: 0 }}>Administrative audit events.</p></div>
      <button onClick={() => void load()} disabled={loading}><RefreshCw size={16} /> Refresh</button>
    </div>
    {error && <div role="alert" style={{ color: '#b91c1c', display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '1rem' }}><AlertTriangle size={18} />{error}<button onClick={() => void load()}>Retry</button></div>}
    <div className="glass-panel" style={{ overflowX: 'auto' }}>
      {loading && events.length === 0 ? <div style={{ padding: '3rem', textAlign: 'center' }}><Loader2 className="loader" /></div> :
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead><tr><th style={{ padding: '1rem' }}>Time</th><th style={{ padding: '1rem' }}>Event</th><th style={{ padding: '1rem' }}>Administrator</th></tr></thead>
          <tbody>{events.map(event => <tr key={event.id} style={{ borderTop: '1px solid var(--border-color)' }}>
            <td style={{ padding: '1rem', whiteSpace: 'nowrap' }}>{new Date(event.created_at).toLocaleString()}</td>
            <td style={{ padding: '1rem' }}>{event.event_type}</td>
            <td style={{ padding: '1rem', fontFamily: 'monospace' }}>{event.admin_id || 'System'}</td>
          </tr>)}
          {!loading && events.length === 0 && <tr><td colSpan={3} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>No audit events found.</td></tr>}
          </tbody>
        </table>}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', borderTop: '1px solid var(--border-color)' }}>
        <span>Showing {total === 0 ? 0 : offset + 1}–{Math.min(offset + events.length, total)} of {total}</span>
        <div style={{ display: 'flex', gap: '.5rem' }}>
          <button disabled={offset === 0 || loading} onClick={() => setOffset(value => Math.max(0, value - PAGE_SIZE))}>Previous</button>
          <button disabled={offset + PAGE_SIZE >= total || loading} onClick={() => setOffset(value => value + PAGE_SIZE)}>Next</button>
        </div>
      </div>
    </div>
  </section>;
}
