import { useState } from 'react'
import { LockSimple, PencilSimple, Plus, ShieldCheck, Trash, Users, Warning, X } from '@phosphor-icons/react'
import { Card } from '../../components/ui'
import { useAuth } from '../../auth/AuthProvider'
import { useProfiles } from '../../data/hooks'
import { useToast } from '../../components/Toast'
import type { AppRole } from '../../lib/types'
import {
  BASE_ROLES,
  PERMISSIONS,
  allowedForBase,
  baseLabel,
  defaultPermissions,
  useDeleteRole,
  useRoles,
  useSaveRole,
  type Role,
} from '../../data/roles'

const shell = 'fixed inset-0 z-[80] flex items-center justify-center bg-navy/50 p-3 sm:p-6'
const inputCls =
  'w-full rounded-xl border-[1.5px] border-ink/15 bg-white p-2.5 text-sm outline-none focus:border-brand disabled:bg-canvas disabled:text-muted'
const label = 'mb-1.5 block text-xs font-semibold text-slate'

/**
 * Admin → Roles: the owner creates roles ("Cashier", "Back Office Staff"…), picks the base role
 * that sets their data access, and ticks the features each role may use.
 */
export default function RolesPanel() {
  const { data: roles } = useRoles()
  const { data: profiles } = useProfiles()
  const { refreshRoles } = useAuth()
  const del = useDeleteRole()
  const toast = useToast()
  const [modal, setModal] = useState<Role | 'new' | null>(null)
  const [confirm, setConfirm] = useState<Role | null>(null)

  const members = (id: string) => (profiles ?? []).filter((p) => p.role_id === id).length
  const rightsCount = (r: Role) =>
    PERMISSIONS.filter((p) => r.permissions[p.key] && allowedForBase(r.base_role, p.key)).length

  return (
    <div>
      <div className="mb-3.5 flex items-center justify-between gap-3">
        <div className="text-[12.5px] text-muted">
          {(roles ?? []).length} roles · a role’s <b>base</b> sets what data it can reach, its{' '}
          <b>rights</b> set what it can do
        </div>
        <button
          onClick={() => setModal('new')}
          className="flex flex-none items-center gap-1.5 rounded-[10px] bg-brand px-3.5 py-2 text-xs font-semibold text-white"
        >
          <Plus size={13} weight="bold" /> New role
        </button>
      </div>
      <Card className="overflow-hidden">
        {(roles ?? []).map((r) => {
          const n = members(r.id)
          return (
            <div key={r.id} className="flex items-center gap-3.5 border-b border-ink/5 px-4 py-3">
              <div className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[11px] bg-violet-soft">
                <ShieldCheck size={19} weight="fill" color="#7C3AED" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13.5px] font-semibold">{r.name}</span>
                  {r.is_system && (
                    <span className="flex items-center gap-1 rounded-full bg-canvas px-2 py-[2px] text-[10px] font-bold uppercase tracking-wide text-muted">
                      <LockSimple size={10} weight="bold" /> Built-in
                    </span>
                  )}
                </div>
                <div className="text-[11.5px] text-muted">
                  {baseLabel(r.base_role)} access · {rightsCount(r)} of {PERMISSIONS.length} rights ·{' '}
                  <span className="inline-flex items-center gap-1">
                    <Users size={11} /> {n} {n === 1 ? 'member' : 'members'}
                  </span>
                  {r.description ? ` · ${r.description}` : ''}
                </div>
              </div>
              <button
                onClick={() => setModal(r)}
                className="flex items-center gap-1.5 rounded-lg border border-ink/15 px-3 py-1.5 text-xs font-semibold text-slate"
              >
                <PencilSimple size={13} /> Edit
              </button>
              {!r.is_system && (
                <button
                  onClick={() => setConfirm(r)}
                  disabled={n > 0}
                  title={n > 0 ? 'Move its members to another role first' : 'Delete role'}
                  className="rounded-lg border border-ink/15 p-1.5 text-muted hover:text-danger disabled:opacity-40"
                >
                  <Trash size={14} />
                </button>
              )}
            </div>
          )
        })}
        {(roles ?? []).length === 0 && (
          <div className="p-8 text-center text-xs text-muted">No roles yet.</div>
        )}
      </Card>
      <div className="mt-3 text-[11.5px] leading-relaxed text-muted">
        Data access (which stores and records a member can see or edit) always comes from the base role and
        is enforced by the database; rights outside what a base role can reach are greyed out. The Admin
        section stays with Owner access.
      </div>

      {modal && (
        <RoleModal
          role={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => void refreshRoles()}
        />
      )}
      {confirm && (
        <div className={shell}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-[440px] max-w-full animate-fade rounded-[20px] bg-white p-6 shadow-[0_30px_80px_rgba(0,0,0,.3)]"
          >
            <div className="mb-2 flex items-center gap-2 font-display text-[17px] font-bold">
              <Warning size={20} weight="fill" color="#E5484D" /> Delete “{confirm.name}”?
            </div>
            <div className="text-[12.5px] leading-relaxed text-slate">
              Nobody holds this role, so nothing else changes. This cannot be undone.
            </div>
            <div className="mt-4 flex gap-2.5">
              <button
                onClick={() => setConfirm(null)}
                className="flex-1 rounded-xl border border-ink/15 bg-white p-2.5 text-[13.5px] font-semibold text-slate"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  del.mutate(confirm.id, {
                    onSuccess: () => {
                      toast(`Role “${confirm.name}” deleted`)
                      setConfirm(null)
                      void refreshRoles()
                    },
                    onError: (e) => toast(e.message, 'error'),
                  })
                }
                disabled={del.isPending}
                className="flex-1 rounded-xl bg-danger p-2.5 text-[13.5px] font-semibold text-white disabled:opacity-60"
              >
                Delete role
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function RoleModal({ role, onClose, onSaved }: { role: Role | null; onClose: () => void; onSaved: () => void }) {
  const save = useSaveRole()
  const toast = useToast()
  const [name, setName] = useState(role?.name ?? '')
  const [description, setDescription] = useState(role?.description ?? '')
  const [base, setBase] = useState<AppRole>(role?.base_role ?? 'staff')
  const [perms, setPerms] = useState<Record<string, boolean>>(
    role ? { ...role.permissions } : defaultPermissions('staff'),
  )
  const locked = !!role?.is_system

  const changeBase = (b: AppRole) => {
    setBase(b)
    // a new role starts from the base's sensible defaults; an existing one keeps its switches
    if (!role) setPerms(defaultPermissions(b))
  }

  const submit = () => {
    if (!name.trim()) return toast('Give the role a name', 'error')
    save.mutate(
      { id: role?.id, name, description: description || null, base_role: base, permissions: perms },
      {
        onSuccess: () => {
          toast(role ? `Role “${name.trim()}” updated` : `Role “${name.trim()}” created`)
          onSaved()
          onClose()
        },
        onError: (e) => toast(e.message, 'error'),
      },
    )
  }

  const groups = Array.from(new Set(PERMISSIONS.map((p) => p.group)))
  const baseInfo = BASE_ROLES.find((b) => b.id === base)

  return (
    <div className={shell}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92dvh] w-[640px] max-w-full animate-fade flex-col overflow-hidden rounded-[20px] bg-white shadow-[0_30px_80px_rgba(0,0,0,.3)]"
      >
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <div>
            <h3 className="font-display text-[17px] font-bold">{role ? `Edit ${role.name}` : 'New role'}</h3>
            <div className="text-xs text-muted">
              {locked ? 'Built-in role — rights can change, name and base cannot' : 'Name, base access and rights'}
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-muted" aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className="flex flex-col gap-4 overflow-y-auto px-6 py-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr]">
            <div>
              <label className={label}>Role name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={locked}
                maxLength={40}
                placeholder="e.g. Cashier"
                className={inputCls}
              />
            </div>
            <div>
              <label className={label}>Base access</label>
              <select
                value={base}
                onChange={(e) => changeBase(e.target.value as AppRole)}
                disabled={locked}
                className={inputCls}
              >
                {BASE_ROLES.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                  </option>
                ))}
              </select>
              {baseInfo && <div className="mt-1 text-[11px] text-muted">{baseInfo.access}</div>}
            </div>
          </div>
          <div>
            <label className={label}>Description (optional)</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={120}
              placeholder="What this role is for"
              className={inputCls}
            />
          </div>

          <div>
            <label className={label}>Rights</label>
            <div className="flex flex-col gap-3">
              {groups.map((g) => (
                <div key={g} className="rounded-xl border border-line">
                  <div className="border-b border-line bg-canvas px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-muted">
                    {g}
                  </div>
                  {PERMISSIONS.filter((p) => p.group === g).map((p) => {
                    const ok = allowedForBase(base, p.key)
                    const on = ok && !!perms[p.key]
                    return (
                      <label
                        key={p.key}
                        className={`flex items-start gap-2.5 border-b border-ink/5 px-3 py-2 last:border-b-0 ${
                          ok ? 'cursor-pointer' : 'opacity-50'
                        }`}
                        title={ok ? undefined : `Not available with ${baseLabel(base)} access`}
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          disabled={!ok}
                          onChange={(e) => setPerms({ ...perms, [p.key]: e.target.checked })}
                          className="mt-0.5 accent-[#FF5A2D]"
                        />
                        <span className="min-w-0">
                          <span className="block text-[13px] font-semibold">{p.label}</span>
                          <span className="block text-[11px] text-muted">
                            {ok ? p.help : `Not available with ${baseLabel(base)} access`}
                          </span>
                        </span>
                      </label>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-2.5 border-t border-line px-6 py-4">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-ink/15 bg-white p-3 text-[13.5px] font-semibold text-slate"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={save.isPending || !name.trim()}
            className="flex-[2] rounded-xl bg-brand p-3 text-[13.5px] font-bold text-white disabled:opacity-60"
          >
            {save.isPending ? 'Saving…' : role ? 'Save changes' : 'Create role'}
          </button>
        </div>
      </div>
    </div>
  )
}
