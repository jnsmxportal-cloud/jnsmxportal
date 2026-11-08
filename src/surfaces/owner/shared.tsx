import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowCounterClockwise,
  ChatText,
  Check,
  ListChecks,
  Money,
  Paperclip,
  QrCode,
  Signature,
  Thermometer,
  Truck,
  Warning,
  Wrench,
  File as FileIcon,
} from '@phosphor-icons/react'
import type { TaskInstance, Delivery, TaskCategory, Category } from '../../lib/types'
import { categoryMeta, useCategories } from '../../data/categories'
import { PrioBadge } from '../../components/ui'
import { sentBack, timeAgo } from '../../lib/format'
import { useSendBacks } from '../../data/reviews'
import { useReviewTask } from '../../data/hooks'
import { useToast } from '../../components/Toast'
import { useAuth } from '../../auth/AuthProvider'
import { useProfiles } from '../../data/hooks'
import { useUserStoreRoles } from '../../data/admin'
import { evidenceSignedUrl, useEvidence, type EvidenceRow } from '../../data/ownerExtras'

type Kindish = TaskInstance | { category: TaskCategory; is_temperature_log?: boolean }

/**
 * Icon + colours for a task. Pass the categories list (from useCategories) to honour the
 * owner's colours and icons; without it the built-in defaults apply.
 */
export function kindMeta(t: Kindish, cats?: Category[]) {
  return categoryMeta(cats, t.category, 'is_temperature_log' in t && !!t.is_temperature_log)
}

