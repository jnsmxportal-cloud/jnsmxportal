import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Broom,
  ClipboardText,
  Drop,
  FirstAid,
  ListChecks,
  LockSimple,
  Megaphone,
  Money,
  NotePencil,
  Package,
  Receipt,
  Recycle,
  ShieldCheck,
  Sparkle,
  Stack,
  Storefront,
  Tag,
  Thermometer,
  Truck,
  Users,
  Warning,
  Wrench,
  type Icon,
} from '@phosphor-icons/react'
import { supabase, ORG_ID } from '../lib/supabase'
import { audit } from './ops'
import type { Category } from '../lib/types'

/** Icons an owner can pick for a category. Keys are what `categories.icon` stores. */
export const CATEGORY_ICONS: Record<string, Icon> = {
  'list-checks': ListChecks,
  broom: Broom,
  'note-pencil': NotePencil,
  warning: Warning,
  truck: Truck,
  wrench: Wrench,
  package: Package,
  'clipboard-text': ClipboardText,
  'shield-check': ShieldCheck,
  sparkle: Sparkle,
  money: Money,
  receipt: Receipt,
  storefront: Storefront,
  megaphone: Megaphone,
  recycle: Recycle,
  tag: Tag,
  thermometer: Thermometer,
  lock: LockSimple,
  stack: Stack,
  users: Users,
  'first-aid': FirstAid,
  drop: Drop,
}
export const CATEGORY_ICON_KEYS = Object.keys(CATEGORY_ICONS)

/** Swatches offered in the editor (the design palette); any hex is accepted. */
export const CATEGORY_COLORS = [
  '#16B364',
  '#0E9152',
  '#0891B2',
  '#3B82F6',
  '#7C3AED',
  '#DB2777',
  '#E5484D',
  '#F59E0B',
  '#B45309',
  '#5B6478',
]

export function categoryIcon(key: string | null | undefined): Icon {
  return (key && CATEGORY_ICONS[key]) || Tag
}

/** 12 % tint of a hex colour, used as the icon-tile background. */
export function tint(hex: string): string {
  return `${hex}1F`
}

/** 'Deep clean (weekly)' -> 'deep_clean_weekly'. Slugs are fixed once a category is created. */
export function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
}

export interface CategoryMeta {
  Icon: Icon
  c: string
  b: string
  name: string
}

// what the six built-ins look like before the categories query has resolved
const FALLBACK: Record<string, CategoryMeta> = {
  daily: { Icon: ListChecks, c: '#16B364', b: '#E7F7EF', name: 'Daily' },
  weekly: { Icon: Broom, c: '#0891B2', b: '#E0F5FA', name: 'Weekly' },
  ad_hoc: { Icon: NotePencil, c: '#5B6478', b: '#F0F1F4', name: 'Ad-hoc' },
  incident: { Icon: Warning, c: '#E5484D', b: '#FCEBEC', name: 'Incident' },
  delivery: { Icon: Truck, c: '#3B82F6', b: '#EAF1FE', name: 'Delivery' },
  maintenance: { Icon: Wrench, c: '#B45309', b: '#FEF3E2', name: 'Maintenance' },
}

/**
 * Icon, colours and display name for a category slug. Temperature logs always render as
 * temperature logs regardless of category. Unknown slugs (e.g. a category deleted while a
 * device was offline) fall back to a neutral tag rather than crashing.
 */
export function categoryMeta(
  cats: Category[] | undefined,
  slug: string,
  isTempLog = false,
): CategoryMeta {
  if (isTempLog) return { Icon: Thermometer, c: '#E5484D', b: '#FCEBEC', name: 'Temperature log' }
  const cat = cats?.find((c) => c.slug === slug)
  if (cat) return { Icon: categoryIcon(cat.icon), c: cat.color, b: tint(cat.color), name: cat.name }
  return (
    FALLBACK[slug] ?? { Icon: Tag, c: '#5B6478', b: tint('#5B6478'), name: slug.replace(/_/g, '-') }
  )
}

export function activeCategories(cats: Category[] | undefined): Category[] {
  return (cats ?? []).filter((c) => !c.archived_at)
}

