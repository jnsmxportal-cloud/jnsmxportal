import { useMemo } from 'react'
import { isToday } from 'date-fns'
import {
  ChartBar,
  CheckCircle,
  ClockCountdown,
  ListBullets,
  SealCheck,
  ShieldCheck,
  Truck,
  Users,
  WarningOctagon,
  CheckCircle as CheckCircleIcon,
} from '@phosphor-icons/react'
import { Card, SectionHead, StatusChip, deliveryStatusStyle } from '../../components/ui'
import { useAuth } from '../../auth/AuthProvider'
import { useDeliveries, useEscalations, useProfiles, useTasks } from '../../data/hooks'
import { dueLabel, timeAgo } from '../../lib/format'
import { useOwnerCtx } from './OwnerLayout'
import { ApprovalCard, useNames } from './shared'
import type { TaskInstance } from '../../lib/types'

function storeCompliance(tasks: TaskInstance[], storeId: string): number {
  const relevant = tasks.filter((t) => t.store_id === storeId)
  const done = relevant.filter((t) => ['completed', 'approved', 'submitted'].includes(t.status)).length
  const bad = relevant.filter(
    (t) =>
      t.status === 'missed' ||
      (['assigned', 'in_progress', 'rejected'].includes(t.status) &&
        t.due_at &&
        new Date(t.due_at) < new Date()),
  ).length
  if (done + bad === 0) return 100
  return Math.round((done / (done + bad)) * 100)
}