/** kindMeta bound to the live categories table. */
export function useKindMeta() {
  const { data: cats } = useCategories()
  return (t: Kindish) => kindMeta(t, cats)
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

/**
 * Single source of truth for compliance maths (Dashboard, Reports, Stores).
 * submitted / in-review = pending (NOT done) · rejected = issue · completed/approved = done.
 */
export function complianceStats(tasks: TaskInstance[]) {
  const done = tasks.filter((t) => ['completed', 'approved'].includes(t.status)).length
  const pending = tasks.filter((t) => t.status === 'submitted').length
  const issues = tasks.filter(
    (t) =>
      t.status === 'missed' ||
      t.status === 'rejected' ||
      (['assigned', 'in_progress'].includes(t.status) &&
        t.due_at &&
        new Date(t.due_at) < new Date()),
  ).length
  const pct = done + issues === 0 ? 100 : Math.round((done / (done + issues)) * 100)
  return { done, pending, issues, pct }
}

export function storeCompliance(tasks: TaskInstance[], storeId: string): number {
  return complianceStats(tasks.filter((t) => t.store_id === storeId)).pct
}

/** Label + colours for every task status (Tasks admin, dashboard look-ups, task detail). */
export const taskStatusStyle: Record<string, { label: string; c: string; b: string }> = {
  scheduled: { label: 'Scheduled', c: '#3B82F6', b: '#EAF1FE' },
  assigned: { label: 'Open', c: '#3B82F6', b: '#EAF1FE' },
  in_progress: { label: 'In progress', c: '#3B82F6', b: '#EAF1FE' },
  submitted: { label: 'Needs review', c: '#E8481F', b: '#FFF6F2' },
  rejected: { label: 'Rejected · redo', c: '#C62F34', b: '#FCEBEC' },
  // not a DB status: an open task that a reviewer sent back (see sentBack())
  reopened: { label: 'Reopened · redo', c: '#B45309', b: '#FEF3E2' },
  approved: { label: 'Completed', c: '#0E9152', b: '#E7F7EF' },
  completed: { label: 'Completed', c: '#0E9152', b: '#E7F7EF' },
  missed: { label: 'Missed', c: '#E5484D', b: '#FCEBEC' },
  cancelled: { label: 'Cancelled', c: '#5B6478', b: '#F0F1F4' },
}

/** Status chip style for a task, telling reopened work apart from fresh open tasks. */
export function statusStyleOf(t: TaskInstance) {
  const key = sentBack(t)?.kind === 'reopened' ? 'reopened' : t.status
  return taskStatusStyle[key] ?? taskStatusStyle.assigned
}

/**
 * Earlier send-backs of a submission awaiting review: "Resubmitted after 1 reopen", with the
 * feedback that was given each time, so the reviewer can check it was acted on.
 */
export function ResubmissionNote({ task, compact }: { task: TaskInstance; compact?: boolean }) {
  const { data } = useSendBacks([task.id])
  const { userName } = useNames()
  const rounds = data?.[task.id] ?? []
  if (rounds.length === 0) return null
  const counts = rounds.reduce<Record<string, number>>((a, r) => ({ ...a, [r.verdict]: (a[r.verdict] ?? 0) + 1 }), {})
  const what = Object.entries(counts)
    .map(([v, n]) => `${n} ${v === 'rejected' ? 'rejection' : 'reopen'}${n === 1 ? '' : 's'}`)
    .join(' & ')
  const shown = compact ? rounds.slice(-1) : rounds
  return (
    <div className="mb-2 rounded-[9px] border border-[#F5C77A] bg-warn-soft px-2.5 py-2 text-[11.5px] text-slate">
      <div className="mb-0.5 flex items-center gap-1.5 font-bold text-amber">
        <ArrowCounterClockwise size={12} weight="bold" /> Resubmitted after {what}
      </div>
      {shown.map((r) => (
        <div key={r.id} className="leading-snug">
          <span className="font-semibold">
            {r.verdict === 'rejected' ? 'Rejected' : 'Reopened'} by {userName(r.reviewer)} · {timeAgo(r.created_at)}:
          </span>{' '}
          {r.feedback ? `“${r.feedback}”` : <span className="text-muted">no feedback</span>}
        </div>
      ))}
      {compact && rounds.length > 1 && (
        <div className="text-[10.5px] text-muted">+{rounds.length - 1} earlier · open the task for the full history</div>
      )}
    </div>
  )
}

export function EvidencePhoto({ ev }: { ev: EvidenceRow }) {
  const { data: url } = useQuery({
    queryKey: ['evidence-url', ev.storage_path],
    enabled: !!ev.storage_path,
    staleTime: 240_000,
    queryFn: () => evidenceSignedUrl(ev.storage_path!),
  })
  const isSignature = ev.type === 'signature'
  return (
    <button
      onClick={() => url && window.open(url, '_blank')}
      title={isSignature ? 'Signature — open full size' : 'Photo evidence — open full size'}
      className={`overflow-hidden rounded-[11px] border border-ink/10 bg-canvas ${
        isSignature ? 'h-[74px] w-[130px] bg-white' : 'h-[74px] w-[74px]'
      }`}
    >
      {url ? (
        <img
          src={url}
          alt={isSignature ? 'Signature evidence' : 'Photo evidence'}
          className={`h-full w-full ${isSignature ? 'object-contain' : 'object-cover'}`}
        />
      ) : (
        <span className="text-[9px] text-muted">…</span>
      )}
    </button>
  )
}

/** Messages staff wrote to the reviewer when submitting (evidence rows of type `note`), newest first. */
function StaffNotes({ rows }: { rows: EvidenceRow[] }) {
  const { userName } = useNames()
  const notes = rows
    .filter((e) => e.type === 'note' && (e.metadata as { text?: string } | null)?.text)
    .sort((a, b) => b.device_ts.localeCompare(a.device_ts))
  if (notes.length === 0) return null
  return (
    <div className="flex flex-col gap-1.5">
      {notes.map((e, i) => (
        <div
          key={e.id}
          className={`rounded-[10px] border px-3 py-2 ${i === 0 ? 'border-info/30 bg-info-soft/60' : 'border-ink/10 bg-canvas/60 opacity-80'}`}
        >
          <div className="mb-0.5 flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-wide text-[#2563EB]">
            <ChatText size={11} weight="fill" /> Message from {userName(e.uploader)}
            <span className="font-medium normal-case tracking-normal text-muted">· {timeAgo(e.device_ts)}</span>
          </div>
          <div className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-ink">
            {(e.metadata as { text: string }).text}
          </div>
        </div>
      ))}
    </div>
  )
}

/** Compact approval cards: just the newest staff message, clamped, so it isn't missed. */
export function LatestStaffNote({ task }: { task: TaskInstance }) {
  const { data: evidence } = useEvidence(task.id)
  const { userName } = useNames()
  const latest = (evidence ?? [])
    .filter((e) => e.type === 'note' && (e.metadata as { text?: string } | null)?.text)
    .sort((a, b) => b.device_ts.localeCompare(a.device_ts))[0]
  if (!latest) return null
  return (
    <div className="mb-2 rounded-[10px] border border-info/30 bg-info-soft/60 px-2.5 py-[7px]">
      <div className="mb-0.5 flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-wide text-[#2563EB]">
        <ChatText size={11} weight="fill" /> Message from {userName(latest.uploader)}
      </div>
      <div className="line-clamp-3 whitespace-pre-wrap text-[12px] leading-relaxed text-ink">
        {(latest.metadata as { text: string }).text}
      </div>
    </div>
  )
}

export function EvidenceGallery({ instanceId }: { instanceId: string }) {
  const { data: evidence } = useEvidence(instanceId)
  const rows = evidence ?? []
  if (rows.length === 0)
    return (
      <div className="rounded-[10px] border border-dashed border-ink/15 px-3 py-2.5 text-[11.5px] text-muted">
        No evidence attached
      </div>
    )
  return (
    <div className="flex flex-col gap-2.5">
      <StaffNotes rows={rows} />
      <EvidenceMedia rows={rows} />
    </div>
  )
}

function EvidenceMedia({ rows }: { rows: EvidenceRow[] }) {
  const allPhotos = rows.filter((e) => e.type === 'photo' && e.storage_path)
  const unitKey = (e: EvidenceRow) => {
    const m = (e.metadata ?? {}) as { unit_id?: string; unit?: string }
    return m.unit_id ?? m.unit ?? null
  }
  // temperature-log display photos sit next to their reading; everything else lists as before
  const unitPhotos = allPhotos.filter((e) => unitKey(e))
  const photos = allPhotos.filter((e) => !unitKey(e))
  const signatures = rows.filter((e) => e.type === 'signature' && e.storage_path)
  const temps = rows.filter((e) => e.type === 'metadata')
  const qrs = rows.filter((e) => e.type === 'qr')

  // a temperature log writes every reading, unit photo and QR row of one submission with the same
  // device_ts, so that timestamp separates the rounds of a reopened / rejected log
  const roundOf = (e: EvidenceRow) => e.device_ts
  const rounds = [...new Set(temps.map(roundOf))].sort().reverse() // newest first
  // QR rows from a log that has readings belong to a round; any others are listed as before
  const looseQrs = qrs.filter((q) => !rounds.includes(roundOf(q)))

  const readingChips = (round: string, faded: boolean) =>
    temps
      .filter((e) => roundOf(e) === round)
      .map((e) => {
        const m = (e.metadata ?? {}) as { unit?: string; unit_id?: string; value?: number; breach?: boolean }
        const key = m.unit_id ?? m.unit
        // the display photo taken in the same submission as this reading
        const photo = unitPhotos.find((p) => roundOf(p) === round && unitKey(p) === key)
        const chip = (
          <span
            className={`flex items-center gap-1.5 rounded-[9px] px-2.5 py-[7px] text-[11.5px] font-semibold ${
              m.breach ? 'bg-danger-soft text-danger' : 'bg-canvas text-slate'
            } ${faded ? 'opacity-70' : ''}`}
          >
            <Thermometer size={13} weight="fill" color={m.breach ? '#E5484D' : '#16B364'} />
            {m.unit ?? 'Unit'} · {m.value ?? '—'}°C{m.breach ? ' · BREACH' : ''}
          </span>
        )
        if (!photo) return <span key={e.id}>{chip}</span>
        return (
          <span
            key={e.id}
            title="Reading with the photo of this unit's display"
            className="flex items-center gap-1.5 rounded-[12px] border border-line bg-white p-1"
          >
            <EvidencePhoto ev={photo} />
            {chip}
          </span>
        )
      })

  const qrChip = (e: EvidenceRow) => {
    const m = (e.metadata ?? {}) as { payload?: string; unit?: string }
    return (
      <span
        key={e.id}
        title={m.payload}
        className="flex max-w-[220px] items-center gap-1.5 rounded-[9px] bg-info-soft px-2.5 py-[7px] text-[11.5px] font-semibold text-[#2563EB]"
      >
        <QrCode size={13} weight="fill" /> {m.unit ? `${m.unit} · QR verified` : 'QR verified'}
        {!m.unit && m.payload && <span className="truncate font-mono text-[10px] font-normal">{m.payload}</span>}
      </span>
    )
  }

  const stamp = (iso: string) =>
    new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

  const other = (
    <>
      {photos.map((e) => (
        <EvidencePhoto key={e.id} ev={e} />
      ))}
      {signatures.map((e) => (
        <EvidencePhoto key={e.id} ev={e} />
      ))}
      {looseQrs.map(qrChip)}
      {signatures.length > 0 && (
        <span className="flex items-center gap-1 text-[10.5px] font-semibold text-success">
          <Signature size={13} weight="bold" /> Signed
        </span>
      )}
    </>
  )

  // one submission (the usual case): everything in a single row, as before
  if (rounds.length <= 1)
    return (
      <div className="flex flex-wrap items-center gap-2">
        {other}
        {rounds[0] && readingChips(rounds[0], false)}
        {rounds[0] && qrs.filter((q) => roundOf(q) === rounds[0]).map(qrChip)}
      </div>
    )

  // several submissions: newest first, each labelled, earlier ones muted
  return (
    <div className="flex flex-col gap-2.5">
      {(photos.length > 0 || signatures.length > 0 || looseQrs.length > 0) && (
        <div className="flex flex-wrap items-center gap-2">{other}</div>
      )}
      {rounds.map((round, i) => (
        <div
          key={round}
          className={`rounded-xl border p-2.5 ${i === 0 ? 'border-line bg-white' : 'border-dashed border-ink/15 bg-canvas/60'}`}
        >
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide">
            <span className={i === 0 ? 'text-ink' : 'text-muted'}>
              {i === 0 ? 'Latest submission' : `Earlier submission ${rounds.length - i}`}
            </span>
            <span className="font-medium normal-case tracking-normal text-muted">· {stamp(round)}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {readingChips(round, i > 0)}
            {qrs.filter((q) => roundOf(q) === round).map(qrChip)}
          </div>
        </div>
      ))}
    </div>
  )
}

export function evidenceSummary(t: TaskInstance): string {
  const parts: string[] = []
  if (t.geofence_verdict === 'verified') parts.push('on-site verified')
  if (t.evidence?.photo) parts.push('photos')
  if (t.evidence?.signature) parts.push('signed')
  if (t.is_temperature_log) parts.push('readings')
  return parts.length ? parts.join(' · ') : 'submission details'
}

/**
 * People a task at `storeId` can be assigned to: everyone with a role at that store, sorted by
 * name. `keep` ids (e.g. the current assignee, the person who submitted it) always stay listed
 * even if they have since moved store; `includeSupervisors` adds owners and managers too.
 */
export function useStorePeople(
  storeId: string,
  keep: (string | null | undefined)[] = [],
  includeSupervisors = false,
) {
  const { data: profiles } = useProfiles()
  const { data: roles } = useUserStoreRoles()
  const keepKey = keep.filter(Boolean).join(',')
  return useMemo(() => {
    const keepIds = new Set(keepKey ? keepKey.split(',') : [])
    const atStore = new Set((roles ?? []).filter((r) => r.store_id === storeId).map((r) => r.user_id))
    return (profiles ?? [])
      .filter(
        (p) =>
          atStore.has(p.id) ||
          keepIds.has(p.id) ||
          (includeSupervisors && (p.role === 'owner' || p.role === 'manager')),
      )
      .sort((a, b) => a.full_name.localeCompare(b.full_name))
  }, [profiles, roles, storeId, keepKey, includeSupervisors])
}

/**
 * Reopen a task and choose who redoes it: the person who handed it in (the default), someone
 * else at the store, or anyone at the store (unassigned). Used by the review actions (feedback
 * required) and by Admin → Tasks for missed / cancelled tasks (feedback optional).
 */
export function ReopenModal({
  task,
  feedbackRequired,
  busy,
  onConfirm,
  onClose,
}: {
  task: TaskInstance
  feedbackRequired: boolean
  busy?: boolean
  onConfirm: (args: { assignTo: string | null; feedback: string }) => void
  onClose: () => void
}) {
  const people = useStorePeople(task.store_id, [task.submitted_by, task.assigned_to])
  const { storeName } = useNames()
  const [assignee, setAssignee] = useState<string>(task.submitted_by ?? task.assigned_to ?? '')
  const [text, setText] = useState('')
  const ok = !busy && (!feedbackRequired || !!text.trim())
  const tag = (id: string) =>
    id === task.submitted_by ? ' · handed it in' : id === task.assigned_to ? ' · currently assigned' : ''

  return (
    <div onClick={onClose} className="fixed inset-0 z-[80] flex items-center justify-center bg-navy/50 p-3 sm:p-6">
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[calc(100dvh-24px)] w-[420px] max-w-full animate-fade overflow-y-auto rounded-[20px] bg-white p-6 shadow-[0_30px_80px_rgba(0,0,0,.3)]"
      >
        <h3 className="mb-1 text-[17px] font-bold">Reopen task</h3>
        <div className="mb-4 text-[12.5px] text-muted">
          “{task.title}” goes back to staff to redo — whoever you pick gets a notification straight away.
        </div>

        <label className="mb-1.5 block text-xs font-semibold text-slate">Assign to</label>
        <select
          value={assignee}
          onChange={(e) => setAssignee(e.target.value)}
          className="mb-1 w-full rounded-xl border-[1.5px] border-ink/15 bg-white p-2.5 text-[13.5px] outline-none focus:border-brand"
        >
          <option value="">Anyone at {storeName(task.store_id)} · unassigned</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name}
              {tag(p.id)}
            </option>
          ))}
        </select>
        <div className="mb-4 text-[11px] text-muted">
          Keep the same person, or pick someone else at the store.
        </div>

        <label className="mb-1.5 block text-xs font-semibold text-slate">
          Feedback{feedbackRequired ? '' : ' (optional)'}
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={feedbackRequired ? 'What needs redoing? (required)…' : 'What needs doing?…'}
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
            onClick={() => ok && onConfirm({ assignTo: assignee || null, feedback: text.trim() })}
            disabled={!ok}
            className="flex-1 rounded-xl bg-[#F59E0B] p-2.5 text-[13.5px] font-semibold text-white disabled:opacity-50"
          >
            Reopen
          </button>
        </div>
      </div>
    </div>
  )
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

