import type { Store } from './types'

/** Why a location check came back 'unknown'. */
export type GeoReason =
  | 'unsupported' // browser has no geolocation API
  | 'no_coords' // the store has no lat/lng configured yet
  | 'denied' // user / OS blocked location for this site
  | 'unavailable' // device could not get a fix (no GPS, airplane mode…)
  | 'timeout' // no fix within the time limit

export interface GeoResult {
  verdict: 'verified' | 'off_site' | 'unknown'
  distanceM: number | null
  reason?: GeoReason
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

export function geoErrorReason(err: GeolocationPositionError): GeoReason {
  switch (err.code) {
    case err.PERMISSION_DENIED:
      return 'denied'
    case err.TIMEOUT:
      return 'timeout'
    default:
      return 'unavailable'
  }
}

/** Short label for the status chip. */
export function geoReasonShort(reason: GeoReason | undefined): string {
  switch (reason) {
    case 'denied':
      return 'Location blocked'
    case 'timeout':
      return 'Location timed out'
    case 'unsupported':
      return 'No location support'
    case 'no_coords':
      return 'Store location not set'
    default:
      return 'No location'
  }
}

/** Full sentence telling the user what to do about it. */
export function geoReasonHelp(reason: GeoReason | undefined, storeName?: string): string {
  const store = storeName ? ` for ${storeName}` : ''
  switch (reason) {
    case 'denied':
      return 'Location is blocked for this app. Allow location in your browser or phone settings for this site, then retry.'
    case 'timeout':
      return 'Your phone did not find a location fix in time. Step away from walls or go near a window, then retry.'
    case 'unavailable':
      return 'Your device could not get a location. Check that location services are switched on, then retry.'
    case 'unsupported':
      return 'This browser does not support location. Open the app in Safari or Chrome.'
    case 'no_coords':
      return `The store location${store} has not been set yet. Ask the owner to set it in Admin → Geofence.`
    default:
      return 'Location is unavailable right now.'
  }
}

export function checkGeofence(store: Store): Promise<GeoResult> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) {
      resolve({ verdict: 'unknown', distanceM: null, reason: 'unsupported' })
      return
    }
    if (store.lat == null || store.lng == null) {
      resolve({ verdict: 'unknown', distanceM: null, reason: 'no_coords' })
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
      (err) => resolve({ verdict: 'unknown', distanceM: null, reason: geoErrorReason(err) }),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    )
  })
}
