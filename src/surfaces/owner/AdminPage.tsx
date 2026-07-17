import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import {
  Check,
  Crosshair,
  MapPin,
  PencilSimple,
  Plus,
  Printer,
  QrCode as QrIcon,
  Thermometer,
  Trash,
  Users as UsersIcon,
  X,
} from '@phosphor-icons/react'
import { Avatar, Card } from '../../components/ui'
import { useAuth } from '../../auth/AuthProvider'
import { useProfiles, useStoreUnits } from '../../data/hooks'
import {
  recurrenceSummary,
  useAdminUsers,
  useDeleteTemplate,
  useDeleteUnit,
  useSaveUnit,
  useTemplates,
  useUpdateStore,
  useUserStoreRoles,
  type TaskTemplate,
} from '../../data/admin'
import { useToast } from '../../components/Toast'
import TemplateEditor from './TemplateEditor'
import type { AppRole, Profile, Store } from '../../lib/types'

const tabs = ['Templates', 'Users', 'Units', 'QR codes', 'Geofence'] as const
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
function TemplatesPanel() {
  const { data: templates } = useTemplates()
  const { stores } = useAuth()
  const del = useDeleteTemplate()
  const toast = useToast()
  const [editing, setEditing] = useState<TaskTemplate | null | 'new'>(null)

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
                <span className="rounded-full bg-canvas px-2 py-px text-[10px] font-semibold text-slate">
                  {t.category.replace('_', '-')}
                </span>
                {t.is_temperature_log && (
                  <span className="rounded-full bg-danger-soft px-2 py-px text-[10px] font-semibold text-danger">
                    temp log
                  </span>
                )}
              </div>
              <div className="mt-0.5 text-xs text-muted">
                {recurrenceSummary(t.recurrence)} ·{' '}
                {t.store_id ? stores.find((s) => s.id === t.store_id)?.name : 'Chain-wide'} ·{' '}
                {t.checklist.length} items
              </div>
            </div>
            <button
              onClick={() => setEditing(t)}
              className="flex items-center gap-1.5 rounded-lg border border-ink/15 px-3 py-1.5 text-xs font-semibold text-slate"
            >
              <PencilSimple size={13} /> Edit
            </button>
            <button
              onClick={() =>
                del.mutate(t.id, { onSuccess: () => toast(`Template “${t.title}” deleted`) })
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
function UserModal({ user, onClose }: { user: Profile | null; onClose: () => void }) {
  const { stores } = useAuth()
  const { data: usr } = useUserStoreRoles()
  const admin = useAdminUsers()
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('StoreOps!2026')
  const [name, setName] = useState(user?.full_name ?? '')
  const [role, setRole] = useState<AppRole>(user?.role ?? 'staff')
  const [storeIds, setStoreIds] = useState<string[]>(
    user ? (usr ?? []).filter((r) => r.user_id === user.id).map((r) => r.store_id) : [],
  )

  const submit = () => {
    const body = user
      ? { action: 'update_user', user_id: user.id, role, full_name: name, store_ids: storeIds }
      : { action: 'create_user', email, password, full_name: name, role, store_ids: storeIds }
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
            <input value={password} onChange={(e) => setPassword(e.target.value)} className={`${inputCls} mb-3`} />
          </>
        )}
        <label className={label}>Full name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} className={`${inputCls} mb-3`} />
        <label className={label}>Role</label>
        <select value={role} onChange={(e) => setRole(e.target.value as AppRole)} className={`${inputCls} mb-3`}>
          {(Object.keys(roleLabels) as AppRole[]).map((r) => (
            <option key={r} value={r}>{roleLabels[r]}</option>
          ))}
        </select>
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
          disabled={admin.isPending || (!user && (!email || !name))}
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
  const { stores } = useAuth()
  const [modal, setModal] = useState<Profile | null | 'new'>(null)

  return (
    <div>
      <div className="mb-3.5 flex items-center justify-between">
        <div className="text-[12.5px] text-muted">
          {(profiles ?? []).length} team members · accounts are created with a temporary password
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
                  {roleLabels[p.role]}
                  {p.role === 'owner' ? ' · all stores' : myStores.length ? ` · ${myStores.join(', ')}` : ' · no store assigned'}
                </div>
              </div>
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

  return (
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
                  { onSuccess: () => toast(`${name} added to ${s.name}`) },
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
                        saveUnit.mutate({ id: u.id, store_id: u.store_id, name: e.target.value })
                      }
                      className="flex-1 bg-transparent text-[12.5px] font-semibold outline-none"
                    />
                    <select
                      defaultValue={u.type}
                      onChange={(e) => saveUnit.mutate({ id: u.id, store_id: u.store_id, type: e.target.value as 'chiller' | 'freezer' })}
                      className="rounded-md border border-ink/10 bg-white px-1 py-0.5 text-[10.5px]"
                    >
                      <option value="chiller">chiller</option>
                      <option value="freezer">freezer</option>
                    </select>
                    <button onClick={() => delUnit.mutate(u.id)} className="p-0.5 text-danger"><Trash size={13} /></button>
                  </div>
                  <div className="flex items-center gap-2 text-[10.5px] text-muted">
                    safe ≤
                    <input
                      type="number"
                      defaultValue={u.safe_limit}
                      onBlur={(e) => saveUnit.mutate({ id: u.id, store_id: u.store_id, safe_limit: parseFloat(e.target.value) })}
                      className="w-12 rounded-md border border-ink/10 bg-white px-1 py-0.5 text-center text-[11px] font-semibold text-ink"
                    />
                    °C · escalate &gt;
                    <input
                      type="number"
                      defaultValue={u.breach_above}
                      onBlur={(e) => saveUnit.mutate({ id: u.id, store_id: u.store_id, breach_above: parseFloat(e.target.value) })}
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
  )
}

