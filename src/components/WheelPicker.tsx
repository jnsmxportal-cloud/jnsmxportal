import { useEffect, useRef } from 'react'

const ITEM_H = 44
const VISIBLE = 5

/**
 * iOS-style vertical wheel: a scroll-snap column of integer values from `min` to `max`.
 * The value under the centre band is the selection; it is reported once scrolling settles,
 * so the caller never sees anything outside [min, max] or a non-integer.
 */
export default function WheelPicker({
  value,
  onChange,
  min,
  max,
  format = (v) => String(v),
  colorFor,
}: {
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  format?: (v: number) => string
  /** optional per-value colour for the centred item (safe / warn / breach cues) */
  colorFor?: (v: number) => string | undefined
}) {
  const ref = useRef<HTMLDivElement>(null)
  const settle = useRef<ReturnType<typeof setTimeout>>()
  const values: number[] = []
  for (let v = min; v <= max; v++) values.push(v)
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v)))

  // keep the wheel aligned with the controlled value (initial mount + external changes)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const target = (clamp(value) - min) * ITEM_H
    if (Math.abs(el.scrollTop - target) > 1) el.scrollTop = target
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, min, max])

  const onScroll = () => {
    const el = ref.current
    if (!el) return
    clearTimeout(settle.current)
    // scroll-snap finishes with momentum; report once movement has stopped
    settle.current = setTimeout(() => {
      const idx = clamp(min + el.scrollTop / ITEM_H)
      if (idx !== value) onChange(idx)
    }, 90)
  }

  const pad = (ITEM_H * (VISIBLE - 1)) / 2
  return (
    <div className="relative select-none" style={{ height: ITEM_H * VISIBLE }}>
      {/* centre band */}
      <div
        className="pointer-events-none absolute inset-x-0 rounded-xl border border-ink/10 bg-canvas"
        style={{ top: pad, height: ITEM_H }}
      />
      <div
        ref={ref}
        onScroll={onScroll}
        className="h-full overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{
          scrollSnapType: 'y mandatory',
          WebkitOverflowScrolling: 'touch',
          maskImage: 'linear-gradient(to bottom, transparent, black 30%, black 70%, transparent)',
          WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 30%, black 70%, transparent)',
        }}
      >
        <div style={{ height: pad }} />
        {values.map((v) => {
          const active = v === value
          return (
            <div
              key={v}
              onClick={() => onChange(v)}
              className="flex items-center justify-center font-display font-bold transition-colors"
              style={{
                height: ITEM_H,
                scrollSnapAlign: 'center',
                fontSize: active ? 24 : 17,
                color: active ? (colorFor?.(v) ?? '#151B28') : '#8B93A4',
              }}
            >
              {format(v)}
            </div>
          )
        })}
        <div style={{ height: pad }} />
      </div>
    </div>
  )
}
