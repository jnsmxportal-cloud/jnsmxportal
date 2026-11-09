import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, ORG_ID } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import type { AppRole, EvidenceReqs, Store, StoreUnit, TaskCategory, TaskPriority } from '../lib/types'

export interface ChecklistDef {
  label: string
  photo?: boolean
  temp?: boolean
  limit?: number
  qr?: boolean
  signature?: boolean
}

export interface Recurrence {
  freq: 'ad_hoc' | 'once' | 'daily' | 'weekly' | 'biweekly' | 'month_end' | 'on_clock_in'
  /** once: local due date-time 'YYYY-MM-DDTHH:MM' (store timezone); the scheduler creates one task per store */
  due_at?: string
  times?: string[]
  except_days?: number[]
  byweekday?: number[]
  /** template-wide deadline (HH:MM); superseded per time by `deadlines` */
  deadline?: string
  /**
   * Deadline per run time, keyed by the entry in `times`. When present, a time without an entry
   * is due at its trigger time (the scheduler ignores `deadline` then).
   */
  deadlines?: Record<string, string>
  /** label per run time, appended to generated task titles: "Chiller temp · Morning" */
  labels?: Record<string, string>
  /** assign each generated task to whoever the rota has on shift at the trigger time */
  assign_on_shift?: boolean
  reminder?: string
  /** legacy absolute clock time; superseded by escalate_after_hours */
  escalate_at?: string
  /** whole hours after the deadline (or trigger time) before missed + escalation; 0 = at deadline */
  escalate_after_hours?: number
  deadline_rel?: string
  pending_until_complete?: boolean
  /** biweekly: ISO date whose week is the first "on" week; weeks alternate from there */
  anchor?: string
}

export interface TaskTemplate {
  id: string
  org_id: string
  /** legacy single-store scope; kept in sync by a DB trigger from store_ids */
  store_id: string | null
  /** stores this template applies to; null / empty = chain-wide */
  store_ids: string[] | null
  title: string
  description: string | null
  category: TaskCategory
  priority: TaskPriority
  evidence: EvidenceReqs
  geofence_policy: 'none' | 'flag' | 'block'
  recurrence: Recurrence | null
  escalation: Record<string, unknown>
  checklist: ChecklistDef[]
  requires_approval: boolean
  is_temperature_log: boolean
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** Monday of the week containing an ISO date, as 'D Mon' (biweekly summaries). */
function weekCommencing(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

/** The deadline (HH:MM) that applies to one run time — same rule as the scheduler. */
export function slotDeadline(r: Recurrence, time: string): string | undefined {
  return r.deadlines ? r.deadlines[time] || undefined : r.deadline || undefined
}

/**
 * Hours-after-deadline for a recurrence: the stored value, or derived from a legacy absolute
 * escalate_at (wrapping past midnight), or null when the template never escalates.
 */
export function escalateAfterHours(r: Recurrence | null | undefined): number | null {
  if (!r) return null
  if (typeof r.escalate_after_hours === 'number') return r.escalate_after_hours
  if (!r.escalate_at) return null
  const base = (r.times?.[0] && slotDeadline(r, r.times[0])) ?? r.times?.[0]
  if (!base) return null
  const mins = (s: string) => {
    const [h, m] = s.split(':').map(Number)
    return h * 60 + m
  }
  const diff = mins(r.escalate_at) - mins(base)
  return Math.max(0, Math.round((diff < 0 ? diff + 1440 : diff) / 60))
}

/** ms to add to a UTC instant to get the wall-clock time in `tz` at that instant */
function tzOffsetMs(tz: string, utcMs: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcMs))
  const get = (k: string) => Number(parts.find((p) => p.type === k)?.value ?? 0)
  const wall = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'))
  return wall - (utcMs - (utcMs % 1000))
}

