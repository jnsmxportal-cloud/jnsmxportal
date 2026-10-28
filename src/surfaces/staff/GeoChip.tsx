import { useEffect, useState } from 'react'
import { CircleNotch, MapPin, Warning } from '@phosphor-icons/react'
import { checkGeofence, geoReasonHelp, geoReasonShort, type GeoResult } from '../../lib/geo'
import type { Store } from '../../lib/types'

export function useGeofence(store: Store | undefined) {
  const [result, setResult] = useState<GeoResult | null>(null)
  const [checking, setChecking] = useState(true)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!store) {
      setChecking(false)
      return
    }
    let live = true
    setChecking(true)
    checkGeofence(store).then((r) => {
      if (!live) return
      setResult(r)
      setChecking(false)
    })
    return () => {
      live = false
    }
    // re-check when the store's fence changes (owner edited it) or on manual retry
  }, [store?.id, store?.lat, store?.lng, store?.geofence_radius_m, attempt])
  const retry = () => setAttempt((a) => a + 1)
  return { result, checking, retry }
}

export default function GeoChip({
  result,
  checking,
  storeName,
}: {
  result: GeoResult | null
  checking: boolean
  storeName: string
}) {
  if (checking)
    return (
      <span className="flex items-center gap-1.5 rounded-full bg-canvas px-2.5 py-1 text-[10.5px] font-semibold text-muted">
        <CircleNotch size={12} className="animate-spin" /> Locating…
      </span>
    )
  if (result?.verdict === 'verified')
    return (
      <span className="flex items-center gap-1 rounded-full bg-success-soft px-2.5 py-1 text-[10.5px] font-semibold text-success-deep">
        <MapPin size={12} weight="fill" /> On-site
        {result.distanceM != null ? ` · ${result.distanceM} m` : ''}
      </span>
    )
  if (result?.verdict === 'off_site')
    return (
      <span
        title={
          result.distanceM != null
            ? `You are about ${formatDistance(result.distanceM)} from ${storeName || 'the store'}`
            : undefined
        }
        className="flex items-center gap-1 rounded-full bg-danger-soft px-2.5 py-1 text-[10.5px] font-semibold text-danger"
      >
        <Warning size={12} weight="fill" /> Off-site
        {result.distanceM != null ? ` · ${formatDistance(result.distanceM)}` : ''}
      </span>
    )
  if (!result)
    return (
      <span className="flex items-center gap-1 rounded-full bg-canvas px-2.5 py-1 text-[10.5px] font-semibold text-muted">
        <MapPin size={12} /> —
      </span>
    )
  return (
    <span
      title={geoReasonHelp(result.reason, storeName)}
      className="flex items-center gap-1 rounded-full bg-warn-soft px-2.5 py-1 text-[10.5px] font-semibold text-amber"
    >
      <Warning size={12} weight="fill" /> {geoReasonShort(result.reason)}
    </span>
  )
}

/** Banner explaining a location problem, with a retry button. */
export function GeoNotice({
  result,
  checking,
  storeName,
  onRetry,
  tone = 'warn',
}: {
  result: GeoResult | null
  checking: boolean
  storeName?: string
  onRetry?: () => void
  tone?: 'warn' | 'danger'
}) {
  if (checking || !result || result.verdict === 'verified') return null
  const danger = tone === 'danger'
  const box = danger
    ? 'border-danger/25 bg-danger-soft text-danger'
    : 'border-amber/25 bg-warn-soft text-amber'
  const btn = danger
    ? 'border-danger/40 text-danger'
    : 'border-amber/40 text-amber'
  const text =
    result.verdict === 'off_site'
      ? `You are about ${formatDistance(result.distanceM ?? 0)} from ${storeName || 'the store'}. Move inside the store to be verified on-site, then retry.`
      : geoReasonHelp(result.reason, storeName)
  return (
    <div className={`mb-3 flex items-center justify-between gap-2.5 rounded-[13px] border p-2.5 ${box}`}>
      <div className="text-[11.5px] font-medium leading-snug">{text}</div>
      {onRetry && (
        <button
          onClick={onRetry}
          className={`flex-none rounded-[9px] border bg-white px-3 py-1.5 text-[11.5px] font-semibold ${btn}`}
        >
          Retry location
        </button>
      )}
    </div>
  )
}

export function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`
  if (m < 10000) return `${(m / 1000).toFixed(1)} km`
  return `${Math.round(m / 1000)} km`
}
