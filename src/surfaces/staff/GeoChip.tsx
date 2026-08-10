import { useEffect, useState } from 'react'
import { CircleNotch, MapPin, Warning } from '@phosphor-icons/react'
import { checkGeofence, type GeoResult } from '../../lib/geo'
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
  }, [store?.id, attempt])
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
      <span className="flex items-center gap-1 rounded-full bg-danger-soft px-2.5 py-1 text-[10.5px] font-semibold text-danger">
        <Warning size={12} weight="fill" /> Off-site
      </span>
    )
  if (!result)
    return (
      <span className="flex items-center gap-1 rounded-full bg-canvas px-2.5 py-1 text-[10.5px] font-semibold text-muted">
        <MapPin size={12} /> —
      </span>
    )
  return (
    <span className="flex items-center gap-1 rounded-full bg-warn-soft px-2.5 py-1 text-[10.5px] font-semibold text-amber">
      <Warning size={12} weight="fill" /> No location
    </span>
  )
}
