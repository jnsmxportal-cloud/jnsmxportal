import { useState } from 'react'
import {
  Camera,
  Check,
  MapPin,
  Note,
  QrCode,
  Signature,
  Thermometer,
  X,
} from '@phosphor-icons/react'
import { useAuth } from '../../auth/AuthProvider'
import { useToast } from '../../components/Toast'
import { categoryOptions, useCategories } from '../../data/categories'
import {
  recurrenceSummary,
  useSaveTemplate,
  type ChecklistDef,
  type Recurrence,
  type TaskTemplate,
} from '../../data/admin'
import TimeField, { HoursField } from '../../components/TimeField'
import ChecklistEditor from '../../components/ChecklistEditor'

const prios = ['low', 'medium', 'high', 'critical'] as const
const freqs: { id: Recurrence['freq'] | 'none'; label: string }[] = [
  { id: 'none', label: 'No schedule' },
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'biweekly', label: 'Every 2 weeks' },
  { id: 'month_end', label: 'Month-end' },
  { id: 'on_clock_in', label: 'On clock-in' },
]
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/**
 * Hours-after-deadline for a template: the stored value, or derived from a legacy absolute
 * escalate_at (wrapping past midnight), or null when the template never escalates.
 */
function legacyEscalateHours(r: Recurrence | null | undefined): number | null {
  if (!r) return null
  if (typeof r.escalate_after_hours === 'number') return r.escalate_after_hours
  if (!r.escalate_at) return null
  const base = r.deadline ?? r.times?.[0]
  if (!base) return null
  const mins = (s: string) => {
    const [h, m] = s.split(':').map(Number)
    return h * 60 + m
  }
  const diff = mins(r.escalate_at) - mins(base)
  return Math.max(0, Math.round((diff < 0 ? diff + 1440 : diff) / 60))
}

