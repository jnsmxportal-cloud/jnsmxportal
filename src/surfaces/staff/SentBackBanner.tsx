import { ArrowCounterClockwise, XCircle } from '@phosphor-icons/react'
import { sentBack, timeAgo } from '../../lib/format'
import type { TaskInstance } from '../../lib/types'

/** Reviewer feedback at the top of a task that was reopened or rejected; nothing otherwise. */
export default function SentBackBanner({ task }: { task: TaskInstance }) {
  const sb = sentBack(task)
  if (!sb) return null
  const reopened = sb.kind === 'reopened'
  const Icon = reopened ? ArrowCounterClockwise : XCircle
  const c = reopened ? '#B45309' : '#C62F34'
  return (
    <div
      className="mb-3 rounded-[14px] border p-3.5"
      style={{ borderColor: reopened ? '#F5C77A' : '#F3B4B6', background: reopened ? '#FEF3E2' : '#FCEBEC' }}
    >
      <div className="mb-1 flex items-center gap-1.5 text-[13px] font-bold" style={{ color: c }}>
        <Icon size={16} weight="bold" />
        {reopened ? 'Reopened — please redo and resubmit' : 'Rejected — please fix and resubmit'}
        {sb.at && <span className="ml-auto text-[10.5px] font-medium text-muted">{timeAgo(sb.at)}</span>}
      </div>
      <div className="mb-0.5 text-[10.5px] font-bold uppercase tracking-wide text-slate">Reviewer feedback</div>
      <div className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink">
        {sb.feedback?.trim() || 'No feedback was given — check with your manager.'}
      </div>
    </div>
  )
}
