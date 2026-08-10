import { supabase } from './supabase'

const VAPID_PUBLIC_KEY =
  'BDr1wu2IUp3xc0nycOtBHz4jdoh6igVtyw_t_5_ZYyxDEUVXBf3CTX8eAyfRvwg4zcfy0tkkeKYYe_0DUKtLQhs'

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

export interface PushEnableResult {
  ok: boolean
  status: 'enabled' | 'denied' | 'unsupported' | 'error'
  error?: string
}

/**
 * Resolve the SW registration without risking a permanent hang:
 * `navigator.serviceWorker.ready` never settles when no SW is registered
 * (e.g. dev builds), so check for a registration first and fall back to it
 * if `ready` stays pending.
 */
async function swRegistration(timeoutMs = 4000): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  const existing = await navigator.serviceWorker.getRegistration()
  if (!existing) return null
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<ServiceWorkerRegistration>((res) => setTimeout(() => res(existing), timeoutMs)),
  ])
}

export async function enablePush(userId: string): Promise<PushEnableResult> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window))
    return { ok: false, status: 'unsupported' }
  try {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return { ok: false, status: 'denied' }
    const reg = await swRegistration()
    if (!reg) return { ok: false, status: 'unsupported' }
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    })
    const json = sub.toJSON()
    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        user_id: userId,
        endpoint: sub.endpoint,
        keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
        device_label: navigator.userAgent.slice(0, 120),
      },
      { onConflict: 'endpoint' },
    )
    if (error) return { ok: false, status: 'error', error: error.message }
    return { ok: true, status: 'enabled' }
  } catch (e) {
    return { ok: false, status: 'error', error: e instanceof Error ? e.message : String(e) }
  }
}

export async function isPushEnabled(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false
  const reg = await swRegistration()
  if (!reg) return false
  return (await reg.pushManager.getSubscription()) != null
}

/** Remove this device's push subscription (row + browser subscription). Best-effort. */
export async function disablePushOnSignOut(): Promise<void> {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
    const reg = await swRegistration()
    if (!reg) return
    const sub = await reg.pushManager.getSubscription()
    if (!sub) return
    const { error } = await supabase
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', sub.endpoint)
    if (error) console.warn('disablePushOnSignOut: row delete failed —', error.message)
    await sub.unsubscribe()
  } catch (e) {
    console.warn('disablePushOnSignOut failed —', e)
  }
}

/** Ask the edge function to fan out any unsent notifications immediately. */
export function triggerFanout(): void {
  supabase.functions
    .invoke('push-fanout')
    .then(({ error }) => {
      if (error) console.warn('push-fanout failed —', error.message ?? error)
    })
    .catch((e) => console.warn('push-fanout failed —', e))
}
