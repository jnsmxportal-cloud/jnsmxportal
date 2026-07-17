import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, ORG_ID } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import type {
  AppNotification,
  ChecklistItem,
  Delivery,
  Escalation,
  Profile,
  StoreUnit,
  TaskInstance,
} from '../lib/types'

// ---------- realtime: invalidate on any change ----------
export function useRealtimeSync() {
  const qc = useQueryClient()
  useEffect(() => {
    const ch = supabase
      .channel('ops-live')
      .on('postgres_changes', { event: '*', schema: 'public' }, () => {
        qc.invalidateQueries()
      })
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [qc])
}

// ---------- queries ----------
export function useProfiles() {
  return useQuery({
    queryKey: ['profiles'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*')
      if (error) throw error
      return data as Profile[]
    },
  })
}

export function useTasks(filter?: { storeId?: string | 'all' }) {
  const storeId = filter?.storeId
  return useQuery({
    queryKey: ['tasks', storeId ?? 'all'],
    queryFn: async () => {
      let q = supabase
        .from('task_instances')
        .select('*')
        .order('due_at', { ascending: true, nullsFirst: false })
      if (storeId && storeId !== 'all') q = q.eq('store_id', storeId)
      const { data, error } = await q
      if (error) throw error
      return data as TaskInstance[]
    },
  })
}

export function useMyTasks() {
  const { session } = useAuth()
  return useQuery({
    queryKey: ['my-tasks', session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('task_instances')
        .select('*')
        .in('status', ['scheduled', 'assigned', 'in_progress', 'rejected'])
        .order('due_at', { ascending: true, nullsFirst: false })
      if (error) throw error
      // assigned to me, my role, or unassigned in my stores
      return (data as TaskInstance[]).filter(
        (t) => !t.assigned_to || t.assigned_to === session!.user.id,
      )
    },
  })
}

export function useChecklistItems(instanceId: string | null) {
  return useQuery({
    queryKey: ['items', instanceId],
    enabled: !!instanceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('checklist_items')
        .select('*')
        .eq('instance_id', instanceId!)
        .order('position')
      if (error) throw error
      return data as ChecklistItem[]
    },
  })
}

export function useStoreUnits(storeId?: string) {
  return useQuery({
    queryKey: ['units', storeId ?? 'all'],
    queryFn: async () => {
      let q = supabase.from('store_units').select('*').order('display_order')
      if (storeId) q = q.eq('store_id', storeId)
      const { data, error } = await q
      if (error) throw error
      return data as StoreUnit[]
    },
  })
}

export function useDeliveries(storeId?: string | 'all') {
  return useQuery({
    queryKey: ['deliveries', storeId ?? 'all'],
    queryFn: async () => {
      let q = supabase.from('deliveries').select('*').order('submitted_at', { ascending: false })
      if (storeId && storeId !== 'all') q = q.eq('store_id', storeId)
      const { data, error } = await q
      if (error) throw error
      return data as Delivery[]
    },
  })
}

export function useInvoices(storeId?: string | 'all') {
  return useQuery({
    queryKey: ['invoices', storeId ?? 'all'],
    queryFn: async () => {
      let q = supabase.from('invoices').select('*').order('uploaded_at', { ascending: false })
      if (storeId && storeId !== 'all') q = q.eq('store_id', storeId)
      const { data, error } = await q
      if (error) throw error
      return data as import('../lib/types').Invoice[]
    },
  })
}

export function useEscalations(storeId?: string | 'all') {
  return useQuery({
    queryKey: ['escalations', storeId ?? 'all'],
    queryFn: async () => {
      let q = supabase
        .from('escalations')
        .select('*')
        .neq('status', 'resolved')
        .order('created_at', { ascending: false })
      if (storeId && storeId !== 'all') q = q.eq('store_id', storeId)
      const { data, error } = await q
      if (error) throw error
      return data as Escalation[]
    },
  })
}

export function useNotifications() {
  const { session } = useAuth()
  return useQuery({
    queryKey: ['notifications', session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(30)
      if (error) throw error
      return data as AppNotification[]
    },
  })
}

// ---------- helpers (shared with the offline flusher) ----------
import {
  audit,
  enqueueOp,
  notify,
  owners as ownersAndManagers,
  submitDeliveryCore,
  submitIncidentCore,
  submitTempLogCore,
  type DeliveryArgs,
  type IncidentArgs,
  type TempLogArgs,
} from './ops'

