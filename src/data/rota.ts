import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, ORG_ID } from '../lib/supabase'
import type { Shift } from '../lib/types'

/** Monday 00:00 local time of the week containing `d`. */
export function weekStart(d: Date): Date {
  const out = new Date(d)
  out.setHours(0, 0, 0, 0)
  const day = (out.getDay() + 6) % 7 // Mon=0 … Sun=6
  out.setDate(out.getDate() - day)
  return out
}

export function addDays(d: Date, n: number): Date {
  const out = new Date(d)
  out.setDate(out.getDate() + n)
  return out
}

export function useShifts(storeId: string | null, from: Date, to: Date) {
  return useQuery({
    queryKey: ['shifts', storeId, from.toISOString(), to.toISOString()],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shifts')
        .select('*')
        .eq('store_id', storeId!)
        .gte('starts_at', from.toISOString())
        .lt('starts_at', to.toISOString())
        .order('starts_at')
      if (error) throw error
      return data as Shift[]
    },
  })
}

export function useMyShifts(userId: string | undefined) {
  return useQuery({
    queryKey: ['my-shifts', userId],
    enabled: !!userId,
    queryFn: async () => {
      const from = new Date()
      from.setHours(0, 0, 0, 0)
      const to = addDays(from, 7)
      const { data, error } = await supabase
        .from('shifts')
        .select('*')
        .eq('user_id', userId!)
        .gte('starts_at', from.toISOString())
        .lt('starts_at', to.toISOString())
        .order('starts_at')
      if (error) throw error
      return data as Shift[]
    },
  })
}

export function useSaveShift() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (
      s: Partial<Shift> & { store_id: string; user_id: string; starts_at: string; ends_at: string },
    ) => {
      if (s.id) {
        const { error } = await supabase
          .from('shifts')
          .update({
            starts_at: s.starts_at,
            ends_at: s.ends_at,
            role_note: s.role_note ?? null,
            user_id: s.user_id,
            updated_at: new Date().toISOString(),
          })
          .eq('id', s.id)
        if (error) throw error
        return s.id
      }
      const { data: me } = await supabase.auth.getUser()
      const { data, error } = await supabase
        .from('shifts')
        .insert({
          org_id: ORG_ID,
          store_id: s.store_id,
          user_id: s.user_id,
          starts_at: s.starts_at,
          ends_at: s.ends_at,
          role_note: s.role_note ?? null,
          created_by: me.user?.id ?? null,
        })
        .select('id')
        .single()
      if (error) throw error
      return (data as { id: string }).id
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shifts'] })
      qc.invalidateQueries({ queryKey: ['my-shifts'] })
    },
  })
}

export function useDeleteShift() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('shifts').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shifts'] })
      qc.invalidateQueries({ queryKey: ['my-shifts'] })
    },
  })
}

/** Copy every shift from the previous week into the current week (same store). */
export function useCopyLastWeek() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ storeId, week }: { storeId: string; week: Date }) => {
      const prevFrom = addDays(week, -7)
      const { data: prev, error } = await supabase
        .from('shifts')
        .select('*')
        .eq('store_id', storeId)
        .gte('starts_at', prevFrom.toISOString())
        .lt('starts_at', week.toISOString())
      if (error) throw error
      const rows = (prev as Shift[]).map((s) => {
        const starts = new Date(s.starts_at)
        const ends = new Date(s.ends_at)
        starts.setDate(starts.getDate() + 7)
        ends.setDate(ends.getDate() + 7)
        return {
          org_id: s.org_id,
          store_id: s.store_id,
          user_id: s.user_id,
          starts_at: starts.toISOString(),
          ends_at: ends.toISOString(),
          role_note: s.role_note,
        }
      })
      if (!rows.length) return 0
      const { error: insErr } = await supabase.from('shifts').insert(rows)
      if (insErr) throw insErr
      return rows.length
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shifts'] }),
  })
}

// ===== Kiosk codes (owner only, via edge function) =====

export interface KioskCodeRow {
  user_id: string
  code: string
  updated_at: string
}

export function useKioskCodes(enabled: boolean) {
  return useQuery({
    queryKey: ['kiosk-codes'],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('kiosk-admin', {
        body: { action: 'list' },
      })
      if (error) throw error
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error)
      return (data as { codes: KioskCodeRow[] }).codes
    },
  })
}

export function useKioskAdmin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: { action: 'set' | 'clear'; user_id: string }) => {
      const { data, error } = await supabase.functions.invoke('kiosk-admin', { body })
      if (error) throw error
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error)
      return data as { ok: true; code?: string }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['kiosk-codes'] }),
  })
}
