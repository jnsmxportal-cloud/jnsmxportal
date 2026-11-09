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
  type TaskTemplate,
} from '../../data/admin'
import ScheduleEditor, { buildRecurrence, scheduleDraft } from '../../components/ScheduleEditor'
import ChecklistEditor from '../../components/ChecklistEditor'

const prios = ['low', 'medium', 'high', 'critical'] as const
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
  const [schedule, setSchedule] = useState(() => scheduleDraft(template?.recurrence))
  const [items, setItems] = useState<ChecklistDef[]>(template?.checklist ?? [])

  const doSave = () => {
    if (schedule.freq === 'once' && !schedule.onceDue) {
      toast('Pick a due date & time for the one-off task, or choose “No schedule”.', 'error')
      return
    }
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
        recurrence: buildRecurrence(schedule),
        // a temp log has no checklist: its rows come from the store's unit registry
        checklist: isTempLog ? [] : items.filter((i) => i.label.trim()),
        requires_approval: requiresApproval,
        is_temperature_log: isTempLog,
      },
      {
        onSuccess: () => {
          toast(
            schedule.freq === 'once'
              ? `Template “${title || 'Untitled'}” saved — the one-off task appears for staff within a minute`
              : `Template “${title || 'Untitled'}” saved — the scheduler picks it up within a minute`,
          )
          onClose()
        },
        onError: (e) => toast(e.message, 'error'),
      },
    )
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-navy/50 p-3 sm:p-6">
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92dvh] w-[680px] max-w-full animate-fade flex-col overflow-hidden rounded-[20px] bg-white shadow-[0_30px_80px_rgba(0,0,0,.3)]"
      >
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <div>
            <h3 className="font-display text-[17px] font-bold">
              {template ? 'Edit template' : 'New template'}
            </h3>
            <div className="text-xs text-muted">{recurrenceSummary(buildRecurrence(schedule))}</div>
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
            <ScheduleEditor
              value={schedule}
              onChange={setSchedule}
              onceHint="Creates this task once, for every store in scope, as soon as you save. Staff see it under its due date; it does not repeat."
            >
              {schedule.freq === 'once' && template?.recurrence?.freq === 'once' && (
                <div className="mt-2.5 rounded-lg border border-line bg-white px-3 py-2 text-[11.5px] text-slate">
                  Changing the date re-times the task if it is still open. A completed one-off does not run again —
                  use <b>Run now</b> or the dashboard <b>New task</b> button for a repeat.
                </div>
              )}
            </ScheduleEditor>
          </div>

          <div>
            <label className={label}>Upon submit</label>
            <div className="flex flex-wrap gap-1.5">
              <button onClick={() => setRequiresApproval(true)} className={chip(requiresApproval)}>
                Needs review
              </button>
              <button onClick={() => setRequiresApproval(false)} className={chip(!requiresApproval)}>
                Completes immediately
              </button>
            </div>
            <div className="mt-1.5 text-[11.5px] text-muted">
              {requiresApproval
                ? 'Goes to the approvals queue for a Team Leader, Manager or Owner to sign off.'
                : 'Marked completed as soon as staff submit — no sign-off step.'}
            </div>
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
            </div>
          </div>

          {isTempLog ? (
            <div className="rounded-xl border border-dashed border-danger/40 bg-danger-soft/40 p-4 text-[11.5px] text-slate">
              <div className="mb-0.5 flex items-center gap-1.5 font-semibold">
                <Thermometer size={13} /> Temperature log
              </div>
              Staff record a reading for every chiller and freezer in the store's unit registry (Admin → Units)
              instead of ticking checklist items. Breaches above a unit's threshold escalate automatically.
              {evidence.photo && ' Photo evidence is on, so staff must photograph every unit’s display before they can submit.'}
              {evidence.qr && ' QR is on, so each unit’s reading is unlocked only by scanning that unit’s own QR label (Admin → Units), in order — nothing can be skipped.'}
              {items.length > 0 && ' Existing checklist items will be dropped when you save.'}
            </div>
          ) : (
            <ChecklistEditor
              items={items}
              onChange={setItems}
              hint={
                evidence.photo
                  ? 'Photo evidence is on, so staff must attach at least one photo of the finished task before they can submit. Camera toggles below require a photo per item.'
                  : 'Photo, temperature and QR checks are enforced per item.'
              }
            />
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
