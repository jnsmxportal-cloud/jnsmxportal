import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import QRCode from 'qrcode'
import {
  ArrowsClockwise,
  Check,
  Crosshair,
  DownloadSimple,
  ListChecks,
  MapPin,
  Password,
  PencilSimple,
  Play,
  Plus,
  Printer,
  QrCode as QrIcon,
  ShieldCheck,
  Tag,
  Truck,
  Thermometer,
  Trash,
  Users as UsersIcon,
  Warning,
  X,
} from '@phosphor-icons/react'
import { Avatar, Card } from '../../components/ui'
import { useAuth } from '../../auth/AuthProvider'
import { useCreateTask, useProfiles, useStoreUnits, useTasks } from '../../data/hooks'
import {
  recurrenceSummary,
  runNowSchedule,
  useAdminUsers,
  useDeleteTemplate,
  useDeleteUnit,
  useSaveUnit,
  useTemplates,
  useUpdateStore,
  useUserStoreRoles,
  type TaskTemplate,
} from '../../data/admin'
import { useKioskAdmin, useKioskCodes } from '../../data/rota'
import { geoErrorReason, geoReasonHelp } from '../../lib/geo'
import { pinInput, pinProblem } from '../../lib/pin'
import { timeAgo } from '../../lib/format'
import { useToast } from '../../components/Toast'
import TemplateEditor from './TemplateEditor'
import CategoriesPanel from './CategoriesPanel'
import SuppliersPanel from './SuppliersPanel'
import TasksPanel from './TasksPanel'
import RolesPanel from './RolesPanel'
import UnitQrModal, { printQrLabel } from './UnitQrModal'
import { baseLabel, useRoles } from '../../data/roles'
import { qrFileName, unitQrPayload, zoneQrPayload } from '../../lib/qr'
import { categoryMeta, useCategories } from '../../data/categories'
import type { AppRole, Profile, Store, StoreUnit, TaskInstance } from '../../lib/types'

const tabs = ['Templates', 'Tasks', 'Categories', 'Suppliers', 'Users', 'Roles', 'Units', 'QR codes', 'Geofence'] as const
type Tab = (typeof tabs)[number]

const roleLabels: Record<AppRole, string> = {
  owner: 'Owner',
  manager: 'Manager',
  team_leader: 'Team Leader',
  remote_office: 'Remote Office',
  staff: 'Staff',
}

const inputCls =
  'w-full rounded-xl border-[1.5px] border-ink/15 bg-white p-2.5 text-sm outline-none focus:border-brand'
const label = 'mb-1.5 block text-xs font-semibold text-slate'

// ================= Templates =================
function templateScopeLabel(t: TaskTemplate, stores: Store[]): string {
  const ids = t.store_ids?.length ? t.store_ids : t.store_id ? [t.store_id] : []
  if (ids.length === 0 || ids.length >= stores.length) return 'Chain-wide'
  const names = ids.map((id) => stores.find((s) => s.id === id)?.name).filter(Boolean)
  return names.length <= 2 ? names.join(' + ') : `${names.length} stores`
}

/** store ids a template is scoped to ([] = chain-wide) */
function templateStoreIds(t: TaskTemplate): string[] {
  return t.store_ids?.length ? t.store_ids : t.store_id ? [t.store_id] : []
}

/** Why a scheduled template can never produce a task, or null when it can. */
function scheduleProblem(t: TaskTemplate): string | null {
  const r = t.recurrence
  if (!r) return null
  if (r.freq === 'once' && !r.due_at)
    return 'No due date set, so the one-off task will never be created.'
  const timed = r.freq === 'daily' || r.freq === 'weekly' || r.freq === 'biweekly'
  if (timed && !r.times?.length)
    return 'No time of day set, so the scheduler will never generate this task.'
  if ((r.freq === 'weekly' || r.freq === 'biweekly') && !r.byweekday?.length)
    return 'No weekday selected, so the scheduler will never generate this task.'
  return null
}

interface TemplateStats {
  total: number
  open: number
  review: number
  done: number
  missed: number
  last: string | null
}

/** Aggregate instances per template (instances carry template_id, so this is a client-side group-by). */
function templateStats(tasks: TaskInstance[] | undefined): Record<string, TemplateStats> {
  const out: Record<string, TemplateStats> = {}
  for (const t of tasks ?? []) {
    if (!t.template_id) continue
    const s = (out[t.template_id] ??= { total: 0, open: 0, review: 0, done: 0, missed: 0, last: null })
    s.total++
    if (t.status === 'submitted') s.review++
    else if (t.status === 'completed' || t.status === 'approved') s.done++
    else if (t.status === 'missed') s.missed++
    else s.open++
    if (!s.last || t.created_at > s.last) s.last = t.created_at
  }
  return out
}