export default function Dashboard() {
  const { storeId } = useOwnerCtx()
  const { stores } = useAuth()
  const { data: allTasks } = useTasks({ storeId: 'all' })
  const { data: deliveries } = useDeliveries(storeId)
  const { data: escalations } = useEscalations(storeId)
  const { data: profiles } = useProfiles()
  const { userName, storeName } = useNames()

  const tasks = useMemo(
    () => (allTasks ?? []).filter((t) => storeId === 'all' || t.store_id === storeId),
    [allTasks, storeId],
  )

  const active = tasks.filter((t) => ['assigned', 'in_progress', 'rejected'].includes(t.status))
  const completedToday = tasks.filter(
    (t) => t.completed_at && isToday(new Date(t.completed_at)),
  ).length
  const pendingReview = tasks.filter((t) => t.status === 'submitted')
  const overdue = tasks.filter(
    (t) =>
      t.status === 'missed' ||
      (['assigned', 'in_progress', 'rejected'].includes(t.status) &&
        t.due_at &&
        new Date(t.due_at) < new Date()),
  )
  const visibleStores = storeId === 'all' ? stores : stores.filter((s) => s.id === storeId)
  const compliance =
    visibleStores.length === 0
      ? 100
      : Math.round(
          visibleStores.reduce((a, s) => a + storeCompliance(allTasks ?? [], s.id), 0) /
            visibleStores.length,
        )

  const kpis = [
    { label: 'Active tasks', value: active.length, Icon: ListBullets, c: '#3B82F6', b: '#EAF1FE' },
    { label: 'Completed today', value: completedToday, Icon: CheckCircle, c: '#16B364', b: '#E7F7EF' },
    { label: 'Pending review', value: pendingReview.length, Icon: SealCheck, c: '#F59E0B', b: '#FEF3E2' },
    { label: 'Overdue', value: overdue.length, Icon: ClockCountdown, c: '#E5484D', b: '#FCEBEC' },
    { label: 'Compliance', value: `${compliance}%`, Icon: ShieldCheck, c: '#7C3AED', b: '#F1EBFC' },
  ]

  const onlineStaff = (profiles ?? []).filter((p) => p.is_online)

  return (
    <div className="animate-fade">
      {/* KPI row */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:gap-4 xl:grid-cols-5">
        {kpis.map((k) => (
          <Card key={k.label} className="relative overflow-hidden p-[18px]">
            <div className="absolute bottom-0 left-0 top-0 w-1" style={{ background: k.c }} />
            <div className="mb-3 flex items-center justify-between">
              <div
                className="flex h-[38px] w-[38px] items-center justify-center rounded-[11px]"
                style={{ background: k.b }}
              >
                <k.Icon size={19} weight="fill" color={k.c} />
              </div>
            </div>
            <div className="font-display text-[32px] font-bold leading-none tracking-tight">
              {k.value}
            </div>
            <div className="mt-1.5 text-xs font-medium text-muted">{k.label}</div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[1.55fr_1fr]">
        {/* LEFT */}
        <div className="flex flex-col gap-5">
          {/* Store status */}
          <div>
            <SectionHead
              title="Store status · live"
              right={<span className="text-[11.5px] text-muted">{visibleStores.length} stores</span>}
            />
            <div className="grid grid-cols-1 gap-[13px] sm:grid-cols-2 lg:grid-cols-3">
              {visibleStores.map((s) => {
                const comp = storeCompliance(allTasks ?? [], s.id)
                const dot = comp >= 92 ? '#16B364' : comp >= 80 ? '#F59E0B' : '#E5484D'
                const opening = (allTasks ?? []).some(
                  (t) =>
                    t.store_id === s.id &&
                    t.title.toLowerCase().includes('opening') &&
                    ['submitted', 'completed', 'approved'].includes(t.status) &&
                    t.submitted_at &&
                    isToday(new Date(t.submitted_at)),
                )
                const staffCount = onlineStaff.length
                return (
                  <Card key={s.id} className="p-[15px]">
                    <div className="mb-2.5 flex items-center gap-2">
                      <span className="h-[9px] w-[9px] rounded-full" style={{ background: dot }} />
                      <span className="font-display text-[13.5px] font-bold">{s.name}</span>
                    </div>
                    <div className="mb-2.5 flex items-baseline gap-1.5">
                      <span
                        className="font-display text-[26px] font-bold tracking-tight"
                        style={{ color: dot }}
                      >
                        {comp}%
                      </span>
                      <span className="text-[10.5px] text-muted">compliance</span>
                    </div>
                    <div className="flex flex-col gap-1.5 text-[11.5px]">
                      <div className="flex items-center justify-between">
                        <span className="text-slate">Opening</span>
                        {opening ? (
                          <StatusChip text="Done ✓" color="#0E9152" bg="#E7F7EF" />
                        ) : (
                          <StatusChip text="Pending" color="#B45309" bg="#FEF3E2" />
                        )}
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate">Closing</span>
                        <StatusChip text="Tonight" color="#5B6478" bg="#F0F1F4" />
                      </div>
                      <div className="flex items-center justify-between border-t border-ink/5 pt-1.5">
                        <span className="flex items-center gap-1 text-slate">
                          <Users size={12} /> Online now
                        </span>
                        <span className="font-semibold">{staffCount}</span>
                      </div>
                    </div>
                  </Card>
                )
              })}
            </div>
          </div>

          {/* Deliveries */}
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-ink/5 px-[17px] py-[15px]">
              <div className="flex items-center gap-2">
                <Truck size={16} weight="fill" color="#3B82F6" />
                <h3 className="text-sm font-bold">Today's deliveries</h3>
              </div>
              <span className="text-[11.5px] text-muted">{(deliveries ?? []).length} logged</span>
            </div>
            {(deliveries ?? []).map((d) => {
              const st = deliveryStatusStyle[d.status]
              return (
                <div
                  key={d.id}
                  className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 border-b border-ink/5 px-[17px] py-3 sm:grid-cols-[1.4fr_1fr_.9fr_auto]"
                >
                  <div>
                    <div className="text-[13px] font-semibold">{d.supplier}</div>
                    <div className="text-[11px] text-muted">
                      {storeName(d.store_id)} · Inv #{d.invoice_no}
                    </div>
                  </div>
                  <div
                    className="hidden text-xs sm:block"
                    style={{
                      color: d.discrepancy_units > 0 ? '#E5484D' : '#8B93A4',
                      fontWeight: d.discrepancy_units > 0 ? 700 : 400,
                    }}
                  >
                    {d.discrepancy_units > 0 ? `${d.discrepancy_units} short` : '—'}
                  </div>
                  <div className="col-span-2 text-[11.5px] text-muted sm:col-span-1">
                    {userName(d.submitted_by)} · {timeAgo(d.submitted_at)}
                    {d.discrepancy_units > 0 && (
                      <span className="font-bold text-danger sm:hidden"> · {d.discrepancy_units} short</span>
                    )}
                  </div>
                  <StatusChip text={st.label} color={st.c} bg={st.b} />
                </div>
              )
            })}
          </Card>

          {/* Overdue */}
          <Card className="overflow-hidden">
            <div className="flex items-center gap-2 border-b border-ink/5 px-[17px] py-[15px]">
              <ClockCountdown size={16} weight="fill" color="#E5484D" />
              <h3 className="text-sm font-bold">Overdue &amp; missed</h3>
              <span className="ml-auto rounded-full bg-danger-soft px-2 py-0.5 text-[11px] font-bold text-danger">
                {overdue.length}
              </span>
            </div>
            {overdue.map((o) => (
              <div key={o.id} className="flex items-center gap-3 border-b border-ink/5 px-[17px] py-3">
                <span className="h-2 w-2 flex-none rounded-full bg-danger" />
                <div className="flex-1">
                  <div className="text-[13px] font-semibold">{o.title}</div>
                  <div className="text-[11px] text-muted">
                    {storeName(o.store_id)} · {o.assigned_to ? userName(o.assigned_to) : 'Unassigned'}
                  </div>
                </div>
                <span className="text-[11.5px] font-semibold text-danger">{dueLabel(o).text}</span>
              </div>
            ))}
            {overdue.length === 0 && (
              <div className="p-8 text-center text-xs text-muted">Nothing overdue. 🎉</div>
            )}
          </Card>
        </div>

        {/* RIGHT */}
        <div className="flex flex-col gap-5">
          {/* Approvals */}
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-ink/5 px-[17px] py-[15px]">
              <div className="flex items-center gap-2">
                <SealCheck size={16} weight="fill" color="#FF5A2D" />
                <h3 className="text-sm font-bold">Pending approvals</h3>
              </div>
              <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-bold text-brand">
                {pendingReview.length}
              </span>
            </div>
            {pendingReview.length === 0 ? (
              <div className="px-[17px] py-8 text-center text-muted">
                <CheckCircleIcon size={30} color="#16B364" className="mx-auto" />
                <div className="mt-2 text-[12.5px]">All caught up — nothing to approve.</div>
              </div>
            ) : (
              pendingReview.slice(0, 4).map((t) => <ApprovalCard key={t.id} task={t} />)
            )}
          </Card>

          {/* Escalations */}
          <Card className="overflow-hidden">
            <div className="flex items-center gap-2 border-b border-ink/5 px-[17px] py-[15px]">
              <WarningOctagon size={16} weight="fill" color="#E5484D" />
              <h3 className="text-sm font-bold">Escalations</h3>
            </div>
            {(escalations ?? []).map((e) => {
              const color = e.level === 'critical' ? '#E5484D' : '#F59E0B'
              const bg = e.level === 'critical' ? '#FCEBEC' : '#FEF3E2'
              return (
                <div
                  key={e.id}
                  className="border-b border-ink/5 px-[17px] py-[13px]"
                  style={{ borderLeft: `3px solid ${color}` }}
                >
                  <div className="mb-0.5 flex items-center justify-between">
                    <span className="text-[12.5px] font-semibold">{e.title}</span>
                    <span
                      className="rounded-full px-[7px] py-[2px] text-[9.5px] font-bold uppercase"
                      style={{ color, background: bg }}
                    >
                      {e.level}
                    </span>
                  </div>
                  <div className="text-[11.5px] leading-snug text-slate">{e.detail}</div>
                  <div className="mt-1 text-[10.5px] text-muted">
                    {storeName(e.store_id)} · Stage: {e.stage === 'owner' ? 'Owner' : 'Team Leader'} ·{' '}
                    {timeAgo(e.created_at)}
                  </div>
                </div>
              )
            })}
            {(escalations ?? []).length === 0 && (
              <div className="p-8 text-center text-xs text-muted">No open escalations.</div>
            )}
          </Card>

          {/* Compliance chart */}
          <Card className="p-[17px]">
            <div className="mb-3.5 flex items-center gap-2">
              <ChartBar size={16} weight="fill" color="#7C3AED" />
              <h3 className="text-sm font-bold">Compliance by store</h3>
            </div>
            <div className="flex flex-col gap-3">
              {stores.map((s) => {
                const comp = storeCompliance(allTasks ?? [], s.id)
                const dot = comp >= 92 ? '#16B364' : comp >= 80 ? '#F59E0B' : '#E5484D'
                return (
                  <div key={s.id}>
                    <div className="mb-1 flex justify-between text-[11.5px]">
                      <span className="font-medium">{s.name}</span>
                      <span className="font-bold" style={{ color: dot }}>
                        {comp}%
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-md bg-[#F0F1F4]">
                      <div
                        className="h-full rounded-md transition-all"
                        style={{ width: `${comp}%`, background: dot }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
