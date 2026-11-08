import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, ORG_ID } from '../lib/supabase'
import type { AppRole } from '../lib/types'

/**
 * Roles & rights. A role = a name the admin chooses + a base role (data access, enforced by the
 * database policies) + feature permissions (what the app shows). See migration 20261104150000.
 */
export interface Role {
  id: string
  org_id: string
  name: string
  description: string | null
  base_role: AppRole
  permissions: Record<string, boolean>
  /** the five built-ins: permissions editable, name/base locked, cannot be deleted */
  is_system: boolean
  display_order: number
  created_at: string
  updated_at: string
}

export type PermissionKey =
  | 'tasks.create'
  | 'tasks.review'
  | 'escalations.resolve'
  | 'deliveries.log'
  | 'temp.log'
  | 'incidents.report'
  | 'invoices.upload'
  | 'deliveries.verify'
  | 'deliveries.approve'
  | 'rota.manage'
  | 'reports.view'
  | 'inbox.use'

export const PERMISSIONS: { key: PermissionKey; label: string; help: string; group: string }[] = [
  { key: 'tasks.create', label: 'Create tasks', help: 'The + button and “New task”: raise one-off tasks for a store', group: 'Tasks' },
  { key: 'tasks.review', label: 'Approve, reject & reopen submissions', help: 'Act on tasks waiting for review', group: 'Tasks' },
  { key: 'escalations.resolve', label: 'Resolve escalations', help: 'Close missed-deadline escalations', group: 'Tasks' },
  { key: 'deliveries.log', label: 'Log deliveries', help: 'Delivery Received wizard', group: 'Store operations' },
  { key: 'temp.log', label: 'Record temperature logs', help: 'Chiller / freezer readings', group: 'Store operations' },
  { key: 'incidents.report', label: 'Report incidents', help: 'Incident Report form', group: 'Store operations' },
  { key: 'invoices.upload', label: 'Upload invoices', help: 'Scan and file supplier invoices', group: 'Store operations' },
  { key: 'deliveries.verify', label: 'Verify deliveries', help: 'Cost and EPOS check before owner approval', group: 'Back office' },
  { key: 'deliveries.approve', label: 'Approve verified deliveries', help: 'Final sign-off that archives the delivery', group: 'Back office' },
  { key: 'rota.manage', label: 'Edit the rota', help: 'Add, change and copy shifts', group: 'Management' },
  { key: 'reports.view', label: 'View reports & analytics', help: 'Compliance and activity reports', group: 'Management' },
  { key: 'inbox.use', label: 'Send & receive messages', help: 'The Inbox', group: 'Communication' },
]

export const BASE_ROLES: { id: AppRole; label: string; access: string }[] = [
  { id: 'owner', label: 'Owner', access: 'Every store and record, all settings, the Admin section' },
  { id: 'manager', label: 'Manager', access: 'Sees every store; the Owner portal; cannot edit task submissions' },
  { id: 'team_leader', label: 'Team Leader', access: 'Their own store(s); the Leader and Staff apps' },
  { id: 'remote_office', label: 'Remote Office', access: 'Their own store(s); the Owner portal' },
  { id: 'staff', label: 'Staff', access: 'Their own store(s); the Staff app only' },
]

/**
 * What each base role's data access can actually support. A permission outside the ceiling is
 * disabled in the editor — switching it on would only produce "permission denied" errors from
 * the database.
 */
export const CEILING: Record<AppRole, PermissionKey[]> = {
  owner: PERMISSIONS.map((p) => p.key),
  manager: ['tasks.create', 'escalations.resolve', 'rota.manage', 'reports.view', 'inbox.use'],
  team_leader: [
    'tasks.create',
    'tasks.review',
    'escalations.resolve',
    'deliveries.log',
    'temp.log',
    'incidents.report',
    'invoices.upload',
    'inbox.use',
  ],
  remote_office: ['tasks.create', 'tasks.review', 'deliveries.verify', 'reports.view', 'inbox.use'],
  staff: ['tasks.create', 'deliveries.log', 'temp.log', 'incidents.report', 'invoices.upload', 'inbox.use'],
}

/** The built-in defaults (same as the seeded system roles) — used when a profile has no role row. */
export const DEFAULTS: Record<AppRole, PermissionKey[]> = {
  owner: PERMISSIONS.map((p) => p.key),
  manager: ['escalations.resolve', 'rota.manage', 'reports.view', 'inbox.use'],
  team_leader: [
    'tasks.create',
    'tasks.review',
    'escalations.resolve',
    'deliveries.log',
    'temp.log',
    'incidents.report',
    'invoices.upload',
    'inbox.use',
  ],
  remote_office: ['tasks.create', 'tasks.review', 'deliveries.verify', 'reports.view', 'inbox.use'],
  staff: ['deliveries.log', 'temp.log', 'incidents.report', 'invoices.upload', 'inbox.use'],
}

export function allowedForBase(base: AppRole, key: PermissionKey): boolean {
  return CEILING[base].includes(key)
}

export function defaultPermissions(base: AppRole): Record<string, boolean> {
  return Object.fromEntries(DEFAULTS[base].map((k) => [k, true]))
}

/** The permissions a user actually has: the role's switches, clipped to the base role's ceiling. */
export function effectivePermissions(role: Role | null, base: AppRole): Set<PermissionKey> {
  const switches = role ? role.permissions : defaultPermissions(base)
  const out = new Set<PermissionKey>()
  for (const key of CEILING[base]) if (switches[key]) out.add(key)
  return out
}

export function baseLabel(base: AppRole): string {
  return BASE_ROLES.find((b) => b.id === base)?.label ?? base
}

export function useRoles() {
  return useQuery({
    queryKey: ['roles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('roles')
        .select('*')
        .order('display_order')
        .order('name')
      if (error) throw error
      return data as Role[]
    },
  })
}

export interface RoleInput {
  id?: string
  name: string
  description: string | null
  base_role: AppRole
  permissions: Record<string, boolean>
}

export function useSaveRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: RoleInput) => {
      const row = {
        name: input.name.trim(),
        description: input.description?.trim() || null,
        base_role: input.base_role,
        // store only switched-on keys inside the base's ceiling
        permissions: Object.fromEntries(
          Object.entries(input.permissions).filter(
            ([k, v]) => v && allowedForBase(input.base_role, k as PermissionKey),
          ),
        ),
      }
      const q = input.id
        ? supabase.from('roles').update(row).eq('id', input.id)
        : supabase.from('roles').insert({ ...row, org_id: ORG_ID })
      const { error } = await q
      if (error) {
        if (error.code === '23505') throw new Error(`A role called “${row.name}” already exists`)
        throw new Error(error.message)
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['roles'] })
      qc.invalidateQueries({ queryKey: ['profiles'] })
    },
  })
}

export function useDeleteRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('roles').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['roles'] }),
  })
}
