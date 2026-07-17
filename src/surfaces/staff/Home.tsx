import { useNavigate } from 'react-router-dom'
import {
  Broom,
  CaretRight,
  ChatCircleDots,
  ListChecks,
  LockSimple,
  LockSimpleOpen,
  MapPin,
  Money,
  NotePencil,
  Package,
  Receipt,
  Stack,
  Thermometer,
  Truck,
  Warning,
  Wrench,
  type Icon,
} from '@phosphor-icons/react'
import { useAuth } from '../../auth/AuthProvider'
import { useMyTasks } from '../../data/hooks'
import { dueLabel } from '../../lib/format'
import { Avatar } from '../../components/ui'
import { useStaffStore } from './StaffShell'
import { useToast } from '../../components/Toast'
import { useThreads } from '../../data/messages'
import type { TaskInstance } from '../../lib/types'

const grid: { id: string; label: string; Icon: Icon; c: string; b: string }[] = [
  { id: 'delivery', label: 'Delivery Received', Icon: Package, c: '#3B82F6', b: '#EAF1FE' },
  { id: 'open', label: 'Opening Checklist', Icon: LockSimpleOpen, c: '#16B364', b: '#E7F7EF' },
  { id: 'close', label: 'Closing Checklist', Icon: LockSimple, c: '#7C3AED', b: '#F1EBFC' },
  { id: 'temp', label: 'Temperature Log', Icon: Thermometer, c: '#E5484D', b: '#FCEBEC' },
  { id: 'cash', label: 'Cash Count', Icon: Money, c: '#0E9152', b: '#E7F7EF' },
  { id: 'clean', label: 'Weekly Cleaning', Icon: Broom, c: '#0891B2', b: '#E0F5FA' },
  { id: 'incident', label: 'Incident Report', Icon: Warning, c: '#E5484D', b: '#FCEBEC' },
  { id: 'maint', label: 'Maintenance', Icon: Wrench, c: '#B45309', b: '#FEF3E2' },
  { id: 'invoice', label: 'Invoice Upload', Icon: Receipt, c: '#DB2777', b: '#FCE7F3' },
  { id: 'stock', label: 'Stock Adjustment', Icon: Stack, c: '#7C3AED', b: '#F1EBFC' },
  { id: 'note', label: 'Staff Note', Icon: NotePencil, c: '#5B6478', b: '#F0F1F4' },
]

export function taskTarget(t: TaskInstance): string {
  if (t.is_temperature_log) return `/staff/temp/${t.id}`
  if (t.category === 'delivery') return '/staff/delivery'
  if (t.category === 'incident') return '/staff/incident'
  return `/staff/runner/${t.id}`
}

export function TaskRow({ t }: { t: TaskInstance }) {
  const navigate = useNavigate()
  const { text, overdue } = dueLabel(t)
  const color = overdue ? '#E5484D' : t.status === 'rejected' ? '#F59E0B' : '#3B82F6'
  const bg = overdue ? '#FCEBEC' : t.status === 'rejected' ? '#FEF3E2' : '#EAF1FE'
  const RowIcon = t.is_temperature_log
    ? Thermometer
    : t.category === 'delivery'
      ? Truck
      : t.category === 'incident'
        ? Warning
        : t.category === 'maintenance'
          ? Wrench
          : ListChecks
  return (
    <button
      onClick={() => navigate(taskTarget(t))}
      className="flex w-full items-center gap-3 rounded-[14px] border border-line bg-white p-[13px] text-left"
      style={{ borderLeft: `3px solid ${color}` }}
    >
      <div
        className="flex h-10 w-10 flex-none items-center justify-center rounded-[11px]"
        style={{ background: bg }}
      >
        <RowIcon size={19} weight="fill" color={color} />
      </div>
      <div className="flex-1">
        <div className="text-sm font-semibold">{t.title}</div>
        <div className="text-[11.5px] font-medium" style={{ color }}>
          {t.status === 'rejected' ? `Reopened — ${t.review_feedback ?? 'see feedback'}` : text}
        </div>
      </div>
      <CaretRight size={16} color="#C3C9D2" />
    </button>
  )
}

