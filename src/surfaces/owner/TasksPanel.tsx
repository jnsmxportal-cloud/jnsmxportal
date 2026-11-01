import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import {
  ArrowCounterClockwise,
  MagnifyingGlass,
  PencilSimple,
  SealCheck,
  Trash,
  Warning,
  X,
  XCircle,
} from '@phosphor-icons/react'
import { Card, PrioBadge } from '../../components/ui'
import { DateTimeField, HoursField } from '../../components/TimeField'
import { useToast } from '../../components/Toast'
import { useAuth } from '../../auth/AuthProvider'
import { useProfiles, useTasks } from '../../data/hooks'
import { useTemplates, useUserStoreRoles } from '../../data/admin'
import { isOpenStatus, useDeleteTask, useSetTaskStatus, useUpdateTask } from '../../data/taskAdmin'
import { dueLabel, timeAgo } from '../../lib/format'
import type { TaskInstance, TaskPriority } from '../../lib/types'
import { useKindMeta, useNames } from './shared'

/**
 * Admin → Tasks: every task instance in the org (scheduler-generated, one-off, Run now and
 * dashboard-created), filterable by status, store and template. Owners can re-time, reassign,
 * cancel, reopen and delete tasks from here; review itself stays on the Approvals page.
 */

const inputCls =
  'rounded-xl border-[1.5px] border-ink/15 bg-white px-3 py-2 text-[12.5px] outline-none focus:border-brand'
const modalInput =
  'w-full rounded-xl border-[1.5px] border-ink/15 bg-white p-2.5 text-sm outline-none focus:border-brand'
const chip = (on: boolean) =>
  `rounded-[10px] border px-3 py-2 text-xs font-semibold capitalize ${
    on ? 'border-brand bg-brand-tint text-brand-dark' : 'border-ink/15 bg-white text-slate'
  }`

type StatusGroup = 'open' | 'review' | 'done' | 'missed' | 'cancelled' | 'all'
const statusGroups: { id: StatusGroup; label: string }[] = [
  { id: 'open', label: 'Open' },
  { id: 'review', label: 'Needs review' },
  { id: 'done', label: 'Completed' },
  { id: 'missed', label: 'Missed' },
  { id: 'cancelled', label: 'Cancelled' },
  { id: 'all', label: 'All' },
]

function inGroup(t: TaskInstance, g: StatusGroup): boolean {
  switch (g) {
    case 'open':
      return isOpenStatus(t.status)
    case 'review':
      return t.status === 'submitted'
    case 'done':
      return t.status === 'completed' || t.status === 'approved'
    case 'missed':
      return t.status === 'missed'
    case 'cancelled':
      return t.status === 'cancelled'
    default:
      return true
  }
}

const statusStyle: Record<string, { label: string; c: string; b: string }> = {
  scheduled: { label: 'Scheduled', c: '#3B82F6', b: '#EAF1FE' },
  assigned: { label: 'Open', c: '#3B82F6', b: '#EAF1FE' },
  in_progress: { label: 'In progress', c: '#3B82F6', b: '#EAF1FE' },
  submitted: { label: 'Needs review', c: '#E8481F', b: '#FFF6F2' },
  rejected: { label: 'Rejected · redo', c: '#B45309', b: '#FEF3E2' },
  approved: { label: 'Completed', c: '#0E9152', b: '#E7F7EF' },
  completed: { label: 'Completed', c: '#0E9152', b: '#E7F7EF' },
  missed: { label: 'Missed', c: '#E5484D', b: '#FCEBEC' },
  cancelled: { label: 'Cancelled', c: '#5B6478', b: '#F0F1F4' },
}

/** ISO → the local 'YYYY-MM-DDTHH:MM' the DateTimeField edits */
function toLocalInput(iso: string | null): string {
  return iso ? format(new Date(iso), "yyyy-MM-dd'T'HH:mm") : ''
}

/** whole hours between due and cutoff, or null when the task never escalates */
function hoursBetween(due: string | null, cutoff: string | null): number | null {
  if (!due || !cutoff) return null
  return Math.max(0, Math.round((new Date(cutoff).getTime() - new Date(due).getTime()) / 3600_000))
}