// ================= QR codes =================
function QrPanel() {
  const { stores } = useAuth()
  const { data: units } = useStoreUnits()
  const [codes, setCodes] = useState<{ store: Store; zone: string; dataUrl: string }[]>([])

  useEffect(() => {
    let live = true
    ;(async () => {
      const out: { store: Store; zone: string; dataUrl: string }[] = []
      for (const s of stores) {
        const zones = [
          ...(units ?? []).filter((u) => u.store_id === s.id).map((u) => u.name),
          'Stockroom',
          'Freezer aisle',
        ]
        for (const zone of zones) {
          const payload = `storeops:asset:${s.id}:${zone}`
          out.push({ store: s, zone, dataUrl: await QRCode.toDataURL(payload, { width: 220, margin: 1 }) })
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
      <div className="mb-3.5 flex items-center justify-between print:hidden">
        <div className="text-[12.5px] text-muted">
          Stick each code on its asset — “QR required” checklist items can only be completed by
          scanning the right code (FR-4.3).
        </div>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-1.5 rounded-[10px] bg-ink px-3.5 py-2 text-xs font-semibold text-white"
        >
          <Printer size={13} /> Print sheet
        </button>
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
        {codes.map((c, i) => (
          <Card key={i} className="flex flex-col items-center p-4 text-center">
            <img src={c.dataUrl} alt={`QR for ${c.zone}`} className="mb-2 w-full max-w-[160px]" />
            <div className="text-[12.5px] font-bold">{c.zone}</div>
            <div className="text-[10.5px] text-muted">{c.store.name}</div>
          </Card>
        ))}
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
        <GeofenceCard key={s.id} store={s} onSave={(patch) =>
          update.mutate({ id: s.id, ...patch }, { onSuccess: () => toast(`${s.name} geofence updated`) })
        } />
      ))}
    </div>
  )
}

function GeofenceCard({
  store,
  onSave,
}: {
  store: Store
  onSave: (patch: Partial<Store>) => void
}) {
  const [lat, setLat] = useState(store.lat?.toString() ?? '')
  const [lng, setLng] = useState(store.lng?.toString() ?? '')
  const [radius, setRadius] = useState(store.geofence_radius_m)
  const toast = useToast()

  const useMyLocation = () => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6))
        setLng(pos.coords.longitude.toFixed(6))
        toast('Coordinates set from your current position', 'info')
      },
      () => toast('Location permission denied', 'warn'),
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
        <div className="mb-2.5 grid grid-cols-2 gap-2">
          <div>
            <div className="mb-1 text-[10.5px] font-semibold text-slate">Latitude</div>
            <input value={lat} onChange={(e) => setLat(e.target.value)} className={inputCls} />
          </div>
          <div>
            <div className="mb-1 text-[10.5px] font-semibold text-slate">Longitude</div>
            <input value={lng} onChange={(e) => setLng(e.target.value)} className={inputCls} />
          </div>
        </div>
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
            className="flex flex-1 items-center justify-center gap-1.5 rounded-[10px] border border-ink/15 p-2 text-xs font-semibold text-slate"
          >
            <Crosshair size={13} /> Use my location
          </button>
          <button
            onClick={() =>
              onSave({
                lat: lat ? parseFloat(lat) : null,
                lng: lng ? parseFloat(lng) : null,
                geofence_radius_m: radius,
              })
            }
            className="flex flex-1 items-center justify-center gap-1.5 rounded-[10px] bg-brand p-2 text-xs font-semibold text-white"
          >
            <Check size={13} weight="bold" /> Save
          </button>
        </div>
      </div>
    </Card>
  )
}

// ================= page =================
export default function AdminPage() {
  const [tab, setTab] = useState<Tab>('Templates')
  const icons: Record<Tab, typeof UsersIcon> = {
    Templates: PencilSimple,
    Users: UsersIcon,
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
      {tab === 'Users' && <UsersPanel />}
      {tab === 'Units' && <UnitsPanel />}
      {tab === 'QR codes' && <QrPanel />}
      {tab === 'Geofence' && <GeofencePanel />}
    </div>
  )
}
