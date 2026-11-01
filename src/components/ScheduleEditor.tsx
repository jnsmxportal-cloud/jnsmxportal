import type { ReactNode } from 'react'
import { X } from '@phosphor-icons/react'
import { escalateAfterHours, type Recurrence } from '../data/admin'
import TimeField, { DateTimeField, HoursField } from './TimeField'

export type ScheduleFreq = Recurrence['freq'] | 'none'

const FREQS: { id: ScheduleFreq; label: string }[] = [
  { id: 'none', label: 'No schedule' },
  { id: 'once', label: 'One-off' },
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'biweekly', label: 'Every 2 weeks' },
  { id: 'month_end', label: 'Month-end' },
  { id: 'on_clock_in', label: 'On clock-in' },
]
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const inputCls =
  'w-full rounded-xl border-[1.5px] border-ink/15 bg-white p-2.5 text-sm outline-none focus:border-brand'
const chip = (active: boolean) =>
  `rounded-[10px] border px-3 py-1.5 text-xs font-semibold ${
    active ? 'border-brand bg-brand-tint text-brand-dark' : 'border-ink/15 bg-white text-slate'
  }`

/** today's local date as YYYY-MM-DD (default biweekly anchor) */
export function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Form state behind the Schedule section; shared by the template editor and the create-task modal. */
export interface ScheduleDraft {
  freq: ScheduleFreq
  times: string[]
  exceptDays: number[]
  byweekday: number[]
  // biweekly: the week containing this date is the first run week
  anchor: string
  deadline: string
  // one-off: the local due date & time ('YYYY-MM-DDTHH:MM')
  onceDue: string
  // hours after the deadline before the task is marked missed + escalated; null = never
  escalateAfter: number | null
  deadlineRel: string
}

export function scheduleDraft(r: Recurrence | null | undefined): ScheduleDraft {
  return {
    freq: r?.freq ?? 'none',
    times: r?.times ?? [],
    exceptDays: r?.except_days ?? [],
    byweekday: r?.byweekday ?? [],
    anchor: r?.anchor ?? todayIso(),
    deadline: r?.deadline ?? '',
    onceDue: r?.due_at?.slice(0, 16) ?? '',
    escalateAfter: escalateAfterHours(r),
    deadlineRel: r?.deadline_rel ?? 'shift_end',
  }
}

export function buildRecurrence(d: ScheduleDraft): Recurrence | null {
  const { freq } = d
  if (freq === 'none') return null
  const r: Recurrence = { freq }
  if (freq === 'once') {
    if (d.onceDue) r.due_at = d.onceDue
    if (d.escalateAfter !== null) r.escalate_after_hours = d.escalateAfter
    return r
  }
  if (freq === 'daily' || freq === 'weekly' || freq === 'biweekly') {
    if (d.times.length) r.times = [...d.times].sort()
    if (d.deadline) r.deadline = d.deadline
    if (d.escalateAfter !== null) r.escalate_after_hours = d.escalateAfter
    if (freq === 'daily' && d.exceptDays.length) r.except_days = d.exceptDays
    if (freq === 'weekly' || freq === 'biweekly') r.byweekday = d.byweekday
    if (freq === 'biweekly') r.anchor = d.anchor || todayIso()
  }
  if (freq === 'month_end') r.pending_until_complete = true
  if (freq === 'on_clock_in') r.deadline_rel = d.deadlineRel
  return r
}

/** True for schedules that repeat, i.e. can only live on a template. */
export function isRecurring(freq: ScheduleFreq): boolean {
  return freq !== 'none' && freq !== 'once' && freq !== 'ad_hoc'
}

export default function ScheduleEditor({
  value,
  onChange,
  onceHint,
  freqs,
  children,
}: {
  value: ScheduleDraft
  onChange: (next: ScheduleDraft) => void
  onceHint: string
  /** limit the chips (e.g. roles that cannot save recurring templates); default all */
  freqs?: ScheduleFreq[]
  /** notes shown under the schedule fields */
  children?: ReactNode
}) {
  const { freq, times, exceptDays, byweekday, anchor, deadline, onceDue, escalateAfter, deadlineRel } = value
  const set = (patch: Partial<ScheduleDraft>) => onChange({ ...value, ...patch })
  const setEscalateAfter = (v: number | null) => set({ escalateAfter: v })

  const weekdayToggles = (sel: number[], setSel: (v: number[]) => void) => (
    <div className="flex flex-wrap gap-1.5">
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
    <div>
      <div className="mb-2.5 flex flex-wrap gap-1.5">
        {FREQS.filter((f) => !freqs || freqs.includes(f.id)).map((f) => (
          <button key={f.id} onClick={() => set({ freq: f.id })} className={chip(freq === f.id)}>
            {f.label}
          </button>
        ))}
      </div>
      {freq === 'once' && (
        <div className="flex flex-col gap-2.5 rounded-xl bg-canvas p-3">
          <div className="text-[11.5px] text-muted">{onceHint}</div>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <div>
              <div className="mb-1 text-[11px] font-semibold text-slate">Due date &amp; time</div>
              <DateTimeField value={onceDue} onChange={(v) => set({ onceDue: v })} className={inputCls} />
              {!onceDue && <div className="mt-1 text-[11px] text-danger">Required for a one-off task.</div>}
            </div>
            <div>
              <div className="mb-1 text-[11px] font-semibold text-slate">Escalate after</div>
              <HoursField value={escalateAfter} onChange={setEscalateAfter} className={inputCls} />
              <div className="mt-1 text-[11px] text-muted">
                Hours past the due time before the task is marked missed and escalated to the Owner.
              </div>
            </div>
          </div>
        </div>
      )}
      {(freq === 'daily' || freq === 'weekly' || freq === 'biweekly') && (
        <div className="flex flex-col gap-2.5 rounded-xl bg-canvas p-3">
          {(freq === 'weekly' || freq === 'biweekly') && (
            <div>
              <div className="mb-1.5 text-[11px] font-semibold text-slate">Days</div>
              {weekdayToggles(byweekday, (v) => set({ byweekday: v }))}
            </div>
          )}
          {freq === 'biweekly' && (
            <div>
              <div className="mb-1 text-[11px] font-semibold text-slate">First week</div>
              <input
                type="date"
                value={anchor}
                onChange={(e) => set({ anchor: e.target.value })}
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
              {weekdayToggles(exceptDays, (v) => set({ exceptDays: v }))}
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
                    onClick={() => set({ times: times.filter((x) => x !== t) })}
                    aria-label={`Remove ${t}`}
                    className="rounded p-0.5 hover:text-danger"
                  >
                    <X size={11} weight="bold" />
                  </button>
                </span>
              ))}
              <TimeField
                value=""
                onChange={(t) => t && !times.includes(t) && set({ times: [...times, t].sort() })}
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
                onChange={(v) => set({ deadline: v })}
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
          <select value={deadlineRel} onChange={(e) => set({ deadlineRel: e.target.value })} className={inputCls}>
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
      {children}
    </div>
  )
}
