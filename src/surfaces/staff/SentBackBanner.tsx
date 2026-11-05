import { ArrowCounterClockwise, Camera, Signature, Thermometer, XCircle } from '@phosphor-icons/react'
import { format } from 'date-fns'
import { sentBack, timeAgo } from '../../lib/format'
import { useReviewHistory } from '../../data/reviews'
import { useEvidence } from '../../data/ownerExtras'
import type { TaskInstance } from '../../lib/types'

/**
 * Shown at the top of a task a reviewer sent back (reopened / rejected): the latest feedback,
 * every earlier round of feedback, and what was handed in last time — so staff see the history
 * instead of what looks like a fresh task. Nothing renders for other tasks.
 */
export default function SentBackBanner({ task }: { task: TaskInstance }) {
  const sb = sentBack(task)
  const { data: reviews } = useReviewHistory(sb ? task.id : null)
  const { data: evidence } = useEvidence(sb ? task.id : null)
  if (!sb) return null

  const reopened = sb.kind === 'reopened'
  const Icon = reopened ? ArrowCounterClockwise : XCircle
  const c = reopened ? '#B45309' : '#C62F34'
  // earlier send-backs, newest first, minus the one shown as "latest" (its row is written a moment
  // after the task's review stamp; an Admin → Tasks reopen has no review row at all)
  const latestAt = sb.at ? new Date(sb.at).getTime() : null
  const earlier = (reviews ?? [])
    .filter(
      (r) =>
        r.verdict !== 'approved' &&
        (latestAt === null || Math.abs(new Date(r.created_at).getTime() - latestAt) > 60_000),
    )
    .reverse()

  // the last hand-in: temperature readings (newest per unit), photos and signature
  const readings = new Map<string, { unit: string; value: number; breach: boolean }>()
  for (const e of evidence ?? []) {
    const m = (e.metadata ?? {}) as { unit?: string; unit_id?: string; value?: number; breach?: boolean }
    if (e.type === 'metadata' && typeof m.value === 'number')
      readings.set(m.unit_id ?? m.unit ?? e.id, { unit: m.unit ?? 'Unit', value: m.value, breach: !!m.breach })
  }
  const photos = (evidence ?? []).filter((e) => e.type === 'photo' && e.storage_path).length
  const signed = (evidence ?? []).some((e) => e.type === 'signature')
  const hasLast = !!task.submitted_at || readings.size > 0 || photos > 0

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

      {hasLast && (
        <div className="mt-2.5 border-t border-ink/10 pt-2">
          <div className="mb-1 text-[10.5px] font-bold uppercase tracking-wide text-slate">
            Your last submission{task.submitted_at ? ` · ${format(new Date(task.submitted_at), 'd MMM HH:mm')}` : ''}
          </div>
          {readings.size > 0 && (
            <div className="mb-1 flex flex-wrap gap-1.5">
              {[...readings.values()].map((r) => (
                <span
                  key={r.unit}
                  className={`flex items-center gap-1 rounded-[8px] px-2 py-1 text-[11.5px] font-semibold ${
                    r.breach ? 'bg-danger-soft text-danger' : 'bg-white/70 text-slate'
                  }`}
                >
                  <Thermometer size={12} weight="fill" /> {r.unit} · {r.value}°C
                </span>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3 text-[11.5px] text-slate">
            {photos > 0 && (
              <span className="flex items-center gap-1">
                <Camera size={13} /> {photos} photo{photos === 1 ? '' : 's'} kept
              </span>
            )}
            {signed && (
              <span className="flex items-center gap-1">
                <Signature size={13} /> signed — sign again below
              </span>
            )}
            {!task.is_temperature_log && <span>Your ticks are kept — change what the feedback asks for.</span>}
          </div>
        </div>
      )}

      {earlier.length > 0 && (
        <details className="mt-2.5 border-t border-ink/10 pt-2">
          <summary className="cursor-pointer text-[11.5px] font-semibold text-slate">
            Earlier feedback ({earlier.length})
          </summary>
          <ul className="mt-1.5 flex flex-col gap-1.5">
            {earlier.map((r) => (
              <li key={r.id} className="rounded-lg bg-white/70 px-2.5 py-1.5 text-[12px] text-slate">
                <span className="font-semibold">
                  {r.verdict === 'rejected' ? 'Rejected' : 'Reopened'} · {format(new Date(r.created_at), 'd MMM HH:mm')}
                </span>
                <div className="whitespace-pre-wrap">{r.feedback || 'No feedback given'}</div>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
