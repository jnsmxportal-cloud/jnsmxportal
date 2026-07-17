import { supabase } from './supabase'

const VAPID_PUBLIC_KEY =
  'BDr1wu2IUp3xc0nycOtBHz4jdoh6igVtyw_t_5_ZYyxDEUVXBf3CTX8eAyfRvwg4zcfy0tkkeKYYe_0DUKtLQhs'

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

export async function enablePush(userId: string): Promise<'enabled' | 'denied' | 'unsupported'> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported'
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return 'denied'
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  })
  const json = sub.toJSON()
  await supabase.from('push_subscriptions').upsert(
    {
      user_id: userId,
      endpoint: sub.endpoint,
      keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
      device_label: navigator.userAgent.slice(0, 120),
    },
    { onConflict: 'endpoint' },
  )
  return 'enabled'
}

export async function isPushEnabled(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false
  const reg = await navigator.serviceWorker.ready
  return (await reg.pushManager.getSubscription()) != null
}

/** Ask the edge function to fan out any unsent notifications immediately. */
export function triggerFanout(): void {
  supabase.functions.invoke('push-fanout').catch(() => {})
}
