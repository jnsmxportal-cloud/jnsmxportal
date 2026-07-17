import {
  ClockCountdown,
  SealCheck,
  Truck,
  WarningOctagon,
} from '@phosphor-icons/react'
import { useMarkNotificationsRead, useNotifications } from '../../data/hooks'
import { timeAgo } from '../../lib/format'
import { useEffect } from 'react'

const styles: Record<string, { c: string; b: string }> = {
  escalation: { c: '#E5484D', b: '#FCEBEC' },
  temp_breach: { c: '#E5484D', b: '#FCEBEC' },
  missed: { c: '#F59E0B', b: '#FEF3E2' },
  overdue: { c: '#F59E0B', b: '#FEF3E2' },
  delivery: { c: '#3B82F6', b: '#EAF1FE' },
  assigned: { c: '#3B82F6', b: '#EAF1FE' },
  submitted: { c: '#16B364', b: '#E7F7EF' },
  approved: { c: '#16B364', b: '#E7F7EF' },
  rejected: { c: '#E5484D', b: '#FCEBEC' },
  reopened: { c: '#F59E0B', b: '#FEF3E2' },
}

export default function Alerts() {
  const { data: notifs } = useNotifications()
  const markRead = useMarkNotificationsRead()
  useEffect(() => {
    const t = setTimeout(() => markRead.mutate(), 1200)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className="animate-fade px-[18px] pb-5 pt-4">
      <h2 className="mb-4 text-[21px] font-extrabold tracking-tight">Alerts</h2>
      <div className="flex flex-col gap-2.5">
        {(notifs ?? []).map((n) => {
          const s = styles[n.type] ?? { c: '#5B6478', b: '#F0F1F4' }
          const NIcon =
            n.type === 'delivery' || n.type === 'assigned'
              ? Truck
              : n.type === 'submitted' || n.type === 'approved'
                ? SealCheck
                : n.type === 'missed' || n.type === 'overdue'
                  ? ClockCountdown
                  : WarningOctagon
          return (
            <div key={n.id} className="flex gap-3 rounded-[14px] border border-line bg-white p-[13px]">
              <div
                className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px]"
                style={{ background: s.b }}
              >
                <NIcon size={17} weight="fill" color={s.c} />
              </div>
              <div className="flex-1">
                <div className="text-[13px] leading-snug">{n.title}</div>
                {n.body && <div className="mt-0.5 text-[11.5px] text-slate">{n.body}</div>}
                <div className="mt-1 text-[10.5px] text-muted">{timeAgo(n.created_at)}</div>
              </div>
              {!n.read_at && <span className="mt-1 h-2 w-2 flex-none rounded-full bg-brand" />}
            </div>
          )
        })}
        {(notifs ?? []).length === 0 && (
          <div className="rounded-[14px] border border-line bg-white p-6 text-center text-xs text-muted">
            No alerts yet.
          </div>
        )}
      </div>
    </div>
  )
}
