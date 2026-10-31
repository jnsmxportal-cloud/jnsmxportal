import { useState } from 'react'
import {
  Camera,
  Check,
  ClipboardText,
  ListChecks,
  MapPin,
  Note,
  PencilSimple,
  QrCode,
  Signature,
  Thermometer,
  X,
} from '@phosphor-icons/react'
import { useAuth } from '../../auth/AuthProvider'
import { useCreateTask, useProfiles } from '../../data/hooks'
import { recurrenceSummary, useTemplates, type ChecklistDef, type TaskTemplate } from '../../data/admin'
import { useToast } from '../../components/Toast'
import { categoryMeta, categoryOptions, useCategories } from '../../data/categories'
import type { TaskCategory, TaskPriority } from '../../lib/types'
import { DateTimeField } from '../../components/TimeField'
import ChecklistEditor from '../../components/ChecklistEditor'

const CUSTOM = 'custom'
const prios: TaskPriority[] = ['low', 'medium', 'high', 'critical']
const evidenceDefs = [
  { k: 'photo', label: 'Photo', Icon: Camera },
  { k: 'temp', label: 'Temperature log', Icon: Thermometer },
  { k: 'qr', label: 'QR scan', Icon: QrCode },
  { k: 'signature', label: 'Signature', Icon: Signature },
  { k: 'note', label: 'Note', Icon: Note },
  { k: 'geofence', label: 'Geofence', Icon: MapPin },
] as const
type GeoPolicy = 'none' | 'flag' | 'block'

const inputCls =
  'w-full rounded-xl border-[1.5px] border-ink/15 p-3 text-sm outline-none focus:border-brand bg-white'
const label = 'mb-1.5 block text-xs font-semibold text-slate'
const chip = (active: boolean) =>
  `rounded-[10px] border px-3 py-2 text-xs font-semibold ${
    active ? 'border-brand bg-brand-tint text-brand-dark' : 'border-ink/15 bg-white text-slate'
  }`

/** store ids a template is scoped to ([] = chain-wide) */
function templateStores(t: TaskTemplate): string[] {
  return t.store_ids?.length ? t.store_ids : t.store_id ? [t.store_id] : []
}

/**
 * Create a one-off task. Picking a template copies every template field into the form
 * (title, stores, instructions, category, priority, evidence, geofence policy, review flag,
 * checklist items); all of them stay editable and apply to this task only — the template
 * itself is never changed. Schedule has no equivalent here: a one-off task has a due date.
 */
