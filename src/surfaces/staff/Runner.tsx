import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Camera,
  Check,
  CheckCircle,
  QrCode,
  Signature as SignatureIcon,
} from '@phosphor-icons/react'
import { supabase, ORG_ID } from '../../lib/supabase'
import { useAuth } from '../../auth/AuthProvider'
import {
  useChecklistItems,
  useSubmitChecklist,
  useTasks,
  useToggleChecklistItem,
} from '../../data/hooks'
import { useToast } from '../../components/Toast'
import GeoChip, { useGeofence } from './GeoChip'
import { useStaffStore } from './StaffShell'
import QrScanner from '../../components/QrScanner'
import type { ChecklistItem } from '../../lib/types'

function useSignature() {
  const ref = useRef<HTMLCanvasElement>(null)
  const [signed, setSigned] = useState(false)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const ctx = c.getContext('2d')!
    ctx.strokeStyle = '#151B28'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    let drawing = false
    let last: { x: number; y: number } | null = null
    const pos = (e: PointerEvent) => {
      const r = c.getBoundingClientRect()
      return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) }
    }
    const down = (e: PointerEvent) => {
      e.preventDefault()
      drawing = true
      last = pos(e)
      setSigned(true)
    }
    const move = (e: PointerEvent) => {
      if (!drawing || !last) return
      e.preventDefault()
      const p = pos(e)
      ctx.beginPath()
      ctx.moveTo(last.x, last.y)
      ctx.lineTo(p.x, p.y)
      ctx.stroke()
      last = p
    }
    const up = () => {
      drawing = false
    }
    c.addEventListener('pointerdown', down)
    c.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      c.removeEventListener('pointerdown', down)
      c.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [])
  const clear = () => {
    const c = ref.current
    if (c) c.getContext('2d')!.clearRect(0, 0, c.width, c.height)
    setSigned(false)
  }
  return { ref, signed, clear }
}

