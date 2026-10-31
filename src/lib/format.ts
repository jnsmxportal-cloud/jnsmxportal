import { differenceInMinutes, format, isToday, isTomorrow } from 'date-fns'

export function timeAgo(iso: string): string {
  const mins = differenceInMinutes(new Date(), new Date(iso))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return format(new Date(iso), 'd MMM')
}

export function dueLabel(t: { due_at: string | null; status: string }): {
  text: string
  overdue: boolean
} {
  if (t.status === 'missed') return { text: 'Missed cutoff', overdue: true }
  if (!t.due_at) return { text: 'No deadline', overdue: false }
  const due = new Date(t.due_at)
  const mins = differenceInMinutes(due, new Date())
  if (mins < 0) {
    const late = -mins
    const text = late < 60 ? `${late}m overdue` : `${Math.floor(late / 60)}h overdue`
    return { text, overdue: true }
  }
  if (isToday(due)) return { text: `Due ${format(due, 'HH:mm')}`, overdue: false }
  return { text: `Due ${format(due, 'EEE d MMM HH:mm')}`, overdue: false }
}

/** Section heading for a due date: Today / Tomorrow (with the date as a subtitle) or the weekday + date. */
export function dateGroupLabel(iso: string): { title: string; sub: string | null; isToday: boolean } {
  const d = new Date(iso)
  if (isToday(d)) return { title: 'Today', sub: format(d, 'EEE d MMM'), isToday: true }
  if (isTomorrow(d)) return { title: 'Tomorrow', sub: format(d, 'EEE d MMM'), isToday: false }
  return { title: format(d, 'EEEE d MMM'), sub: null, isToday: false }
}

export function todayLabel(): string {
  return format(new Date(), 'EEEE d MMMM yyyy')
}
