import { useMutation, useQueryClient } from '@tanstack/react-query'
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
