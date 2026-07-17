import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import {
  Bell,
  House,
  ListChecks,
  Plus,
  User,
} from '@phosphor-icons/react'
import { useMemo } from 'react'
import { useAuth } from '../../auth/AuthProvider'
import Home from './Home'
import TasksPage from './TasksPage'
import Alerts from './Alerts'
import Profile from './Profile'
import Runner from './Runner'
import TempLog from './TempLog'
import DeliveryWizard from './DeliveryWizard'
import Incident from './Incident'
import Success from './Success'
import CreateTask from './CreateTask'
import { InboxList, InboxThread } from './Inbox'
import InvoiceUpload from './InvoiceUpload'

export function useStaffStore() {
  const { stores, myStoreIds } = useAuth()
  return useMemo(
    () => stores.find((s) => myStoreIds.includes(s.id)) ?? stores[0],
    [stores, myStoreIds],
  )
}

const tabs = [
  { id: 'home', label: 'Home', Icon: House, to: '/staff' },
  { id: 'tasks', label: 'Tasks', Icon: ListChecks, to: '/staff/tasks' },
  { id: 'new', label: '', Icon: Plus, to: '/staff/new' },
  { id: 'alerts', label: 'Alerts', Icon: Bell, to: '/staff/alerts' },
  { id: 'profile', label: 'Profile', Icon: User, to: '/staff/profile' },
]

export default function StaffShell() {
  const location = useLocation()
  const navigate = useNavigate()
  const isFlow =
    ['/staff/runner', '/staff/temp', '/staff/delivery', '/staff/incident', '/staff/success', '/staff/new', '/staff/invoice'].some(
      (p) => location.pathname.startsWith(p),
    ) || /^\/staff\/inbox\/./.test(location.pathname)

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-[430px] flex-col bg-canvas shadow-2xl">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Routes>
          <Route index element={<Home />} />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="alerts" element={<Alerts />} />
          <Route path="profile" element={<Profile />} />
          <Route path="runner/:id" element={<Runner />} />
          <Route path="temp" element={<TempLog />} />
          <Route path="temp/:id" element={<TempLog />} />
          <Route path="delivery" element={<DeliveryWizard />} />
          <Route path="incident" element={<Incident />} />
          <Route path="success" element={<Success />} />
          <Route path="new" element={<CreateTask />} />
          <Route path="invoice" element={<InvoiceUpload />} />
          <Route path="inbox" element={<InboxList />} />
          <Route path="inbox/:threadId" element={<InboxThread />} />
          <Route path="*" element={<Navigate to="/staff" replace />} />
        </Routes>
      </div>

      {!isFlow && (
        <div className="z-30 flex h-16 flex-none items-center border-t border-line bg-white px-2 pb-1">
          {tabs.map((tb) => {
            const active =
              tb.to === '/staff'
                ? location.pathname === '/staff'
                : location.pathname.startsWith(tb.to)
            if (tb.id === 'new')
              return (
                <button key={tb.id} onClick={() => navigate(tb.to)} className="flex flex-1 flex-col items-center">
                  <div className="-mt-0.5 flex h-[34px] w-11 items-center justify-center rounded-xl bg-brand">
                    <Plus size={20} weight="bold" color="#fff" />
                  </div>
                </button>
              )
            return (
              <button
                key={tb.id}
                onClick={() => navigate(tb.to)}
                className="flex flex-1 flex-col items-center gap-[3px] py-1.5"
              >
                <tb.Icon
                  size={22}
                  weight={active ? 'fill' : 'regular'}
                  color={active ? '#FF5A2D' : '#8B93A4'}
                />
                <span
                  className="text-[9.5px] font-semibold"
                  style={{ color: active ? '#FF5A2D' : '#8B93A4' }}
                >
                  {tb.label}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
