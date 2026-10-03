import { useAuthStore } from '../../store/authStore';
import { supabase } from '../../supabase';
import { LogOut } from 'lucide-react';

export function Header() {
  const session = useAuthStore(state => state.session);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <header className="top-header">
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
          {session?.user.email}
        </span>
        <button 
          onClick={handleLogout}
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
