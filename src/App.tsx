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
  const { session, profile, loading } = useAuth()
  useRealtimeSync()
  const toast = useToast()
  const qc = useQueryClient()

  // offline queue: flush on reconnect and at startup (PWA-4)
  useEffect(() => {
    if (!session) return
    const flush = async () => {
      const n = await flushQueue(session.user.id)
      if (n > 0) {
        toast(`${n} offline submission${n > 1 ? 's' : ''} synced ✓`)
        qc.invalidateQueries()
      }
    }
    flush()
    window.addEventListener('online', flush)
    return () => window.removeEventListener('online', flush)
  }, [session?.user.id])

  if (loading) return <Splash />
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
