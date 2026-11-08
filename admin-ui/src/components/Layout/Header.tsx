import { useAuthStore } from '../../store/authStore';
import { LogOut } from 'lucide-react';

export function Header() {
  const { session, context, logout } = useAuthStore();

  return (
    <header className="top-header">
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.2 }}>
          <span style={{ color: 'var(--text-primary)', fontSize: '0.875rem', fontWeight: 600 }}>
            {session?.user.email}
          </span>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
            {context?.role || 'Admin'}
          </span>
        </div>
        <button 
          onClick={logout}
          style={{ 
            background: 'transparent', 
            border: 'none', 
            color: 'var(--text-secondary)', 
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.5rem',
            borderRadius: '6px'
          }}
          onMouseOver={(e) => e.currentTarget.style.color = '#ef4444'}
          onMouseOut={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
        >
          <LogOut size={18} />
          Sign Out
        </button>
      </div>
    </header>
  );
}


