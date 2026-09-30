import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // In a real application, you might log this to a remote service.
    // For this offline app, we log it to the console which the main process logger can optionally capture.
    console.error('Uncaught rendering error:', error, errorInfo);
  }

  private handleReload = () => {
    // Reloading safely resets the React tree. The active draft is stored in SQLite and
    // will be reloaded on boot.
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div style={styles.container}>
          <div style={styles.card}>
            <h2 style={styles.title}>Something went wrong.</h2>
            <p style={styles.message}>An unexpected display error occurred. Your data is safe.</p>
            <button style={styles.button} onClick={this.handleReload}>
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const styles = {
  container: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100vh',
    width: '100vw',
    backgroundColor: '#f9fafb',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
  },
  card: {
    backgroundColor: 'white',
    padding: '2rem',
    borderRadius: '8px',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
    textAlign: 'center' as const,
    maxWidth: '400px'
  },
  title: {
    margin: '0 0 1rem 0',
    color: '#111827',
    fontSize: '1.25rem'
  },
  message: {
    margin: '0 0 1.5rem 0',
    color: '#4b5563',
    fontSize: '0.875rem'
  },
  button: {
    backgroundColor: '#3b82f6',
    color: 'white',
    border: 'none',
    padding: '0.5rem 1rem',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '0.875rem',
    fontWeight: 500
  }
};
