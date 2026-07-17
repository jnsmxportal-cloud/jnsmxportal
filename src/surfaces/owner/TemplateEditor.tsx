import { useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  Camera,
  Check,
  MapPin,
  Note,
  Plus,
  QrCode,
  Signature,
  Thermometer,
  Trash,
  X,
} from '@phosphor-icons/react'
import { useAuth } from '../../auth/AuthProvider'
import { useToast } from '../../components/Toast'
import {
  recurrenceSummary,
  useSaveTemplate,
  type ChecklistDef,
  type Recurrence,
  type TaskTemplate,
} from '../../data/admin'

const cats = ['daily', 'weekly', 'ad_hoc', 'incident', 'delivery', 'maintenance'] as const
const prios = ['low', 'medium', 'high', 'critical'] as const
const freqs: { id: Recurrence['freq'] | 'none'; label: string }[] = [
  { id: 'none', label: 'No schedule' },
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'month_end', label: 'Month-end' },
  { id: 'on_clock_in', label: 'On clock-in' },
]
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const evidenceDefs = [
  { k: 'photo', label: 'Photo', Icon: Camera },
  { k: 'temp', label: 'Temperature', Icon: Thermometer },
  { k: 'qr', label: 'QR scan', Icon: QrCode },
  { k: 'signature', label: 'Signature', Icon: Signature },
  { k: 'note', label: 'Note', Icon: Note },
  { k: 'geofence', label: 'Geofence', Icon: MapPin },
] as const

const inputCls =
  'w-full rounded-xl border-[1.5px] border-ink/15 bg-white p-2.5 text-sm outline-none focus:border-brand'
const label = 'mb-1.5 block text-xs font-semibold text-slate'
const chip = (active: boolean) =>
  `rounded-[10px] border px-3 py-1.5 text-xs font-semibold ${
    active ? 'border-brand bg-brand-tint text-brand-dark' : 'border-ink/15 bg-white text-slate'
  }`