function TemplatesPanel() {
  const { data: templates } = useTemplates()
  const { data: tasks } = useTasks({ storeId: 'all' })
  const { data: categories } = useCategories()
  const { stores } = useAuth()
  const del = useDeleteTemplate()
  const create = useCreateTask()
  const toast = useToast()
  const [editing, setEditing] = useState<TaskTemplate | null | 'new'>(null)
  // template id awaiting "Run now" confirmation
  const [runConfirm, setRunConfirm] = useState<string | null>(null)
  const stats = templateStats(tasks)

  const runNow = async (t: TaskTemplate) => {
    const scope = templateStoreIds(t)
    const storeIds = scope.length
      ? scope.filter((id) => stores.some((s) => s.id === id))
      : stores.map((s) => s.id)
    if (storeIds.length === 0) {
      toast('No store matches the scope of this template', 'error')
      return
    }
    // the template's next deadline is store-local, so stores are created per timezone
    const byTz = new Map<string, string[]>()
    for (const id of storeIds) {
      const tz = stores.find((s) => s.id === id)?.timezone || 'Europe/London'
      byTz.set(tz, [...(byTz.get(tz) ?? []), id])
    }
    let dueText = 'no due time'
    try {
      for (const [tz, ids] of byTz) {
        const { dueAt, cutoffAt } = runNowSchedule(t.recurrence, tz)
        if (dueAt && dueText === 'no due time')
          dueText = `due ${dueAt.toLocaleString('en-GB', {
            timeZone: tz,
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          })}`
        await create.mutateAsync({
          title: t.title,
          storeIds: ids,
          assignedTo: null,
          dueAt: dueAt ? dueAt.toISOString() : null,
          cutoffAt: cutoffAt ? cutoffAt.toISOString() : null,
          priority: t.priority,
          category: t.category,
          evidence: t.evidence,
          templateId: t.id,
          description: t.description,
          geofencePolicy: t.geofence_policy,
          isTemperatureLog: t.is_temperature_log,
          // requires_approval is inherited from the template by the DB trigger
        })
      }
      setRunConfirm(null)
      const where =
        storeIds.length === stores.length
          ? 'all stores'
          : `${storeIds.length} store${storeIds.length === 1 ? '' : 's'}`
      toast(`“${t.title}” created for ${where} · unassigned, ${dueText}`)
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error')
    }
  }

  return (
    <div>
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
        <div className="text-[12.5px] text-muted">
          Templates drive the scheduler — changes take effect within a minute.
        </div>
        <button
          onClick={() => setEditing('new')}
          className="flex items-center gap-1.5 rounded-[10px] bg-brand px-3.5 py-2 text-xs font-semibold text-white"
        >
          <Plus size={13} weight="bold" /> New template
        </button>
      </div>
      <div className="flex flex-col gap-2.5">
        {(templates ?? []).map((t) => (
          <Card key={t.id} className="flex flex-wrap items-center gap-3 p-4 sm:flex-nowrap sm:gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-display text-sm font-bold">{t.title}</span>
                <span
                  className="rounded-full px-2 py-px text-[10px] font-semibold"
                  style={{
                    background: categoryMeta(categories, t.category).b,
                    color: categoryMeta(categories, t.category).c,
                  }}
                >
                  {categoryMeta(categories, t.category).name}
                </span>
                {t.is_temperature_log && (
                  <span className="rounded-full bg-danger-soft px-2 py-px text-[10px] font-semibold text-danger">
                    temp log
                  </span>
                )}
              </div>
              <div className="mt-0.5 text-xs text-muted">
                {recurrenceSummary(t.recurrence)} ·{' '}
                {templateScopeLabel(t, stores)} ·{' '}
                {t.checklist.length} items
              </div>
              {(() => {
                const s = stats[t.id]
                if (!s)
                  return (
                    <div className="mt-1 text-[11.5px] text-muted">
                      No tasks generated yet
                      {!t.recurrence ? ' (use Run now or the dashboard New task button)' : ''}
                    </div>
                  )
                return (
                  <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11.5px]">
                    <span className="text-muted">Last run {s.last ? timeAgo(s.last) : '—'} ·</span>
                    <span className="font-semibold text-slate">{s.total} created</span>
                    {s.open > 0 && (
                      <span className="rounded-full bg-[#EAF1FE] px-2 py-px font-semibold text-[#3B82F6]">{s.open} open</span>
                    )}
                    {s.review > 0 && (
                      <span className="rounded-full bg-warn-soft px-2 py-px font-semibold text-amber">{s.review} awaiting review</span>
                    )}
                    {s.done > 0 && (
                      <span className="rounded-full bg-success-soft px-2 py-px font-semibold text-success-deep">{s.done} completed</span>
                    )}
                    {s.missed > 0 && (
                      <span className="rounded-full bg-danger-soft px-2 py-px font-semibold text-danger">{s.missed} missed</span>
                    )}
                  </div>
                )
              })()}
              {scheduleProblem(t) && (
                <div className="mt-1 flex items-center gap-1 text-[11.5px] font-semibold text-danger">
                  <Warning size={13} weight="fill" /> {scheduleProblem(t)}
                </div>
              )}
            </div>
            {runConfirm === t.id ? (
              <div className="flex items-center gap-1.5">
                <span className="text-[11.5px] text-slate">
                  Create for {templateStoreIds(t).length || stores.length} store
                  {(templateStoreIds(t).length || stores.length) === 1 ? '' : 's'}?
                </span>
                <button
                  onClick={() => runNow(t)}
                  disabled={create.isPending}
                  className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                >
                  Confirm
                </button>
                <button
                  onClick={() => setRunConfirm(null)}
                  className="rounded-lg border border-ink/15 px-3 py-1.5 text-xs font-semibold text-slate"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setRunConfirm(t.id)}
                title="Create this task now for every store in its scope, due at the template's next deadline"
                className="flex items-center gap-1.5 rounded-lg border border-brand/40 bg-brand-tint px-3 py-1.5 text-xs font-semibold text-brand-dark"
              >
                <Play size={13} weight="fill" /> Run now
              </button>
            )}
            <button
              onClick={() => setEditing(t)}
              className="flex items-center gap-1.5 rounded-lg border border-ink/15 px-3 py-1.5 text-xs font-semibold text-slate"
            >
              <PencilSimple size={13} /> Edit
            </button>
            <button
              onClick={() =>
                del.mutate(t.id, {
                  onSuccess: () => toast(`Template “${t.title}” deleted`),
                  onError: (e) => toast(e.message, 'error'),
                })
              }
              className="rounded-lg p-1.5 text-danger"
            >
              <Trash size={15} />
            </button>
          </Card>
        ))}
      </div>
      {editing && (
        <TemplateEditor template={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      )}
    </div>
  )
}