// ---------- mutations ----------
export function useReviewTask() {
  const qc = useQueryClient()
  const { session } = useAuth()
  return useMutation({
    mutationFn: async (args: {
      instance: TaskInstance
      verdict: 'approved' | 'rejected' | 'reopened'
      feedback?: string
    }) => {
      const uid = session!.user.id
      const { instance, verdict, feedback } = args
      const status =
        verdict === 'approved' ? 'completed' : verdict === 'rejected' ? 'rejected' : 'assigned'
      const patch: Partial<TaskInstance> & Record<string, unknown> = {
        status,
        reviewed_at: new Date().toISOString(),
        reviewed_by: uid,
        review_feedback: feedback ?? null,
      }
      if (verdict === 'approved') patch.completed_at = new Date().toISOString()
      const { error } = await supabase.from('task_instances').update(patch).eq('id', instance.id)
      if (error) throw error
      await supabase.from('approvals').insert({
        org_id: ORG_ID,
        instance_id: instance.id,
        reviewer: uid,
        verdict,
        feedback: feedback ?? null,
      })
      if (instance.submitted_by) {
        await notify([instance.submitted_by], {
          org_id: ORG_ID,
          type: verdict,
          title:
            verdict === 'approved'
              ? `“${instance.title}” approved`
              : verdict === 'rejected'
                ? `“${instance.title}” rejected`
                : `“${instance.title}” reopened`,
          body: feedback ?? null,
          deep_link: '/staff/tasks',
          icon: verdict === 'approved' ? 'seal-check' : 'arrow-counter-clockwise',
        } as never)
      }
      await audit(uid, `task.${verdict}`, 'task_instance', instance.id, { feedback })
    },
    onSuccess: () => qc.invalidateQueries(),
  })
}

export function useReviewDelivery() {
  const qc = useQueryClient()
  const { session } = useAuth()
  return useMutation({
    mutationFn: async (args: { delivery: Delivery; verdict: 'approved' | 'rejected' }) => {
      const uid = session!.user.id
      const patch =
        args.verdict === 'approved'
          ? { status: 'approved', approved_by: uid, approved_at: new Date().toISOString() }
          : { status: 'rejected', reviewed_by: uid, reviewed_at: new Date().toISOString() }
      const { error } = await supabase.from('deliveries').update(patch).eq('id', args.delivery.id)
      if (error) throw error
      await audit(uid, `delivery.${args.verdict}`, 'delivery', args.delivery.id)
    },
    onSuccess: () => qc.invalidateQueries(),
  })
}

