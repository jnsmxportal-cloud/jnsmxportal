import { useEffect, useState } from 'react'
import { ArrowsClockwise, BellRinging, DownloadSimple, SignOut } from '@phosphor-icons/react'
import { useAuth } from '../../auth/AuthProvider'
import { Avatar } from '../../components/ui'
import { useStaffStore } from './StaffShell'
import { useToast } from '../../components/Toast'
import { enablePush, isPushEnabled } from '../../lib/push'
import { iosNeedsInstallForPush } from '../../lib/ios'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
}

export default function Profile() {
  const { profile, signOut } = useAuth()
  const store = useStaffStore()
  const toast = useToast()
  const [installEvt, setInstallEvt] = useState<BeforeInstallPromptEvent | null>(null)
  const [pushOn, setPushOn] = useState(false)

  useEffect(() => {
    isPushEnabled().then(setPushOn)
  }, [])

  useEffect(() => {
    const h = (e: Event) => {
      e.preventDefault()
      setInstallEvt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', h)
    return () => window.removeEventListener('beforeinstallprompt', h)
  }, [])

  const install = async () => {
    if (installEvt) {
      await installEvt.prompt()
      setInstallEvt(null)
    } else {
      toast('On iOS: Share → Add to Home Screen. On Android use the browser menu.', 'info')
    }
  }

  return (
    <div className="animate-fade px-[18px] pb-5 pt-4">
      <h2 className="mb-4 text-[21px] font-extrabold tracking-tight">Profile</h2>
      <div className="mb-4 flex items-center gap-3 rounded-2xl border border-line bg-white p-[18px]">
        <Avatar name={profile!.full_name} color={profile!.avatar_color} size={52} />
        <div>
          <div className="text-base font-bold">{profile!.full_name}</div>
          <div className="text-xs text-muted">
            {profile!.role === 'team_leader' ? 'Team Leader' : 'Staff'}
            {store ? ` · ${store.name}${store.city ? `, ${store.city}` : ''}` : ''}
          </div>
        </div>
      </div>

      <div className="mb-3.5 rounded-2xl bg-navy p-4 text-white">
        <div className="mb-1.5 flex items-center gap-2">
          <DownloadSimple size={18} weight="fill" color="#FF5A2D" />
          <span className="text-sm font-bold">Install the app</span>
        </div>
        <div className="mb-2.5 text-[11.5px] leading-normal text-muted">
          Add to Home Screen for push notifications &amp; offline mode. On iOS: Share → Add to Home
          Screen.
        </div>
        <button
          onClick={install}
          className="w-full rounded-[10px] bg-brand p-2.5 text-[13px] font-semibold text-white"
        >
          Add to Home Screen
        </button>
      </div>

      <div className="mb-3.5 rounded-2xl border border-line bg-white p-[15px]">
        <div className="mb-3 flex items-center justify-between text-[13px]">
          <span className="flex items-center gap-2 text-slate">
            <BellRinging size={15} color="#FF5A2D" /> Push notifications
          </span>
          {pushOn ? (
            <span className="font-semibold text-success">Enabled ✓</span>
          ) : iosNeedsInstallForPush() ? (
            <span className="text-[11px] font-semibold text-amber">Install first ↓</span>
          ) : (
            <button
              onClick={async () => {
                const r = await enablePush(profile!.id)
                if (r === 'enabled') {
                  setPushOn(true)
                  toast('Push notifications enabled on this device')
                } else if (r === 'denied') toast('Notification permission was denied', 'warn')
                else toast('Push is not supported in this browser', 'warn')
              }}
              className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white"
            >
              Enable
            </button>
          )}
        </div>
        {iosNeedsInstallForPush() && !pushOn && (
          <div className="mb-3 rounded-xl bg-warn-soft p-3 text-[11.5px] leading-relaxed text-amber">
            <b>iOS: install before enabling notifications.</b>
            <ol className="ml-4 mt-1 list-decimal">
              <li>Tap the Share button in Safari</li>
              <li>Choose “Add to Home Screen”</li>
              <li>Open the app from your Home Screen</li>
              <li>Return here and tap Enable</li>
            </ol>
          </div>
        )}
        <div className="flex items-center justify-between border-t border-ink/5 pt-3 text-[13px]">
          <span className="flex items-center gap-2 text-slate">
            <ArrowsClockwise size={15} color="#16B364" /> Sync status
          </span>
          <span className="font-semibold text-success">
            {navigator.onLine ? 'All synced ✓' : 'Offline · queued'}
          </span>
        </div>
      </div>

      <button
        onClick={signOut}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-line bg-white p-3.5 text-[13.5px] font-semibold text-danger"
      >
        <SignOut size={17} /> Sign out
      </button>
    </div>
  )
}
