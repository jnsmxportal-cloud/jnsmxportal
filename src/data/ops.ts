import Dexie, { type Table } from 'dexie'
import { supabase, ORG_ID } from '../lib/supabase'
import { triggerFanout } from '../lib/push'
import type { AppNotification, StoreUnit, TaskInstance } from '../lib/types'

// ---------- shared notification/audit helpers ----------
export async function notify(
  userIds: string[],
  n: Omit<AppNotification, 'id' | 'user_id' | 'created_at' | 'read_at'>,
) {
  if (!userIds.length) return
  await supabase
    .from('notifications')
    .insert(userIds.map((uid) => ({ ...n, user_id: uid, org_id: ORG_ID })))
  triggerFanout()
}

export async function audit(
  actor: string,
  action: string,
  entity: string,
  entityId: string,
  detail: object = {},
) {
  await supabase
    .from('audit_log')
    .insert({ org_id: ORG_ID, actor, action, entity, entity_id: entityId, detail })
}

export async function owners(): Promise<string[]> {
  const { data } = await supabase.from('profiles').select('id').eq('role', 'owner')
  return (data ?? []).map((p: { id: string }) => p.id)
}

// ---------- core submission ops (used online and by the offline flusher) ----------
export interface TempLogArgs {
  instance: TaskInstance | null
  storeId: string
  readings: { unit: StoreUnit; value: number }[]
  geofenceVerdict: string
}

export async function submitTempLogCore(uid: string, args: TempLogArgs) {
  let instanceId = args.instance?.id
  if (instanceId) {
    await supabase
      .from('task_instances')
      .update({
        status: 'submitted',
        submitted_at: new Date().toISOString(),
        submitted_by: uid,
        geofence_verdict: args.geofenceVerdict,
      })
      .eq('id', instanceId)
  } else {
    const { data, error } = await supabase
      .from('task_instances')
      .insert({
        org_id: ORG_ID,
        store_id: args.storeId,
        title: 'Fridge / Freezer Temp Log',
        category: 'daily',
        priority: 'high',
        status: 'submitted',
        is_temperature_log: true,
        evidence: { temp: true, geofence: true },
        submitted_at: new Date().toISOString(),
        submitted_by: uid,
        geofence_verdict: args.geofenceVerdict,
      })
      .select('id')
      .single()
    if (error) throw error
    instanceId = (data as { id: string }).id
  }
  await supabase.from('evidence').insert(
    args.readings.map((r) => ({
      org_id: ORG_ID,
      instance_id: instanceId,
      type: 'metadata',
      metadata: {
        unit: r.unit.name,
        unit_type: r.unit.type,
        value: r.value,
        breach: r.value > r.unit.breach_above,
      },
      uploader: uid,
      device_ts: new Date().toISOString(),
      geofence_verdict: args.geofenceVerdict,
    })),
  )
  const breaches = args.readings.filter((r) => r.value > r.unit.breach_above)
  if (breaches.length) {
    await supabase.from('escalations').insert(
      breaches.map((b) => ({
        org_id: ORG_ID,
        store_id: args.storeId,
        source: 'temp_breach',
        title: `${b.unit.name} temperature failure`,
        detail: `Reading ${b.value > 0 ? '+' : ''}${b.value}°C recorded — above the ${b.unit.breach_above}°C escalation threshold. Auto-created a maintenance workflow.`,
        level: 'critical',
        stage: 'owner',
        status: 'open',
        instance_id: instanceId,
        action_due_at: new Date(Date.now() + 24 * 3600e3).toISOString(),
      })),
    )
    await supabase.from('task_instances').insert(
      breaches.map((b) => ({
        org_id: ORG_ID,
        store_id: args.storeId,
        title: `Repair: ${b.unit.name} temperature failure`,
        category: 'maintenance',
        priority: 'critical',
        status: 'assigned',
        due_at: new Date(Date.now() + 24 * 3600e3).toISOString(),
      })),
    )
    const mgmt = await owners()
    await notify([...mgmt, uid], {
      org_id: ORG_ID,
      type: 'temp_breach',
      title: `Temperature failure: ${breaches.map((b) => b.unit.name).join(', ')}`,
      body: 'Escalated instantly. A repair workflow was auto-created.',
      deep_link: '/owner/escalations',
      icon: 'warning-octagon',
    } as never)
  }
  await audit(uid, 'templog.submitted', 'task_instance', instanceId!, {
    breaches: breaches.length,
  })
  return { breaches: breaches.length, queued: false }
}

export interface DeliveryArgs {
  storeId: string
  supplier: string
  invoiceNo: string
  discrepancy: number
  remarks: string
  photoCount: number
  geofenceVerdict: string
}