// ================= Users =================
/**
 * The member's staff PIN: tap the chip to show / hide it. Changing or removing it only happens
 * inside PinModal — there are no one-tap regenerate / delete buttons that are easy to hit by
 * accident on a phone (that is how codes kept "changing by themselves").
 */
function KioskCodeChip({ code, onManage }: { code: string | null; onManage: () => void }) {
  const [visible, setVisible] = useState(false)
  if (!code)
    return (
      <button
        onClick={onManage}
        className="flex items-center gap-1.5 rounded-lg bg-brand-tint px-3 py-1.5 text-xs font-semibold text-brand-dark"
        title="Set a 6-digit sign-in PIN"
      >
        <Password size={13} /> Set PIN
      </button>
    )
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => setVisible((v) => !v)}
        className="rounded-lg border border-ink/15 bg-canvas px-2.5 py-1.5 font-mono text-xs font-bold tracking-[.15em] text-ink"
        title={visible ? 'Hide PIN' : 'Show PIN'}
      >
        {visible ? code : '••••••'}
      </button>
      <button
        onClick={onManage}
        className="rounded-lg px-2 py-1.5 text-[11.5px] font-semibold text-slate"
        title="Change or remove this PIN"
      >
        Change
      </button>
    </div>
  )
}

function PinModal({ user, code, onClose }: { user: Profile; code: string | null; onClose: () => void }) {
  const kiosk = useKioskAdmin()
  const toast = useToast()
  const [pin, setPin] = useState('')
  const [confirmRemove, setConfirmRemove] = useState(false)
  const problem = pin ? pinProblem(pin) : null
  const busy = kiosk.isPending

  const save = (chosen?: string) =>
    kiosk.mutate(
      { action: 'set', user_id: user.id, code: chosen },
      {
        onSuccess: (r) => {
          toast(`PIN for ${user.full_name}: ${r.code}`)
          onClose()
        },
        onError: (e) => toast(e.message, 'error'),
      },
    )

  const remove = () =>
    kiosk.mutate(
      { action: 'clear', user_id: user.id },
      {
        onSuccess: () => {
          toast(`PIN removed for ${user.full_name}`)
          onClose()
        },
        onError: (e) => toast(e.message, 'error'),
      },
    )

  return (
    <div onClick={onClose} className="fixed inset-0 z-[80] flex items-center justify-center bg-navy/50 p-3 sm:p-6">
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[400px] max-w-full animate-fade rounded-[20px] bg-white p-6 shadow-[0_30px_80px_rgba(0,0,0,.3)]"
      >
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-[17px] font-bold">Sign-in PIN · {user.full_name}</h3>
          <button onClick={onClose} className="p-1 text-muted" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="mb-4 text-xs text-muted">
          {code ? (
            <>
              Current PIN <b className="font-mono tracking-[.15em] text-ink">{code}</b>. The old PIN stops
              working as soon as you save a new one.
            </>
          ) : (
            'They type this 6-digit PIN on the “Staff code” keypad to sign in. Staff can also change it themselves under Profile.'
          )}
        </div>

        <label className="mb-1.5 block text-xs font-semibold text-slate" htmlFor="pin-new">
          {code ? 'New PIN' : 'PIN'}
        </label>
        <input
          id="pin-new"
          value={pin}
          onChange={(e) => setPin(pinInput(e.target.value))}
          inputMode="numeric"
          autoComplete="off"
          placeholder="6 digits"
          className="w-full rounded-xl border-[1.5px] border-ink/15 bg-white p-3 font-mono text-lg tracking-[.3em] outline-none focus:border-brand"
        />
        <div className={`mb-3 mt-1 min-h-[16px] text-[11px] ${problem && pin.length === 6 ? 'text-danger' : 'text-muted'}`}>
          {pin.length === 6 ? problem ?? 'Looks good' : 'Avoid easy PINs like 123456 or 111111.'}
        </div>

        <button
          onClick={() => save(pin)}
          disabled={busy || pin.length !== 6 || !!problem}
          className="mb-2 w-full rounded-xl bg-brand p-3 text-[13.5px] font-semibold text-white disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save this PIN'}
        </button>
        <button
          onClick={() => save()}
          disabled={busy}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-ink/15 p-2.5 text-[13px] font-semibold text-slate disabled:opacity-50"
        >
          <ArrowsClockwise size={14} /> Generate a random PIN
        </button>

        {code && (
          <div className="mt-4 border-t border-ink/5 pt-3">
            {confirmRemove ? (
              <div className="flex items-center gap-2">
                <span className="flex-1 text-xs text-danger">
                  {user.full_name} won’t be able to sign in with a PIN.
                </span>
                <button onClick={() => setConfirmRemove(false)} className="px-2 py-1.5 text-xs font-semibold text-slate">
                  Cancel
                </button>
                <button
                  onClick={remove}
                  disabled={busy}
                  className="rounded-lg bg-danger px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                >
                  Remove
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmRemove(true)}
                className="flex items-center gap-1.5 text-xs font-semibold text-danger"
              >
                <Trash size={13} /> Remove PIN
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function UserModal({ user, onClose }: { user: Profile | null; onClose: () => void }) {
  const { stores } = useAuth()
  const { data: usr } = useUserStoreRoles()
  const admin = useAdminUsers()
  const { data: roles } = useRoles()
  const toast = useToast()
  const [email, setEmail] = useState('')
  // no default: every new account gets its own password (the old shared demo one is public)
  const [password, setPassword] = useState('')
  const [name, setName] = useState(user?.full_name ?? '')
  const [roleId, setRoleId] = useState<string>(user?.role_id ?? '')
  const [storeIds, setStoreIds] = useState<string[]>(
    user ? (usr ?? []).filter((r) => r.user_id === user.id).map((r) => r.store_id) : [],
  )
  // until a role is picked: the member's current built-in (or Staff for a new account)
  const selectedRoleId =
    roleId ||
    (roles ?? []).find((r) => r.is_system && r.base_role === (user?.role ?? 'staff'))?.id ||
    ''
  const selectedRole = (roles ?? []).find((r) => r.id === selectedRoleId) ?? null
  // base role travels too so an older edge function keeps working
  const role: AppRole = selectedRole?.base_role ?? user?.role ?? 'staff'

  const submit = () => {
    const body = user
      ? { action: 'update_user', user_id: user.id, role, role_id: selectedRoleId || undefined, full_name: name, store_ids: storeIds }
      : { action: 'create_user', email, password, full_name: name, role, role_id: selectedRoleId || undefined, store_ids: storeIds }
    admin.mutate(body, {
      onSuccess: () => {
        toast(user ? 'User updated' : `Account created for ${name}`)
        onClose()
      },
      onError: (e) => toast(e.message, 'error'),
    })
  }

  return (
    <div onClick={onClose} className="fixed inset-0 z-[80] flex items-center justify-center bg-navy/50 p-6">
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[440px] max-w-full animate-fade rounded-[20px] bg-white p-6 shadow-[0_30px_80px_rgba(0,0,0,.3)]"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-[17px] font-bold">{user ? `Edit ${user.full_name}` : 'Add team member'}</h3>
          <button onClick={onClose} className="p-1 text-muted"><X size={18} /></button>
        </div>
        {!user && (
          <>
            <label className={label}>Email</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} className={`${inputCls} mb-3`} placeholder="name@store.com" />
            <label className={label}>Temporary password</label>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`${inputCls} mb-1`}
              placeholder="At least 8 characters"
              autoComplete="new-password"
            />
            <div className="mb-3 text-[11px] text-muted">
              Staff can also sign in with a 6-digit staff code — issue one from the Users list.
            </div>
          </>
        )}
        <label className={label}>Full name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} className={`${inputCls} mb-3`} />
        <label className={label}>Role</label>
        {(roles ?? []).length > 0 ? (
          <>
            <select value={selectedRoleId} onChange={(e) => setRoleId(e.target.value)} className={inputCls}>
              {(roles ?? []).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                  {r.name !== baseLabel(r.base_role) ? ` · ${baseLabel(r.base_role)} access` : ''}
                </option>
              ))}
            </select>
            <div className="mb-3 mt-1 text-[11px] text-muted">
              {selectedRole?.description ?? 'Roles and their rights are managed under the Roles tab.'}
            </div>
          </>
        ) : (
          <div className={`${inputCls} mb-3`}>{roleLabels[role]}</div>
        )}
        <label className={label}>Stores</label>
        <div className="mb-4 flex flex-wrap gap-1.5">
          {stores.map((s) => {
            const on = storeIds.includes(s.id)
            return (
              <button
                key={s.id}
                onClick={() => setStoreIds(on ? storeIds.filter((x) => x !== s.id) : [...storeIds, s.id])}
                className={`rounded-[10px] border px-3 py-1.5 text-xs font-semibold ${
                  on ? 'border-brand bg-brand-tint text-brand-dark' : 'border-ink/15 bg-white text-slate'
                }`}
              >
                {s.name}
              </button>
            )
          })}
        </div>
        <button
          onClick={submit}
          disabled={admin.isPending || (!user && (!email || !name || password.length < 8))}
          className="w-full rounded-xl bg-brand p-3 text-[13.5px] font-semibold text-white disabled:opacity-50"
        >
          {user ? 'Save changes' : 'Create account'}
        </button>
      </div>
    </div>
  )
}

