/// <reference lib="webworker" />
declare let self: ServiceWorkerGlobalScope

import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { CacheFirst, NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies'

// activation is user-driven: the app posts SKIP_WAITING when the user accepts the update
clientsClaim()

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')))

registerRoute(
  ({ url }) => url.origin === 'https://fonts.googleapis.com',
  new StaleWhileRevalidate({ cacheName: 'google-fonts-css' }),
)
registerRoute(
  ({ url }) => url.origin === 'https://fonts.gstatic.com',
  new CacheFirst({ cacheName: 'google-fonts-files' }),
)
registerRoute(
  ({ url, request }) =>
    url.pathname.startsWith('/rest/v1/') &&
    !url.pathname.includes('app_secrets') &&
    request.method === 'GET',
  new NetworkFirst({ cacheName: 'api', networkTimeoutSeconds: 4 }),
)

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
  if (event.data?.type === 'CLEAR_API_CACHE') event.waitUntil(caches.delete('api'))
})

// ===== Web Push (PWA-6 / FR-5) =====
self.addEventListener('push', (event) => {
  const data = (() => {
    try {
      return event.data?.json() ?? {}
    } catch {
      return { title: 'Store Operations', body: event.data?.text() }
    }
  })()
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'Store Operations', {
      body: data.body ?? undefined,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { deep_link: data.deep_link ?? '/', id: data.id },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const link: string = event.notification.data?.deep_link ?? '/'
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const w of wins) {
        try {
          await w.navigate(link)
          return await w.focus()
        } catch {
          // navigate/focus can reject (cross-origin, discarded client) — fall back
        }
      }
      return self.clients.openWindow(link)
    })(),
  )
})
