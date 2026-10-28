import { useMemo, useState } from 'react'
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
import { recurrenceSummary, useTemplates, type TaskTemplate } from '../../data/admin'
import { useToast } from '../../components/Toast'
import type { TaskCategory, TaskPriority } from '../../lib/types'

const CUSTOM = 'custom'
const cats: { id: TaskCategory; label: string }[] = [
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'ad_hoc', label: 'Ad-hoc' },
  { id: 'incident', label: 'Incident' },
  { id: 'delivery', label: 'Delivery' },
  { id: 'maintenance', label: 'Maintenance' },
]
const prios: TaskPriority[] = ['low', 'medium', 'high', 'critical']
const evidenceDefs = [
  { k: 'photo', label: 'Photo', Icon: Camera },
  { k: 'temp', label: 'Temperature', Icon: Thermometer },
  { k: 'qr', label: 'QR scan', Icon: QrCode },
  { k: 'signature', label: 'Signature', Icon: Signature },
  { k: 'note', label: 'Note', Icon: Note },
  { k: 'geofence', label: 'Geofence', Icon: MapPin },
] as const

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

export default function CreateTaskModal({ onClose }: { onClose: () => void }) {
  const { stores } = useAuth()
  const { data: profiles } = useProfiles()
  const { data: templates } = useTemplates()
  const create = useCreateTask()
  const toast = useToast()

  const [templateId, setTemplateId] = useState<string>(CUSTOM)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<TaskCategory>('ad_hoc')
  const [storeSel, setStoreSel] = useState<string>('all')
  const [assignee, setAssignee] = useState<string>('')
  const [due, setDue] = useState<string>('')
  const [prio, setPrio] = useState<TaskPriority>('medium')
  const [evidence, setEvidence] = useState<Record<string, boolean>>({})
  const [needsReview, setNeedsReview] = useState(true)

  const template =
    templateId === CUSTOM ? null : ((templates ?? []).find((t) => t.id === templateId) ?? null)

  // templates usable for the selected store (chain-wide ones always qualify)
  const visibleTemplates = useMemo(
    () =>
      (templates ?? []).filter((t) => {
        const scope = templateStores(t)
        return storeSel === 'all' || scope.length === 0 || scope.includes(storeSel)
      }),
    [templates, storeSel],
  )

  const pickTemplate = (t: TaskTemplate | null) => {
    if (!t) {
      setTemplateId(CUSTOM)
      return
    }
    setTemplateId(t.id)
    setTitle(t.title)
    setDescription(t.description ?? '')
    setCategory(t.category)
    setPrio(t.priority)
    setEvidence({ ...(t.evidence as Record<string, boolean>) })
    setNeedsReview(t.requires_approval ?? true)
  }

  const onStoreChange = (v: string) => {
    setStoreSel(v)
    // drop a template that is not scoped to the newly chosen store
    if (template && v !== 'all') {
      const scope = templateStores(template)
      if (scope.length && !scope.includes(v)) setTemplateId(CUSTOM)
    }
  }

  const save = () => {
    const scope = template ? templateStores(template) : []
    const storeIds =
      storeSel === 'all'
        ? scope.length
          ? scope.filter((id) => stores.some((s) => s.id === id))
          : stores.map((s) => s.id)
        : [storeSel]
    if (storeIds.length === 0) {
      toast('No store matches the scope of this template', 'error')
      return
    }
    const finalTitle = title.trim() || template?.title || 'Untitled task'
    create.mutate(
      {
        title: finalTitle,
        storeIds,
        assignedTo: assignee || null,
        dueAt: due ? new Date(due).toISOString() : null,
        priority: prio,
        category,
        evidence,
        templateId: template?.id ?? null,
        description: description.trim() || null,
        geofencePolicy: template?.geofence_policy ?? 'none',
        isTemperatureLog: template?.is_temperature_log ?? false,
        requiresApproval: needsReview,
      },
      {
        onSuccess: () => {
          const where =
            storeSel === 'all'
              ? storeIds.length === stores.length
                ? 'all stores'
                : `${storeIds.length} store${storeIds.length === 1 ? '' : 's'}`
              : stores.find((s) => s.id === storeSel)?.name
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
        className="flex max-h-[88vh] w-[560px] max-w-full animate-fade flex-col overflow-hidden rounded-[20px] bg-white shadow-[0_30px_80px_rgba(0,0,0,.3)]"
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
            <label className={label}>Store</label>
            <select value={storeSel} onChange={(e) => onStoreChange(e.target.value)} className={inputCls}>
              <option value="all">All stores</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={label}>Choose template</label>
            <div className="flex max-h-[220px] flex-col gap-1.5 overflow-y-auto rounded-xl border-[1.5px] border-ink/15 p-1.5">
              <button
                onClick={() => pickTemplate(null)}
                className={`flex items-center gap-2.5 rounded-[10px] border px-3 py-2 text-left ${
                  !template ? 'border-brand bg-brand-tint' : 'border-transparent hover:bg-canvas'
                }`}
              >
                <PencilSimple size={16} className="flex-none text-slate" />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold">Custom one-off</div>
                  <div className="text-[11px] text-muted">Blank task: title, due date and evidence only</div>
                </div>
              </button>
              {visibleTemplates.map((t) => (
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
                      <span className="rounded-full bg-canvas px-1.5 py-px text-[10px] font-semibold text-slate">
                        {t.category.replace('_', '-')}
                      </span>
                    </div>
                    <div className="truncate text-[11px] text-muted">
                      {t.checklist.length} item{t.checklist.length === 1 ? '' : 's'} · {scopeLabel(t)} ·{' '}
                      {recurrenceSummary(t.recurrence)}
                    </div>
                  </div>
                </button>
              ))}
              {templates && visibleTemplates.length === 0 && (
                <div className="px-3 py-2 text-[12px] text-muted">No templates are scoped to this store.</div>
              )}
            </div>
            {template && (
              <div className="mt-1.5 text-[11.5px] text-muted">
                Checklist items, geofence policy{template.is_temperature_log ? ' and temperature readings' : ''}{' '}
                come from the template. Edit them in Admin → Templates.
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
            <label className={label}>Instructions (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Shown to staff at the top of the task"
              className={`${inputCls} h-16 resize-none`}
            />
          </div>

          {!template && (
            <div>
              <label className={label}>Category</label>
              <div className="flex flex-wrap gap-2">
                {cats.map((c) => (
                  <button key={c.id} onClick={() => setCategory(c.id)} className={chip(category === c.id)}>
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          )}

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
              <input
                type="datetime-local"
                value={due}
                onChange={(e) => setDue(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>

          <div>
            <label className={label}>Priority</label>
            <div className="flex flex-wrap gap-1.5">
              {prios.map((p) => (
                <button key={p} onClick={() => setPrio(p)} className={`${chip(prio === p)} px-4 capitalize`}>
                  {p}
                </button>
              ))}
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

          <div>
            <label className={label}>Required evidence</label>
            <div className="flex flex-wrap gap-2">
              {evidenceDefs.map((e) => (
                <button
                  key={e.k}
                  onClick={() => setEvidence((ev) => ({ ...ev, [e.k]: !ev[e.k] }))}
                  className={`flex items-center gap-1.5 ${chip(!!evidence[e.k])}`}
                >
                  <e.Icon size={15} /> {e.label}
                </button>
              ))}
            </div>
            {template && template.checklist.length > 0 && (
              <div className="mt-1.5 text-[11.5px] text-muted">
                Photo, temperature and QR checks are enforced per checklist item as set in the template.
              </div>
            )}
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
            onClick={save}
            disabled={create.isPending}
            className="flex flex-[2] items-center justify-center gap-2 rounded-xl bg-brand p-3 text-[13.5px] font-semibold text-white disabled:opacity-60"
          >
            <Check size={15} weight="bold" /> Create &amp; assign
          </button>
        </div>
      </div>
    </div>
  )
}