function UsersPanel() {
  const { data: profiles } = useProfiles()
  const { data: usr } = useUserStoreRoles()
  const { data: roles } = useRoles()
  const roleName = (p: Profile) => (roles ?? []).find((r) => r.id === p.role_id)?.name ?? roleLabels[p.role]
  const { stores, profile: me } = useAuth()
  const [modal, setModal] = useState<Profile | null | 'new'>(null)
  const isOwner = me?.role === 'owner'
  const { data: kioskCodes } = useKioskCodes(isOwner)
  const codeOf = (userId: string) => (kioskCodes ?? []).find((k) => k.user_id === userId)?.code ?? null
  const [pinFor, setPinFor] = useState<Profile | null>(null)

  return (
    <div>
      <div className="mb-3.5 flex items-center justify-between">
        <div className="text-[12.5px] text-muted">
          {(profiles ?? []).length} team members · tap “Change” next to a PIN to set or reset it
        </div>
        <button
          onClick={() => setModal('new')}
          className="flex items-center gap-1.5 rounded-[10px] bg-brand px-3.5 py-2 text-xs font-semibold text-white"
        >
          <Plus size={13} weight="bold" /> Add member
        </button>
      </div>
      <Card className="overflow-hidden">
        {(profiles ?? []).map((p) => {
          const myStores = (usr ?? [])
            .filter((r) => r.user_id === p.id)
            .map((r) => stores.find((s) => s.id === r.store_id)?.name)
            .filter(Boolean)
          return (
            <div key={p.id} className="flex items-center gap-3.5 border-b border-ink/5 px-4 py-3">
              <Avatar name={p.full_name} color={p.avatar_color} size={38} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[13.5px] font-semibold">{p.full_name}</span>
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: p.is_online ? '#16B364' : '#C3C9D2' }}
                    title={p.is_online ? 'Online' : 'Offline'}
                  />
                </div>
                <div className="text-[11.5px] text-muted">
                  {roleName(p)}
                  {p.role === 'owner' ? ' · all stores' : myStores.length ? ` · ${myStores.join(', ')}` : ' · no store assigned'}
                </div>
              </div>
              {isOwner && (
                <KioskCodeChip code={codeOf(p.id)} onManage={() => setPinFor(p)} />
              )}
              <button
                onClick={() => setModal(p)}
                className="flex items-center gap-1.5 rounded-lg border border-ink/15 px-3 py-1.5 text-xs font-semibold text-slate"
              >
                <PencilSimple size={13} /> Edit
              </button>
            </div>
          )
        })}
      </Card>
      {modal && <UserModal user={modal === 'new' ? null : modal} onClose={() => setModal(null)} />}
      {pinFor && <PinModal user={pinFor} code={codeOf(pinFor.id)} onClose={() => setPinFor(null)} />}
    </div>
  )
}