/** Remote-Office review step (FR-6.4 step 2): cost & quantity verification -> Owner approval. */
export function useVerifyDelivery() {
  const qc = useQueryClient()
  const { session } = useAuth()
  return useMutation({
    mutationFn: async (args: {
      delivery: Delivery
      cost: number | null
      finalQty: number | null
      eposUpdated: boolean
      stockShortages: string
    }) => {
      const uid = session!.user.id
      const { error } = await supabase
        .from('deliveries')
        .update({
          cost: args.cost,
          final_qty: args.finalQty,
          epos_updated: args.eposUpdated,
          stock_shortages: args.stockShortages || null,
          status: 'verified',
          reviewed_by: uid,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', args.delivery.id)
      if (error) throw error
      const mgmt = await ownersAndManagers()
      await notify(mgmt, {
        org_id: ORG_ID,
        type: 'delivery',
        title: `Delivery verified — ${args.delivery.supplier}`,
        body: 'Cost & quantity confirmed by Remote Office. Awaiting your approval.',
        deep_link: '/owner/deliveries',
        icon: 'truck',
      } as never)
      await audit(uid, 'delivery.verified', 'delivery', args.delivery.id, {
        cost: args.cost,
        final_qty: args.finalQty,
        epos_updated: args.eposUpdated,
      })
    },
    onSuccess: () => qc.invalidateQueries(),
  })
}

export function useSubmitChecklist() {
  const qc = useQueryClient()
  const { session } = useAuth()
  return useMutation({
    mutationFn: async (args: {
      instance: TaskInstance
      geofenceVerdict: string
      gps?: { lat?: number; lng?: number; accuracy?: number }
    }) => {
      const uid = session!.user.id
      const { error } = await supabase
        .from('task_instances')
        .update({
          status: 'submitted',
          submitted_at: new Date().toISOString(),
          submitted_by: uid,
          geofence_verdict: args.geofenceVerdict,
          gps_lat: args.gps?.lat ?? null,
          gps_lng: args.gps?.lng ?? null,
          gps_accuracy: args.gps?.accuracy ?? null,
        })
        .eq('id', args.instance.id)
      if (error) throw error
      const mgmt = await ownersAndManagers()
      await notify(mgmt, {
        org_id: ORG_ID,
        type: 'submitted',
        title: `“${args.instance.title}” submitted, awaiting review`,
        body: null,
        deep_link: '/owner/approvals',
        icon: 'seal-check',
      } as never)
      await audit(uid, 'task.submitted', 'task_instance', args.instance.id, {
        geofence: args.geofenceVerdict,
      })
    },
    onSuccess: () => qc.invalidateQueries(),
  })
}

export function useSubmitTempLog() {
  const qc = useQueryClient()
  const { session } = useAuth()
  return useMutation({
    mutationFn: async (args: TempLogArgs) => {
      if (!navigator.onLine) {
        await enqueueOp('temp_log', args)
        return { breaches: args.readings.filter((r) => r.value > r.unit.breach_above).length, queued: true }
      }
      return submitTempLogCore(session!.user.id, args)
    },
    onSuccess: () => qc.invalidateQueries(),
  })
}

export function useSubmitDelivery() {
  const qc = useQueryClient()
  const { session } = useAuth()
  return useMutation({
    mutationFn: async (args: DeliveryArgs) => {
      if (!navigator.onLine) {
        await enqueueOp('delivery', args)
        return { queued: true }
      }
      return submitDeliveryCore(session!.user.id, args)
    },
    onSuccess: () => qc.invalidateQueries(),
  })
}

export function useSubmitIncident() {
  const qc = useQueryClient()
  const { session } = useAuth()
  return useMutation({
    mutationFn: async (args: IncidentArgs) => {
      if (!navigator.onLine) {
        await enqueueOp('incident', args)
        return { queued: true }
      }
      return submitIncidentCore(session!.user.id, args)
    },
    onSuccess: () => qc.invalidateQueries(),
  })
}

export function useCreateTask() {
  const qc = useQueryClient()
  const { session } = useAuth()
  return useMutation({
    mutationFn: async (args: {
      title: string
      storeIds: string[]
      assignedTo: string | null
      dueAt: string | null
      priority: 'low' | 'medium' | 'high'
      category: string
      evidence: Record<string, boolean>
    }) => {
      const uid = session!.user.id
      const { data, error } = await supabase
        .from('task_instances')
        .insert(
          args.storeIds.map((sid) => ({
            org_id: ORG_ID,
            store_id: sid,
            title: args.title,
            category: args.category,
            priority: args.priority,
            status: 'assigned',
            evidence: args.evidence,
            due_at: args.dueAt,
            assigned_to: args.assignedTo,
          })),
        )
        .select('id')
      if (error) throw error
      if (args.assignedTo) {
        await notify([args.assignedTo], {
          org_id: ORG_ID,
          type: 'assigned',
          title: `New task: ${args.title}`,
          body: null,
          deep_link: '/staff/tasks',
          icon: 'clipboard-text',
        } as never)
      }
      await audit(uid, 'task.created', 'task_instance', (data as { id: string }[])[0]?.id ?? '', {
        stores: args.storeIds.length,
      })
    },
    onSuccess: () => qc.invalidateQueries(),
  })
}

export function useResolveEscalation() {
  const qc = useQueryClient()
  const { session } = useAuth()
  return useMutation({
    mutationFn: async (args: { id: string; status: 'investigating' | 'resolved' }) => {
      const patch: Record<string, unknown> = { status: args.status }
      if (args.status === 'resolved') {
        patch.resolved_at = new Date().toISOString()
        patch.resolved_by = session!.user.id
      }
      const { error } = await supabase.from('escalations').update(patch).eq('id', args.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries(),
  })
}

export function useMarkNotificationsRead() {
  const qc = useQueryClient()
  const { session } = useAuth()
  return useMutation({
    mutationFn: async () => {
      await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('user_id', session!.user.id)
        .is('read_at', null)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })
}

export function useToggleChecklistItem() {
  const qc = useQueryClient()
  const { session } = useAuth()
  return useMutation({
    mutationFn: async (args: { item: ChecklistItem; patch: Partial<ChecklistItem> }) => {
      const { error } = await supabase
        .from('checklist_items')
        .update({
          ...args.patch,
          checked_by: session!.user.id,
          checked_at: new Date().toISOString(),
        })
        .eq('id', args.item.id)
      if (error) throw error
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['items', v.item.instance_id] }),
  })
}
