import { useState, type ReactNode } from 'react'
import { Check, Clock, HourglassMedium, X } from '@phosphor-icons/react'
import WheelPicker from './WheelPicker'

/**
 * Wheel-based pickers for every time entry in the app, replacing native <input type="time">
 * and <input type="datetime-local">. Each field is a button that opens a bottom sheet with
 * WheelPicker columns; the value only changes when the user taps Done (or Clear).
 */

const STEP = 5 // minute granularity of the wheel
const defaultCls =
  'w-full rounded-xl border-[1.5px] border-ink/15 bg-white p-2.5 text-sm outline-none focus:border-brand'
const two = (n: number) => String(n).padStart(2, '0')

export function parseHM(v: string | null | undefined): { h: number; m: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v ?? '')
  if (!m) return null
  const h = Number(m[1])
  const mi = Number(m[2])
  if (h > 23 || mi > 59) return null
  return { h, m: mi }
}

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`
}

function Sheet({
  title,
  sub,
  onClose,
  children,
}: {
  title: string
  sub?: string
  onClose: () => void
  children: ReactNode
}) {
  return (
    <div onClick={onClose} className="fixed inset-0 z-[90] flex items-end justify-center bg-navy/50">
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[430px] animate-fade rounded-t-[20px] bg-white p-4 pb-6 shadow-[0_-20px_60px_rgba(0,0,0,.25)]"
      >
        <div className="mb-2 flex items-center gap-2.5">
          <div className="flex-1">
            <div className="text-[15px] font-bold">{title}</div>
            {sub && <div className="text-[11.5px] text-muted">{sub}</div>}
          </div>
          <button onClick={onClose} aria-label="Cancel" className="p-1 text-muted">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function FieldButton({
  onClick,
  className,
  children,
}: {
  onClick: () => void
  className?: string
  children: ReactNode
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onClick())}
      className={`${className ?? defaultCls} flex cursor-pointer items-center justify-between gap-2 text-left`}
    >
      {children}
    </div>
  )
}

// ---------------- time of day ----------------

export default function TimeField({
  value,
  onChange,
  placeholder = 'Set time',
  clearable = false,
  className,
  label = 'Time',
}: {
  /** 'HH:MM' or '' */
  value: string
  onChange: (v: string) => void
  placeholder?: string
  /** show a clear control; onChange('') when used */
  clearable?: boolean
  className?: string
  /** sheet title */
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const [h, setH] = useState(9)
  const [mi, setMi] = useState(0) // index into 5-minute steps
  const cur = parseHM(value)

  const openSheet = () => {
    const c = parseHM(value)
    setH(c?.h ?? 9)
    setMi(Math.min(60 / STEP - 1, Math.round((c?.m ?? 0) / STEP)))
    setOpen(true)
  }
  const done = () => {
    onChange(`${two(h)}:${two(mi * STEP)}`)
    setOpen(false)
  }

  return (
    <>
      <FieldButton onClick={openSheet} className={className}>
        <span className={cur ? 'font-semibold' : 'text-muted'}>
          {cur ? `${two(cur.h)}:${two(cur.m)}` : placeholder}
        </span>
        <span className="flex flex-none items-center gap-1 text-muted">
          {clearable && cur && (
            <button
              type="button"
              aria-label="Clear time"
              onClick={(e) => {
                e.stopPropagation()
                onChange('')
              }}
              className="rounded p-0.5 hover:text-danger"
            >
              <X size={13} />
            </button>
          )}
          <Clock size={15} />
        </span>
      </FieldButton>
      {open && (
        <Sheet title={label} sub="Scroll the wheels, then tap Done" onClose={() => setOpen(false)}>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="mb-1 text-center text-[11px] font-semibold text-muted">Hour</div>
              <WheelPicker value={h} onChange={setH} min={0} max={23} format={two} />
            </div>
            <div>
              <div className="mb-1 text-center text-[11px] font-semibold text-muted">Minute</div>
              <WheelPicker value={mi} onChange={setMi} min={0} max={60 / STEP - 1} format={(v) => two(v * STEP)} />
            </div>
          </div>
          <div className="mt-3 flex gap-2.5">
            {clearable && (
              <button
                onClick={() => {
                  onChange('')
                  setOpen(false)
                }}
                className="flex-1 rounded-xl border border-ink/15 bg-white p-3 text-[13.5px] font-semibold text-slate"
              >
                Clear
              </button>
            )}
            <button
              onClick={done}
              className="flex flex-[1.4] items-center justify-center gap-1.5 rounded-xl bg-brand p-3 text-[13.5px] font-semibold text-white"
            >
              <Check size={15} weight="bold" /> Done
            </button>
          </div>
        </Sheet>
      )}
    </>
  )
}

// ---------------- hours after deadline ----------------

export function HoursField({
  value,
  onChange,
  className,
  label = 'Escalate after',
  max = 72,
}: {
  /** whole hours after the deadline; 0 = at the deadline; null = never */
  value: number | null
  onChange: (v: number | null) => void
  className?: string
  label?: string
  max?: number
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(2)
  const text =
    value === null ? 'Off' : value === 0 ? 'At the deadline' : `${value} h after deadline`
  const fmt = (v: number) => (v === 0 ? 'At deadline' : `${v} h`)

  return (
    <>
      <FieldButton
        onClick={() => {
          setDraft(value ?? 2)
          setOpen(true)
        }}
        className={className}
      >
        <span className={value === null ? 'text-muted' : 'font-semibold'}>{text}</span>
        <HourglassMedium size={15} className="flex-none text-muted" />
      </FieldButton>
      {open && (
        <Sheet
          title={label}
          sub="Hours after the deadline before the task is marked missed and escalated"
          onClose={() => setOpen(false)}
        >
          <WheelPicker value={Math.min(max, draft)} onChange={setDraft} min={0} max={max} format={fmt} />
          <div className="mt-3 flex gap-2.5">
            <button
              onClick={() => {
                onChange(null)
                setOpen(false)
              }}
              className="flex-1 rounded-xl border border-ink/15 bg-white p-3 text-[13.5px] font-semibold text-slate"
            >
              Never escalate
            </button>
            <button
              onClick={() => {
                onChange(draft)
                setOpen(false)
              }}
              className="flex flex-[1.4] items-center justify-center gap-1.5 rounded-xl bg-brand p-3 text-[13.5px] font-semibold text-white"
            >
              <Check size={15} weight="bold" /> Done
            </button>
          </div>
        </Sheet>
      )}
    </>
  )
}

// ---------------- date + time ----------------

/**
 * Replacement for <input type="datetime-local">: native date input beside a wheel time
 * picker. Value stays 'YYYY-MM-DDTHH:MM' (or '') so `new Date(value)` keeps working.
 */
export function DateTimeField({
  value,
  onChange,
  className,
  defaultTime = '09:00',
}: {
  value: string
  onChange: (v: string) => void
  className?: string
  defaultTime?: string
}) {
  const [date, time] = value ? value.split('T') : ['', '']
  return (
    <div className="grid grid-cols-[1fr_auto] gap-2">
      <input
        type="date"
        value={date}
        onChange={(e) => onChange(e.target.value ? `${e.target.value}T${time || defaultTime}` : '')}
        className={className ?? defaultCls}
      />
      <TimeField
        value={time}
        onChange={(t) => onChange(`${date || todayIso()}T${t || defaultTime}`)}
        placeholder="Time"
        label="Due time"
        className={`${className ?? defaultCls} min-w-[112px]`}
      />
    </div>
  )
}
