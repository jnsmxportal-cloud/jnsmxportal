export function isIos(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) && !('MSStream' in window)
}

/** True when running installed to the Home Screen (standalone display mode). */
export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in navigator && (navigator as { standalone?: boolean }).standalone === true)
  )
}

/** iOS Safari only supports Web Push from an installed PWA (iOS >= 16.4) — PWA-6. */
export function iosNeedsInstallForPush(): boolean {
  return isIos() && !isStandalone()
}
