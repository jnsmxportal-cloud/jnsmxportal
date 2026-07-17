import { useLocation, useNavigate } from 'react-router-dom'
import { ClipboardText, SealCheck, Truck, Warning } from '@phosphor-icons/react'

const icons = {
  seal: SealCheck,
  truck: Truck,
  warn: Warning,
  task: ClipboardText,
} as const

export default function Success() {
  const navigate = useNavigate()
  const { state } = useLocation() as {
    state?: { icon?: keyof typeof icons; color?: string; title?: string; msg?: string }
  }
  const Icon = icons[state?.icon ?? 'seal']
  const color = state?.color ?? '#16B364'
  const bg = color === '#16B364' ? '#E7F7EF' : color === '#3B82F6' ? '#EAF1FE' : '#FCEBEC'

  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-canvas p-8 text-center">
      <div
        className="mb-5 flex h-[88px] w-[88px] animate-pop items-center justify-center rounded-full"
        style={{ background: bg }}
      >
        <Icon size={46} weight="fill" color={color} />
      </div>
      <h2 className="mb-2 text-[22px] font-extrabold tracking-tight">
        {state?.title ?? 'Submitted'}
      </h2>
      <div className="mb-6 max-w-[260px] text-[13.5px] leading-normal text-slate">
        {state?.msg ?? 'Your submission has been recorded.'}
      </div>
      <button
        onClick={() => navigate('/staff')}
        className="rounded-[13px] bg-ink px-8 py-3.5 text-sm font-semibold text-white"
      >
        Back to home
      </button>
    </div>
  )
}
