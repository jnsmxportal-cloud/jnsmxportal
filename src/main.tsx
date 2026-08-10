import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { AuthProvider } from './auth/AuthProvider'
import { ToastProvider } from './components/Toast'
import './index.css'

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-full flex-col items-center justify-center gap-4 bg-navy p-6 text-center">
          <div className="text-[17px] font-bold text-white">Something went wrong</div>
          <button
            onClick={() => window.location.reload()}
            className="rounded-xl bg-brand px-6 py-2.5 text-sm font-bold text-white"
          >
            Reload
          </button>
          <div className="max-w-[300px] text-[11px] leading-relaxed text-muted">
            {this.state.error.message}
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    if (document.getElementById('sw-update-banner')) return
    const bar = document.createElement('div')
    bar.id = 'sw-update-banner'
    bar.style.cssText =
      'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);z-index:9999;display:flex;align-items:center;gap:12px;background:#0F1420;color:#fff;padding:10px 14px;border-radius:14px;font:600 13px Inter,system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.35)'
    bar.append('Update available')
    const btn = document.createElement('button')
    btn.textContent = 'Refresh'
    btn.style.cssText =
      'background:#FF5A2D;color:#fff;border:0;padding:6px 14px;border-radius:9px;font:700 13px Inter,system-ui,sans-serif;cursor:pointer'
    btn.onclick = () => updateSW(true)
    bar.appendChild(btn)
    document.body.appendChild(bar)
  },
})

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 15_000, retry: 1 },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ToastProvider>
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </ToastProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)