/** store-local 'YYYY-MM-DDTHH:MM' in `tz` → the UTC instant (DST-safe, like the scheduler's `at time zone`) */
export function zonedToUtc(local: string, tz: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local)
  if (!m) return new Date(NaN)
  const guess = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]))
  const off = tzOffsetMs(tz, guess)
  let t = guess - off
  const off2 = tzOffsetMs(tz, t)
  if (off2 !== off) t = guess - off2
  return new Date(t)
}

/** today's date in `tz` as YYYY-MM-DD, shifted by `addDays` */
function zonedDate(tz: string, now: Date, addDays = 0): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(now)
  const [y, mo, d] = today.split('-').map(Number)
  return new Date(Date.UTC(y, mo - 1, d + addDays)).toISOString().slice(0, 10)
}

/**
 * Due + cutoff for a task created on demand from a template ("Run now"): the template's next
 * deadline at that store. Timed schedules use the next run slot whose deadline is still ahead
 * (a deadline earlier than its run time falls on the next day, same rule as the scheduler);
 * one-offs use their due date. Schedules without clock times (month-end, on clock-in, none)
 * give no due time.
 */
export function runNowSchedule(
  r: Recurrence | null | undefined,
  tz: string,
  now: Date = new Date(),
): { dueAt: Date | null; cutoffAt: Date | null } {
  let due: Date | null = null
  if (r?.freq === 'once' && r.due_at) {
    due = zonedToUtc(r.due_at, tz)
  } else if ((r?.freq === 'daily' || r?.freq === 'weekly' || r?.freq === 'biweekly') && r.times?.length) {
    const candidates: Date[] = []
    for (const dayOffset of [0, 1]) {
      for (const t of r.times) {
        const dl = slotDeadline(r, t) || t
        const day = zonedDate(tz, now, dayOffset + (dl < t ? 1 : 0))
        candidates.push(zonedToUtc(`${day}T${dl}`, tz))
      }
    }
    due = candidates.sort((a, b) => a.getTime() - b.getTime()).find((d) => d > now) ?? null
  }
  if (due && Number.isNaN(due.getTime())) due = null
  const esc = escalateAfterHours(r)
  return { dueAt: due, cutoffAt: due && esc !== null ? new Date(due.getTime() + esc * 3600_000) : null }
}

/** 'YYYY-MM-DDTHH:MM' → 'Mon 3 Nov 14:00' (no timezone conversion: the value is already local) */
export function formatLocalDateTime(v: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(v)
  if (!m) return v
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]))
  const day = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
  return `${day} ${m[4]}:${m[5]}`
}

/** Plain-language recurrence summary per §8.3 ("Every Monday at 08:00", "Daily except Wednesday"). */
export function recurrenceSummary(r: Recurrence | null): string {
  if (!r || r.freq === 'ad_hoc') return 'Ad-hoc — created on demand'
  if (r.freq === 'once') {
    const esc =
      typeof r.escalate_after_hours === 'number'
        ? r.escalate_after_hours === 0
          ? ' · escalates at the due time'
          : ` · escalates ${r.escalate_after_hours}h after`
        : ''
    return r.due_at ? `One-off · due ${formatLocalDateTime(r.due_at)}${esc}` : 'One-off · no due date set'
  }
  if (r.freq === 'on_clock_in')
    return `On each clock-in · due ${r.deadline_rel === 'shift_end-2h' ? '2h before shift end' : 'at shift end'}`
  if (r.freq === 'month_end') return 'Last day of every month · pending until completed'
  // each run time with its label and deadline: "Morning 07:00 → 09:00, Evening 19:00 → 21:00"
  const slot = (t: string) => {
    const label = r.labels?.[t]?.trim()
    const dl = slotDeadline(r, t)
    return `${label ? `${label} ` : ''}${t}${dl && dl !== t ? ` → ${dl}` : ''}`
  }
  const times = r.times?.length ? ` at ${r.times.map(slot).join(', ')}` : ''
  const esc =
    typeof r.escalate_after_hours === 'number'
      ? r.escalate_after_hours === 0
        ? ' · escalates at deadline'
        : ` · escalates ${r.escalate_after_hours}h after`
      : r.escalate_at
        ? ` · escalates ${r.escalate_at}`
        : ''
  const deadline = esc + (r.assign_on_shift ? ' · assigned from the rota' : '')
  if (r.freq === 'weekly' || r.freq === 'biweekly') {
    const days = (r.byweekday ?? []).map((d) => WEEKDAYS[d - 1]).join(' & ') || 'no day set'
    if (r.freq === 'biweekly') {
      const from = r.anchor ? ` · from w/c ${weekCommencing(r.anchor)}` : ''
      return `Every other ${days}${times}${deadline}${from}`
    }
    return `Every ${days}${times}${deadline}`
  }
  const except = r.except_days?.length
    ? ` except ${r.except_days.map((d) => WEEKDAYS[d - 1]).join(', ')}`
    : ''
  return `Daily${except}${times}${deadline}`
}

