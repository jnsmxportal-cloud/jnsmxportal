import { useMemo, useState } from 'react'
import { CaretLeft, CaretRight, Clock, Copy, Plus, Trash, X } from '@phosphor-icons/react'
import { Avatar, Card } from '../../components/ui'
import { useAuth } from '../../auth/AuthProvider'
import { useProfiles } from '../../data/hooks'
import { useUserStoreRoles } from '../../data/admin'
import {
  addDays,
  useCopyLastWeek,
  useDeleteShift,
  useSaveShift,
  useShifts,
  weekStart,
} from '../../data/rota'
import { useToast } from '../../components/Toast'
import { useOwnerCtx } from './OwnerLayout'
import type { Profile, Shift } from '../../lib/types'

const inputCls =
  'w-full rounded-xl border-[1.5px] border-ink/15 bg-white p-2.5 text-sm outline-none focus:border-brand'
const label = 'mb-1.5 block text-xs font-semibold text-slate'

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function hm(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
}

function dateInputValue(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

interface ModalState {
  shift: Shift | null
  userId: string
  day: Date
}

function ShiftModal({
  state,
  storeId,
  employees,
  onClose,
}: {
  state: ModalState
  storeId: string
  employees: Profile[]
  onClose: () => void
}) {
  const save = useSaveShift()
  const del = useDeleteShift()
  const toast = useToast()
  const s = state.shift
  const [userId, setUserId] = useState(s?.user_id ?? state.userId)
  const [date, setDate] = useState(dateInputValue(s ? new Date(s.starts_at) : state.day))
  const [start, setStart] = useState(s ? hm(s.starts_at) : '09:00')
  const [end, setEnd] = useState(s ? hm(s.ends_at) : '17:00')
  const [note, setNote] = useState(s?.role_note ?? '')

  const submit = () => {
    const starts = new Date(`${date}T${start}:00`)
    const ends = new Date(`${date}T${end}:00`)
    if (ends <= starts) ends.setDate(ends.getDate() + 1) // overnight shift
    save.mutate(
      {
        id: s?.id,
        store_id: storeId,
        user_id: userId,
        starts_at: starts.toISOString(),
        ends_at: ends.toISOString(),
        role_note: note.trim() || null,
      },
      {
        onSuccess: () => {
          toast(s ? 'Shift updated' : 'Shift added')
          onClose()
        },
        onError: (e) => toast(e.message, 'error'),
      },
    )
  }

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[80] flex items-center justify-center bg-navy/50 p-6"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[400px] max-w-full animate-fade rounded-[20px] bg-white p-6 shadow-[0_30px_80px_rgba(0,0,0,.3)]"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-[17px] font-bold">{s ? 'Edit shift' : 'Add shift'}</h3>
          <button onClick={onClose} className="p-1 text-muted">
            <X size={18} />
          </button>
        </div>
        <label className={label}>Employee</label>
        <select
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          className={`${inputCls} mb-3`}
        >
          {employees.map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name}
            </option>
          ))}
        </select>
        <label className={label}>Date</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className={`${inputCls} mb-3`}
        />
        <div className="mb-3 grid grid-cols-2 gap-3">
          <div>
            <label className={label}>Start</label>
            <input
              type="time"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className={label}>End</label>
            <input
              type="time"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className={inputCls}
            />
          </div>
        </div>
        <label className={label}>Note (optional)</label>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Till, Stock, Keyholder"
          className={`${inputCls} mb-4`}
        />
        <div className="flex gap-2.5">
          {s && (
            <button
              onClick={() =>
                del.mutate(s.id, {
                  onSuccess: () => {
                    toast('Shift removed')
                    onClose()
                  },
                  onError: (e) => toast(e.message, 'error'),
                })
              }
              className="flex items-center gap-1.5 rounded-xl border border-danger/30 px-3.5 text-[13px] font-semibold text-danger"
            >
              <Trash size={14} /> Delete
            </button>
          )}
          <button
            onClick={submit}
            disabled={save.isPending || !userId}
            className="flex-1 rounded-xl bg-brand p-3 text-[13.5px] font-semibold text-white disabled:opacity-50"
          >
            {s ? 'Save changes' : 'Add shift'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function RotaPage() {
  const { storeId: ctxStore } = useOwnerCtx()
  const { profile, stores } = useAuth()
  const toast = useToast()
  const [localStore, setLocalStore] = useState<string>(stores[0]?.id ?? '')
  const storeId = ctxStore === 'all' ? localStore : ctxStore
  const store = stores.find((s) => s.id === storeId)

  const [offset, setOffset] = useState(0)
  const week = useMemo(() => addDays(weekStart(new Date()), offset * 7), [offset])
  const weekEnd = useMemo(() => addDays(week, 7), [week])

  const { data: shifts } = useShifts(storeId || null, week, weekEnd)
  const { data: profiles } = useProfiles()
  const { data: usr } = useUserStoreRoles()
  const copyWeek = useCopyLastWeek()
  const canEdit = profile!.role === 'owner' || profile!.role === 'manager'

  const [modal, setModal] = useState<ModalState | null>(null)

  const employees = useMemo(() => {
    const assigned = new Set(
      (usr ?? []).filter((r) => r.store_id === storeId).map((r) => r.user_id),
    )
    ;(shifts ?? []).forEach((s) => assigned.add(s.user_id)) // keep rows for anyone scheduled
    return (profiles ?? [])
      .filter((p) => assigned.has(p.id) && p.role !== 'remote_office')
      .sort((a, b) => a.full_name.localeCompare(b.full_name))
  }, [profiles, usr, storeId, shifts])

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(week, i)), [week])
  const now = new Date()
  const onNow = (shifts ?? []).filter((s) => new Date(s.starts_at) <= now && new Date(s.ends_at) > now)
  const totalHours = (shifts ?? []).reduce(
    (acc, s) => acc + (new Date(s.ends_at).getTime() - new Date(s.starts_at).getTime()) / 3.6e6,
    0,
  )

  const weekLabel = `${week.toLocaleDateString([], { day: 'numeric', month: 'short' })} – ${addDays(week, 6).toLocaleDateString([], { day: 'numeric', month: 'short' })}`

  return (
    <div className="animate-fade">
      {/* controls */}
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        {ctxStore === 'all' && (
          <div className="flex gap-0.5 rounded-[10px] bg-white p-[3px] shadow-sm">
            {stores.map((s) => (
              <button
                key={s.id}
                onClick={() => setLocalStore(s.id)}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  localStore === s.id ? 'bg-navy text-white' : 'text-muted'
                }`}
              >
                {s.name}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-1 rounded-[10px] bg-white p-[3px] shadow-sm">
          <button onClick={() => setOffset(offset - 1)} className="rounded-lg p-2 text-slate">
            <CaretLeft size={14} weight="bold" />
          </button>
          <button
            onClick={() => setOffset(0)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${offset === 0 ? 'bg-navy text-white' : 'text-slate'}`}
          >
            {offset === 0 ? 'This week' : weekLabel}
          </button>
          <button onClick={() => setOffset(offset + 1)} className="rounded-lg p-2 text-slate">
            <CaretRight size={14} weight="bold" />
          </button>
        </div>
        <div className="flex items-center gap-2 text-[12px] text-muted">
          <Clock size={14} />
          {(shifts ?? []).length} shift{(shifts ?? []).length === 1 ? '' : 's'} ·{' '}
          {Math.round(totalHours * 10) / 10}h scheduled
          {offset === 0 && onNow.length > 0 && (
            <span className="flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-1 text-[11px] font-semibold text-success-deep">
              <span className="h-[7px] w-[7px] animate-pulsedot rounded-full bg-success" />
              {onNow.length} on shift now
            </span>
          )}
        </div>
        {canEdit && (
          <div className="ml-auto flex gap-2">
            <button
              onClick={() =>
                copyWeek.mutate(
                  { storeId, week },
                  {
                    onSuccess: (n) =>
                      toast(n ? `Copied ${n} shifts from last week` : 'Last week has no shifts', n ? 'info' : 'warn'),
                    onError: (e) => toast(e.message, 'error'),
                  },
                )
              }
              disabled={copyWeek.isPending || !storeId}
              className="flex items-center gap-1.5 rounded-[10px] border border-ink/15 bg-white px-3.5 py-2 text-xs font-semibold text-slate disabled:opacity-50"
            >
              <Copy size={13} /> Copy last week
            </button>
            <button
              onClick={() =>
                setModal({ shift: null, userId: employees[0]?.id ?? '', day: days[0] })
              }
              disabled={!employees.length}
              className="flex items-center gap-1.5 rounded-[10px] bg-brand px-3.5 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              <Plus size={13} weight="bold" /> Add shift
            </button>
          </div>
        )}
      </div>

      {/* grid */}
      <Card className="overflow-x-auto">
        <div className="min-w-[860px]">
          <div className="grid border-b border-ink/10 bg-canvas/60" style={{ gridTemplateColumns: '180px repeat(7, 1fr)' }}>
            <div className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-muted">
              {store?.name ?? 'Team'}
            </div>
            {days.map((d, i) => {
              const isToday = dateInputValue(d) === dateInputValue(now)
              return (
                <div
                  key={i}
                  className={`border-l border-ink/5 px-2 py-2.5 text-center text-[11px] font-bold ${isToday ? 'text-brand' : 'text-slate'}`}
                >
                  {DAY_NAMES[i]}{' '}
                  <span className={isToday ? '' : 'font-medium text-muted'}>
                    {d.toLocaleDateString([], { day: 'numeric', month: 'numeric' })}
                  </span>
                </div>
              )
            })}
          </div>
          {employees.map((p) => (
            <div
              key={p.id}
              className="grid border-b border-ink/5"
              style={{ gridTemplateColumns: '180px repeat(7, 1fr)' }}
            >
              <div className="flex items-center gap-2.5 px-4 py-2.5">
                <Avatar name={p.full_name} color={p.avatar_color} size={30} />
                <div className="min-w-0">
                  <div className="truncate text-[12.5px] font-semibold">{p.full_name}</div>
                  <div className="text-[10px] capitalize text-muted">{p.role.replace('_', ' ')}</div>
                </div>
              </div>
              {days.map((d, i) => {
                const dayShifts = (shifts ?? []).filter(
                  (s) =>
                    s.user_id === p.id &&
                    dateInputValue(new Date(s.starts_at)) === dateInputValue(d),
                )
                return (
                  <button
                    key={i}
                    onClick={() =>
                      canEdit && setModal({ shift: null, userId: p.id, day: d })
                    }
                    className={`flex min-h-[54px] flex-col items-stretch justify-center gap-1 border-l border-ink/5 p-1.5 text-left ${canEdit ? 'hover:bg-brand-tint/40' : 'cursor-default'}`}
                  >
                    {dayShifts.map((s) => (
                      <span
                        key={s.id}
                        onClick={(e) => {
                          if (!canEdit) return
                          e.stopPropagation()
                          setModal({ shift: s, userId: p.id, day: d })
                        }}
                        className="block rounded-lg bg-navy px-2 py-1 text-center text-[10.5px] font-semibold text-white hover:bg-brand"
                      >
                        {hm(s.starts_at)}–{hm(s.ends_at)}
                        {s.role_note && (
                          <span className="block truncate text-[9px] font-medium text-white/60">
                            {s.role_note}
                          </span>
                        )}
                      </span>
                    ))}
                  </button>
                )
              })}
            </div>
          ))}
          {employees.length === 0 && (
            <div className="p-10 text-center text-xs text-muted">
              No employees are assigned to this store yet — assign them in Admin → Users.
            </div>
          )}
        </div>
      </Card>

      {modal && storeId && (
        <ShiftModal
          state={modal}
          storeId={storeId}
          employees={employees}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}