export function ApprovalActions({
  task,
  compact,
  onDone,
}: {
  task: TaskInstance
  compact?: boolean
  /** called after a verdict is saved (e.g. to close the surrounding detail view) */
  onDone?: () => void
}) {
  const review = useReviewTask()
  const toast = useToast()
  const { can } = useAuth()
  const { userName } = useNames()
  const [modal, setModal] = useState<'rejected' | 'reopened' | null>(null)

  if (!can('tasks.review'))
    return (
      <div className="rounded-[10px] border border-dashed border-ink/15 px-3 py-2 text-[11.5px] text-muted">
        Your role can’t approve or reject submissions.
      </div>
    )

  const act = (verdict: 'approved' | 'rejected' | 'reopened', feedback?: string, assignTo?: string | null) => {
    review.mutate(
      { instance: task, verdict, feedback, assignTo },
      {
        onSuccess: () => {
          if (verdict === 'approved')
            toast('Approved · archived & staged for EPOS sync', 'success')
          else if (verdict === 'rejected')
            toast('Rejected · returned to staff with feedback', 'error')
          else
            toast(
              assignTo
                ? `Reopened · assigned to ${userName(assignTo)} with feedback`
                : 'Reopened · open to anyone at the store, with feedback',
              'warn',
            )
          setModal(null)
          onDone?.()
        },
        onError: (e) => toast(e.message, 'error'),
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
      {modal === 'rejected' && (
        <FeedbackModal
          title="Reject submission"
          sub={`“${task.title}” — feedback is sent to the staff member instantly with a push notification.`}
          confirmLabel="Reject"
          confirmColor="#E5484D"
          onConfirm={(text) => act('rejected', text)}
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'reopened' && (
        <ReopenModal
          task={task}
          feedbackRequired
          busy={review.isPending}
          onConfirm={({ assignTo, feedback }) => act('reopened', feedback, assignTo)}
          onClose={() => setModal(null)}
        />
      )}
    </>
  )
}

/**
 * What staff wrote when reporting an incident (kept in the task's description — the same text
 * the escalation card shows). Renders nothing for other tasks, whose description is the
 * template's instructions rather than something staff reported.
 */
export function IncidentNote({ task, compact }: { task: TaskInstance; compact?: boolean }) {
  const text = task.category === 'incident' ? task.description?.trim() : ''
  if (!text) return null
  return (
    <div
      className={`rounded-[10px] border border-danger/20 bg-danger-soft/60 ${
        compact ? 'mb-2 px-2.5 py-[7px]' : 'mb-3 px-3 py-2.5'
      }`}
    >
      <div className="mb-0.5 flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-wide text-danger">
        <Warning size={11} weight="fill" /> Reported by staff
      </div>
      <div
        className={`whitespace-pre-wrap leading-relaxed text-ink ${
          compact ? 'line-clamp-3 text-[12px]' : 'text-[13px]'
        }`}
      >
        {text}
      </div>
    </div>
  )
}

export function ApprovalCard({ task, onOpen }: { task: TaskInstance; onOpen?: () => void }) {
  const { Icon, c, b } = useKindMeta()(task)
  const { userName, storeName } = useNames()
  const Head = onOpen ? 'button' : 'div'
  return (
    <div className="border-b border-ink/5 px-[17px] py-3.5">
      <Head
        onClick={onOpen}
        className={`mb-2 flex w-full items-start gap-2.5 text-left ${onOpen ? 'group' : ''}`}
      >
        <div
          className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-[9px]"
          style={{ background: b }}
        >
          <Icon size={15} weight="fill" color={c} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] font-semibold leading-tight group-hover:text-brand">{task.title}</div>
          <div className="mt-px text-[11px] text-muted">
            {storeName(task.store_id)} · {userName(task.submitted_by)} ·{' '}
            {task.submitted_at ? timeAgo(task.submitted_at) : ''}
          </div>
        </div>
        <PrioBadge p={task.priority} />
      </Head>
      <ResubmissionNote task={task} compact />
      <IncidentNote task={task} compact />
      <LatestStaffNote task={task} />
      <Head
        onClick={onOpen}
        className="mb-2 flex w-full items-center gap-1.5 rounded-[9px] bg-canvas px-2.5 py-[7px] text-left text-[11.5px] text-slate"
      >
        <Paperclip size={12} />
        <span className="flex-1">{evidenceSummary(task)}</span>
        {onOpen && <span className="font-semibold text-brand">View evidence →</span>}
      </Head>
      <ApprovalActions task={task} compact />
    </div>
  )
}

export const deliveryIcon = { Truck, Money, FileIcon }
export type { Delivery }