// ================= Units =================
function UnitsPanel() {
  const { stores } = useAuth()
  const { data: units } = useStoreUnits()
  const saveUnit = useSaveUnit()
  const delUnit = useDeleteUnit()
  const toast = useToast()
  const onErr = { onError: (e: Error) => toast(e.message, 'error') }
  const [qrUnit, setQrUnit] = useState<StoreUnit | null>(null)

  return (
    <div>
    <div className="mb-3.5 text-[12.5px] text-muted">
      The chillers and freezers of each store, in the order staff read them. Every unit has its own QR
      label (<QrIcon size={12} className="inline" />) to print and stick on it — QR-gated temperature
      logs unlock a unit only after its label is scanned.
    </div>
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {stores.map((s) => (
        <Card key={s.id} className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="font-display text-sm font-bold">{s.name}</span>
            <button
              onClick={() => {
                const name = `Chiller #${((units ?? []).filter((u) => u.store_id === s.id && u.type === 'chiller').length + 1)}`
                saveUnit.mutate(
                  { store_id: s.id, name, type: 'chiller', safe_limit: 5, breach_above: 7, display_order: 99 },
                  {
                    onSuccess: () => toast(`${name} added to ${s.name}`),
                    onError: (e) => toast(e.message, 'error'),
                  },
                )
              }}
              className="flex items-center gap-1 rounded-lg bg-brand-tint px-2.5 py-1 text-[11px] font-semibold text-brand-dark"
            >
              <Plus size={11} weight="bold" /> Add unit
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {(units ?? [])
              .filter((u) => u.store_id === s.id)
              .map((u) => (
                <div key={u.id} className="rounded-xl border border-line bg-canvas p-2.5">
                  <div className="mb-1.5 flex items-center gap-2">
                    <Thermometer size={14} weight="fill" color={u.type === 'freezer' ? '#3B82F6' : '#E5484D'} />
                    <input
                      defaultValue={u.name}
                      onBlur={(e) =>
                        e.target.value !== u.name &&
                        saveUnit.mutate({ id: u.id, store_id: u.store_id, name: e.target.value }, onErr)
                      }
                      className="flex-1 bg-transparent text-[12.5px] font-semibold outline-none"
                    />
                    <select
                      defaultValue={u.type}
                      onChange={(e) => saveUnit.mutate({ id: u.id, store_id: u.store_id, type: e.target.value as 'chiller' | 'freezer' }, onErr)}
                      className="rounded-md border border-ink/10 bg-white px-1 py-0.5 text-[10.5px]"
                    >
                      <option value="chiller">chiller</option>
                      <option value="freezer">freezer</option>
                    </select>
                    <button
                      onClick={() => setQrUnit(u)}
                      title="QR label — view, download or print"
                      aria-label={`QR label for ${u.name}`}
                      className="p-0.5 text-slate hover:text-brand"
                    >
                      <QrIcon size={14} />
                    </button>
                    <button onClick={() => delUnit.mutate(u.id, onErr)} className="p-0.5 text-danger"><Trash size={13} /></button>
                  </div>
                  <div className="flex items-center gap-2 text-[10.5px] text-muted">
                    safe ≤
                    <input
                      type="number"
                      defaultValue={u.safe_limit}
                      onBlur={(e) => saveUnit.mutate({ id: u.id, store_id: u.store_id, safe_limit: parseFloat(e.target.value) }, onErr)}
                      className="w-12 rounded-md border border-ink/10 bg-white px-1 py-0.5 text-center text-[11px] font-semibold text-ink"
                    />
                    °C · escalate &gt;
                    <input
                      type="number"
                      defaultValue={u.breach_above}
                      onBlur={(e) => saveUnit.mutate({ id: u.id, store_id: u.store_id, breach_above: parseFloat(e.target.value) }, onErr)}
                      className="w-12 rounded-md border border-ink/10 bg-white px-1 py-0.5 text-center text-[11px] font-semibold text-danger"
                    />
                    °C
                  </div>
                </div>
              ))}
          </div>
        </Card>
      ))}
    </div>
    {qrUnit && (
      <UnitQrModal
        unit={qrUnit}
        storeName={stores.find((s) => s.id === qrUnit.store_id)?.name ?? ''}
        onClose={() => setQrUnit(null)}
      />
    )}
    </div>
  )
}

