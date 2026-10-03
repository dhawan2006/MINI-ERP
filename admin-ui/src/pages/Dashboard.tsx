export function Dashboard() {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Overview Dashboard</h2>
        <span style={{ padding: '0.5rem 1rem', background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', borderRadius: '20px', fontSize: '0.875rem', fontWeight: 600 }}>
          Phase 3B Preview
        </span>
      </div>
      
      <div className="dashboard-grid">
        <div className="stat-card glass-panel">
          <span className="title">Total Active Licenses</span>
          <span className="value">--</span>
        </div>
        <div className="stat-card glass-panel">
          <span className="title">Licenses Due Soon</span>
          <span className="value" style={{ color: '#eab308' }}>--</span>
        </div>
        <div className="stat-card glass-panel">
          <span className="title">Overdue Check-ins</span>
          <span className="value" style={{ color: '#ef4444' }}>--</span>
        </div>
        <div className="stat-card glass-panel">
          <span className="title">Total Customers</span>
          <span className="value">--</span>
        </div>
      </div>
    </div>
  );
}
