import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, ORG_ID } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { audit, notify } from './ops'
import type { TaskInstance, TaskPriority } from '../lib/types'

/**
 * Owner-side task management (Admin → Tasks): re-time, reassign, cancel, reopen and delete task
 * instances. Every change writes an audit row; assignment changes notify the new assignee.
 */

const OPEN_STATUSES = ['scheduled', 'assigned', 'in_progress', 'rejected'] as const

export function isOpenStatus(status: string): boolean {
  return (OPEN_STATUSES as readonly string[]).includes(status)
}

export interface TaskEditArgs {
  instance: TaskInstance
  title: string
  priority: TaskPriority
  /** ISO timestamp or null for "no deadline" */
  dueAt: string | null
  /** whole hours after the due time before missed + escalation; null = never */
  escalateAfterHours: number | null
  assignedTo: string | null
}

export function useUpdateTask() {
  const qc = useQueryClient()
  const { session } = useAuth()
  return useMutation({
    mutationFn: async (args: TaskEditArgs) => {
      const uid = session!.user.id
      const { instance } = args
      const due = args.dueAt ? new Date(args.dueAt) : null
      const cutoff =
        due && args.escalateAfterHours !== null
          ? new Date(due.getTime() + args.escalateAfterHours * 3600_000)
          : null
      const dueChanged = (instance.due_at ?? null) !== (due ? due.toISOString() : null)
      const patch: Record<string, unknown> = {
        title: args.title,
        priority: args.priority,
        due_at: due ? due.toISOString() : null,
        cutoff_at: cutoff ? cutoff.toISOString() : null,
        assigned_to: args.assignedTo,
      }
      // a new deadline in the future re-arms the reminder / overdue notices and escalation
      if (dueChanged && due && due > new Date()) {
        patch.reminder_sent_at = null
        patch.overdue_notified_at = null
        patch.escalation_created_at = null
      }
      const { error } = await supabase.from('task_instances').update(patch).eq('id', instance.id)
      if (error) throw error
      if (args.assignedTo && args.assignedTo !== instance.assigned_to) {
        await notify([args.assignedTo], {
          org_id: ORG_ID,
          type: 'assigned',
          title: `Assigned to you: ${args.title}`,
          body: due ? `Due ${due.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}` : null,
          deep_link: '/staff/tasks',
          icon: 'clipboard-text',
        } as never)
      }
      await audit(uid, 'task.edited', 'task_instance', instance.id, {
        title: args.title,
        priority: args.priority,
        due_at: patch.due_at,
        cutoff_at: patch.cutoff_at,
        assigned_to: args.assignedTo,
      })
    },
    onSuccess: () => qc.invalidateQueries(),
  })
}

export function useSetTaskStatus() {
  const qc = useQueryClient()
  const { session } = useAuth()
  return useMutation({
    mutationFn: async (args: { instance: TaskInstance; action: 'cancel' | 'reopen' }) => {
      const uid = session!.user.id
      const { instance, action } = args
      const patch: Record<string, unknown> =
        action === 'cancel'
          ? { status: 'cancelled' }
          : {
              status: 'assigned',
              // reopened work gets a clean slate for notices and escalation
              reminder_sent_at: null,
              overdue_notified_at: null,
              escalation_created_at: null,
              submitted_at: null,
              submitted_by: null,
              completed_at: null,
              // review stamp = "sent back": staff see it in their Reopened section (no feedback here)
              reviewed_at: new Date().toISOString(),
              reviewed_by: uid,
              review_feedback: null,
            }
      const { error } = await supabase.from('task_instances').update(patch).eq('id', instance.id)
      if (error) throw error
      if (instance.assigned_to) {
        await notify([instance.assigned_to], {
          org_id: ORG_ID,
          type: action === 'cancel' ? 'cancelled' : 'assigned',
          title: action === 'cancel' ? `Cancelled: ${instance.title}` : `Reopened: ${instance.title}`,
          body: null,
          deep_link: '/staff/tasks',
          icon: action === 'cancel' ? 'x-circle' : 'arrow-counter-clockwise',
        } as never)
      }
      await audit(uid, action === 'cancel' ? 'task.cancelled' : 'task.reopened', 'task_instance', instance.id, {
        from: instance.status,
      })
    },
    onSuccess: () => qc.invalidateQueries(),
  })
}

// ---------- bulk tidy-up ----------

/** ids per request: keeps the `id=in.(…)` URL well under proxy limits */
const CHUNK = 100
function chunks<T>(a: T[], n = CHUNK): T[][] {
  const out: T[][] = []
  for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n))
  return out
}

export interface BulkTaskArgs {
  tasks: TaskInstance[]
  /** cancel = keep the record but take it out of staff lists and compliance; delete = remove */
  action: 'cancel' | 'delete'
  /** why, e.g. "Test data" — stored on the audit row and shown on cancelled tasks */
  reason: string | null
}

