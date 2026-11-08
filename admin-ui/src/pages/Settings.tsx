import { ShieldCheck, User } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

export function Settings() {
  const context = useAuthStore(state => state.context);

  return (
    <section style={{ maxWidth: 800, margin: '0 auto' }}>
      <h2>Settings</h2>
      <div className="glass-panel" style={{ padding: '2rem', marginTop: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
          <ShieldCheck size={28} color="var(--primary-brand)" />
          <div>
            <h3 style={{ margin: 0 }}>Administrator Profile</h3>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Current session security and role configuration</p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.5rem' }}>
          <div style={{ padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
            <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-tertiary)', fontWeight: 600 }}>Role</span>
            <div style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--primary-brand)', marginTop: '0.25rem' }}>
              {context?.role || 'Administrator'}
            </div>
          </div>

          <div style={{ padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
            <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-tertiary)', fontWeight: 600 }}>Authentication Level</span>
            <div style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--text-primary)', marginTop: '0.25rem' }}>
              {context?.aal || 'AAL1'}
            </div>
          </div>

          <div style={{ padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
            <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-tertiary)', fontWeight: 600 }}>Administrator ID</span>
            <div style={{ fontSize: '0.9rem', fontFamily: 'monospace', color: 'var(--text-secondary)', marginTop: '0.25rem', wordBreak: 'break-all' }}>
              {context?.adminId || '—'}
            </div>
          </div>
        </div>

        <div style={{ marginTop: '2rem', padding: '1rem', background: 'rgba(59, 130, 246, 0.05)', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <User size={20} color="var(--primary-brand)" />
          <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            Mini POS standalone administration. Role-based access control and multi-factor authentication are enforced for sensitive administrative actions.
          </p>
        </div>
      </div>
    </section>
  );
}