/**
 * Options for a category <select>: every active category, plus the current value when it
 * is archived (or unknown) so an existing selection never silently disappears from a form.
 */
export function categoryOptions(
  cats: Category[] | undefined,
  current: string | null | undefined,
): { value: string; label: string }[] {
  const opts = activeCategories(cats).map((c) => ({ value: c.slug, label: c.name }))
  if (current && !opts.some((o) => o.value === current)) {
    const known = cats?.find((c) => c.slug === current)
    opts.push({ value: current, label: `${known?.name ?? current.replace(/_/g, '-')} (archived)` })
  }
  return opts
}

// ---------------- queries ----------------

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('display_order')
        .order('name')
      if (error) throw error
      return data as Category[]
    },
    staleTime: 60_000,
  })
}

export interface CategoryUsage {
  templates: number
  instances: number
  open_instances: number
}

/** slug -> how many templates / tasks reference it (owner Admin tab). */
export function useCategoryUsage() {
  return useQuery({
    queryKey: ['category-usage'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('category_usage')
      if (error) throw error
      const out: Record<string, CategoryUsage> = {}
      for (const r of (data ?? []) as {
        category: string
        templates: number | string
        instances: number | string
        open_instances: number | string
      }[]) {
        out[r.category] = {
          templates: Number(r.templates),
          instances: Number(r.instances),
          open_instances: Number(r.open_instances),
        }
      }
      return out
    },
  })
}

// ---------------- mutations ----------------

async function actorId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.user.id ?? null
}

function friendly(e: { code?: string; message: string }, name: string): Error {
  if (e.code === '23505')
    return new Error(
      `A category called “${name}” already exists. If it is archived, restore it instead.`,
    )
  return new Error(e.message)
}

export interface SaveCategoryArgs {
  id?: string
  name: string
  color: string
  icon: string
}

export function useSaveCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (c: SaveCategoryArgs): Promise<string> => {
      const name = c.name.trim()
      if (!name) throw new Error('Give the category a name')
      const uid = await actorId()
      if (c.id) {
        const { error } = await supabase
          .from('categories')
          .update({ name, color: c.color, icon: c.icon })
          .eq('id', c.id)
        if (error) throw friendly(error, name)
        if (uid) await audit(uid, 'category.updated', 'category', c.id, { name, color: c.color, icon: c.icon })
        return c.id
      }
      const slug = slugify(name)
      if (!slug) throw new Error('The name needs at least one letter or number')
      const { data, error } = await supabase
        .from('categories')
        .insert({ org_id: ORG_ID, slug, name, color: c.color, icon: c.icon })
        .select('id')
        .single()
      if (error) throw friendly(error, name)
      if (uid) await audit(uid, 'category.created', 'category', data.id, { slug, name, color: c.color, icon: c.icon })
      return data.id as string
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories'] })
      qc.invalidateQueries({ queryKey: ['category-usage'] })
    },
  })
}

/** Archive hides a category from pickers; existing templates and tasks keep it. Restore undoes it. */
export function useArchiveCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, archived }: { id: string; archived: boolean }) => {
      const { error } = await supabase
        .from('categories')
        .update({ archived_at: archived ? new Date().toISOString() : null })
        .eq('id', id)
      if (error) throw error
      const uid = await actorId()
      if (uid) await audit(uid, archived ? 'category.archived' : 'category.restored', 'category', id)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  })
}

export interface DeleteCategoryResult {
  templates_moved: number
  instances_moved: number
  replacement: string | null
}

/**
 * Permanently delete a category via the `delete_category` RPC. When the category is still
 * referenced, `replacementId` is required: templates and tasks move to it in the same
 * transaction as the delete. The RPC refuses built-ins and writes the audit entry itself.
 */
export function useDeleteCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, replacementId }: { id: string; replacementId: string | null }) => {
      const { data, error } = await supabase.rpc('delete_category', {
        p_id: id,
        p_replacement: replacementId,
      })
      if (error) throw error
      return data as DeleteCategoryResult
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories'] })
      qc.invalidateQueries({ queryKey: ['category-usage'] })
      qc.invalidateQueries({ queryKey: ['templates'] })
      qc.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
}
