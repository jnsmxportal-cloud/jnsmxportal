import type { Store } from './types'

export interface GeoResult {
  verdict: 'verified' | 'off_site' | 'unknown'
  distanceM: number | null
  lat?: number
  lng?: number
  accuracy?: number
}

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

export function checkGeofence(store: Store): Promise<GeoResult> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator) || store.lat == null || store.lng == null) {
      resolve({ verdict: 'unknown', distanceM: null })
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const d = haversineM(pos.coords.latitude, pos.coords.longitude, store.lat!, store.lng!)
        // accuracy-aware tolerance (PRD §12): allow fence + reported accuracy
        const inside = d <= store.geofence_radius_m + Math.min(pos.coords.accuracy, 150)
        resolve({
          verdict: inside ? 'verified' : 'off_site',
          distanceM: Math.round(d),
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        })
      },
      () => resolve({ verdict: 'unknown', distanceM: null }),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
    )
  })
}
