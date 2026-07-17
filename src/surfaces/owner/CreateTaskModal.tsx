import { useState } from 'react'
import {
  Camera,
  Check,
  ClipboardText,
  QrCode,
  Signature,
  Thermometer,
  X,
} from '@phosphor-icons/react'
import { useAuth } from '../../auth/AuthProvider'
import { useCreateTask, useProfiles } from '../../data/hooks'
import { useToast } from '../../components/Toast'

const types = [
  { label: 'Checklist', cat: 'daily' },
  { label: 'Temperature log', cat: 'daily' },
  { label: 'Delivery', cat: 'delivery' },
  { label: 'Cleaning', cat: 'weekly' },
  { label: 'Maintenance', cat: 'maintenance' },
  { label: 'Custom', cat: 'ad_hoc' },
]
const prios = ['low', 'medium', 'high'] as const
const evidenceDefs = [
  { k: 'photo', label: 'Photo', Icon: Camera },
  { k: 'temp', label: 'Temperature', Icon: Thermometer },
  { k: 'qr', label: 'QR scan', Icon: QrCode },
  { k: 'signature', label: 'Signature', Icon: Signature },
]

export default function CreateTaskModal({ onClose }: { onClose: () => void }) {
  const { stores } = useAuth()
  const { data: profiles } = useProfiles()
  const create = useCreateTask()
  const toast = useToast()

  const [title, setTitle] = useState('')
  const [type, setType] = useState(types[0])
  const [storeSel, setStoreSel] = useState<string>('all')
  const [assignee, setAssignee] = useState<string>('')
  const [due, setDue] = useState<string>('')
  const [prio, setPrio] = useState<(typeof prios)[number]>('medium')
  const [evidence, setEvidence] = useState<Record<string, boolean>>({ photo: true, signature: true })

  const save = () => {
    const storeIds = storeSel === 'all' ? stores.map((s) => s.id) : [storeSel]
    create.mutate(
      {
        title: title || 'Untitled task',
        storeIds,
        assignedTo: assignee || null,
        dueAt: due ? new Date(due).toISOString() : null,
        priority: prio,
        category: type.cat,
        evidence,
      },
      {
        onSuccess: () => {
          toast(
            `Task “${title || 'Untitled task'}” created · assigned to ${
              storeSel === 'all' ? 'all stores' : stores.find((s) => s.id === storeSel)?.name
            }`,
          )
          onClose()
        },
        onError: (e) => toast(e.message, 'error'),
      },
    )
  }

  const inputCls =
    'w-full rounded-xl border-[1.5px] border-ink/15 p-3 text-sm outline-none focus:border-brand bg-white'
  const label = 'mb-1.5 block text-xs font-semibold text-slate'

  return (
    <div onClick={onClose} className="fixed inset-0 z-[80] flex items-center justify-center bg-navy/50 p-6">
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[88vh] w-[540px] max-w-full animate-fade flex-col overflow-hidden rounded-[20px] bg-white shadow-[0_30px_80px_rgba(0,0,0,.3)]"
      >
        <div className="flex items-center gap-3 border-b border-line px-6 py-5">
          <div className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-brand-soft">
            <ClipboardText size={20} weight="fill" color="#FF5A2D" />
          </div>
          <div className="flex-1">
            <h3 className="font-display text-[17px] font-bold">Create task</h3>
            <div className="text-xs text-muted">Assign a one-off or recurring task to a store or person</div>
          </div>
          <button onClick={onClose} className="p-1 text-muted">
            <X size={20} />
          </button>
        </div>

        <div className="flex flex-col gap-4 overflow-y-auto px-6 py-5">
          <div>
            <label className={label}>Task title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Check backroom fridge door seals"
              className={inputCls}
            />
          </div>
          <div>
            <label className={label}>Task type</label>
            <div className="flex flex-wrap gap-2">
              {types.map((t) => (
                <button
                  key={t.label}
                  onClick={() => setType(t)}
                  className={`rounded-[10px] border px-3 py-2 text-xs font-semibold ${
                    type.label === t.label
                      ? 'border-brand bg-brand-tint text-brand-dark'
                      : 'border-ink/15 bg-white text-slate'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <div>
              <label className={label}>Store</label>
              <select value={storeSel} onChange={(e) => setStoreSel(e.target.value)} className={inputCls}>
                <option value="all">All stores</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
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
          <div>
            <label className={label}>Priority</label>
            <div className="flex gap-1.5">
              {prios.map((p) => (
                <button
                  key={p}
                  onClick={() => setPrio(p)}
                  className={`rounded-[10px] border px-4 py-2 text-xs font-semibold capitalize ${
                    prio === p
                      ? 'border-brand bg-brand-tint text-brand-dark'
                      : 'border-ink/15 bg-white text-slate'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className={label}>Required evidence</label>
            <div className="flex flex-wrap gap-2">
              {evidenceDefs.map((e) => (
                <button
                  key={e.k}
                  onClick={() => setEvidence((ev) => ({ ...ev, [e.k]: !ev[e.k] }))}
                  className={`flex items-center gap-1.5 rounded-[10px] border px-3 py-2 text-xs font-semibold ${
                    evidence[e.k]
                      ? 'border-brand bg-brand-tint text-brand-dark'
                      : 'border-ink/15 bg-white text-slate'
                  }`}
                >
                  <e.Icon size={15} /> {e.label}
                </button>
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
