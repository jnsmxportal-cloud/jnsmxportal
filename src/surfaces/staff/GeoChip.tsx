import { useEffect, useState } from 'react'
import { CircleNotch, MapPin, Warning } from '@phosphor-icons/react'
import { checkGeofence, type GeoResult } from '../../lib/geo'
import type { Store } from '../../lib/types'

export function useGeofence(store: Store | undefined) {
  const [result, setResult] = useState<GeoResult | null>(null)
  const [checking, setChecking] = useState(true)
  useEffect(() => {
    if (!store) return
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
  }, [store?.id])
  return { result, checking }
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
  return (
    <span className="flex items-center gap-1 rounded-full bg-warn-soft px-2.5 py-1 text-[10.5px] font-semibold text-amber">
      <Warning size={12} weight="fill" /> No location
    </span>
  )
}