export function useTemplates() {
  return useQuery({
    queryKey: ['templates'],
    queryFn: async () => {
      const { data, error } = await supabase.from('task_templates').select('*').order('title')
      if (error) throw error
      return data as TaskTemplate[]
    },
  })
}

export function useSaveTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (t: Partial<TaskTemplate> & { id?: string }) => {
      const row = { ...t, org_id: ORG_ID }
      if (t.id) {
        const { error } = await supabase.from('task_templates').update(row).eq('id', t.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('task_templates').insert(row)
        if (error) throw error
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates'] }),
  })
}

export function useDeleteTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('task_templates').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates'] }),
  })
}

// ---- units ----
export function useSaveUnit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (u: Partial<StoreUnit> & { id?: string; store_id: string }) => {
      if (u.id) {
        const { error } = await supabase.from('store_units').update(u).eq('id', u.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('store_units').insert(u)
        if (error) throw error
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['units'] }),
  })
}

export function useDeleteUnit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('store_units').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['units'] }),
  })
}

// ---- stores / geofence ----
export function useUpdateStore() {
  const qc = useQueryClient()
  const { refreshStores } = useAuth()
  return useMutation({
    mutationFn: async (s: Partial<Store> & { id: string }) => {
      const { error } = await supabase.from('stores').update(s).eq('id', s.id)
      if (error) throw error
    },
    onSuccess: async () => {
      // stores live in AuthProvider state, not in a query — re-read them so the
      // Stores page, geofence cards and staff screens see the new fence at once
      await refreshStores()
      qc.invalidateQueries()
    },
  })
}

// ---- users (via owner-only edge function) ----
export interface UserStoreRole {
  user_id: string
  store_id: string
  role: AppRole
}

export function useUserStoreRoles() {
  return useQuery({
    queryKey: ['user-store-roles'],
    queryFn: async () => {
      const { data, error } = await supabase.from('user_store_roles').select('*')
      if (error) throw error
      return data as UserStoreRole[]
    },
  })
}

export function useAdminUsers() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const { data, error } = await supabase.functions.invoke('admin-users', { body })
      if (error) {
        // non-2xx: show the function's own message ("This is the only Owner …"), not "non-2xx"
        const ctx = (error as { context?: Response }).context
        let msg: string | undefined
        if (ctx && typeof ctx.json === 'function') {
          try {
            msg = ((await ctx.json()) as { error?: string }).error
          } catch {
            /* keep the generic error */
          }
        }
        throw msg ? new Error(msg) : error
      }
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error)
      return data as { ok: true; mode?: 'deleted' | 'deactivated'; unassigned_tasks?: number; user_id?: string }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profiles'] })
      qc.invalidateQueries({ queryKey: ['user-store-roles'] })
      qc.invalidateQueries({ queryKey: ['kiosk-codes'] })
      qc.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
}