// ================= QR codes =================
interface QrCard {
  store: Store
  label: string
  sub: string
  dataUrl: string
  file: string
}

function QrPanel() {
  const { stores } = useAuth()
  const { data: units } = useStoreUnits()
  const [codes, setCodes] = useState<QrCard[]>([])

  useEffect(() => {
    let live = true
    ;(async () => {
      const out: QrCard[] = []
      for (const s of stores) {
        // one label per chiller/freezer, keyed by the unit's id so renaming never orphans a sticker
        for (const u of (units ?? []).filter((x) => x.store_id === s.id)) {
          out.push({
            store: s,
            label: u.name,
            sub: `${u.type === 'freezer' ? 'Freezer' : 'Chiller'} · ${s.name}`,
            dataUrl: await QRCode.toDataURL(unitQrPayload(s.id, u.id), { width: 512, margin: 2 }),
            file: qrFileName(s.name, u.name),
          })
        }
        // zone labels for "QR required" checklist items
        for (const zone of ['Stockroom', 'Freezer aisle']) {
          out.push({
            store: s,
            label: zone,
            sub: `Zone · ${s.name}`,
            dataUrl: await QRCode.toDataURL(zoneQrPayload(s.id, zone), { width: 512, margin: 2 }),
            file: qrFileName(s.name, zone),
          })
        }
      }
      if (live) setCodes(out)
    })()
    return () => {
      live = false
    }
  }, [stores, units])

  return (
    <div>
      <div className="mb-3.5 flex items-center justify-between gap-3 print:hidden">
        <div className="text-[12.5px] text-muted">
          One label per chiller/freezer (from Admin → Units) and per zone. Stick each on its asset:
          QR-gated temperature logs unlock a unit only after its label is scanned, and “QR required”
          checklist items need the zone label.
        </div>
        <button
          onClick={() => window.print()}
          className="flex flex-none items-center gap-1.5 rounded-[10px] bg-ink px-3.5 py-2 text-xs font-semibold text-white"
        >
          <Printer size={13} /> Print sheet
        </button>
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
        {codes.map((c) => (
          <Card key={`${c.store.id}:${c.label}`} className="flex flex-col items-center p-4 text-center">
            <img src={c.dataUrl} alt={`QR for ${c.label}`} className="mb-2 w-full max-w-[160px]" />
            <div className="text-[12.5px] font-bold">{c.label}</div>
            <div className="text-[10.5px] text-muted">{c.sub}</div>
            <div className="mt-2.5 flex gap-1.5 print:hidden">
              <a
                href={c.dataUrl}
                download={c.file}
                title="Download PNG"
                className="flex items-center gap-1 rounded-lg border border-ink/15 px-2 py-1 text-[11px] font-semibold text-slate"
              >
                <DownloadSimple size={12} weight="bold" /> PNG
              </a>
              <button
                onClick={() => printQrLabel(c.dataUrl, c.label, c.sub)}
                title="Print this label"
                className="flex items-center gap-1 rounded-lg border border-ink/15 px-2 py-1 text-[11px] font-semibold text-slate"
              >
                <Printer size={12} weight="bold" /> Print
              </button>
            </div>
          </Card>
        ))}
        {codes.length === 0 && (
          <div className="col-span-full p-8 text-center text-xs text-muted">
            Add chillers and freezers under Admin → Units to generate their labels.
          </div>
        )}
      </div>
    </div>
  )
}

