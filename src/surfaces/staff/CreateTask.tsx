import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from '@phosphor-icons/react'
import { useAuth } from '../../auth/AuthProvider'
import { useCreateTask } from '../../data/hooks'
import { useToast } from '../../components/Toast'
import { useStaffStore } from './StaffShell'

const types = [
  { label: 'Checklist', cat: 'daily' },
  { label: 'Cleaning', cat: 'weekly' },
  { label: 'Maintenance', cat: 'maintenance' },
  { label: 'Staff note', cat: 'ad_hoc' },
]
const prios = ['low', 'medium', 'high'] as const

export default function CreateTask() {
  const navigate = useNavigate()
  const toast = useToast()
  const { session } = useAuth()
  const store = useStaffStore()
  const create = useCreateTask()
  const [title, setTitle] = useState('')
  const [type, setType] = useState(types[0])
  const [prio, setPrio] = useState<(typeof prios)[number]>('medium')
  const [due, setDue] = useState('')

  const save = () => {
    create.mutate(
      {
        title: title || 'Untitled task',
        storeIds: [store!.id],
        assignedTo: session!.user.id,
        dueAt: due ? new Date(due).toISOString() : null,
        priority: prio,
        category: type.cat,
        evidence: {},
      },
      {
        onSuccess: () =>
          navigate('/staff/success', {
            state: {
              icon: 'task',
              color: '#16B364',
              title: 'Task created',
              msg: 'Added to your task list and shared with your Team Leader for visibility.',
            },
          }),
        onError: (e) => toast(e.message, 'error'),
      },
    )
  }

  const label = 'mb-1.5 block text-xs font-semibold text-slate'
  const inputCls =
    'w-full rounded-xl border-[1.5px] border-ink/15 bg-white p-3 text-sm outline-none focus:border-brand'

  return (
    <div className="flex min-h-full flex-col bg-canvas">
      <div className="border-b border-line bg-white px-4 pb-3 pt-2">
        <div className="flex items-center gap-2.5">
          <button onClick={() => navigate('/staff')} className="p-1">
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1">
            <div className="text-[15.5px] font-bold">Create task</div>
            <div className="text-[11px] text-muted">Add an ad-hoc task or note</div>
          </div>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-4 p-4">
        <div>
          <label className={label}>Task title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Restock chilled drinks aisle"
            className={inputCls}
          />
        </div>
        <div>
          <label className={label}>Type</label>
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
        <div>
          <label className={label}>Due date</label>
          <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={label}>Priority</label>
          <div className="flex gap-1.5">
            {prios.map((p) => (
              <button
                key={p}
                onClick={() => setPrio(p)}
                className={`flex-1 rounded-[10px] border px-4 py-2 text-xs font-semibold capitalize ${
                  prio === p ? 'border-brand bg-brand-tint text-brand-dark' : 'border-ink/15 bg-white text-slate'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="sticky bottom-0 border-t border-line bg-white p-4">
        <button
          onClick={save}
          disabled={create.isPending}
          className="w-full rounded-[13px] bg-brand p-[15px] text-[15px] font-bold text-white disabled:opacity-60"
        >
          Create task
        </button>
      </div>
    </div>
  )
}
