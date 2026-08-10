import { useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate, useOutletContext } from 'react-router-dom'
import {
  Bell,
  ClockCountdown,
  MapPin,
  Plus,
  SealCheck,
  SignOut,
  SquaresFour,
  Storefront,
  Truck,
  WarningOctagon,
  ChartBar,
  ChatCircleDots,
  GearSix,
  List,
  type Icon,
} from '@phosphor-icons/react'
import { useAuth } from '../../auth/AuthProvider'
import {
  useDeliveries,
  useEscalations,
  useMarkNotificationsRead,
  useNotifications,
  useTasks,
} from '../../data/hooks'
import { timeAgo, todayLabel } from '../../lib/format'
import { Avatar } from '../../components/ui'
import CreateTaskModal from './CreateTaskModal'
import { useThreads } from '../../data/messages'

export interface OwnerCtx {
  storeId: string | 'all'
}

export function useOwnerCtx() {
  return useOutletContext<OwnerCtx>()
}

const notifIconColors: Record<string, { c: string; b: string }> = {
  escalation: { c: '#E5484D', b: '#FCEBEC' },
  temp_breach: { c: '#E5484D', b: '#FCEBEC' },
  missed: { c: '#F59E0B', b: '#FEF3E2' },
  delivery: { c: '#3B82F6', b: '#EAF1FE' },
  submitted: { c: '#16B364', b: '#E7F7EF' },
  approved: { c: '#16B364', b: '#E7F7EF' },
}

const navDefs: {
  to: string
  label: string
  icon: Icon
  end?: boolean
  badge?: 'approvals' | 'escalations' | 'inbox'
  ownerOnly?: boolean
}[] = [
  { to: '/owner', label: 'Dashboard', icon: SquaresFour, end: true },
  { to: '/owner/approvals', label: 'Approvals', icon: SealCheck, badge: 'approvals' },
  { to: '/owner/deliveries', label: 'Deliveries', icon: Truck },
  { to: '/owner/escalations', label: 'Escalations', icon: WarningOctagon, badge: 'escalations' },
  { to: '/owner/inbox', label: 'Inbox', icon: ChatCircleDots, badge: 'inbox' },
  { to: '/owner/reports', label: 'Reports', icon: ChartBar },
  { to: '/owner/stores', label: 'Stores & geofence', icon: MapPin },
  { to: '/owner/admin', label: 'Admin', icon: GearSix, ownerOnly: true },
]

const titles: Record<string, string> = {
  '/owner': 'Dashboard',
  '/owner/approvals': 'Approvals',
  '/owner/deliveries': 'Deliveries',
  '/owner/escalations': 'Escalations',
  '/owner/inbox': 'Inbox',
  '/owner/reports': 'Reports & analytics',
  '/owner/stores': 'Stores & geofence',
  '/owner/admin': 'Admin',
}