/** today's local date as YYYY-MM-DD (default biweekly anchor) */
function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const evidenceDefs = [
  { k: 'photo', label: 'Photo', Icon: Camera },
  { k: 'temp', label: 'Temperature log', Icon: Thermometer },
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
  const { data: categories } = useCategories()

  const [title, setTitle] = useState(template?.title ?? '')
  const [description, setDescription] = useState(template?.description ?? '')
  const [category, setCategory] = useState<string>(template?.category ?? 'daily')
  const [priority, setPriority] = useState<(typeof prios)[number]>(template?.priority ?? 'medium')
  // store scope: [] = chain-wide, otherwise the checked store ids
  const [storeIds, setStoreIds] = useState<string[]>(
    template?.store_ids?.length
      ? template.store_ids
      : template?.store_id
        ? [template.store_id]
        : [],
  )
  const chainWide = storeIds.length === 0
  const toggleStore = (id: string) =>
    setStoreIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  const [evidence, setEvidence] = useState<Record<string, boolean>>(
    (template?.evidence as Record<string, boolean>) ?? {},
  )
  const [geoPolicy, setGeoPolicy] = useState(template?.geofence_policy ?? 'none')
  const [requiresApproval, setRequiresApproval] = useState(template?.requires_approval ?? true)
  // temperature logs open the readings screen (store chillers/freezers) instead of the checklist runner
  const [isTempLog, setIsTempLog] = useState(template?.is_temperature_log ?? false)
  const [freq, setFreq] = useState<Recurrence['freq'] | 'none'>(template?.recurrence?.freq ?? 'none')
  const [times, setTimes] = useState<string[]>(template?.recurrence?.times ?? [])
  const [exceptDays, setExceptDays] = useState<number[]>(template?.recurrence?.except_days ?? [])
  const [byweekday, setByweekday] = useState<number[]>(template?.recurrence?.byweekday ?? [])
  // biweekly: the week containing this date is the first run week
  const [anchor, setAnchor] = useState(template?.recurrence?.anchor ?? todayIso())
  const [deadline, setDeadline] = useState(template?.recurrence?.deadline ?? '')
  // hours after the deadline before the task is marked missed + escalated; null = never
  const [escalateAfter, setEscalateAfter] = useState<number | null>(
    legacyEscalateHours(template?.recurrence),
  )
  const [deadlineRel, setDeadlineRel] = useState(template?.recurrence?.deadline_rel ?? 'shift_end')
  const [items, setItems] = useState<ChecklistDef[]>(template?.checklist ?? [])

  const buildRecurrence = (): Recurrence | null => {
    if (freq === 'none') return null
    const r: Recurrence = { freq }
    if (freq === 'daily' || freq === 'weekly' || freq === 'biweekly') {
      if (times.length) r.times = [...times].sort()
      if (deadline) r.deadline = deadline
      if (escalateAfter !== null) r.escalate_after_hours = escalateAfter
      if (freq === 'daily' && exceptDays.length) r.except_days = exceptDays
      if (freq === 'weekly' || freq === 'biweekly') r.byweekday = byweekday
      if (freq === 'biweekly') r.anchor = anchor || todayIso()
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
        store_ids: chainWide ? null : storeIds,
        evidence: { ...evidence, temp: isTempLog },
        geofence_policy: geoPolicy,
        recurrence: buildRecurrence(),
        // a temp log has no checklist: its rows come from the store's unit registry
        checklist: isTempLog ? [] : items.filter((i) => i.label.trim()),
        requires_approval: requiresApproval,
        is_temperature_log: isTempLog,
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
          </div>
          <div>
            <label className={label}>Store scope</label>
            <div className="flex flex-wrap gap-2">
              <label
                className={`flex cursor-pointer items-center gap-2 rounded-[10px] border px-3 py-2 text-xs font-semibold ${
                  chainWide ? 'border-brand bg-brand-tint text-brand-dark' : 'border-ink/15 bg-white text-slate'
                }`}
              >
                <input
                  type="checkbox"
                  checked={chainWide}
                  onChange={() => setStoreIds([])}
                  className="accent-[#FF5A2D]"
                />
                All stores (chain-wide)
              </label>
              {stores.map((s) => {
                const on = storeIds.includes(s.id)
                return (
                  <label
                    key={s.id}
                    className={`flex cursor-pointer items-center gap-2 rounded-[10px] border px-3 py-2 text-xs font-semibold ${
                      on ? 'border-brand bg-brand-tint text-brand-dark' : 'border-ink/15 bg-white text-slate'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggleStore(s.id)}
                      className="accent-[#FF5A2D]"
                    />
                    {s.name}
                  </label>
                )
              })}
            </div>
            <div className="mt-1.5 text-[11px] text-muted">
              {chainWide
                ? 'Scheduled at every store, including any added later.'
                : `Scheduled at ${storeIds.length} of ${stores.length} stores. Untick all to make it chain-wide.`}
            </div>
          </div>
          <div>
            <label className={label}>Instructions</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} className={`${inputCls} h-16 resize-none`} placeholder="Shown to staff at the top of the task" />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={label}>Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls}>
                {categoryOptions(categories, category).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
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
            {(freq === 'daily' || freq === 'weekly' || freq === 'biweekly') && (
              <div className="flex flex-col gap-2.5 rounded-xl bg-canvas p-3">
                {(freq === 'weekly' || freq === 'biweekly') && (
                  <div>
                    <div className="mb-1.5 text-[11px] font-semibold text-slate">Days</div>
                    {weekdayToggles(byweekday, setByweekday)}
                  </div>
                )}
                {freq === 'biweekly' && (
                  <div>
                    <div className="mb-1 text-[11px] font-semibold text-slate">First week</div>
                    <input
                      type="date"
                      value={anchor}
                      onChange={(e) => setAnchor(e.target.value)}
                      className={`${inputCls} sm:max-w-[220px]`}
                    />
                    <div className="mt-1 text-[11px] text-muted">
                      Runs on the chosen days in the week containing this date, then every other week after it.
                    </div>
                  </div>
                )}
                {freq === 'daily' && (
                  <div>
                    <div className="mb-1.5 text-[11px] font-semibold text-slate">Except days</div>
                    {weekdayToggles(exceptDays, setExceptDays)}
                  </div>
                )}
                <div>
                  <div className="mb-1 text-[11px] font-semibold text-slate">Times</div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {times.map((t) => (
                      <span
                        key={t}
                        className="flex items-center gap-1 rounded-[10px] border border-brand bg-brand-tint px-2.5 py-1.5 text-xs font-semibold text-brand-dark"
                      >
                        {t}
                        <button
                          onClick={() => setTimes((a) => a.filter((x) => x !== t))}
                          aria-label={`Remove ${t}`}
                          className="rounded p-0.5 hover:text-danger"
                        >
                          <X size={11} weight="bold" />
                        </button>
                      </span>
                    ))}
                    <TimeField
                      value=""
                      onChange={(t) => t && setTimes((a) => (a.includes(t) ? a : [...a, t].sort()))}
                      placeholder="+ Add time"
                      label="Add a time"
                      className="rounded-[10px] border border-dashed border-ink/25 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate"
                    />
                  </div>
                  {times.length === 0 && (
                    <div className="mt-1 text-[11px] text-muted">A task is created at each time on every scheduled day.</div>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <div>
                    <div className="mb-1 text-[11px] font-semibold text-slate">Deadline</div>
                    <TimeField
                      value={deadline}
                      onChange={setDeadline}
                      clearable
                      placeholder="Same as the trigger time"
                      label="Deadline"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <div className="mb-1 text-[11px] font-semibold text-slate">Escalate after</div>
                    <HoursField value={escalateAfter} onChange={setEscalateAfter} className={inputCls} />
                    <div className="mt-1 text-[11px] text-muted">
                      Hours past the deadline before the task is marked missed and escalated to the Owner.
                    </div>
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
                {evidenceDefs.map((e) => {
                  // "Temperature log" switches the whole task to the readings screen (is_temperature_log);
                  // the other chips are plain evidence requirements
                  const on = e.k === 'temp' ? isTempLog : !!evidence[e.k]
                  const toggle = () =>
                    e.k === 'temp'
                      ? setIsTempLog((v) => !v)
                      : setEvidence((ev) => ({ ...ev, [e.k]: !ev[e.k] }))
                  return (
                    <button key={e.k} onClick={toggle} className={`${chip(on)} flex items-center gap-1`}>
                      <e.Icon size={13} /> {e.label}
                    </button>
                  )
                })}
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

          {isTempLog ? (
            <div className="rounded-xl border border-dashed border-danger/40 bg-danger-soft/40 p-4 text-[11.5px] text-slate">
              <div className="mb-0.5 flex items-center gap-1.5 font-semibold">
                <Thermometer size={13} /> Temperature log
              </div>
              Staff record a reading for every chiller and freezer in the store's unit registry (Admin → Units)
              instead of ticking checklist items. Breaches above a unit's threshold escalate automatically.
              {items.length > 0 && ' Existing checklist items will be dropped when you save.'}
            </div>
          ) : (
            <ChecklistEditor items={items} onChange={setItems} />
          )}
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
