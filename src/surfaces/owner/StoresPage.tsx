import { useNavigate } from 'react-router-dom'
import { MapPinArea, QrCode, Storefront, Users } from '@phosphor-icons/react'
import { Card } from '../../components/ui'
import { useAuth } from '../../auth/AuthProvider'
import { useProfiles, useTasks } from '../../data/hooks'
import { isOnline, useUserStoreRoles } from '../../data/ownerExtras'
import { storeCompliance } from './shared'

export default function StoresPage() {
  const { stores } = useAuth()
  const { data: tasks } = useTasks({ storeId: 'all' })
  const { data: profiles } = useProfiles()
  const { data: storeRoles } = useUserStoreRoles()
  const navigate = useNavigate()
  const onlineStaff = (profiles ?? []).filter(isOnline)

  return (
    <div className="grid max-w-[960px] animate-fade grid-cols-1 gap-[18px] sm:grid-cols-2 xl:grid-cols-3">
      {stores.map((s) => {
        const comp = storeCompliance(tasks ?? [], s.id)
        const online = onlineStaff.filter((p) =>
          (storeRoles ?? []).some((r) => r.user_id === p.id && r.store_id === s.id),
        ).length
        const dot = comp >= 92 ? '#16B364' : comp >= 80 ? '#F59E0B' : '#E5484D'
        return (
          <Card key={s.id} className="overflow-hidden">
            <div
              className="relative flex h-[150px] items-center justify-center overflow-hidden border-b border-ink/5"
              style={{ background: 'radial-gradient(circle at 50% 45%, #EAF1FE, #F5F6F8)' }}
            >
              <div
                className="absolute inset-0"
                style={{
                  backgroundImage:
                    'linear-gradient(rgba(21,27,40,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(21,27,40,.05) 1px,transparent 1px)',
                  backgroundSize: '24px 24px',
                }}
              />
              <div className="absolute h-[110px] w-[110px] rounded-full border-[1.5px] border-dashed border-info/50 bg-info/10" />
              <div className="absolute h-[110px] w-[110px] animate-ring rounded-full border-[1.5px] border-info/35" />
              <div
                className="relative flex h-[30px] w-[30px] -rotate-45 items-center justify-center bg-brand shadow-[0_4px_10px_rgba(255,90,45,.4)]"
                style={{ borderRadius: '50% 50% 50% 0' }}
              >
                <Storefront size={14} weight="fill" color="#fff" className="rotate-45" />
              </div>
            </div>
            <div className="p-4">
              <div className="font-display text-base font-bold">{s.name}</div>
              <div className="mb-3 text-[11.5px] text-muted">{s.city}</div>
              <div className="flex flex-col gap-2 text-xs">
                <div className="flex justify-between">
                  <span className="flex items-center gap-1 text-slate">
                    <MapPinArea size={13} /> Geofence radius
                  </span>
                  <span className="font-semibold">{s.geofence_radius_m} m</span>
                </div>
                <div className="flex justify-between">
                  <span className="flex items-center gap-1 text-slate">
                    <QrCode size={13} /> QR assets
                  </span>
                  <span className="font-semibold">{s.qr_zones} zones</span>
                </div>
                <div className="flex justify-between">
                  <span className="flex items-center gap-1 text-slate">
                    <Users size={13} /> Online now
                  </span>
                  <span className="font-semibold">{online}</span>
                </div>
                <div className="flex justify-between border-t border-ink/5 pt-2">
                  <span className="text-slate">Compliance</span>
                  <span className="font-bold" style={{ color: dot }}>
                    {comp}%
                  </span>
                </div>
              </div>
              <button
                onClick={() => navigate('/owner/admin?tab=geofence')}
                className="mt-3.5 w-full rounded-[10px] border border-ink/10 bg-canvas p-2 text-xs font-semibold"
              >
                Edit geofence &amp; QR codes
              </button>
            </div>
          </Card>
        )
      })}
    </div>
  )
}