export default function TemplateEditor({
  template,
  onClose,
}: {
  template: TaskTemplate | null
  onClose: () => void
}) {
  const { stores } = useAuth()
  const toast = useToast()
  const save = useSaveTemplate()

  const [title, setTitle] = useState(template?.title ?? '')
  const [description, setDescription] = useState(template?.description ?? '')
  const [category, setCategory] = useState<(typeof cats)[number]>(template?.category ?? 'daily')
  const [priority, setPriority] = useState<(typeof prios)[number]>(template?.priority ?? 'medium')
  const [storeId, setStoreId] = useState<string>(template?.store_id ?? 'all')
  const [evidence, setEvidence] = useState<Record<string, boolean>>(
    (template?.evidence as Record<string, boolean>) ?? {},
  )
  const [geoPolicy, setGeoPolicy] = useState(template?.geofence_policy ?? 'none')
  const [requiresApproval, setRequiresApproval] = useState(template?.requires_approval ?? true)
  const [freq, setFreq] = useState<Recurrence['freq'] | 'none'>(template?.recurrence?.freq ?? 'none')
  const [times, setTimes] = useState((template?.recurrence?.times ?? []).join(', '))
  const [exceptDays, setExceptDays] = useState<number[]>(template?.recurrence?.except_days ?? [])
  const [byweekday, setByweekday] = useState<number[]>(template?.recurrence?.byweekday ?? [])
  const [deadline, setDeadline] = useState(template?.recurrence?.deadline ?? '')
  const [escalateAt, setEscalateAt] = useState(template?.recurrence?.escalate_at ?? '')
  const [deadlineRel, setDeadlineRel] = useState(template?.recurrence?.deadline_rel ?? 'shift_end')
  const [items, setItems] = useState<ChecklistDef[]>(template?.checklist ?? [])

  const buildRecurrence = (): Recurrence | null => {
    if (freq === 'none') return null
    const r: Recurrence = { freq }
    if (freq === 'daily' || freq === 'weekly') {
      const t = times
        .split(',')
        .map((s) => s.trim())
        .filter((s) => /^\d{1,2}:\d{2}$/.test(s))
      if (t.length) r.times = t
      if (deadline) r.deadline = deadline
      if (escalateAt) r.escalate_at = escalateAt
      if (freq === 'daily' && exceptDays.length) r.except_days = exceptDays
      if (freq === 'weekly') r.byweekday = byweekday
    }
    if (freq === 'month_end') r.pending_until_complete = true
    if (freq === 'on_clock_in') r.deadline_rel = deadlineRel
    return r
  }

  const doSave = () => {
    save.mutate(
      {
        id: template?.id,
        title: title.trim() || 'Untitled template',
        description: description || null,
        category,
        priority,
        store_id: storeId === 'all' ? null : storeId,
        evidence,
        geofence_policy: geoPolicy,
        recurrence: buildRecurrence(),
        checklist: items.filter((i) => i.label.trim()),
        requires_approval: requiresApproval,
        is_temperature_log: template?.is_temperature_log ?? false,
      },
      {
        onSuccess: () => {
          toast(`Template “${title || 'Untitled'}” saved — the scheduler picks it up within a minute`)
          onClose()
        },
        onError: (e) => toast(e.message, 'error'),
      },
    )
  }

  const setItem = (i: number, patch: Partial<ChecklistDef>) =>
    setItems((arr) => arr.map((it, ix) => (ix === i ? { ...it, ...patch } : it)))
  const moveItem = (i: number, dir: -1 | 1) =>
    setItems((arr) => {
      const j = i + dir
      if (j < 0 || j >= arr.length) return arr
      const copy = [...arr]
      ;[copy[i], copy[j]] = [copy[j], copy[i]]
      return copy
    })

  const weekdayToggles = (sel: number[], setSel: (v: number[]) => void) => (
    <div className="flex gap-1.5">
      {WEEKDAYS.map((d, ix) => {
        const v = ix + 1
        const on = sel.includes(v)
        return (
          <button
            key={d}
            onClick={() => setSel(on ? sel.filter((x) => x !== v) : [...sel, v].sort())}
            className={`h-8 w-10 rounded-lg border text-[11px] font-bold ${
              on ? 'border-brand bg-brand text-white' : 'border-ink/15 bg-white text-slate'
            }`}
          >
            {d}
          </button>
        )
      })}
    </div>
  )

  return (
    <div onClick={onClose} className="fixed inset-0 z-[80] flex items-center justify-center bg-navy/50 p-6">
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-[680px] max-w-full animate-fade flex-col overflow-hidden rounded-[20px] bg-white shadow-[0_30px_80px_rgba(0,0,0,.3)]"
      >
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <div>
            <h3 className="font-display text-[17px] font-bold">
              {template ? 'Edit template' : 'New template'}
            </h3>
            <div className="text-xs text-muted">{recurrenceSummary(buildRecurrence())}</div>
          </div>
          <button onClick={onClose} className="p-1 text-muted">
            <X size={20} />
          </button>
        </div>

        <div className="flex flex-col gap-4 overflow-y-auto px-6 py-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr]">
            <div>
              <label className={label}>Title</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} placeholder="e.g. Closing Checklist" />
            </div>
            <div>
              <label className={label}>Store scope</label>
              <select value={storeId} onChange={(e) => setStoreId(e.target.value)} className={inputCls}>
                <option value="all">Chain-wide</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className={label}>Instructions</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} className={`${inputCls} h-16 resize-none`} placeholder="Shown to staff at the top of the task" />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={label}>Category</label>
              <div className="flex flex-wrap gap-1.5">
                {cats.map((c) => (
                  <button key={c} onClick={() => setCategory(c)} className={chip(category === c)}>
                    {c.replace('_', '-')}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className={label}>Priority</label>
              <div className="flex flex-wrap gap-1.5">
                {prios.map((p) => (
                  <button key={p} onClick={() => setPriority(p)} className={chip(priority === p)}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className={label}>Schedule</label>
            <div className="mb-2.5 flex flex-wrap gap-1.5">
              {freqs.map((f) => (
                <button key={f.id} onClick={() => setFreq(f.id)} className={chip(freq === f.id)}>
                  {f.label}
                </button>
              ))}
            </div>
            {(freq === 'daily' || freq === 'weekly') && (
              <div className="flex flex-col gap-2.5 rounded-xl bg-canvas p-3">
                {freq === 'weekly' && (
                  <div>
                    <div className="mb-1.5 text-[11px] font-semibold text-slate">Days</div>
                    {weekdayToggles(byweekday, setByweekday)}
                  </div>
                )}
                {freq === 'daily' && (
                  <div>
                    <div className="mb-1.5 text-[11px] font-semibold text-slate">Except days</div>
                    {weekdayToggles(exceptDays, setExceptDays)}
                  </div>
                )}
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                  <div>
                    <div className="mb-1 text-[11px] font-semibold text-slate">Times (HH:MM)</div>
                    <input value={times} onChange={(e) => setTimes(e.target.value)} placeholder="07:00, 14:00" className={inputCls} />
                  </div>
                  <div>
                    <div className="mb-1 text-[11px] font-semibold text-slate">Deadline</div>
                    <input type="time" value={deadline} onChange={(e) => setDeadline(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <div className="mb-1 text-[11px] font-semibold text-slate">Escalate at</div>
                    <input type="time" value={escalateAt} onChange={(e) => setEscalateAt(e.target.value)} className={inputCls} />
                  </div>
                </div>
              </div>
            )}
            {freq === 'on_clock_in' && (
              <div className="rounded-xl bg-canvas p-3">
                <div className="mb-1 text-[11px] font-semibold text-slate">Deadline relative to shift</div>
                <select value={deadlineRel} onChange={(e) => setDeadlineRel(e.target.value)} className={inputCls}>
                  <option value="shift_end">At shift end / clock-out</option>
                  <option value="shift_end-2h">2 hours before shift end</option>
                </select>
              </div>
            )}
            {freq === 'month_end' && (
              <div className="rounded-xl bg-canvas p-3 text-xs text-slate">
                Created on the last day of every month · stays <b>Pending until completed</b> · escalates to Owner + staff on the 5th of the following month.
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={label}>Required evidence</label>
              <div className="flex flex-wrap gap-1.5">
                {evidenceDefs.map((e) => (
                  <button
                    key={e.k}
                    onClick={() => setEvidence((ev) => ({ ...ev, [e.k]: !ev[e.k] }))}
                    className={`${chip(!!evidence[e.k])} flex items-center gap-1`}
                  >
                    <e.Icon size={13} /> {e.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className={label}>Geofence policy</label>
              <div className="flex gap-1.5">
                {(['none', 'flag', 'block'] as const).map((p) => (
                  <button key={p} onClick={() => setGeoPolicy(p)} className={chip(geoPolicy === p)}>
                    {p === 'none' ? 'Off' : p === 'flag' ? 'Allow & flag' : 'Block off-site'}
                  </button>
                ))}
              </div>
              <label className="mt-2.5 flex items-center gap-2 text-xs font-semibold text-slate">
                <input
                  type="checkbox"
                  checked={requiresApproval}
                  onChange={(e) => setRequiresApproval(e.target.checked)}
                  className="h-4 w-4 accent-[#FF5A2D]"
                />
                Requires review &amp; approval
              </label>
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-xs font-semibold text-slate">Checklist items</label>
              <button
                onClick={() => setItems((a) => [...a, { label: '' }])}
                className="flex items-center gap-1 rounded-lg bg-brand-tint px-2.5 py-1 text-[11.5px] font-semibold text-brand-dark"
              >
                <Plus size={12} weight="bold" /> Add item
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {items.map((it, i) => (
                <div key={i} className="flex items-center gap-2 rounded-xl border border-line bg-canvas p-2">
                  <div className="flex flex-col">
                    <button onClick={() => moveItem(i, -1)} className="p-0.5 text-muted"><ArrowUp size={11} /></button>
                    <button onClick={() => moveItem(i, 1)} className="p-0.5 text-muted"><ArrowDown size={11} /></button>
                  </div>
                  <input
                    value={it.label}
                    onChange={(e) => setItem(i, { label: e.target.value })}
                    placeholder="Item label…"
                    className="flex-1 rounded-lg border border-ink/10 bg-white px-2.5 py-2 text-[12.5px] outline-none"
                  />
                  <button onClick={() => setItem(i, { photo: !it.photo })} title="Photo required" className={`rounded-lg p-1.5 ${it.photo ? 'bg-brand text-white' : 'text-muted'}`}><Camera size={14} /></button>
                  <button onClick={() => setItem(i, { temp: !it.temp })} title="Temperature" className={`rounded-lg p-1.5 ${it.temp ? 'bg-danger text-white' : 'text-muted'}`}><Thermometer size={14} /></button>
                  {it.temp && (
                    <input
                      value={it.limit ?? ''}
                      onChange={(e) => setItem(i, { limit: e.target.value === '' ? undefined : parseFloat(e.target.value) })}
                      placeholder="limit"
                      className="w-14 rounded-lg border border-ink/10 bg-white px-1.5 py-2 text-center text-[11px] outline-none"
                    />
                  )}
                  <button onClick={() => setItem(i, { qr: !it.qr })} title="QR required" className={`rounded-lg p-1.5 ${it.qr ? 'bg-info text-white' : 'text-muted'}`}><QrCode size={14} /></button>
                  <button onClick={() => setItems((a) => a.filter((_, ix) => ix !== i))} className="p-1.5 text-danger"><Trash size={14} /></button>
                </div>
              ))}
              {items.length === 0 && (
                <div className="rounded-xl border border-dashed border-ink/15 p-4 text-center text-[11.5px] text-muted">
                  No checklist items — the task is a single completable unit.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-2.5 border-t border-line px-6 py-4">
          <button onClick={onClose} className="flex-1 rounded-xl border border-ink/15 bg-white p-3 text-[13.5px] font-semibold text-slate">
            Cancel
          </button>
          <button
            onClick={doSave}
            disabled={save.isPending}
            className="flex flex-[2] items-center justify-center gap-2 rounded-xl bg-brand p-3 text-[13.5px] font-semibold text-white disabled:opacity-60"
          >
            <Check size={15} weight="bold" /> Save template
          </button>
        </div>
      </div>
    </div>
  )
}
