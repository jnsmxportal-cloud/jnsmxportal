import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bell,
  CheckCircle,
  DeviceMobile,
  SealCheck,
  SignOut,
  Storefront,
  WarningOctagon,
} from '@phosphor-icons/react'
import { useAuth } from '../../auth/AuthProvider'
import { useEscalations, useTasks } from '../../data/hooks'
import { timeAgo } from '../../lib/format'
import { Avatar, Card, PrioBadge } from '../../components/ui'
import { ApprovalActions, evidenceSummary, kindMeta, useNames } from '../owner/shared'

export default function LeaderShell() {
  const { profile, stores, myStoreIds, signOut } = useAuth()
  const navigate = useNavigate()
  const [view, setView] = useState<'approvals' | 'escalations'>('approvals')
  const myStore = stores.find((s) => myStoreIds.includes(s.id))
  const { data: tasks } = useTasks({ storeId: myStore?.id ?? 'all' })
  const { data: escalations } = useEscalations(myStore?.id ?? 'all')
  const { userName } = useNames()

  const queue = (tasks ?? []).filter((t) => t.status === 'submitted')

  return (
    <div className="flex h-full min-h-0 bg-canvas">
      {/* rail */}
      <div className="flex w-[76px] flex-none flex-col items-center gap-2 bg-navy py-[18px]">
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-brand">
          <Storefront size={20} weight="bold" color="#fff" />
        </div>
        <button
          onClick={() => setView('approvals')}
          className={`flex h-12 w-12 items-center justify-center rounded-[14px] ${
            view === 'approvals' ? 'bg-navy-2 text-white' : 'text-[#5B6478]'
          }`}
        >
          <SealCheck size={20} weight={view === 'approvals' ? 'fill' : 'regular'} />
        </button>
        <button
          onClick={() => setView('escalations')}
          className={`flex h-12 w-12 items-center justify-center rounded-[14px] ${
            view === 'escalations' ? 'bg-navy-2 text-white' : 'text-[#5B6478]'
          }`}
        >
          <WarningOctagon size={20} weight={view === 'escalations' ? 'fill' : 'regular'} />
        </button>
        <button
          onClick={() => navigate('/staff')}
          title="Open Staff Portal (kiosk)"
          className="flex h-12 w-12 items-center justify-center rounded-[14px] text-[#5B6478] hover:text-white"
        >
          <DeviceMobile size={20} />
        </button>
        <button
          onClick={signOut}
          title="Sign out"
          className="mt-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl text-[#5B6478] hover:text-white"
        >
          <SignOut size={18} />
        </button>
        <Avatar name={profile!.full_name} color={profile!.avatar_color} size={40} />
      </div>

      {/* content */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-16 flex-none items-center justify-between border-b border-line bg-white px-6">
          <div>
            <h1 className="text-[19px] font-bold">
              {view === 'approvals' ? 'Approvals' : 'Escalations'}
              {myStore ? ` · ${myStore.name}` : ''}
            </h1>
            <div className="text-[11.5px] text-muted">
              Team Leader · {profile!.full_name} · verify staff submissions
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="rounded-full bg-brand-soft px-3 py-1 text-[11px] font-bold text-brand">
              {view === 'approvals'
                ? `${queue.length} awaiting review`
                : `${(escalations ?? []).length} open`}
            </span>
            <div className="relative flex h-[38px] w-[38px] items-center justify-center rounded-xl border border-ink/10">
              <Bell size={18} />
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {view === 'approvals' &&
            (queue.length === 0 ? (
              <Card className="p-14 text-center text-muted">
                <CheckCircle size={48} color="#16B364" className="mx-auto" />
                <div className="mt-3 text-base font-semibold text-ink">Queue clear</div>
                <div className="mt-1 text-[12.5px]">All submissions reviewed. Nice work.</div>
              </Card>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {queue.map((a) => {
                  const { Icon, c, b } = kindMeta(a)
                  return (
                    <Card key={a.id} className="p-[17px]">
                      <div className="mb-3 flex items-start gap-3">
                        <div
                          className="flex h-10 w-10 flex-none items-center justify-center rounded-[11px]"
                          style={{ background: b }}
                        >
                          <Icon size={20} weight="fill" color={c} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-display text-[14.5px] font-bold">{a.title}</div>
                          <div className="mt-px text-[11.5px] text-muted">
                            {userName(a.submitted_by)} ·{' '}
                            {a.submitted_at ? timeAgo(a.submitted_at) : ''}
                          </div>
                        </div>
                        <PrioBadge p={a.priority} />
                      </div>
                      <div className="mb-3 rounded-[10px] bg-canvas px-3 py-2 text-xs text-slate">
                        {evidenceSummary(a)}
                      </div>
                      <ApprovalActions task={a} compact />
                    </Card>
                  )
                })}
              </div>
            ))}

          {view === 'escalations' && (
            <div className="flex max-w-[720px] flex-col gap-3.5">
              {(escalations ?? []).map((e) => {
                const color = e.level === 'critical' ? '#E5484D' : '#F59E0B'
                return (
                  <Card key={e.id} className="p-[17px]" >
                    <div className="mb-1 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <WarningOctagon size={18} weight="fill" color={color} />
                        <span className="font-display text-[14.5px] font-bold">{e.title}</span>
                      </div>
                      <span
                        className="rounded-full px-2 py-[2px] text-[9.5px] font-bold uppercase"
                        style={{
                          color,
                          background: e.level === 'critical' ? '#FCEBEC' : '#FEF3E2',
                        }}
                      >
                        {e.level}
                      </span>
                    </div>
                    <div className="text-xs leading-normal text-slate">{e.detail}</div>
                    <div className="mt-1.5 text-[10.5px] text-muted">
                      Stage: {e.stage === 'owner' ? 'Owner' : 'Team Leader'} · {timeAgo(e.created_at)}
                    </div>
                  </Card>
                )
              })}
              {(escalations ?? []).length === 0 && (
                <Card className="p-10 text-center text-xs text-muted">No open escalations.</Card>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
