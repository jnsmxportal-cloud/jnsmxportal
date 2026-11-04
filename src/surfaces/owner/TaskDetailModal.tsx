import { useState } from 'react'
import {
  Camera,
  CheckCircle,
  Circle,
  MapPin,
  QrCode,
  Thermometer,
  X,
} from '@phosphor-icons/react'
import type { TaskInstance } from '../../lib/types'
import { PrioBadge, StatusChip } from '../../components/ui'
import { useChecklistItems } from '../../data/hooks'
import { dueLabel, timeAgo } from '../../lib/format'
import {
  ApprovalActions,
  EvidenceGallery,
  evidenceSummary,
  taskStatusStyle,
  useKindMeta,
  useNames,
} from './shared'

const shell = 'fixed inset-0 z-[80] flex items-center justify-center bg-navy/50 p-3 sm:p-6'
const card =
  'flex max-h-[92dvh] w-[640px] max-w-full animate-fade flex-col overflow-hidden rounded-[20px] bg-white shadow-[0_30px_80px_rgba(0,0,0,.3)]'

function fmt(iso: string | null) {
  return iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—'
}

const geoLabel: Record<string, { text: string; color: string; bg: string }> = {
  verified: { text: 'On-site verified', color: '#0E9152', bg: '#E7F7EF' },
  off_site: { text: 'Submitted off-site', color: '#E5484D', bg: '#FCEBEC' },
  unknown: { text: 'Location unknown', color: '#B45309', bg: '#FEF3E2' },
}

/**
 * Full view of one task: who/where/when, checklist results, every piece of evidence, and —
 * while it is awaiting review — the Approve / Reject / Reopen actions.
 */
