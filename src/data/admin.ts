import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, ORG_ID } from '../lib/supabase'
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
  freq: 'ad_hoc' | 'daily' | 'weekly' | 'month_end' | 'on_clock_in'
  times?: string[]
  except_days?: number[]
  byweekday?: number[]
  deadline?: string
  reminder?: string
  escalate_at?: string
  deadline_rel?: string
  pending_until_complete?: boolean
}

export interface TaskTemplate {
  id: string
  org_id: string
  store_id: string | null
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

/** Plain-language recurrence summary per §8.3 ("Every Monday at 08:00", "Daily except Wednesday"). */
export function recurrenceSummary(r: Recurrence | null): string {
  if (!r || r.freq === 'ad_hoc') return 'Ad-hoc — created on demand'
  if (r.freq === 'on_clock_in')
    return `On each clock-in · due ${r.deadline_rel === 'shift_end-2h' ? '2h before shift end' : 'at shift end'}`
  if (r.freq === 'month_end') return 'Last day of every month · pending until completed'
  const times = r.times?.length ? ` at ${r.times.join(', ')}` : ''
  const deadline = r.deadline ? ` · deadline ${r.deadline}` : ''
  if (r.freq === 'weekly') {
    const days = (r.byweekday ?? []).map((d) => WEEKDAYS[d - 1]).join(' & ') || 'no day set'
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
  return useMutation({
    mutationFn: async (s: Partial<Store> & { id: string }) => {
      const { error } = await supabase.from('stores').update(s).eq('id', s.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries(),
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
