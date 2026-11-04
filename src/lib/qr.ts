import type { StoreUnit } from './types'

/**
 * QR label payloads. A unit label identifies one chiller/freezer by id; a zone label (Stockroom,
 * Freezer aisle…) identifies a place in a store for "QR required" checklist items.
 */
export const unitQrPayload = (storeId: string, unitId: string) => `storeops:unit:${storeId}:${unitId}`
export const zoneQrPayload = (storeId: string, zone: string) => `storeops:asset:${storeId}:${zone}`

/** Does a scanned payload identify this unit? Accepts the unit-id form and the older name form. */
export function matchesUnit(payload: string, unit: StoreUnit): boolean {
  const p = payload.trim()
  return p === unitQrPayload(unit.store_id, unit.id) || p === zoneQrPayload(unit.store_id, unit.name)
}

/** Any label printed for this store (unit or zone). */
export function belongsToStore(payload: string, storeId: string): boolean {
  return payload.startsWith('storeops:') && payload.includes(storeId)
}

/** A safe file name for a downloaded label. */
export function qrFileName(storeName: string, label: string): string {
  return `${storeName} - ${label}`.replace(/[^\w\- ]+/g, '').replace(/\s+/g, ' ').trim() + '.png'
}