export function TaskDetailModal({ task, onClose }: { task: TaskInstance; onClose: () => void }) {
  const { userName, storeName } = useNames()
  const { Icon, c, b } = useKindMeta()(task)
  const { data: items } = useChecklistItems(task.id)
  const st = taskStatusStyle[task.status] ?? taskStatusStyle.assigned
  const due = dueLabel(task)
  const geo = task.geofence_verdict ? geoLabel[task.geofence_verdict] : null
  const reviewable = task.status === 'submitted'

  const meta: { k: string; v: string }[] = [
    { k: 'Store', v: storeName(task.store_id) },
    { k: 'Assigned to', v: task.assigned_to ? userName(task.assigned_to) : 'Unassigned · anyone at the store' },
    { k: 'Due', v: task.due_at ? fmt(task.due_at) : 'No deadline' },
    { k: 'Escalates', v: task.cutoff_at ? fmt(task.cutoff_at) : 'Never' },
  ]
  if (task.submitted_at)
    meta.push({ k: 'Submitted', v: `${userName(task.submitted_by)} · ${fmt(task.submitted_at)}` })
  if (task.reviewed_at)
    meta.push({ k: 'Reviewed', v: `${userName(task.reviewed_by)} · ${fmt(task.reviewed_at)}` })
  if (task.completed_at && !task.reviewed_at) meta.push({ k: 'Completed', v: fmt(task.completed_at) })

  return (
    <div onClick={onClose} className={shell}>
      <div onClick={(e) => e.stopPropagation()} className={card}>
        <div className="flex items-start gap-3 border-b border-line px-5 py-4 sm:px-6">
          <div
            className="flex h-11 w-11 flex-none items-center justify-center rounded-xl"
            style={{ background: b }}
          >
            <Icon size={22} weight="fill" color={c} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-display text-[17px] font-bold leading-tight">{task.title}</h3>
              <PrioBadge p={task.priority} />
              <StatusChip text={st.label} color={st.c} bg={st.b} />
            </div>
            <div className="mt-0.5 text-xs text-muted">
              {storeName(task.store_id)} ·{' '}
              <span className={due.overdue ? 'font-semibold text-danger' : ''}>{due.text}</span>
              {task.submitted_at && <> · submitted {timeAgo(task.submitted_at)}</>}
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-muted" aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className="flex flex-col gap-5 overflow-y-auto px-5 py-5 sm:px-6">
          <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-[12.5px] sm:grid-cols-2">
            {meta.map((m) => (
              <div key={m.k} className="flex gap-2">
                <dt className="w-[88px] flex-none text-muted">{m.k}</dt>
                <dd className="min-w-0 font-medium text-ink">{m.v}</dd>
              </div>
            ))}
            {geo && (
              <div className="flex gap-2">
                <dt className="w-[88px] flex-none text-muted">Location</dt>
                <dd>
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-2 py-[2px] text-[10.5px] font-semibold"
                    style={{ color: geo.color, background: geo.bg }}
                  >
                    <MapPin size={11} weight="fill" /> {geo.text}
                  </span>
                </dd>
              </div>
            )}
          </dl>

          {task.description && (
            <section>
              <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted">Instructions</div>
              <div className="whitespace-pre-wrap text-[13px] leading-relaxed text-slate">{task.description}</div>
            </section>
          )}

          {(items?.length ?? 0) > 0 && (
            <section>
              <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted">
                Checklist · {items!.filter((i) => i.checked).length}/{items!.length} done
              </div>
              <ul className="divide-y divide-ink/5 rounded-xl border border-line">
                {items!.map((i) => {
                  const breach =
                    i.requires_temp &&
                    i.temp_value != null &&
                    i.temp_limit != null &&
                    (i.temp_is_max ? i.temp_value > i.temp_limit : i.temp_value < i.temp_limit)
                  return (
                    <li key={i.id} className="flex items-center gap-2.5 px-3 py-2 text-[13px]">
                      {i.checked ? (
                        <CheckCircle size={17} weight="fill" color="#16B364" className="flex-none" />
                      ) : (
                        <Circle size={17} color="#C3C9D2" className="flex-none" />
                      )}
                      <span className={`min-w-0 flex-1 ${i.checked ? '' : 'text-slate'}`}>{i.label}</span>
                      <span className="flex flex-none items-center gap-2 text-[11px] text-muted">
                        {i.requires_temp && (
                          <span
                            className={`flex items-center gap-1 ${breach ? 'font-bold text-danger' : ''}`}
                            title={i.temp_limit != null ? `${i.temp_is_max ? 'Max' : 'Min'} ${i.temp_limit}°C` : undefined}
                          >
                            <Thermometer size={12} weight="fill" />
                            {i.temp_value != null ? `${i.temp_value}°C` : '—'}
                            {breach ? ' · BREACH' : ''}
                          </span>
                        )}
                        {i.requires_photo && (
                          <span className="flex items-center gap-1">
                            <Camera size={12} weight="fill" /> {i.photo_count}
                          </span>
                        )}
                        {i.requires_qr && (
                          <span className={`flex items-center gap-1 ${i.qr_verified ? 'text-success' : ''}`}>
                            <QrCode size={12} weight="fill" /> {i.qr_verified ? 'verified' : 'not scanned'}
                          </span>
                        )}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}

          <section>
            <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted">
              Evidence · {evidenceSummary(task)}
            </div>
            <EvidenceGallery instanceId={task.id} />
            <div className="mt-1.5 text-[11px] text-muted">Tap a photo or signature to open it full size.</div>
          </section>

          {task.review_feedback && (
            <section className="rounded-xl bg-warn-soft px-3.5 py-3 text-[12.5px] text-amber">
              <div className="mb-0.5 text-[11px] font-bold uppercase tracking-wide">Reviewer feedback</div>
              {task.review_feedback}
            </section>
          )}
        </div>

        <div className="border-t border-line px-5 py-4 sm:px-6">
          {reviewable ? (
            <ApprovalActions task={task} onDone={onClose} />
          ) : (
            <div className="flex items-center justify-between gap-3">
              <div className="text-[12px] text-muted">
                {task.status === 'completed' || task.status === 'approved'
                  ? 'This task is complete.'
                  : task.status === 'rejected'
                    ? 'Returned to staff to redo.'
                    : task.status === 'missed'
                      ? 'Missed its cutoff — manage it under Admin → Tasks.'
                      : 'Awaiting staff — nothing to review yet.'}
              </div>
              <button
                onClick={onClose}
                className="rounded-xl border border-ink/15 bg-white px-4 py-2.5 text-[13px] font-semibold text-slate"
              >
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/** A scrollable list of tasks (one dashboard figure) — each row opens the task's detail view. */
export function TaskListModal({
  title,
  sub,
  tasks,
  onClose,
}: {
  title: string
  sub?: string
  tasks: TaskInstance[]
  onClose: () => void
}) {
  const [open, setOpen] = useState<TaskInstance | null>(null)
  const { userName, storeName } = useNames()
  const kind = useKindMeta()
  return (
    <div onClick={onClose} className={shell}>
      <div onClick={(e) => e.stopPropagation()} className={card}>
        <div className="flex items-center justify-between border-b border-line px-5 py-4 sm:px-6">
          <div>
            <h3 className="font-display text-[17px] font-bold">{title}</h3>
            <div className="text-xs text-muted">
              {tasks.length} {tasks.length === 1 ? 'task' : 'tasks'}
              {sub ? ` · ${sub}` : ''}
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-muted" aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <div className="overflow-y-auto">
          {tasks.length === 0 && (
            <div className="px-6 py-10 text-center text-[12.5px] text-muted">Nothing here right now.</div>
          )}
          {tasks.map((t) => {
            const { Icon, c, b } = kind(t)
            const st = taskStatusStyle[t.status] ?? taskStatusStyle.assigned
            const due = dueLabel(t)
            return (
              <button
                key={t.id}
                onClick={() => setOpen(t)}
                className="flex w-full items-center gap-3 border-b border-ink/5 px-5 py-3 text-left transition hover:bg-canvas sm:px-6"
              >
                <div
                  className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px]"
                  style={{ background: b }}
                >
                  <Icon size={17} weight="fill" color={c} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold">{t.title}</div>
                  <div className="truncate text-[11px] text-muted">
                    {storeName(t.store_id)} ·{' '}
                    {t.status === 'submitted' && t.submitted_by
                      ? `submitted by ${userName(t.submitted_by)}`
                      : t.assigned_to
                        ? userName(t.assigned_to)
                        : 'Unassigned'}
                  </div>
                </div>
                <div className="flex flex-none flex-col items-end gap-1">
                  <StatusChip text={st.label} color={st.c} bg={st.b} />
                  <span className={`text-[11px] ${due.overdue ? 'font-semibold text-danger' : 'text-muted'}`}>
                    {due.text}
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      </div>
      {open && <TaskDetailModal task={open} onClose={() => setOpen(null)} />}
    </div>
  )
}