export default function CreateTaskModal({ onClose }: { onClose: () => void }) {
  const { stores } = useAuth()
  const { data: profiles } = useProfiles()
  const { data: templates } = useTemplates()
  const { data: categories } = useCategories()
  const create = useCreateTask()
  const toast = useToast()

  const allStoreIds = stores.map((s) => s.id)
  const [templateId, setTemplateId] = useState<string>(CUSTOM)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<TaskCategory>('ad_hoc')
  const [storeIds, setStoreIds] = useState<string[]>(allStoreIds)
  const [assignee, setAssignee] = useState<string>('')
  const [due, setDue] = useState<string>('')
  const [prio, setPrio] = useState<TaskPriority>('medium')
  const [evidence, setEvidence] = useState<Record<string, boolean>>({})
  // readings screen instead of a checklist
  const [isTempLog, setIsTempLog] = useState(false)
  const [needsReview, setNeedsReview] = useState(true)
  const [geoPolicy, setGeoPolicy] = useState<GeoPolicy>('none')
  const [items, setItems] = useState<ChecklistDef[]>([])

  const template =
    templateId === CUSTOM ? null : ((templates ?? []).find((t) => t.id === templateId) ?? null)

  const pickTemplate = (t: TaskTemplate | null) => {
    if (!t) {
      // blank one-off: back to defaults
      setTemplateId(CUSTOM)
      setTitle('')
      setDescription('')
      setCategory('ad_hoc')
      setStoreIds(allStoreIds)
      setPrio('medium')
      setEvidence({})
      setIsTempLog(false)
      setNeedsReview(true)
      setGeoPolicy('none')
      setItems([])
      return
    }
    // copy every template field; the copies are edited freely for this task only
    const scope = templateStores(t).filter((id) => allStoreIds.includes(id))
    setTemplateId(t.id)
    setTitle(t.title)
    setDescription(t.description ?? '')
    setCategory(t.category)
    setStoreIds(scope.length ? scope : allStoreIds)
    setPrio(t.priority)
    const ev = { ...(t.evidence as Record<string, boolean>) }
    delete ev.temp
    setEvidence(ev)
    setIsTempLog(t.is_temperature_log)
    setNeedsReview(t.requires_approval ?? true)
    setGeoPolicy(t.geofence_policy ?? 'none')
    setItems((t.checklist ?? []).map((i) => ({ ...i })))
  }

  const toggleStore = (id: string) =>
    setStoreIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const save = () => {
    if (storeIds.length === 0) {
      toast('Pick at least one store', 'error')
      return
    }
    const finalTitle = title.trim() || template?.title || 'Untitled task'
    const checklist = isTempLog ? [] : items.filter((i) => i.label.trim())
    create.mutate(
      {
        title: finalTitle,
        storeIds,
        assignedTo: assignee || null,
        dueAt: due ? new Date(due).toISOString() : null,
        priority: prio,
        category,
        evidence: { ...evidence, temp: isTempLog },
        templateId: template?.id ?? null,
        description: description.trim() || null,
        geofencePolicy: geoPolicy,
        isTemperatureLog: isTempLog,
        requiresApproval: needsReview,
        checklist,
      },
      {
        onSuccess: () => {
          const where =
            storeIds.length === stores.length
              ? 'all stores'
              : storeIds.length === 1
                ? stores.find((s) => s.id === storeIds[0])?.name
                : `${storeIds.length} stores`
          toast(`Task “${finalTitle}” created · assigned to ${where}`)
          onClose()
        },
        onError: (e) => toast(e.message, 'error'),
      },
    )
  }

  const scopeLabel = (t: TaskTemplate) => {
    const ids = templateStores(t)
    if (ids.length === 0 || ids.length >= stores.length) return 'Chain-wide'
    const names = ids.map((id) => stores.find((s) => s.id === id)?.name).filter(Boolean)
    return names.length <= 2 ? names.join(' + ') : `${names.length} stores`
  }

  return (
    <div onClick={onClose} className="fixed inset-0 z-[80] flex items-center justify-center bg-navy/50 p-6">
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[88vh] w-[600px] max-w-full animate-fade flex-col overflow-hidden rounded-[20px] bg-white shadow-[0_30px_80px_rgba(0,0,0,.3)]"
      >
        <div className="flex items-center gap-3 border-b border-line px-6 py-5">
          <div className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-brand-soft">
            <ClipboardText size={20} weight="fill" color="#FF5A2D" />
          </div>
          <div className="flex-1">
            <h3 className="font-display text-[17px] font-bold">Create task</h3>
            <div className="text-xs text-muted">Start from a template or build a one-off task</div>
          </div>
          <button onClick={onClose} className="p-1 text-muted">
            <X size={20} />
          </button>
        </div>

        <div className="flex flex-col gap-4 overflow-y-auto px-6 py-5">
          <div>
            <label className={label}>Choose template</label>
            <div className="flex max-h-[200px] flex-col gap-1.5 overflow-y-auto rounded-xl border-[1.5px] border-ink/15 p-1.5">
              <button
                onClick={() => pickTemplate(null)}
                className={`flex items-center gap-2.5 rounded-[10px] border px-3 py-2 text-left ${
                  !template ? 'border-brand bg-brand-tint' : 'border-transparent hover:bg-canvas'
                }`}
              >
                <PencilSimple size={16} className="flex-none text-slate" />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold">Custom one-off</div>
                  <div className="text-[11px] text-muted">Blank task — fill in every detail below</div>
                </div>
              </button>
              {(templates ?? []).map((t) => (
                <button
                  key={t.id}
                  onClick={() => pickTemplate(t)}
                  className={`flex items-center gap-2.5 rounded-[10px] border px-3 py-2 text-left ${
                    template?.id === t.id ? 'border-brand bg-brand-tint' : 'border-transparent hover:bg-canvas'
                  }`}
                >
                  {t.is_temperature_log ? (
                    <Thermometer size={16} className="flex-none text-danger" />
                  ) : (
                    <ListChecks size={16} className="flex-none text-slate" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-[13px] font-semibold">
                      <span className="truncate">{t.title}</span>
                      <span
                        className="rounded-full px-1.5 py-px text-[10px] font-semibold"
                        style={{
                          background: categoryMeta(categories, t.category).b,
                          color: categoryMeta(categories, t.category).c,
                        }}
                      >
                        {categoryMeta(categories, t.category).name}
                      </span>
                    </div>
                    <div className="truncate text-[11px] text-muted">
                      {t.checklist.length} item{t.checklist.length === 1 ? '' : 's'} · {scopeLabel(t)} ·{' '}
                      {recurrenceSummary(t.recurrence)}
                    </div>
                  </div>
                </button>
              ))}
            </div>
            {template && (
              <div className="mt-1.5 text-[11.5px] text-muted">
                Everything below was copied from “{template.title}”. Change anything for this task only —
                the template itself is not modified.
              </div>
            )}
          </div>

          <div>
            <label className={label}>Task title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={template ? template.title : 'e.g. Check backroom fridge door seals'}
              className={inputCls}
            />
          </div>

          <div>
            <label className={label}>Stores</label>
            <div className="flex flex-wrap gap-1.5">
              {stores.map((s) => (
                <button key={s.id} onClick={() => toggleStore(s.id)} className={chip(storeIds.includes(s.id))}>
                  {s.name}
                </button>
              ))}
              {stores.length > 1 && (
                <button
                  onClick={() => setStoreIds(storeIds.length === stores.length ? [] : allStoreIds)}
                  className="rounded-[10px] px-2.5 py-2 text-xs font-semibold text-brand-dark"
                >
                  {storeIds.length === stores.length ? 'Clear' : 'All stores'}
                </button>
              )}
            </div>
            <div className="mt-1.5 text-[11.5px] text-muted">
              {storeIds.length === 0
                ? 'Pick at least one store.'
                : `One task is created per store (${storeIds.length} of ${stores.length}).`}
            </div>
          </div>

          <div>
            <label className={label}>Instructions (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Shown to staff at the top of the task"
              className={`${inputCls} h-16 resize-none`}
            />
          </div>

          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
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
                  <button key={p} onClick={() => setPrio(p)} className={`${chip(prio === p)} capitalize`}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <div>
              <label className={label}>Assign to</label>
              <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className={inputCls}>
                <option value="">Any on-shift</option>
                {(profiles ?? [])
                  .filter((p) => p.role === 'staff' || p.role === 'team_leader')
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className={label}>Due date &amp; time</label>
              <DateTimeField value={due} onChange={setDue} className={inputCls} />
            </div>
          </div>

          <div>
            <label className={label}>After submit</label>
            <div className="flex flex-wrap gap-1.5">
              <button onClick={() => setNeedsReview(true)} className={chip(needsReview)}>
                Needs review
              </button>
              <button onClick={() => setNeedsReview(false)} className={chip(!needsReview)}>
                Completes immediately
              </button>
            </div>
            <div className="mt-1.5 text-[11.5px] text-muted">
              {needsReview
                ? 'Goes to the approvals queue for a Team Leader, Manager or Owner to sign off.'
                : 'Marked completed as soon as staff submit — no sign-off step.'}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <div>
              <label className={label}>Required evidence</label>
              <div className="flex flex-wrap gap-1.5">
                {evidenceDefs.map((e) => {
                  // "Temperature log" switches the task to the readings screen; the rest are evidence flags
                  const isTemp = e.k === 'temp'
                  const on = isTemp ? isTempLog : !!evidence[e.k]
                  const toggle = () =>
                    isTemp ? setIsTempLog((v) => !v) : setEvidence((ev) => ({ ...ev, [e.k]: !ev[e.k] }))
                  return (
                    <button key={e.k} onClick={toggle} className={`flex items-center gap-1.5 ${chip(on)}`}>
                      <e.Icon size={14} /> {e.label}
                    </button>
                  )
                })}
              </div>
            </div>
            <div>
              <label className={label}>Geofence policy</label>
              <div className="flex flex-wrap gap-1.5">
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
              instead of ticking checklist items.
              {items.length > 0 && ' The checklist items below are not used.'}
            </div>
          ) : (
            <ChecklistEditor
              items={items}
              onChange={setItems}
              hint={
                template
                  ? 'Copied from the template — edits apply to this task only.'
                  : 'Photo, temperature and QR checks are enforced per item.'
              }
            />
          )}
        </div>

        <div className="flex gap-2.5 border-t border-line px-6 py-4">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-ink/15 bg-white p-3 text-[13.5px] font-semibold text-slate"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={create.isPending || storeIds.length === 0}
            className="flex flex-[2] items-center justify-center gap-2 rounded-xl bg-brand p-3 text-[13.5px] font-semibold text-white disabled:opacity-60"
          >
            <Check size={15} weight="bold" /> Create &amp; assign
          </button>
        </div>
      </div>
    </div>
  )
}