function ItemRow({
  item,
  onPhoto,
  onQr,
}: {
  item: ChecklistItem
  onPhoto: (item: ChecklistItem) => void
  onQr: (item: ChecklistItem) => void
}) {
  const toggle = useToggleChecklistItem()
  const toast = useToast()
  const [temp, setTemp] = useState(item.temp_value?.toString() ?? '')

  const tempNum = temp === '' ? null : parseFloat(temp)
  const tempBad =
    tempNum != null &&
    item.temp_limit != null &&
    (item.temp_is_max ? tempNum > item.temp_limit : tempNum < item.temp_limit)

  const done = item.checked
  const border = done ? 'rgba(22,179,100,.4)' : 'rgba(21,27,40,.08)'

  return (
    <div className="mb-2.5 rounded-[14px] bg-white p-[13px]" style={{ border: `1px solid ${border}` }}>
      <div className="flex items-start gap-3">
        <button
          onClick={() =>
            toggle.mutate({ item, patch: { checked: !item.checked } })
          }
          className="mt-px flex h-[26px] w-[26px] flex-none items-center justify-center rounded-lg border-2"
          style={{
            borderColor: done ? '#16B364' : 'rgba(21,27,40,.25)',
            background: done ? '#16B364' : '#fff',
          }}
        >
          {done && <Check size={14} weight="bold" color="#fff" />}
        </button>
        <div className="min-w-0 flex-1">
          <div
            className="text-[13.5px] font-semibold leading-snug"
            style={{ color: done ? '#8B93A4' : '#151B28', textDecoration: done ? 'line-through' : 'none' }}
          >
            {item.label}
          </div>

          {item.requires_temp && (
            <div className="mt-2 flex items-center gap-2">
              <input
                value={temp}
                onChange={(e) => setTemp(e.target.value)}
                onBlur={() => {
                  if (tempNum != null && !Number.isNaN(tempNum))
                    toggle.mutate({ item, patch: { temp_value: tempNum, checked: true } })
                }}
                inputMode="decimal"
                className="w-[74px] rounded-[9px] border p-2 text-center text-sm font-semibold outline-none"
                style={{ borderColor: tempBad ? '#E5484D' : 'rgba(21,27,40,.15)', color: tempBad ? '#E5484D' : '#151B28' }}
              />
              <span className="text-xs text-muted">
                °C · limit {item.temp_is_max ? '≤' : '≥'} {item.temp_limit}°C
              </span>
              {tempNum != null && (
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                  style={{
                    color: tempBad ? '#E5484D' : '#0E9152',
                    background: tempBad ? '#FCEBEC' : '#E7F7EF',
                  }}
                >
                  {tempBad ? 'FAIL' : 'OK'}
                </span>
              )}
            </div>
          )}

          {item.requires_photo && (
            <div className="mt-2 flex items-center gap-2">
              {Array.from({ length: item.photo_count }).map((_, i) => (
                <div
                  key={i}
                  className="flex h-[46px] w-[46px] items-center justify-center rounded-[10px] border border-ink/5"
                  style={{
                    background:
                      'repeating-linear-gradient(45deg,#eef0f3,#eef0f3 5px,#e4e7ec 5px,#e4e7ec 10px)',
                  }}
                >
                  <CheckCircle size={16} weight="fill" color="#16B364" />
                </div>
              ))}
              <button
                onClick={() => onPhoto(item)}
                className="flex h-[46px] w-[46px] items-center justify-center rounded-[10px] border-[1.5px] border-dashed border-ink/20 bg-[#F9FAFB]"
              >
                <Camera size={18} color="#8B93A4" />
              </button>
            </div>
          )}

          {item.requires_qr && (
            <button
              onClick={() => !item.qr_verified && onQr(item)}
              className="mt-2 flex items-center gap-1.5 rounded-[9px] border px-3 py-2 text-[12.5px] font-semibold"
              style={{
                borderColor: item.qr_verified ? 'rgba(22,179,100,.4)' : 'rgba(255,90,45,.5)',
                background: item.qr_verified ? '#E7F7EF' : '#FFF6F2',
                color: item.qr_verified ? '#0E9152' : '#E8481F',
              }}
            >
              <QrCode size={16} />
              {item.qr_verified ? 'QR verified ✓' : 'Scan QR at asset'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Runner() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { session } = useAuth()
  const store = useStaffStore()
  const { data: tasks } = useTasks({ storeId: 'all' })
  const instance = (tasks ?? []).find((t) => t.id === id) ?? null
  const { data: items } = useChecklistItems(id ?? null)
  const { result: geo, checking } = useGeofence(store)
  const submit = useSubmitChecklist()
  const sig = useSignature()
  const fileRef = useRef<HTMLInputElement>(null)
  const photoItem = useRef<ChecklistItem | null>(null)
  const [qrItem, setQrItem] = useState<ChecklistItem | null>(null)
  const toggle = useToggleChecklistItem()

  const done = (items ?? []).filter((i) => i.checked).length
  const total = (items ?? []).length
  const progress = total === 0 ? 0 : Math.round((done / total) * 100)
  const requiresSig = instance?.evidence?.signature
  const blocked =
    instance?.geofence_policy === 'block' && geo?.verdict === 'off_site'
  const canSubmit = total > 0 && done === total && (!requiresSig || sig.signed) && !blocked

  const onPhoto = (item: ChecklistItem) => {
    photoItem.current = item
    fileRef.current?.click()
  }

  const onFile = async (f: File | undefined) => {
    const item = photoItem.current
    if (!f || !item || !instance) return
    const path = `${ORG_ID}/${instance.id}/${item.id}-${Date.now()}.jpg`
    const { error } = await supabase.storage.from('evidence').upload(path, f, { upsert: false })
    if (error) {
      toast(`Upload failed: ${error.message}`, 'error')
      return
    }
    await supabase.from('evidence').insert({
      org_id: ORG_ID,
      instance_id: instance.id,
      item_id: item.id,
      type: 'photo',
      storage_path: path,
      uploader: session!.user.id,
      device_ts: new Date().toISOString(),
      gps_lat: geo?.lat,
      gps_lng: geo?.lng,
      gps_accuracy: geo?.accuracy,
      geofence_verdict: geo?.verdict ?? 'unknown',
    })
    toggle.mutate({ item, patch: { photo_count: item.photo_count + 1, checked: true } })
    toast('Photo captured & stamped', 'success')
  }

  const doSubmit = () => {
    if (!instance) return
    submit.mutate(
      {
        instance,
        geofenceVerdict: geo?.verdict ?? 'unknown',
        gps: geo ? { lat: geo.lat, lng: geo.lng, accuracy: geo.accuracy } : undefined,
      },
      {
        onSuccess: () =>
          navigate('/staff/success', {
            state: {
              icon: 'seal',
              color: '#16B364',
              title: 'Checklist submitted',
              msg: `Locked & sent to your Team Leader for verification.${
                geo?.verdict === 'verified' ? ' Evidence stamped ✓ Verified on-site.' : ''
              }`,
            },
          }),
        onError: (e) => toast(e.message, 'error'),
      },
    )
  }

  if (!instance) return null

  return (
    <div className="flex min-h-full flex-col bg-canvas">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0])}
      />
      <div className="sticky top-0 z-20 border-b border-line bg-white px-4 pb-2.5 pt-2">
        <div className="mb-2.5 flex items-center gap-2.5">
          <button onClick={() => navigate('/staff')} className="p-1">
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1">
            <div className="text-[15.5px] font-bold">{instance.title}</div>
            <div className="text-[11px] text-muted">
              {done} / {total} complete
            </div>
          </div>
          <GeoChip result={geo} checking={checking} storeName={store?.name ?? ''} />
        </div>
        <div className="h-1.5 overflow-hidden rounded-md bg-[#EDEEF1]">
          <div
            className="h-full rounded-md bg-success transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="flex-1 p-4">
        {blocked && (
          <div className="mb-3 rounded-[13px] border border-danger/25 bg-danger-soft p-3 text-xs font-medium text-danger">
            This checklist requires on-premises completion. Move inside the store geofence to submit.
          </div>
        )}
        {(items ?? []).map((it) => (
          <ItemRow key={it.id} item={it} onPhoto={onPhoto} onQr={setQrItem} />
        ))}

        {requiresSig && (
          <div className="mt-1 rounded-[14px] border border-line bg-white p-3.5">
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[13.5px] font-semibold">
                <SignatureIcon size={17} color="#FF5A2D" /> Sign to confirm
              </span>
              <button onClick={sig.clear} className="text-xs font-medium text-muted">
                Clear
              </button>
            </div>
            <canvas
              ref={sig.ref}
              width={620}
              height={150}
              className="block h-[118px] w-full cursor-crosshair rounded-[11px] border-[1.5px] border-dashed border-ink/20 bg-[#F7F8FA]"
              style={{ touchAction: 'none' }}
            />
          </div>
        )}
      </div>

      {qrItem && (
        <QrScanner
          onClose={() => setQrItem(null)}
          onDetect={async (payload) => {
            const item = qrItem
            setQrItem(null)
            if (!item || !instance) return
            await supabase.from('evidence').insert({
              org_id: ORG_ID,
              instance_id: instance.id,
              item_id: item.id,
              type: 'qr',
              metadata: { payload },
              uploader: session!.user.id,
              device_ts: new Date().toISOString(),
              geofence_verdict: geo?.verdict ?? 'unknown',
            })
            toggle.mutate({ item, patch: { qr_verified: true, checked: true } })
            toast('QR verified · presence confirmed at asset', 'success')
          }}
        />
      )}

      <div className="sticky bottom-0 border-t border-line bg-white p-4">
        <button
          onClick={doSubmit}
          disabled={!canSubmit || submit.isPending}
          className="w-full rounded-[13px] p-[15px] text-[15px] font-bold text-white transition"
          style={{ background: canSubmit ? '#FF5A2D' : '#C3C9D2' }}
        >
          {blocked
            ? 'Blocked — outside geofence'
            : canSubmit
              ? 'Submit checklist'
              : `Complete all items${requiresSig ? ' & sign' : ''} to submit`}
        </button>
      </div>
    </div>
  )
}