/**
 * Cancel or delete many tasks at once (Admin → Tasks tidy-up). Works in chunks, writes one audit
 * row per task (with the reason) and returns how many rows the database actually changed, so
 * RLS refusals are reported instead of silently "succeeding".
 */
export function useBulkTasks() {
  const qc = useQueryClient()
  const { session } = useAuth()
  return useMutation({
    mutationFn: async ({ tasks, action, reason }: BulkTaskArgs): Promise<{ done: number; skipped: number }> => {
      const uid = session!.user.id
      const auditRows = (part: TaskInstance[], extra: (t: TaskInstance) => object) =>
        part.map((t) => ({
          org_id: ORG_ID,
          actor: uid,
          action: action === 'cancel' ? 'task.cancelled' : 'task.deleted',
          entity: 'task_instance',
          entity_id: t.id,
          detail: { ...extra(t), reason, bulk: true },
        }))
      let done = 0

      if (action === 'cancel') {
        const targets = tasks.filter((t) => t.status !== 'cancelled')
        const cancelled: TaskInstance[] = []
        for (const part of chunks(targets)) {
          const { data, error } = await supabase
            .from('task_instances')
            .update({ status: 'cancelled' })
            .in(
              'id',
              part.map((t) => t.id),
            )
            .select('id')
          if (error) throw error
          const ok = new Set((data ?? []).map((r: { id: string }) => r.id))
          const changed = part.filter((t) => ok.has(t.id))
          cancelled.push(...changed)
          done += changed.length
          if (changed.length) {
            const { error: aErr } = await supabase
              .from('audit_log')
              .insert(auditRows(changed, (t) => ({ from: t.status })))
            if (aErr) console.warn('audit: insert failed —', aErr.message)
          }
        }
        // people who still had one of these on their list: one notice each
        const byUser = new Map<string, TaskInstance[]>()
        for (const t of cancelled)
          if (t.assigned_to && isOpenStatus(t.status))
            byUser.set(t.assigned_to, [...(byUser.get(t.assigned_to) ?? []), t])
        for (const [user, list] of byUser)
          await notify([user], {
            org_id: ORG_ID,
            type: 'cancelled',
            title: list.length === 1 ? `Cancelled: ${list[0].title}` : `${list.length} of your tasks were cancelled`,
            body: reason,
            deep_link: '/staff/tasks',
            icon: 'x-circle',
          } as never)
        return { done, skipped: tasks.length - done }
      }

      for (const part of chunks(tasks)) {
        // audit first: the rows (and their ids) are gone after the delete
        const { error: aErr } = await supabase.from('audit_log').insert(
          auditRows(part, (t) => ({
            title: t.title,
            store_id: t.store_id,
            status: t.status,
            template_id: t.template_id,
          })),
        )
        if (aErr) console.warn('audit: insert failed —', aErr.message)
        const { error, count } = await supabase
          .from('task_instances')
          .delete({ count: 'exact' })
          .in(
            'id',
            part.map((t) => t.id),
          )
        if (error) throw error
        done += count ?? 0
      }
      if (done === 0 && tasks.length) throw new Error('Nothing was deleted — only an Owner can delete tasks.')
      return { done, skipped: tasks.length - done }
    },
    onSuccess: () => qc.invalidateQueries(),
  })
}

/** Latest cancel reason per task id (from the audit trail), for showing on cancelled tasks. */
export function useCancelReasons(enabled: boolean) {
  return useQuery({
    queryKey: ['cancel-reasons'],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audit_log')
        .select('entity_id, detail, created_at')
        .eq('action', 'task.cancelled')
        .order('created_at', { ascending: false })
        .limit(1000)
      if (error) throw error
      const out: Record<string, string> = {}
      for (const r of (data ?? []) as { entity_id: string; detail: { reason?: string | null } | null }[])
        if (!(r.entity_id in out) && r.detail?.reason) out[r.entity_id] = r.detail.reason
      return out
    },
  })
}

export function useDeleteTask() {
  const qc = useQueryClient()
  const { session } = useAuth()
  return useMutation({
    mutationFn: async (instance: TaskInstance) => {
      const uid = session!.user.id
      // audit first: the row (and its id) is gone after the delete
      await audit(uid, 'task.deleted', 'task_instance', instance.id, {
        title: instance.title,
        store_id: instance.store_id,
        status: instance.status,
        template_id: instance.template_id,
      })
      const { error, count } = await supabase
        .from('task_instances')
        .delete({ count: 'exact' })
        .eq('id', instance.id)
      if (error) throw error
      if (!count) throw new Error('Nothing was deleted — only an Owner can delete tasks.')
    },
    onSuccess: () => qc.invalidateQueries(),
  })
}