function InboxButton() {
  const navigate = useNavigate()
  const { unreadTotal } = useThreads()
  return (
    <button
      onClick={() => navigate('/staff/inbox')}
      className="relative flex h-[42px] w-[42px] items-center justify-center rounded-[13px] border border-line bg-white"
    >
      <ChatCircleDots size={21} />
      {unreadTotal > 0 && (
        <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-canvas bg-brand px-1 text-[10px] font-bold text-white">
          {unreadTotal}
        </span>
      )}
    </button>
  )
}

export default function Home() {
  const { profile } = useAuth()
  const store = useStaffStore()
  const navigate = useNavigate()
  const toast = useToast()
  const { data: myTasks } = useMyTasks()

  const dueNow = (myTasks ?? [])
    .filter((t) => t.due_at && new Date(t.due_at).getTime() < Date.now() + 4 * 3600e3)
    .slice(0, 3)

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  const openOp = (id: string) => {
    if (id === 'temp') return navigate('/staff/temp')
    if (id === 'delivery') return navigate('/staff/delivery')
    if (id === 'incident') return navigate('/staff/incident')
    if (id === 'invoice') return navigate('/staff/invoice')
    if (id === 'open' || id === 'close') {
      const inst = (myTasks ?? []).find(
        (t) =>
          t.title.toLowerCase().includes(id === 'open' ? 'opening' : 'closing') &&
          ['assigned', 'in_progress', 'rejected'].includes(t.status),
      )
      if (inst) return navigate(`/staff/runner/${inst.id}`)
      toast('No pending checklist of that type right now', 'info')
      return
    }
    navigate('/staff/new')
  }

  return (
    <div className="animate-fade px-[18px] pb-5 pt-4">
      <div className="mb-1 flex items-center justify-between">
        <div>
          <div className="text-[12.5px] text-muted">
            {greeting}, {profile!.full_name.split(' ')[0]}
          </div>
          <h2 className="text-[22px] font-extrabold tracking-tight">Store Operations</h2>
        </div>
        <div className="flex items-center gap-2.5">
          <InboxButton />
          <Avatar name={profile!.full_name} color={profile!.avatar_color} size={42} />
        </div>
      </div>
      <div className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-[5px] text-[11px] font-semibold text-success-deep">
        <MapPin size={12} weight="fill" />
        {store ? `${store.name}${store.city ? `, ${store.city}` : ''}` : 'No store assigned'}
      </div>

      <div className="mb-2 flex items-center justify-between">
        <span className="text-[13px] font-bold">Due now</span>
        {dueNow.some((t) => dueLabel(t).overdue) && (
          <span className="text-[11px] font-semibold text-danger">
            {dueNow.filter((t) => dueLabel(t).overdue).length} overdue
          </span>
        )}
      </div>
      <div className="mb-5 flex flex-col gap-2">
        {dueNow.map((t) => (
          <TaskRow key={t.id} t={t} />
        ))}
        {dueNow.length === 0 && (
          <div className="rounded-[14px] border border-line bg-white p-4 text-center text-xs text-muted">
            Nothing due right now — nice work.
          </div>
        )}
      </div>

      <div className="mb-2.5 text-[13px] font-bold">All operations</div>
      <div className="grid grid-cols-3 gap-2.5">
        {grid.map((g) => (
          <button
            key={g.id}
            onClick={() => openOp(g.id)}
            className="flex min-h-[92px] flex-col items-center justify-center gap-2 rounded-2xl border border-line bg-white px-2 py-3.5"
          >
            <div
              className="flex h-[46px] w-[46px] items-center justify-center rounded-[14px]"
              style={{ background: g.b }}
            >
              <g.Icon size={23} color={g.c} />
            </div>
            <span className="text-center text-[11px] font-semibold leading-tight">{g.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