export async function submitDeliveryCore(uid: string, args: DeliveryArgs) {
  const { data, error } = await supabase
    .from('deliveries')
    .insert({
      org_id: ORG_ID,
      store_id: args.storeId,
      supplier: args.supplier,
      invoice_no: args.invoiceNo || null,
      discrepancy_units: args.discrepancy,
      remarks: args.remarks || null,
      photo_count: args.photoCount,
      status: 'review',
      submitted_by: uid,
      review_due_at: new Date(Date.now() + 36 * 3600e3).toISOString(),
      geofence_verdict: args.geofenceVerdict,
    })
    .select('id')
    .single()
  if (error) throw error
  const deliveryId = (data as { id: string }).id
  if (args.discrepancy > 0) {
    await supabase.from('escalations').insert({
      org_id: ORG_ID,
      store_id: args.storeId,
      source: 'delivery_discrepancy',
      title: `Delivery discrepancy — ${args.supplier}${args.invoiceNo ? ` (Inv #${args.invoiceNo})` : ''}`,
      detail: `${args.discrepancy} unit(s) short on delivery. ${args.remarks || ''}`.trim(),
      level: 'high',
      stage: 'owner',
      status: 'open',
      delivery_id: deliveryId,
    })
  }
  const { data: reviewers } = await supabase
    .from('profiles')
    .select('id')
    .in('role', ['owner', 'remote_office'])
  await notify(((reviewers ?? []) as { id: string }[]).map((r) => r.id), {
    org_id: ORG_ID,
    type: 'delivery',
    title: `Delivery logged — ${args.supplier}`,
    body:
      args.discrepancy > 0
        ? `Quantity discrepancy: ${args.discrepancy} short`
        : 'Awaiting Remote Office review (36h SLA)',
    deep_link: '/owner/deliveries',
    icon: 'truck',
  } as never)
  await audit(uid, 'delivery.submitted', 'delivery', deliveryId, {
    discrepancy: args.discrepancy,
  })
  return { queued: false }
}

export interface IncidentArgs {
  storeId: string
  type: string
  description: string
  priority: 'low' | 'medium' | 'high' | 'critical'
  photoCount: number
}

export async function submitIncidentCore(uid: string, args: IncidentArgs) {
  const { data, error } = await supabase
    .from('task_instances')
    .insert({
      org_id: ORG_ID,
      store_id: args.storeId,
      title: `Incident: ${args.type}`,
      description: args.description,
      category: 'incident',
      priority: args.priority,
      status: 'submitted',
      submitted_at: new Date().toISOString(),
      submitted_by: uid,
    })
    .select('id')
    .single()
  if (error) throw error
  const instanceId = (data as { id: string }).id
  await supabase.from('escalations').insert({
    org_id: ORG_ID,
    store_id: args.storeId,
    source: 'incident',
    title: `Incident: ${args.type}`,
    detail: args.description,
    level: args.priority === 'critical' ? 'critical' : 'high',
    stage: args.priority === 'critical' ? 'owner' : 'team_leader',
    status: 'open',
    instance_id: instanceId,
    action_due_at: new Date(Date.now() + 24 * 3600e3).toISOString(),
  })
  const { data: mgmt } = await supabase
    .from('profiles')
    .select('id')
    .in('role', ['owner', 'team_leader'])
  await notify(((mgmt ?? []) as { id: string }[]).map((r) => r.id), {
    org_id: ORG_ID,
    type: 'escalation',
    title: `Incident reported: ${args.type}`,
    body: args.description.slice(0, 120),
    deep_link: '/owner/escalations',
    icon: 'warning-octagon',
  } as never)
  await audit(uid, 'incident.reported', 'task_instance', instanceId, { type: args.type })
  return { queued: false }
}

// ---------- offline queue (PWA-4) ----------
export interface QueuedOp {
  id?: number
  kind: 'temp_log' | 'delivery' | 'incident'
  payload: TempLogArgs | DeliveryArgs | IncidentArgs
  created_at: string
}

class OpsDB extends Dexie {
  queue!: Table<QueuedOp, number>
  constructor() {
    super('ops-offline')
    this.version(1).stores({ queue: '++id, kind' })
  }
}

export const offlineDb = new OpsDB()

export async function enqueueOp(kind: QueuedOp['kind'], payload: QueuedOp['payload']) {
  await offlineDb.queue.add({ kind, payload, created_at: new Date().toISOString() })
}

export function pendingOpsCount(): Promise<number> {
  return offlineDb.queue.count()
}

export async function flushQueue(uid: string): Promise<number> {
  const ops = await offlineDb.queue.orderBy('id').toArray()
  let flushed = 0
  for (const op of ops) {
    try {
      if (op.kind === 'temp_log') await submitTempLogCore(uid, op.payload as TempLogArgs)
      else if (op.kind === 'delivery') await submitDeliveryCore(uid, op.payload as DeliveryArgs)
      else await submitIncidentCore(uid, op.payload as IncidentArgs)
      await offlineDb.queue.delete(op.id!)
      flushed++
    } catch {
      break // stop on first failure; retry on next flush
    }
  }
  return flushed
}