// ================= Geofence =================
function GeofencePanel() {
  const { stores } = useAuth()
  const update = useUpdateStore()
  const toast = useToast()

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {stores.map((s) => (
        <GeofenceCard
          key={s.id}
          store={s}
          saving={update.isPending}
          onSave={(patch) =>
            update.mutate(
              { id: s.id, ...patch },
              {
                onSuccess: () => toast(`${s.name} geofence updated`, 'success'),
                onError: (e) => toast(`Could not save ${s.name}: ${e.message}`, 'error'),
              },
            )
          }
        />
      ))}
    </div>
  )
}

function GeofenceCard({
  store,
  saving,
  onSave,
}: {
  store: Store
  saving: boolean
  onSave: (patch: Partial<Store>) => void
}) {
  const [lat, setLat] = useState(store.lat?.toString() ?? '')
  const [lng, setLng] = useState(store.lng?.toString() ?? '')
  const [radius, setRadius] = useState(store.geofence_radius_m)
  const [locating, setLocating] = useState(false)
  const [accuracy, setAccuracy] = useState<number | null>(null)
  const toast = useToast()

  // follow the saved store when it changes (after our save, or another owner's edit)
  useEffect(() => {
    setLat(store.lat?.toString() ?? '')
    setLng(store.lng?.toString() ?? '')
    setRadius(store.geofence_radius_m)
  }, [store.lat, store.lng, store.geofence_radius_m])

  const latNum = lat.trim() === '' ? null : parseFloat(lat)
  const lngNum = lng.trim() === '' ? null : parseFloat(lng)
  const latBad = latNum != null && (Number.isNaN(latNum) || latNum < -90 || latNum > 90)
  const lngBad = lngNum != null && (Number.isNaN(lngNum) || lngNum < -180 || lngNum > 180)
  const halfSet = (latNum == null) !== (lngNum == null)
  const dirty =
    (latNum ?? null) !== (store.lat ?? null) ||
    (lngNum ?? null) !== (store.lng ?? null) ||
    radius !== store.geofence_radius_m
  const canSave = dirty && !latBad && !lngBad && !halfSet && !saving

  const useMyLocation = () => {
    if (!('geolocation' in navigator)) {
      toast(geoReasonHelp('unsupported'), 'warn')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false)
        setLat(pos.coords.latitude.toFixed(6))
        setLng(pos.coords.longitude.toFixed(6))
        setAccuracy(Math.round(pos.coords.accuracy))
        toast(
          `Coordinates set from your position (±${Math.round(pos.coords.accuracy)} m). Press Save to keep them.`,
          'info',
        )
      },
      (err) => {
        setLocating(false)
        toast(geoReasonHelp(geoErrorReason(err)), 'warn')
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    )
  }

  const previewSize = Math.max(40, Math.min(130, radius * 0.9))
  return (
    <Card className="overflow-hidden">
      <div
        className="relative flex h-[140px] items-center justify-center border-b border-ink/5"
        style={{ background: 'radial-gradient(circle at 50% 45%, #EAF1FE, #F5F6F8)' }}
      >
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(rgba(21,27,40,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(21,27,40,.05) 1px,transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />
        <div
          className="absolute rounded-full border-[1.5px] border-dashed border-info/50 bg-info/10 transition-all"
          style={{ width: previewSize, height: previewSize }}
        />
        <MapPin size={22} weight="fill" color="#FF5A2D" className="relative" />
      </div>
      <div className="p-4">
        <div className="mb-2.5 font-display text-sm font-bold">{store.name}</div>
        {store.lat == null || store.lng == null ? (
          <div className="mb-2.5 rounded-[10px] border border-amber/25 bg-warn-soft p-2 text-[11px] font-medium text-amber">
            No location set — staff cannot be verified on-site at this store yet.
          </div>
        ) : null}
        <div className="mb-2.5 grid grid-cols-2 gap-2">
          <div>
            <div className="mb-1 text-[10.5px] font-semibold text-slate">Latitude</div>
            <input
              value={lat}
              inputMode="decimal"
              placeholder="e.g. 51.3721"
              onChange={(e) => setLat(e.target.value)}
              className={`${inputCls} ${latBad ? 'border-danger' : ''}`}
            />
          </div>
          <div>
            <div className="mb-1 text-[10.5px] font-semibold text-slate">Longitude</div>
            <input
              value={lng}
              inputMode="decimal"
              placeholder="e.g. -0.1005"
              onChange={(e) => setLng(e.target.value)}
              className={`${inputCls} ${lngBad ? 'border-danger' : ''}`}
            />
          </div>
        </div>
        {(latBad || lngBad || halfSet) && (
          <div className="mb-2 text-[10.5px] font-medium text-danger">
            {halfSet
              ? 'Enter both latitude and longitude, or clear both.'
              : 'Latitude must be between -90 and 90, longitude between -180 and 180.'}
          </div>
        )}
        {accuracy != null && (
          <div className="mb-2 text-[10.5px] text-muted">
            Device fix accuracy ±{accuracy} m — if that is larger than the radius, widen the radius a little.
          </div>
        )}
        <div className="mb-1 flex justify-between text-[10.5px] font-semibold text-slate">
          <span>Radius</span>
          <span className="text-ink">{radius} m</span>
        </div>
        <input
          type="range"
          min={30}
          max={300}
          step={10}
          value={radius}
          onChange={(e) => setRadius(parseInt(e.target.value, 10))}
          className="mb-3 w-full accent-[#FF5A2D]"
        />
        <div className="flex gap-2">
          <button
            onClick={useMyLocation}
            disabled={locating}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-[10px] border border-ink/15 p-2 text-xs font-semibold text-slate disabled:opacity-60"
          >
            <Crosshair size={13} className={locating ? 'animate-spin' : ''} />
            {locating ? 'Locating…' : 'Use my location'}
          </button>
          <button
            onClick={() =>
              onSave({
                lat: latNum,
                lng: lngNum,
                geofence_radius_m: radius,
              })
            }
            disabled={!canSave}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-[10px] bg-brand p-2 text-xs font-semibold text-white disabled:opacity-50"
          >
            <Check size={13} weight="bold" /> {saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}
          </button>
        </div>
      </div>
    </Card>
  )
}

// ================= page =================
const tabParams: Record<string, Tab> = {
  templates: 'Templates',
  tasks: 'Tasks',
  categories: 'Categories',
  suppliers: 'Suppliers',
  users: 'Users',
  roles: 'Roles',
  units: 'Units',
  qr: 'QR codes',
  geofence: 'Geofence',
}

export default function AdminPage() {
  const [params] = useSearchParams()
  const [tab, setTab] = useState<Tab>(
    tabParams[(params.get('tab') ?? '').toLowerCase()] ?? 'Templates',
  )
  const icons: Record<Tab, typeof UsersIcon> = {
    Templates: PencilSimple,
    Tasks: ListChecks,
    Categories: Tag,
    Suppliers: Truck,
    Users: UsersIcon,
    Roles: ShieldCheck,
    Units: Thermometer,
    'QR codes': QrIcon,
    Geofence: MapPin,
  }
  return (
    <div className="max-w-[1020px] animate-fade">
      <div className="mb-5 flex max-w-full gap-1 overflow-x-auto rounded-xl bg-white p-1 shadow-sm print:hidden lg:w-fit">
        {tabs.map((t) => {
          const TIcon = icons[t]
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex flex-none items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-[12.5px] font-semibold transition lg:px-4 ${
                tab === t ? 'bg-navy text-white' : 'text-slate'
              }`}
            >
              <TIcon size={14} /> {t}
            </button>
          )
        })}
      </div>
      {tab === 'Templates' && <TemplatesPanel />}
      {tab === 'Tasks' && <TasksPanel />}
      {tab === 'Categories' && <CategoriesPanel />}
      {tab === 'Suppliers' && <SuppliersPanel />}
      {tab === 'Users' && <UsersPanel />}
      {tab === 'Roles' && <RolesPanel />}
      {tab === 'Units' && <UnitsPanel />}
      {tab === 'QR codes' && <QrPanel />}
      {tab === 'Geofence' && <GeofencePanel />}
    </div>
  )
}
