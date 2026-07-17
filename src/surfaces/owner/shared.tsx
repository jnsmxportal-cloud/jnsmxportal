import { useState } from 'react'
import {
  Check,
  ListChecks,
  Money,
  Paperclip,
  Thermometer,
  Truck,
  Warning,
  Wrench,
  File as FileIcon,
} from '@phosphor-icons/react'
import type { TaskInstance, Delivery, TaskCategory } from '../../lib/types'
import { PrioBadge } from '../../components/ui'
import { timeAgo } from '../../lib/format'
import { useReviewTask } from '../../data/hooks'
import { useToast } from '../../components/Toast'
import { useAuth } from '../../auth/AuthProvider'
import { useProfiles } from '../../data/hooks'

export function kindMeta(t: TaskInstance | { category: TaskCategory; is_temperature_log?: boolean }) {
  if ('is_temperature_log' in t && t.is_temperature_log)
    return { Icon: Thermometer, c: '#E5484D', b: '#FCEBEC' }
  switch (t.category) {
    case 'delivery':
      return { Icon: Truck, c: '#3B82F6', b: '#EAF1FE' }
    case 'incident':
      return { Icon: Warning, c: '#E5484D', b: '#FCEBEC' }
    case 'maintenance':
      return { Icon: Wrench, c: '#B45309', b: '#FEF3E2' }
    default:
      return { Icon: ListChecks, c: '#16B364', b: '#E7F7EF' }
  }
}

export function useNames() {
  const { data: profiles } = useProfiles()
  const { stores } = useAuth()
  return {
    userName: (id: string | null) =>
      profiles?.find((p) => p.id === id)?.full_name ?? '—',
    storeName: (id: string) => stores.find((s) => s.id === id)?.name ?? '—',
  }
}

export function evidenceSummary(t: TaskInstance): string {
  const parts: string[] = []
  if (t.geofence_verdict === 'verified') parts.push('on-site verified')
  if (t.evidence?.photo) parts.push('photos')
  if (t.evidence?.signature) parts.push('signed')
  if (t.is_temperature_log) parts.push('readings')
  return parts.length ? parts.join(' · ') : 'submission details'
}

export function FeedbackModal({
  title,
  sub,
  confirmLabel,
  confirmColor,
  onConfirm,
  onClose,
}: {
  title: string
  sub: string
  confirmLabel: string
  confirmColor: string
  onConfirm: (text: string) => void
  onClose: () => void
}) {
  const [text, setText] = useState('')
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[80] flex items-center justify-center bg-navy/50 p-6"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[400px] max-w-full animate-fade rounded-[20px] bg-white p-6 shadow-[0_30px_80px_rgba(0,0,0,.3)]"
      >
        <h3 className="mb-1 text-[17px] font-bold">{title}</h3>
        <div className="mb-4 text-[12.5px] text-muted">{sub}</div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Feedback for the staff member (required)…"
          className="mb-4 h-[100px] w-full resize-none rounded-xl border-[1.5px] border-ink/15 p-3 text-[13.5px] outline-none focus:border-brand"
        />
        <div className="flex gap-2.5">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-ink/15 bg-white p-2.5 text-[13.5px] font-semibold text-slate"
          >
            Cancel
          </button>
          <button
            onClick={() => text.trim() && onConfirm(text.trim())}
            disabled={!text.trim()}
            className="flex-1 rounded-xl p-2.5 text-[13.5px] font-semibold text-white disabled:opacity-50"
            style={{ background: confirmColor }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export function ApprovalActions({ task, compact }: { task: TaskInstance; compact?: boolean }) {
  const review = useReviewTask()
  const toast = useToast()
  const [modal, setModal] = useState<'rejected' | 'reopened' | null>(null)

  const act = (verdict: 'approved' | 'rejected' | 'reopened', feedback?: string) => {
    review.mutate(
      { instance: task, verdict, feedback },
      {
        onSuccess: () => {
          if (verdict === 'approved')
            toast('Approved · archived & staged for EPOS sync', 'success')
          else if (verdict === 'rejected')
            toast('Rejected · returned to staff with feedback', 'error')
          else toast('Reopened · re-assigned instantly with feedback', 'warn')
          setModal(null)
        },
      },
    )
  }

  const pad = compact ? 'p-2 text-xs' : 'p-2.5 text-[13px]'
  return (
    <>
      <div className={`flex gap-2 ${compact ? '' : 'max-w-[440px]'}`}>
        <button
          onClick={() => act('approved')}
          disabled={review.isPending}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-[10px] bg-success font-semibold text-white ${pad}`}
        >
          <Check size={13} weight="bold" /> Approve
        </button>
        <button
          onClick={() => setModal('rejected')}
          disabled={review.isPending}
          className={`flex-1 rounded-[10px] border border-danger/35 bg-white font-semibold text-danger ${pad}`}
        >
          {compact ? 'Reject' : 'Reject with feedback'}
        </button>
        <button
          onClick={() => setModal('reopened')}
          disabled={review.isPending}
          className={`rounded-[10px] border border-ink/15 bg-white px-3 font-semibold text-slate ${pad}`}
        >
          Reopen
        </button>
      </div>
      {modal && (
        <FeedbackModal
          title={modal === 'rejected' ? 'Reject submission' : 'Reopen task'}
          sub={`“${task.title}” — feedback is sent to the staff member instantly with a push notification.`}
          confirmLabel={modal === 'rejected' ? 'Reject' : 'Reopen'}
          confirmColor={modal === 'rejected' ? '#E5484D' : '#F59E0B'}
          onConfirm={(text) => act(modal, text)}
          onClose={() => setModal(null)}
        />
      )}
    </>
  )
}

export function ApprovalCard({ task }: { task: TaskInstance }) {
  const { Icon, c, b } = kindMeta(task)
  const { userName, storeName } = useNames()
  return (
    <div className="border-b border-ink/5 px-[17px] py-3.5">
      <div className="mb-2 flex items-start gap-2.5">
        <div
          className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-[9px]"
          style={{ background: b }}
        >
          <Icon size={15} weight="fill" color={c} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] font-semibold leading-tight">{task.title}</div>
          <div className="mt-px text-[11px] text-muted">
            {storeName(task.store_id)} · {userName(task.submitted_by)} ·{' '}
            {task.submitted_at ? timeAgo(task.submitted_at) : ''}
          </div>
        </div>
        <PrioBadge p={task.priority} />
      </div>
      <div className="mb-2 flex items-center gap-1.5 rounded-[9px] bg-canvas px-2.5 py-[7px] text-[11.5px] text-slate">
        <Paperclip size={12} />
        {evidenceSummary(task)}
      </div>
      <ApprovalActions task={task} compact />
    </div>
  )
}

export const deliveryIcon = { Truck, Money, FileIcon }
export type { Delivery }
