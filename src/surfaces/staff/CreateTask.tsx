import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft } from '@phosphor-icons/react'
import { useAuth } from '../../auth/AuthProvider'
import { useCreateTask } from '../../data/hooks'
import { categoryOptions, useCategories } from '../../data/categories'
import { useToast } from '../../components/Toast'
import { useStaffStore } from './StaffShell'
import type { TaskCategory } from '../../lib/types'
import { DateTimeField } from '../../components/TimeField'

const prios = ['low', 'medium', 'high'] as const

export default function CreateTask() {
  const navigate = useNavigate()
  const toast = useToast()
  const { session } = useAuth()
  const store = useStaffStore()
  const create = useCreateTask()
  const { data: categories } = useCategories()
  const prefill = (useLocation().state ?? {}) as { title?: string; category?: string }
  const [title, setTitle] = useState(prefill.title ?? '')
  // home-screen tiles pass a category; otherwise a staff task is ad-hoc
  const [category, setCategory] = useState<TaskCategory>(prefill.category ?? 'ad_hoc')
  const [prio, setPrio] = useState<(typeof prios)[number]>('medium')
  const [due, setDue] = useState('')

  const save = () => {
    if (!store) {
      toast('No store assigned to your account', 'error')
      return
    }
    create.mutate(
      {
        title: title || 'Untitled task',
        storeIds: [store.id],
        assignedTo: session!.user.id,
        dueAt: due ? new Date(due).toISOString() : null,
        priority: prio,
        category,
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
          <label className={label}>Due date</label>
          <DateTimeField value={due} onChange={setDue} className={inputCls} />
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
