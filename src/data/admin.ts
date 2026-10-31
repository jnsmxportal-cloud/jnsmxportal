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
  freq: 'ad_hoc' | 'daily' | 'weekly' | 'biweekly' | 'month_end' | 'on_clock_in'
  times?: string[]
  except_days?: number[]
  byweekday?: number[]
  deadline?: string
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

/**
 * Hours-after-deadline for a recurrence: the stored value, or derived from a legacy absolute
 * escalate_at (wrapping past midnight), or null when the template never escalates.
 */
export function escalateAfterHours(r: Recurrence | null | undefined): number | null {
  if (!r) return null
  if (typeof r.escalate_after_hours === 'number') return r.escalate_after_hours
  if (!r.escalate_at) return null
  const base = r.deadline ?? r.times?.[0]
  if (!base) return null
  const mins = (s: string) => {
    const [h, m] = s.split(':').map(Number)
    return h * 60 + m
  }
  const diff = mins(r.escalate_at) - mins(base)
  return Math.max(0, Math.round((diff < 0 ? diff + 1440 : diff) / 60))
}

/** Plain-language recurrence summary per §8.3 ("Every Monday at 08:00", "Daily except Wednesday"). */
export function recurrenceSummary(r: Recurrence | null): string {
  if (!r || r.freq === 'ad_hoc') return 'Ad-hoc — created on demand'
  if (r.freq === 'on_clock_in')
    return `On each clock-in · due ${r.deadline_rel === 'shift_end-2h' ? '2h before shift end' : 'at shift end'}`
  if (r.freq === 'month_end') return 'Last day of every month · pending until completed'
  const times = r.times?.length ? ` at ${r.times.join(', ')}` : ''
  const esc =
    typeof r.escalate_after_hours === 'number'
      ? r.escalate_after_hours === 0
        ? ' · escalates at deadline'
        : ` · escalates ${r.escalate_after_hours}h after`
      : r.escalate_at
        ? ` · escalates ${r.escalate_at}`
        : ''
  const deadline = (r.deadline ? ` · deadline ${r.deadline}` : '') + esc
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
      if (error) throw error
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error)
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profiles'] })
      qc.invalidateQueries({ queryKey: ['user-store-roles'] })
    },
  })
}
