import { useMyTasks } from '../../data/hooks'
import { dueLabel } from '../../lib/format'
import { TaskRow } from './Home'

export default function TasksPage() {
  const { data: myTasks } = useMyTasks()
  const sorted = [...(myTasks ?? [])].sort((a, b) => {
    const ao = dueLabel(a).overdue ? 0 : 1
    const bo = dueLabel(b).overdue ? 0 : 1
    if (ao !== bo) return ao - bo
    return (a.due_at ?? '9999').localeCompare(b.due_at ?? '9999')
  })

  return (
    <div className="animate-fade px-[18px] pb-5 pt-4">
      <h2 className="mb-1 text-[21px] font-extrabold tracking-tight">My Tasks</h2>
      <div className="mb-4 text-xs text-muted">Today · overdue first</div>
      <div className="flex flex-col gap-2">
        {sorted.map((t) => (
          <TaskRow key={t.id} t={t} />
        ))}
        {sorted.length === 0 && (
          <div className="rounded-[14px] border border-line bg-white p-6 text-center text-xs text-muted">
            No open tasks assigned to you.
          </div>
        )}
      </div>
    </div>
  )
}
