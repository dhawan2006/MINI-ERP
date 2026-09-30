import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './ui/components/ErrorBoundary'
import './index.css'
import { setupNavigationShortcuts } from './application/state/navigationStore'

setupNavigationShortcuts();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
