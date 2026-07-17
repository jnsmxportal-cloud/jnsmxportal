import type { ReactNode } from 'react'
import type { TaskPriority } from '../lib/types'

export function Card({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`rounded-2xl border border-line bg-white ${className}`}>{children}</div>
  )
}

const prioStyles: Record<TaskPriority, { c: string; b: string }> = {
  critical: { c: '#E5484D', b: '#FCEBEC' },
  high: { c: '#E5484D', b: '#FCEBEC' },
  medium: { c: '#F59E0B', b: '#FEF3E2' },
  low: { c: '#16B364', b: '#E7F7EF' },
}

export function PrioBadge({ p }: { p: TaskPriority }) {
  const s = prioStyles[p]
  return (
    <span
      className="rounded-full px-2 py-[2px] text-[9.5px] font-bold uppercase tracking-wide"
      style={{ color: s.c, background: s.b }}
    >
      {p}
    </span>
  )
}

export function StatusChip({
  text,
  color,
  bg,
}: {
  text: string
  color: string
  bg: string
}) {
  return (
    <span
      className="rounded-full px-2.5 py-1 text-[10.5px] font-semibold"
      style={{ color, background: bg }}
    >
      {text}
    </span>
  )
}

export function Avatar({
  name,
  color,
  size = 36,
}: {
  name: string
  color: string
  size?: number
}) {
  return (
    <div
      className="flex flex-none items-center justify-center rounded-xl font-display font-bold text-white"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        background: `linear-gradient(135deg, ${color}, ${color}CC)`,
      }}
    >
      {name.charAt(0)}
    </div>
  )
}

export function SectionHead({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h3 className="text-sm font-bold">{title}</h3>
      {right}
    </div>
  )
}

export const deliveryStatusStyle: Record<string, { c: string; b: string; label: string }> = {
  review: { c: '#F59E0B', b: '#FEF3E2', label: 'Review' },
  verified: { c: '#3B82F6', b: '#EAF1FE', label: 'Verified' },
  approved: { c: '#16B364', b: '#E7F7EF', label: 'Approved' },
  rejected: { c: '#E5484D', b: '#FCEBEC', label: 'Rejected' },
}
