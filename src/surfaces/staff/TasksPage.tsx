import { useMemo } from 'react'
import { format } from 'date-fns'
import { useMyTasks } from '../../data/hooks'
import { dateGroupLabel, dueLabel } from '../../lib/format'
import type { TaskInstance } from '../../lib/types'
import { TaskRow } from './Home'

interface Group {
  key: string
  title: string
  sub: string | null
  tone: 'danger' | 'brand' | 'default'
  tasks: TaskInstance[]
}

/**
 * My Tasks, grouped by due date: Overdue first, then Today, Tomorrow, later dates in order,
 * and finally tasks with no deadline. Rows show the due time on the right.
 */
export default function TasksPage() {
  const { data: myTasks } = useMyTasks()

  const groups = useMemo<Group[]>(() => {
    const byDue = (a: TaskInstance, b: TaskInstance) =>
      (a.due_at ?? '9999').localeCompare(b.due_at ?? '9999')
    const all = [...(myTasks ?? [])].sort(byDue)
    const overdue = all.filter((t) => dueLabel(t).overdue)
    const rest = all.filter((t) => !dueLabel(t).overdue)

    const out: Group[] = []
    if (overdue.length)
      out.push({ key: 'overdue', title: 'Overdue', sub: 'Needs attention first', tone: 'danger', tasks: overdue })

    const dated = new Map<string, Group>()
    const undated: TaskInstance[] = []
    for (const t of rest) {
      if (!t.due_at) {
        undated.push(t)
        continue
      }
      const day = format(new Date(t.due_at), 'yyyy-MM-dd')
      let g = dated.get(day)
      if (!g) {
        const { title, sub, isToday } = dateGroupLabel(t.due_at)
        g = { key: day, title, sub, tone: isToday ? 'brand' : 'default', tasks: [] }
        dated.set(day, g)
      }
      g.tasks.push(t)
    }
    out.push(...[...dated.values()].sort((a, b) => a.key.localeCompare(b.key)))
    if (undated.length)
      out.push({ key: 'none', title: 'No deadline', sub: 'Do when you have a moment', tone: 'default', tasks: undated })
    return out
  }, [myTasks])

  const total = myTasks?.length ?? 0

  return (
    <div className="animate-fade px-[18px] pb-5 pt-4">
      <h2 className="mb-1 text-[21px] font-extrabold tracking-tight">My Tasks</h2>
      <div className="mb-4 text-xs text-muted">
        {total === 0 ? 'Nothing open' : `${total} open · grouped by due date · overdue first`}
      </div>

      <div className="flex flex-col gap-5">
        {groups.map((g) => (
          <section key={g.key}>
            <div className="mb-2 flex items-baseline justify-between px-0.5">
              <div className="flex items-baseline gap-2">
                <span
                  className={`text-[13px] font-bold ${
                    g.tone === 'danger' ? 'text-danger' : g.tone === 'brand' ? 'text-brand-dark' : 'text-ink'
                  }`}
                >
                  {g.title}
                </span>
                {g.sub && <span className="text-[11px] text-muted">{g.sub}</span>}
              </div>
              <span
                className={`rounded-full px-2 py-px text-[10.5px] font-bold ${
                  g.tone === 'danger' ? 'bg-danger-soft text-danger' : 'bg-white text-slate'
                }`}
              >
                {g.tasks.length}
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {g.tasks.map((t) => (
                <TaskRow key={t.id} t={t} variant="grouped" />
              ))}
            </div>
          </section>
        ))}
        {total === 0 && (
          <div className="rounded-[14px] border border-line bg-white p-6 text-center text-xs text-muted">
            No open tasks assigned to you.
          </div>
        )}
      </div>
    </div>
  )
}
