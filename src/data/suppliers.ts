import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, ORG_ID } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { audit } from './ops'

/**
 * Suppliers the owner manages in Admin → Suppliers; the Delivery Received and Invoice Upload
 * pickers list the active ones. Deliveries and invoices store the supplier NAME as text, so
 * renaming, archiving or deleting a supplier never changes what was already logged.
 */
export interface Supplier {
  id: string
  org_id: string
  name: string
  archived_at: string | null
  created_at: string
}

/** What the app offered before suppliers were managed — used if the list can't be loaded (offline). */
export const FALLBACK_SUPPLIERS = ['Booker', 'Coca-Cola Enterprises', 'Nisa', 'Bestway']

export function useSuppliers() {
  return useQuery({
    queryKey: ['suppliers'],
    queryFn: async () => {
      const { data, error } = await supabase.from('suppliers').select('*').order('name')
      if (error) throw error
      return data as Supplier[]
    },
    staleTime: 60_000,
  })
}

/**
 * Names for a staff picker: active suppliers A–Z. Falls back to the built-in names when the list
 * can't be loaded (no connection), so a delivery can still be logged offline.
 */
export function useSupplierNames(): { names: string[]; loading: boolean } {
  const { data, isLoading, isError } = useSuppliers()
  if (data) return { names: data.filter((s) => !s.archived_at).map((s) => s.name), loading: false }
  return { names: isError ? FALLBACK_SUPPLIERS : [], loading: isLoading }
}

/** How often each supplier NAME appears on deliveries and invoices (case-insensitive). */
export function useSupplierUsage() {
  return useQuery({
    queryKey: ['supplier-usage'],
    queryFn: async () => {
      const [d, i] = await Promise.all([
        supabase.from('deliveries').select('supplier'),
        supabase.from('invoices').select('supplier'),
      ])
      if (d.error) throw d.error
      if (i.error) throw i.error
      const out: Record<string, { deliveries: number; invoices: number }> = {}
      const bump = (name: string, k: 'deliveries' | 'invoices') => {
        const key = name.trim().toLowerCase()
        out[key] ??= { deliveries: 0, invoices: 0 }
        out[key][k]++
      }
      for (const r of d.data as { supplier: string }[]) bump(r.supplier, 'deliveries')
      for (const r of i.data as { supplier: string }[]) bump(r.supplier, 'invoices')
      return out
    },
  })
}

const friendly = (e: { code?: string; message: string }) =>
  e.code === '23505' ? new Error('A supplier with that name already exists') : new Error(e.message)

export function useSaveSupplier() {
  const qc = useQueryClient()
  const { session } = useAuth()
  return useMutation({
    mutationFn: async ({ id, name }: { id?: string; name: string }) => {
      const clean = name.trim().replace(/\s+/g, ' ')
      if (!clean) throw new Error('Enter a supplier name')
      if (id) {
        const { error } = await supabase.from('suppliers').update({ name: clean }).eq('id', id)
        if (error) throw friendly(error)
        await audit(session!.user.id, 'supplier.renamed', 'supplier', id, { name: clean })
      } else {
        const { data, error } = await supabase
          .from('suppliers')
          .insert({ org_id: ORG_ID, name: clean })
          .select('id')
          .single()
        if (error) throw friendly(error)
        await audit(session!.user.id, 'supplier.created', 'supplier', (data as { id: string }).id, { name: clean })
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['suppliers'] }),
  })
}

export function useArchiveSupplier() {
  const qc = useQueryClient()
  const { session } = useAuth()
  return useMutation({
    mutationFn: async ({ id, archived }: { id: string; archived: boolean }) => {
      const { error } = await supabase
        .from('suppliers')
        .update({ archived_at: archived ? new Date().toISOString() : null })
        .eq('id', id)
      if (error) throw error
      await audit(session!.user.id, archived ? 'supplier.archived' : 'supplier.restored', 'supplier', id)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['suppliers'] }),
  })
}

export function useDeleteSupplier() {
  const qc = useQueryClient()
  const { session } = useAuth()
  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.from('suppliers').delete().eq('id', id)
      if (error) throw error
      await audit(session!.user.id, 'supplier.deleted', 'supplier', id, { name })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['suppliers'] }),
  })
}