export default function TasksPanel() {
  const { stores } = useAuth()
  const { data: tasks, isLoading } = useTasks({ storeId: 'all' })
  const { data: templates } = useTemplates()
  const { userName, storeName } = useNames()
  const kindMeta = useKindMeta()
  const toast = useToast()
  const setStatus = useSetTaskStatus()

  const [group, setGroup] = useState<StatusGroup>('open')
  const [storeId, setStoreId] = useState<string>('all')
  const [templateId, setTemplateId] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<TaskInstance | null>(null)
  const [deleting, setDeleting] = useState<TaskInstance | null>(null)

  const templateTitle = useMemo(
    () => Object.fromEntries((templates ?? []).map((t) => [t.id, t.title])),
    [templates],
  )

  const all = tasks ?? []
  const counts = useMemo(
    () =>
      Object.fromEntries(
        statusGroups.map((g) => [g.id, all.filter((t) => inGroup(t, g.id)).length]),
      ) as Record<StatusGroup, number>,
    [all],
  )

  const list = useMemo(() => {
    const q = search.trim().toLowerCase()
    const rows = all.filter(
      (t) =>
        inGroup(t, group) &&
        (storeId === 'all' || t.store_id === storeId) &&
        (templateId === 'all' ||
          (templateId === 'manual' ? !t.template_id : t.template_id === templateId)) &&
        (!q ||
          t.title.toLowerCase().includes(q) ||
          storeName(t.store_id).toLowerCase().includes(q) ||
          (t.assigned_to ? userName(t.assigned_to).toLowerCase().includes(q) : false)),
    )
    // open work: soonest deadline first (no deadline last); finished work: most recent first
    if (group === 'done' || group === 'cancelled' || group === 'missed')
      rows.sort((a, b) =>
        (b.completed_at ?? b.submitted_at ?? b.created_at).localeCompare(
          a.completed_at ?? a.submitted_at ?? a.created_at,
        ),
      )
    return rows
  }, [all, group, storeId, templateId, search, storeName, userName])

  const act = (t: TaskInstance, action: 'cancel' | 'reopen') =>
    setStatus.mutate(
      { instance: t, action },
      {
        onSuccess: () =>
          toast(action === 'cancel' ? `“${t.title}” cancelled` : `“${t.title}” reopened for staff`),
        onError: (e) => toast(e.message, 'error'),
      },
    )

  return (
    <div>
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
        <div className="text-[12.5px] text-muted">
          Every task created from a template, the scheduler, Run now or the dashboard. Re-time, reassign,
          cancel or delete here; approve submissions on the{' '}
          <Link to="/owner/approvals" className="font-semibold text-brand-dark">
            Approvals
          </Link>{' '}
          page.
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {statusGroups.map((g) => (
          <button key={g.id} onClick={() => setGroup(g.id)} className={`${chip(group === g.id)} flex items-center gap-1.5`}>
            {g.label}
            <span
              className={`rounded-full px-1.5 py-px text-[10px] ${
                group === g.id ? 'bg-brand text-white' : 'bg-canvas text-muted'
              }`}
            >
              {counts[g.id]}
            </span>
          </button>
        ))}
      </div>

      <div className="mb-3.5 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto]">
        <div className="relative">
          <MagnifyingGlass size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, store or assignee…"
            className={`${inputCls} w-full pl-8`}
          />
        </div>
        <select value={storeId} onChange={(e) => setStoreId(e.target.value)} className={inputCls}>
          <option value="all">All stores</option>
          {stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className={inputCls}>
          <option value="all">Any template</option>
          <option value="manual">No template (manual)</option>
          {(templates ?? []).map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>
      </div>

      <Card className="divide-y divide-line">
        {isLoading && <div className="p-8 text-center text-xs text-muted">Loading tasks…</div>}
        {!isLoading && list.length === 0 && (
          <div className="p-8 text-center text-xs text-muted">
            {all.length === 0 ? 'No tasks yet.' : 'No tasks match these filters.'}
          </div>
        )}
        {list.map((t) => {
          const { Icon, c, b } = kindMeta(t)
          const st = statusStyle[t.status] ?? statusStyle.assigned
          const due = dueLabel(t)
          const open = isOpenStatus(t.status)
          const showDue = open || t.status === 'missed'
          return (
            <div key={t.id} className="flex flex-wrap items-center gap-3 p-3.5 sm:flex-nowrap">
              <div
                className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px]"
                style={{ background: b }}
              >
                <Icon size={17} weight="fill" color={c} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-display text-sm font-bold">{t.title}</span>
                  <PrioBadge p={t.priority} />
                  <span
                    className="rounded-full px-2 py-px text-[10px] font-bold"
                    style={{ color: st.c, background: st.b }}
                  >
                    {st.label}
                  </span>
                </div>
                <div className="mt-0.5 text-[11.5px] text-muted">
                  {storeName(t.store_id)} · {t.assigned_to ? userName(t.assigned_to) : 'Unassigned'}
                  {t.template_id && (
                    <>
                      {' '}
                      · from <span className="text-slate">{templateTitle[t.template_id] ?? 'template'}</span>
                    </>
                  )}
                  {!t.template_id && ' · manual'}
                  {' · created '}
                  {timeAgo(t.created_at)}
                </div>
              </div>
              <div className="flex flex-none items-center gap-3 text-right">
                {showDue && (
                  <span
                    className="text-[11.5px] font-semibold"
                    style={{ color: due.overdue ? '#E5484D' : '#5B6478' }}
                  >
                    {due.text}
                  </span>
                )}
                {t.status === 'submitted' && (
                  <span className="text-[11.5px] text-muted">
                    submitted {t.submitted_at ? timeAgo(t.submitted_at) : ''}
                  </span>
                )}
                {(t.status === 'completed' || t.status === 'approved') && (
                  <span className="text-[11.5px] text-muted">
                    done {t.completed_at ? timeAgo(t.completed_at) : ''}
                  </span>
                )}
                <div className="flex items-center gap-0.5">
                  {t.status === 'submitted' && (
                    <Link
                      to="/owner/approvals"
                      title="Review on the Approvals page"
                      className="rounded-lg p-1.5 text-brand-dark hover:bg-brand-tint"
                    >
                      <SealCheck size={16} />
                    </Link>
                  )}
                  {(open || t.status === 'missed') && (
                    <button
                      onClick={() => setEditing(t)}
                      title="Edit due date, assignee, priority"
                      className="rounded-lg p-1.5 text-slate hover:bg-canvas"
                    >
                      <PencilSimple size={16} />
                    </button>
                  )}
                  {open && (
                    <button
                      onClick={() => act(t, 'cancel')}
                      title="Cancel task"
                      className="rounded-lg p-1.5 text-slate hover:bg-canvas"
                    >
                      <XCircle size={16} />
                    </button>
                  )}
                  {(t.status === 'missed' || t.status === 'cancelled') && (
                    <button
                      onClick={() => act(t, 'reopen')}
                      title="Reopen for staff"
                      className="rounded-lg p-1.5 text-slate hover:bg-canvas"
                    >
                      <ArrowCounterClockwise size={16} />
                    </button>
                  )}
                  <button
                    onClick={() => setDeleting(t)}
                    title="Delete permanently"
                    className="rounded-lg p-1.5 text-muted hover:bg-danger-soft hover:text-danger"
                  >
                    <Trash size={16} />
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </Card>

      {editing && <TaskEditModal task={editing} onClose={() => setEditing(null)} />}
      {deleting && <DeleteTaskModal task={deleting} onClose={() => setDeleting(null)} />}
    </div>
  )
}

const prios: TaskPriority[] = ['low', 'medium', 'high', 'critical']

function TaskEditModal({ task, onClose }: { task: TaskInstance; onClose: () => void }) {
  const toast = useToast()
  const update = useUpdateTask()
  const { data: profiles } = useProfiles()
  const { data: roles } = useUserStoreRoles()
  const { storeName } = useNames()
  const [title, setTitle] = useState(task.title)
  const [priority, setPriority] = useState<TaskPriority>(task.priority)
  const [due, setDue] = useState(toLocalInput(task.due_at))
  const [escalateAfter, setEscalateAfter] = useState<number | null>(hoursBetween(task.due_at, task.cutoff_at))
  const [assignee, setAssignee] = useState<string>(task.assigned_to ?? '')

  // people who work at this task's store (any role), owner/manager included so a task can be
  // pinned on a supervisor; the current assignee always stays selectable
  const people = useMemo(() => {
    const atStore = new Set((roles ?? []).filter((r) => r.store_id === task.store_id).map((r) => r.user_id))
    return (profiles ?? [])
      .filter((p) => atStore.has(p.id) || p.role === 'owner' || p.role === 'manager' || p.id === task.assigned_to)
      .sort((a, b) => a.full_name.localeCompare(b.full_name))
  }, [profiles, roles, task.store_id, task.assigned_to])

  const save = () => {
    if (!title.trim()) {
      toast('Give the task a title', 'error')
      return
    }
    update.mutate(
      {
        instance: task,
        title: title.trim(),
        priority,
        dueAt: due ? new Date(due).toISOString() : null,
        escalateAfterHours: escalateAfter,
        assignedTo: assignee || null,
      },
      {
        onSuccess: () => {
          toast(`“${title.trim()}” updated`)
          onClose()
        },
        onError: (e) => toast(e.message, 'error'),
      },
    )
  }

  return (
    <div onClick={onClose} className="fixed inset-0 z-[80] flex items-center justify-center bg-navy/50 p-6">
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-[520px] max-w-full animate-fade flex-col overflow-hidden rounded-[20px] bg-white shadow-[0_30px_80px_rgba(0,0,0,.3)]"
      >
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <div>
            <h3 className="font-display text-[17px] font-bold">Edit task</h3>
            <div className="text-xs text-muted">{storeName(task.store_id)}</div>
          </div>
          <button onClick={onClose} className="p-1 text-muted">
            <X size={20} />
          </button>
        </div>
        <div className="flex flex-col gap-4 overflow-y-auto px-6 py-5">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate">Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={modalInput} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate">Priority</label>
            <div className="flex flex-wrap gap-1.5">
              {prios.map((p) => (
                <button key={p} onClick={() => setPriority(p)} className={chip(priority === p)}>
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate">Due date &amp; time</label>
              <DateTimeField value={due} onChange={setDue} className={modalInput} />
              {!due && <div className="mt-1 text-[11px] text-muted">No due time: the task never goes overdue.</div>}
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate">Escalate after</label>
              <HoursField value={escalateAfter} onChange={setEscalateAfter} className={modalInput} />
              <div className="mt-1 text-[11px] text-muted">
                {due ? 'Hours past the due time before it is marked missed and escalated.' : 'Needs a due time.'}
              </div>
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate">Assigned to</label>
            <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className={modalInput}>
              <option value="">Unassigned · anyone at the store</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </select>
            <div className="mt-1 text-[11px] text-muted">A new assignee gets a notification straight away.</div>
          </div>
          {task.status === 'missed' && (
            <div className="rounded-xl border border-dashed p-3 text-[11.5px] text-slate" style={{ borderColor: "rgba(245,158,11,.4)", background: "rgba(254,243,226,.6)" }}>
              This task is marked <b>Missed</b>. Saving keeps that status — use <b>Reopen</b> in the list to put it back
              in front of staff.
            </div>
          )}
        </div>
        <div className="flex gap-2.5 border-t border-line px-6 py-4">
          <button onClick={onClose} className="flex-1 rounded-xl border border-ink/15 bg-white p-3 text-[13.5px] font-semibold text-slate">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={update.isPending}
            className="flex-1 rounded-xl bg-brand p-3 text-[13.5px] font-bold text-white disabled:opacity-60"
          >
            {update.isPending ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

function DeleteTaskModal({ task, onClose }: { task: TaskInstance; onClose: () => void }) {
  const toast = useToast()
  const del = useDeleteTask()
  const { storeName } = useNames()
  const open = isOpenStatus(task.status)
  return (
    <div onClick={onClose} className="fixed inset-0 z-[80] flex items-center justify-center bg-navy/50 p-6">
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[440px] max-w-full animate-fade rounded-[20px] bg-white p-6 shadow-[0_30px_80px_rgba(0,0,0,.3)]"
      >
        <div className="mb-2 flex items-center gap-2 font-display text-[17px] font-bold">
          <Warning size={20} weight="fill" color="#E5484D" /> Delete this task?
        </div>
        <div className="text-[12.5px] leading-relaxed text-slate">
          “{task.title}” at {storeName(task.store_id)} will be removed permanently, including its checklist
          progress and any photos or signatures attached. The scheduler will not recreate it.
          {open && (
            <>
              {' '}
              If you only want it off the staff list, <b>Cancel</b> keeps the record for reporting.
            </>
          )}
        </div>
        <div className="mt-5 flex gap-2.5">
          <button onClick={onClose} className="flex-1 rounded-xl border border-ink/15 bg-white p-3 text-[13.5px] font-semibold text-slate">
            Keep it
          </button>
          <button
            onClick={() =>
              del.mutate(task, {
                onSuccess: () => {
                  toast(`“${task.title}” deleted`)
                  onClose()
                },
                onError: (e) => toast(e.message, 'error'),
              })
            }
            disabled={del.isPending}
            className="flex-1 rounded-xl bg-danger p-3 text-[13.5px] font-bold text-white disabled:opacity-60"
          >
            {del.isPending ? 'Deleting…' : 'Delete permanently'}
          </button>
        </div>
      </div>
    </div>
  )
}
