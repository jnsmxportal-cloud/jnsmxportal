import Dexie, { type Table } from 'dexie'
import { supabase, ORG_ID } from '../lib/supabase'
import { triggerFanout } from '../lib/push'
import type { AppNotification, AppRole, StoreUnit, TaskInstance } from '../lib/types'

// ---------- shared notification/audit helpers ----------
/** A recipient is either a bare user id (uses n.deep_link) or an id with a role-specific deep link. */
export type NotifyRecipient = string | { id: string; deep_link: string | null }

export async function notify(
  recipients: NotifyRecipient[],
  n: Omit<AppNotification, 'id' | 'user_id' | 'created_at' | 'read_at'>,
) {
  if (!recipients.length) return
  // secondary write: never break the main flow
  const { error } = await supabase.from('notifications').insert(
    recipients.map((r) =>
      typeof r === 'string'
        ? { ...n, user_id: r, org_id: ORG_ID }
        : { ...n, user_id: r.id, deep_link: r.deep_link, org_id: ORG_ID },
    ),
  )
  if (error) {
    console.warn('notify: insert failed —', error.message)
    return
  }
  triggerFanout()
}

export async function audit(
  actor: string,
  action: string,
  entity: string,
  entityId: string,
  detail: object = {},
) {
  // secondary write: never break the main flow
  const { error } = await supabase
    .from('audit_log')
    .insert({ org_id: ORG_ID, actor, action, entity, entity_id: entityId, detail })
  if (error) console.warn('audit: insert failed —', error.message)
}

export async function reviewerProfiles(roles: AppRole[]): Promise<{ id: string; role: AppRole }[]> {
  const { data, error } = await supabase.from('profiles').select('id, role').in('role', roles)
  if (error) {
    console.warn('reviewers: lookup failed —', error.message)
    return []
  }
  return (data ?? []) as { id: string; role: AppRole }[]
}

export async function reviewers(roles: AppRole[]): Promise<string[]> {
  return (await reviewerProfiles(roles)).map((p) => p.id)
}

/** Deep link appropriate for a recipient's role (staff / team leaders can't open /owner/*). */
export function roleLink(
  role: AppRole,
  links: { mgmt: string; team_leader?: string; staff?: string },
): string {
  if (role === 'team_leader') return links.team_leader ?? links.mgmt
  if (role === 'staff') return links.staff ?? links.mgmt
  return links.mgmt
}

// ---------- core submission ops (used online and by the offline flusher) ----------
export interface TempLogArgs {
  instance: TaskInstance | null
  storeId: string
  readings: { unit: StoreUnit; value: number }[]
  geofenceVerdict: string
}

