import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { CircleNotch } from '@phosphor-icons/react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from './auth/AuthProvider'
import Login from './auth/Login'
import { useRealtimeSync } from './data/hooks'
import { flushQueue } from './data/ops'
import { useToast } from './components/Toast'
import OwnerLayout from './surfaces/owner/OwnerLayout'
import Dashboard from './surfaces/owner/Dashboard'
import ApprovalsPage from './surfaces/owner/ApprovalsPage'
import DeliveriesPage from './surfaces/owner/DeliveriesPage'
import EscalationsPage from './surfaces/owner/EscalationsPage'
import ReportsPage from './surfaces/owner/ReportsPage'
import StoresPage from './surfaces/owner/StoresPage'
import InboxPage from './surfaces/owner/InboxPage'
import AdminPage from './surfaces/owner/AdminPage'
import RotaPage from './surfaces/owner/RotaPage'
import StaffShell from './surfaces/staff/StaffShell'
import LeaderShell from './surfaces/leader/LeaderShell'

function Splash() {
  return (
    <div className="flex min-h-full items-center justify-center bg-navy">
      <CircleNotch size={34} color="#FF5A2D" className="animate-spin" />
    </div>
  )
}

export default function App() {
  const { session, profile, loading, loadError, profileMissing, retry, signOut } = useAuth()
  useRealtimeSync()
  const toast = useToast()
  const qc = useQueryClient()

  // offline queue: flush at startup, on reconnect, on tab focus, and every 60s (PWA-4)
  useEffect(() => {
    if (!session) return
    const flush = async () => {
      if (!navigator.onLine) return
      const { flushed } = await flushQueue(session.user.id)
      if (flushed > 0) {
        toast(`${flushed} offline submission${flushed > 1 ? 's' : ''} synced ✓`)
        qc.invalidateQueries()
      }
    }
    flush()
    const onVisibility = () => {
      if (document.visibilityState === 'visible') flush()
    }
    const iv = setInterval(flush, 60_000)
    window.addEventListener('online', flush)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearInterval(iv)
      window.removeEventListener('online', flush)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [session?.user.id])

  if (loading) return <Splash />
  if (session && loadError)
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-4 bg-navy p-6 text-center">
        <div className="text-[17px] font-bold text-white">Couldn't load your account</div>
        <div className="max-w-[300px] text-[12px] leading-relaxed text-muted">{loadError}</div>
        <button
          onClick={retry}
          className="rounded-xl bg-brand px-6 py-2.5 text-sm font-bold text-white"
        >
          Retry
        </button>
      </div>
    )
  if (session && profileMissing)
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-4 bg-navy p-6 text-center">
        <div className="text-[17px] font-bold text-white">Your account isn't set up yet</div>
        <div className="max-w-[300px] text-[12px] leading-relaxed text-muted">
          You're signed in, but no staff profile exists for this account — ask your manager to set
          one up.
        </div>
        <button
          onClick={() => signOut()}
          className="rounded-xl bg-white/10 px-6 py-2.5 text-sm font-bold text-white"
        >
          Sign out
        </button>
      </div>
    )
  if (!session || !profile) return <Login />

  const home =
    profile.role === 'staff'
      ? '/staff'
      : profile.role === 'team_leader'
        ? '/leader'
        : '/owner'

  return (
    <Routes>
      {(profile.role === 'owner' || profile.role === 'manager' || profile.role === 'remote_office') && (
        <Route path="/owner" element={<OwnerLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="approvals" element={<ApprovalsPage />} />
          <Route path="deliveries" element={<DeliveriesPage />} />
          <Route path="escalations" element={<EscalationsPage />} />
          <Route path="rota" element={<RotaPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="stores" element={<StoresPage />} />
          <Route path="inbox" element={<InboxPage />} />
          {profile.role === 'owner' && <Route path="admin" element={<AdminPage />} />}
        </Route>
      )}
      {profile.role === 'team_leader' && <Route path="/leader/*" element={<LeaderShell />} />}
      {(profile.role === 'staff' || profile.role === 'team_leader') && (
        <Route path="/staff/*" element={<StaffShell />} />
      )}
      <Route path="*" element={<Navigate to={home} replace />} />
    </Routes>
  )
}