export default function OwnerLayout() {
  const { profile, stores, signOut } = useAuth()
  const [storeId, setStoreId] = useState<string | 'all'>('all')
  const [notifOpen, setNotifOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [navOpen, setNavOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()

  const { data: tasks } = useTasks({ storeId: 'all' })
  const { data: escalations } = useEscalations('all')
  useDeliveries('all')
  const { data: notifs } = useNotifications()
  const markRead = useMarkNotificationsRead()

  const approvalsCount = useMemo(
    () => (tasks ?? []).filter((t) => t.status === 'submitted').length,
    [tasks],
  )
  const escCount = (escalations ?? []).length
  const { unreadTotal } = useThreads()
  const unread = (notifs ?? []).filter((n) => !n.read_at).length

  const roleLabel =
    profile!.role === 'owner'
      ? `Store Owner · ${stores.length} stores`
      : profile!.role === 'manager'
        ? 'Manager · monitoring'
        : 'Remote Office'

  return (
    <div className="flex h-full min-h-0 bg-canvas">
      {/* mobile drawer backdrop */}
      {navOpen && (
        <div
          className="fixed inset-0 z-[65] bg-navy/60 lg:hidden"
          onClick={() => setNavOpen(false)}
        />
      )}
      {/* Sidebar: static on desktop, slide-over drawer on mobile */}
      <div
        className={`${
          navOpen ? 'fixed inset-y-0 left-0 z-[70] flex' : 'hidden'
        } w-[246px] flex-none flex-col overflow-y-auto bg-navy p-[14px] pt-5 text-white lg:static lg:flex`}
      >
        <div className="px-2 pb-5">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-[.08em] text-[#5B6478]">
            Signed in as
          </div>
          <div className="flex items-center gap-2.5">
            <Avatar name={profile!.full_name} color={profile!.avatar_color} />
            <div>
              <div className="text-[13.5px] font-semibold">{profile!.full_name}</div>
              <div className="text-[11px] text-muted">{roleLabel}</div>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-0.5">
          {navDefs.filter((n) => !n.ownerOnly || profile!.role === 'owner').map((n) => {
            const badge =
              n.badge === 'approvals'
                ? approvalsCount
                : n.badge === 'escalations'
                  ? escCount
                  : n.badge === 'inbox'
                    ? unreadTotal
                    : 0
            return (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                onClick={() => setNavOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold transition ${
                    isActive ? 'bg-brand text-white' : 'text-muted hover:bg-navy-2 hover:text-white'
                  }`
                }
              >
                <n.icon size={18} />
                <span className="flex-1 text-left">{n.label}</span>
                {badge > 0 && (
                  <span className="rounded-full bg-brand px-[7px] py-[1px] text-[10px] font-bold text-white">
                    {badge}
                  </span>
                )}
              </NavLink>
            )
          })}
        </div>
        <div className="mt-auto rounded-xl bg-navy-2 p-[13px]">
          <div className="mb-1 flex items-center gap-[7px] text-[11.5px] font-semibold text-success">
            <span className="h-[7px] w-[7px] animate-pulsedot rounded-full bg-success" />
            Live · Realtime sync
          </div>
          <div className="text-[10.5px] leading-normal text-muted">
            Dashboard updates automatically as staff submit — no refresh.
          </div>
        </div>
        <button
          onClick={signOut}
          className="mt-3 flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[12.5px] font-semibold text-muted hover:bg-navy-2 hover:text-white"
        >
          <SignOut size={17} /> Sign out
        </button>
      </div>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <div className="relative z-30 flex flex-none flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-line bg-white px-4 py-2.5 lg:h-16 lg:flex-nowrap lg:px-[26px] lg:py-0">
          <div className="flex min-w-0 items-center gap-2.5">
            <button
              onClick={() => setNavOpen(true)}
              className="flex h-9 w-9 flex-none items-center justify-center rounded-lg border border-ink/10 lg:hidden"
              aria-label="Open navigation"
            >
              <List size={18} />
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-base font-bold tracking-tight lg:text-xl">
                {Object.entries(titles)
                  .filter(
                    ([p]) => location.pathname === p || location.pathname.startsWith(`${p}/`),
                  )
                  .sort((a, b) => b[0].length - a[0].length)[0]?.[1] ?? 'Dashboard'}
              </h1>
              <div className="mt-px hidden text-[11.5px] text-muted sm:block">{todayLabel()}</div>
            </div>
          </div>
          <div className="flex min-w-0 flex-1 items-center justify-end gap-2 lg:flex-none lg:gap-3.5">
            <div className="flex min-w-0 gap-0.5 overflow-x-auto rounded-[10px] bg-canvas p-[3px]">
              {[{ id: 'all' as const, name: 'All stores' }, ...stores].map((s) => (
                <button
                  key={s.id}
                  onClick={() => setStoreId(s.id)}
                  className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-semibold transition lg:px-3 ${
                    storeId === s.id ? 'bg-white text-ink shadow-sm' : 'text-muted'
                  }`}
                >
                  {s.name}
                </button>
              ))}
            </div>
            <div className="relative">
              <button
                onClick={() => {
                  setNotifOpen((o) => !o)
                  if (!notifOpen && unread > 0) markRead.mutate()
                }}
                className="relative flex h-10 w-10 flex-none items-center justify-center rounded-xl border border-ink/10 bg-white"
              >
                <Bell size={19} />
                {unread > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-white bg-danger px-1 text-[10px] font-bold text-white">
                    {unread}
                  </span>
                )}
              </button>
              {notifOpen && (
                <div className="absolute right-0 top-12 z-50 w-[340px] max-w-[calc(100vw-32px)] animate-fade overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-[0_24px_60px_rgba(15,20,32,.18)]">
                  <div className="flex items-center justify-between border-b border-line px-4 py-3.5">
                    <span className="font-display text-sm font-bold">Notifications</span>
                    <span className="text-[11px] text-muted">{unread} unread</span>
                  </div>
                  <div className="max-h-[360px] overflow-y-auto">
                    {(notifs ?? []).map((nt) => {
                      const style = notifIconColors[nt.type] ?? { c: '#5B6478', b: '#F0F1F4' }
                      return (
                        <button
                          key={nt.id}
                          onClick={() => {
                            setNotifOpen(false)
                            navigate(nt.deep_link ?? '/owner')
                          }}
                          className={`flex w-full gap-3 border-b border-ink/5 px-4 py-3 text-left hover:bg-canvas ${!nt.read_at ? 'bg-brand-tint/40' : ''}`}
                        >
                          <div
                            className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[10px]"
                            style={{ background: style.b }}
                          >
                            {nt.type === 'delivery' ? (
                              <Truck size={16} weight="fill" color={style.c} />
                            ) : nt.type === 'submitted' || nt.type === 'approved' ? (
                              <SealCheck size={16} weight="fill" color={style.c} />
                            ) : nt.type === 'missed' ? (
                              <ClockCountdown size={16} weight="fill" color={style.c} />
                            ) : (
                              <WarningOctagon size={16} weight="fill" color={style.c} />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-[12.5px] leading-snug">{nt.title}</div>
                            <div className="mt-0.5 text-[10.5px] text-muted">
                              {timeAgo(nt.created_at)}
                            </div>
                          </div>
                          {!nt.read_at && (
                            <span className="mt-1 h-2 w-2 flex-none rounded-full bg-brand" />
                          )}
                        </button>
                      )
                    })}
                    {(notifs ?? []).length === 0 && (
                      <div className="p-8 text-center text-xs text-muted">No notifications yet.</div>
                    )}
                  </div>
                </div>
              )}
            </div>
            {profile!.role !== 'manager' && (
              <button
                onClick={() => setCreateOpen(true)}
                className="flex h-10 flex-none items-center gap-[7px] rounded-xl bg-brand px-3 text-[13px] font-semibold text-white lg:px-4"
              >
                <Plus size={15} weight="bold" />
                <span className="hidden sm:inline">New task</span>
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-10 pt-4 lg:px-[26px] lg:pt-6">
          <Outlet context={{ storeId } satisfies OwnerCtx} />
        </div>
      </div>

      {createOpen && <CreateTaskModal onClose={() => setCreateOpen(false)} />}

      {/* brand mark for small screens */}
      <div className="hidden">
        <Storefront />
      </div>
    </div>
  )
}