export async function submitTempLogCore(uid: string, args: TempLogArgs, deviceTs?: string) {
  const ts = deviceTs ?? new Date().toISOString()
  let instanceId = args.instance?.id
  if (instanceId) {
    const { error } = await supabase
      .from('task_instances')
      .update({
        status: 'submitted',
        submitted_at: ts,
        submitted_by: uid,
        geofence_verdict: args.geofenceVerdict,
      })
      .eq('id', instanceId)
    if (error) throw error
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
        submitted_at: ts,
        submitted_by: uid,
        geofence_verdict: args.geofenceVerdict,
      })
      .select('id')
      .single()
    if (error) throw error
    instanceId = (data as { id: string }).id
  }
  const { error: evidenceError } = await supabase.from('evidence').insert(
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
      device_ts: ts,
      geofence_verdict: args.geofenceVerdict,
    })),
  )
  if (evidenceError) throw evidenceError
  const breaches = args.readings.filter((r) => r.value > r.unit.breach_above)
  if (breaches.length) {
    const { error: escError } = await supabase.from('escalations').insert(
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
    if (escError) throw escError
    const { error: repairError } = await supabase.from('task_instances').insert(
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
    if (repairError) throw repairError
    // recipients: owner + manager + team_leader, plus the submitter — deep link per role
    const { data: recips, error: recipsError } = await supabase
      .from('profiles')
      .select('id, role')
      .or(`id.eq.${uid},role.in.(owner,manager,team_leader)`)
    if (recipsError) console.warn('temp breach: recipient lookup failed —', recipsError.message)
    await notify(
      ((recips ?? []) as { id: string; role: AppRole }[]).map((p) => ({
        id: p.id,
        deep_link: roleLink(p.role, {
          mgmt: '/owner/escalations',
          team_leader: '/leader',
          staff: '/staff/alerts',
        }),
      })),
      {
        org_id: ORG_ID,
        type: 'temp_breach',
        title: `Temperature failure: ${breaches.map((b) => b.unit.name).join(', ')}`,
        body: 'Escalated instantly. A repair workflow was auto-created.',
        deep_link: '/owner/escalations',
        icon: 'warning-octagon',
      } as never,
    )
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
  photos: Blob[]
  geofenceVerdict: string
}

export async function submitDeliveryCore(uid: string, args: DeliveryArgs, deviceTs?: string) {
  const ts = deviceTs ?? new Date().toISOString()
  const { data, error } = await supabase
    .from('deliveries')
    .insert({
      org_id: ORG_ID,
      store_id: args.storeId,
      supplier: args.supplier,
      invoice_no: args.invoiceNo || null,
      discrepancy_units: args.discrepancy,
      remarks: args.remarks || null,
      photo_count: args.photos.length,
      status: 'review',
      submitted_by: uid,
      submitted_at: ts,
      review_due_at: new Date(Date.now() + 36 * 3600e3).toISOString(),
      geofence_verdict: args.geofenceVerdict,
    })
    .select('id')
    .single()
  if (error) throw error
  const deliveryId = (data as { id: string }).id
  for (let i = 0; i < args.photos.length; i++) {
    const path = `${ORG_ID}/deliveries/${deliveryId}/${Date.now()}-${i}.jpg`
    const { error: uploadError } = await supabase.storage
      .from('evidence')
      .upload(path, args.photos[i], { contentType: 'image/jpeg' })
    if (uploadError) throw uploadError
    const { error: evidenceError } = await supabase.from('evidence').insert({
      org_id: ORG_ID,
      delivery_id: deliveryId,
      type: 'photo',
      storage_path: path,
      uploader: uid,
      device_ts: ts,
    })
    if (evidenceError) throw evidenceError
  }
  if (args.discrepancy > 0) {
    const { error: escError } = await supabase.from('escalations').insert({
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
    if (escError) throw escError
  }
  await notify(await reviewers(['owner', 'remote_office']), {
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
    photos: args.photos.length,
  })
  return { queued: false }
}

export interface IncidentArgs {
  storeId: string
  type: string
  description: string
  priority: 'low' | 'medium' | 'high' | 'critical'
  photoCount: number
  photos: Blob[]
}

export async function submitIncidentCore(uid: string, args: IncidentArgs, deviceTs?: string) {
  const ts = deviceTs ?? new Date().toISOString()
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
      submitted_at: ts,
      submitted_by: uid,
    })
    .select('id')
    .single()
  if (error) throw error
  const instanceId = (data as { id: string }).id
  for (let i = 0; i < args.photos.length; i++) {
    const path = `${ORG_ID}/${instanceId}/incident-${Date.now()}-${i}.jpg`
    const { error: uploadError } = await supabase.storage
      .from('evidence')
      .upload(path, args.photos[i], { contentType: 'image/jpeg' })
    if (uploadError) throw uploadError
    const { error: evidenceError } = await supabase.from('evidence').insert({
      org_id: ORG_ID,
      instance_id: instanceId,
      type: 'photo',
      storage_path: path,
      uploader: uid,
      device_ts: ts,
    })
    if (evidenceError) throw evidenceError
  }
  const { error: escError } = await supabase.from('escalations').insert({
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
  if (escError) throw escError
  const recips = await reviewerProfiles(['owner', 'team_leader'])
  await notify(
    recips.map((p) => ({
      id: p.id,
      deep_link: roleLink(p.role, { mgmt: '/owner/escalations', team_leader: '/leader' }),
    })),
    {
      org_id: ORG_ID,
      type: 'escalation',
      title: `Incident reported: ${args.type}`,
      body: args.description.slice(0, 120),
      deep_link: '/owner/escalations',
      icon: 'warning-octagon',
    } as never,
  )
  await audit(uid, 'incident.reported', 'task_instance', instanceId, {
    type: args.type,
    photos: args.photos.length,
  })
  return { queued: false }
}

// ---------- offline queue (PWA-4) ----------
export interface QueuedOp {
  id?: number
  uid: string
  kind: 'temp_log' | 'delivery' | 'incident'
  payload: TempLogArgs | DeliveryArgs | IncidentArgs
  created_at: string
  device_ts: string
  attempts?: number
  last_error?: string
}

class OpsDB extends Dexie {
  queue!: Table<QueuedOp, number>
  constructor() {
    super('ops-offline')
    this.version(1).stores({ queue: '++id, kind' })
  }
}

export const offlineDb = new OpsDB()

export async function enqueueOp(
  uid: string,
  kind: QueuedOp['kind'],
  payload: QueuedOp['payload'],
) {
  const now = new Date().toISOString()
  await offlineDb.queue.add({ uid, kind, payload, created_at: now, device_ts: now, attempts: 0 })
}

export function pendingOpsCount(): Promise<number> {
  return offlineDb.queue.count()
}

const MAX_ATTEMPTS = 8
let flushing = false

export async function flushQueue(currentUid?: string): Promise<{ flushed: number; failed: number }> {
  if (flushing) return { flushed: 0, failed: 0 }
  flushing = true
  try {
    const ops = await offlineDb.queue.orderBy('id').toArray()
    let flushed = 0
    let failed = 0
    for (const op of ops) {
      // RLS requires the author to be the signed-in user — keep other users'
      // ops queued until they sign in on this device
      if (currentUid && op.uid && op.uid !== currentUid) continue
      if (!op.uid) {
        // legacy row from before uid was captured — cannot replay safely
        console.warn('offline queue: dropping op without uid', op)
        await offlineDb.queue.delete(op.id!)
        continue
      }
      try {
        if (op.kind === 'temp_log')
          await submitTempLogCore(op.uid, op.payload as TempLogArgs, op.device_ts)
        else if (op.kind === 'delivery')
          await submitDeliveryCore(op.uid, op.payload as DeliveryArgs, op.device_ts)
        else await submitIncidentCore(op.uid, op.payload as IncidentArgs, op.device_ts)
        await offlineDb.queue.delete(op.id!)
        flushed++
      } catch (e) {
        failed++
        const attempts = (op.attempts ?? 0) + 1
        const lastError = e instanceof Error ? e.message : String(e)
        if (attempts >= MAX_ATTEMPTS) {
          console.warn(
            `offline queue: dropping ${op.kind} op after ${attempts} failed attempts —`,
            lastError,
            op.payload,
          )
          await offlineDb.queue.delete(op.id!)
        } else {
          await offlineDb.queue.update(op.id!, { attempts, last_error: lastError })
        }
        continue // keep flushing the rest of the queue
      }
    }
    return { flushed, failed }
  } finally {
    flushing = false
  }
}
