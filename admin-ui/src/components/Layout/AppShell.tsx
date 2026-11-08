import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { useAuthStore } from '../../store/authStore';

export function AppShell() {
  const context = useAuthStore(state => state.context);
  return (
    <div className="app-layout">
      <Sidebar />
      <div className="main-content">
        <Header />
        {context?.environment === 'QA' && context.projectRef === 'hooemticmycoqhoccdsn' && (
          <div role="status" style={{ padding: '.5rem 1rem', background: '#fef3c7', color: '#92400e', borderBottom: '1px solid #f59e0b', fontSize: '.875rem', fontWeight: 600 }}>
            QA ENVIRONMENT · {context.projectRef}
          </div>
        )}
        <main className="page-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
