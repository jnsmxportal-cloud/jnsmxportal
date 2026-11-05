import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

/**
 * Review history of tasks. Every Approve / Reject / Reopen writes an `approvals` row (readable by
 * everyone in the org), so a task's earlier feedback survives later reviews — the task row itself
 * only keeps the latest `review_feedback`. Owners/managers additionally get the full activity
 * timeline from the audit log (created, submitted, reviewed, cancelled…), which staff can't read.
 */

export interface ReviewRow {
  id: string
  instance_id: string
  reviewer: string | null
  verdict: 'approved' | 'rejected' | 'reopened'
  feedback: string | null
  created_at: string
}

/** All reviews of one task, oldest first. */
export function useReviewHistory(instanceId: string | null | undefined) {
  return useQuery({
    queryKey: ['reviews', instanceId],
    enabled: !!instanceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('approvals')
        .select('id, instance_id, reviewer, verdict, feedback, created_at')
        .eq('instance_id', instanceId!)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as ReviewRow[]
    },
  })
}

/** Earlier send-backs (rejected / reopened) for a set of tasks, keyed by task id, oldest first. */
export function useSendBacks(instanceIds: string[]) {
  const ids = [...new Set(instanceIds)].sort()
  return useQuery({
    queryKey: ['send-backs', ids.join(',')],
    enabled: ids.length > 0,
    queryFn: async () => {
      const out: Record<string, ReviewRow[]> = {}
      for (let i = 0; i < ids.length; i += 100) {
        const { data, error } = await supabase
          .from('approvals')
          .select('id, instance_id, reviewer, verdict, feedback, created_at')
          .in('instance_id', ids.slice(i, i + 100))
          .in('verdict', ['rejected', 'reopened'])
          .order('created_at', { ascending: true })
        if (error) throw error
        for (const r of (data ?? []) as ReviewRow[]) (out[r.instance_id] ??= []).push(r)
      }
      return out
    },
  })
}

export interface TimelineEvent {
  id: string
  at: string
  actor: string | null
  label: string
  /** feedback / reason, quoted under the event */
  note: string | null
  tone: 'neutral' | 'good' | 'warn' | 'bad'
}

const ACTIONS: Record<string, { label: string; tone: TimelineEvent['tone'] }> = {
  'task.created': { label: 'Created', tone: 'neutral' },
  'incident.reported': { label: 'Reported', tone: 'neutral' },
  'task.submitted': { label: 'Submitted', tone: 'neutral' },
  'templog.submitted': { label: 'Readings submitted', tone: 'neutral' },
  'task.completed': { label: 'Completed (no review needed)', tone: 'good' },
  'task.approved': { label: 'Approved', tone: 'good' },
  'task.rejected': { label: 'Rejected', tone: 'bad' },
  'task.reopened': { label: 'Reopened', tone: 'warn' },
  'task.cancelled': { label: 'Cancelled', tone: 'neutral' },
  'task.edited': { label: 'Edited', tone: 'neutral' },
}

/** Full activity timeline of a task from the audit log (owners / managers only), oldest first. */
export function useTaskTimeline(instanceId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ['task-timeline', instanceId],
    enabled: enabled && !!instanceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audit_log')
        .select('id, actor, action, detail, created_at')
        .eq('entity', 'task_instance')
        .eq('entity_id', instanceId!)
        .order('created_at', { ascending: true })
      if (error) throw error
      return ((data ?? []) as {
        id: number
        actor: string | null
        action: string
        detail: { feedback?: string | null; reason?: string | null } | null
        created_at: string
      }[]).map<TimelineEvent>((r) => {
        const a = ACTIONS[r.action] ?? { label: r.action.replace(/^\w+\./, '').replace(/_/g, ' '), tone: 'neutral' }
        return {
          id: String(r.id),
          at: r.created_at,
          actor: r.actor,
          label: a.label,
          note: r.detail?.feedback ?? r.detail?.reason ?? null,
          tone: a.tone,
        }
      })
    },
  })
}
