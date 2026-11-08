import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  Camera,
  ChatText,
  Check,
  CheckCircle,
  QrCode,
  Signature as SignatureIcon,
  Warning,
} from '@phosphor-icons/react'
import { sentBack } from '../../lib/format'
import { supabase, ORG_ID } from '../../lib/supabase'
import { compressImage } from '../../lib/image'
import { useAuth } from '../../auth/AuthProvider'
import {
  useChecklistItems,
  useSubmitChecklist,
  useTask,
  useToggleChecklistItem,
} from '../../data/hooks'
import { useToast } from '../../components/Toast'
import { useEvidence } from '../../data/ownerExtras'
import GeoChip, { GeoNotice, useGeofence } from './GeoChip'
import { useStaffStore } from './StaffShell'
import QrScanner from '../../components/QrScanner'
import SentBackBanner from './SentBackBanner'
import type { ChecklistItem } from '../../lib/types'

/**
 * Signature pad. The canvas is tracked with a callback ref, so the drawing handlers attach
 * whenever the canvas actually mounts — the Runner renders nothing until the task has loaded
 * (cold cache on mobile: deep link, reload, opened from My Tasks), and a mount-only effect
 * would run before the canvas existed and never attach.
 */
function useSignature() {
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null)
  const [signed, setSigned] = useState(false)
  useEffect(() => {
    const c = canvas
    if (!c) return
    setSigned(false)
    const ctx = c.getContext('2d')!
    ctx.strokeStyle = '#151B28'
    ctx.fillStyle = '#151B28'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    let drawing: number | null = null // active pointer id
    let last: { x: number; y: number } | null = null
    const pos = (e: PointerEvent) => {
      const r = c.getBoundingClientRect()
      return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) }
    }
    const down = (e: PointerEvent) => {
      if (drawing !== null) return // ignore a second finger
      e.preventDefault()
      drawing = e.pointerId
      // keep receiving moves even if the finger slides off the pad
      try {
        c.setPointerCapture(e.pointerId)
      } catch {
        /* not supported: moves outside the pad are simply dropped */
      }
      last = pos(e)
      // a dot, so a tap leaves a mark too
      ctx.beginPath()
      ctx.arc(last.x, last.y, ctx.lineWidth / 2, 0, Math.PI * 2)
      ctx.fill()
      setSigned(true)
    }
    const move = (e: PointerEvent) => {
      if (e.pointerId !== drawing || !last) return
      e.preventDefault()
      const p = pos(e)
      ctx.beginPath()
      ctx.moveTo(last.x, last.y)
      ctx.lineTo(p.x, p.y)
      ctx.stroke()
      last = p
    }
    const up = (e: PointerEvent) => {
      if (e.pointerId !== drawing) return
      drawing = null
      last = null
    }
    c.addEventListener('pointerdown', down)
    c.addEventListener('pointermove', move)
    c.addEventListener('pointerup', up)
    c.addEventListener('pointercancel', up)
    c.addEventListener('lostpointercapture', up)
    return () => {
      c.removeEventListener('pointerdown', down)
      c.removeEventListener('pointermove', move)
      c.removeEventListener('pointerup', up)
      c.removeEventListener('pointercancel', up)
      c.removeEventListener('lostpointercapture', up)
    }
  }, [canvas])
  const clear = () => {
    if (canvas) canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height)
    setSigned(false)
  }
  return { ref: setCanvas, canvas, signed, clear }
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
            toggle.mutate(
              { item, patch: { checked: !item.checked } },
              { onError: (e) => toast(e.message, 'error') },
            )
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
                    toggle.mutate(
                      { item, patch: { temp_value: tempNum, checked: true } },
                      { onError: (e) => toast(e.message, 'error') },
                    )
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
  // just this task (not the whole history), so it opens fast and never falls outside a page
  const { data: task } = useTask(id)
  const instance = task ?? null
  const { data: items } = useChecklistItems(id ?? null)
  const { result: geo, checking, retry } = useGeofence(store)
  const submit = useSubmitChecklist()
  const sig = useSignature()
  const fileRef = useRef<HTMLInputElement>(null)
  // the checklist item a photo is for; null = a task-level photo (the template's "Photo" evidence chip)
  const photoItem = useRef<ChecklistItem | null>(null)
  const [qrItem, setQrItem] = useState<ChecklistItem | null>(null)
  const toggle = useToggleChecklistItem()
  const qc = useQueryClient()
  const { data: evidenceRows } = useEvidence(id ?? null)
  const [uploading, setUploading] = useState(false)
  // optional message for the reviewer, saved as a `note` evidence row on submit
  const [note, setNote] = useState('')

  const done = (items ?? []).filter((i) => i.checked).length
  const total = (items ?? []).length
  const progress = total === 0 ? 0 : Math.round((done / total) * 100)
  const isIncident = instance?.category === 'incident'
  const returned = instance ? sentBack(instance) : null
  // incidents, tasks without a checklist and anything sent back can carry optional photos and a
  // message — otherwise a reopened incident offers nothing but a bare Submit button
  const openEvidence = isIncident || total === 0 || !!returned
  const requiresSig = instance?.evidence?.signature
  // task-level photo requirement: at least one photo must be attached to the task (any item or the
  // task itself) before it can be submitted — the per-item camera toggles are enforced separately
  const requiresPhoto = !!instance?.evidence?.photo
  const showPhotos = requiresPhoto || openEvidence
  const taskPhotos = (evidenceRows ?? []).filter((e) => e.type === 'photo' && e.storage_path)
  const photoOk = !requiresPhoto || taskPhotos.length > 0
  const submitLabel = isIncident
    ? returned
      ? 'Resubmit incident report'
      : 'Submit incident report'
    : total === 0
      ? 'Submit task'
      : 'Submit checklist'
  const noLocation = geo?.verdict === 'unknown'
  const blocked =
    instance?.geofence_policy === 'block' &&
    (geo?.verdict === 'off_site' || noLocation)
  const canSubmit =
    (total === 0 || done === total) && (!requiresSig || sig.signed) && photoOk && !blocked
  // only what is actually still missing, so staff are never left guessing why Submit is grey
  const missing = [
    total > 0 && done < total && `tick ${total - done} more item${total - done === 1 ? '' : 's'}`,
    requiresPhoto && !photoOk && 'add a photo',
    requiresSig && !sig.signed && 'sign above',
  ].filter(Boolean) as string[]
  const missingSteps = missing.length
    ? `${missing.join(', ').replace(/^./, (c) => c.toUpperCase())} to submit`
    : submitLabel

  const onPhoto = (item: ChecklistItem | null) => {
    photoItem.current = item
    fileRef.current?.click()
  }

  const onFile = async (f: File | undefined) => {
    const item = photoItem.current
    if (!f || !instance) return
    setUploading(true)
    try {
      await uploadPhoto(f, item)
    } finally {
      setUploading(false)
    }
  }

  const uploadPhoto = async (f: File, item: ChecklistItem | null) => {
    if (!instance) return
    let compressed: Blob
    try {
      compressed = await compressImage(f)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not process the photo', 'error')
      return
    }
    const path = `${ORG_ID}/${instance.id}/${item ? item.id : 'task'}-${Date.now()}.jpg`
    const { error } = await supabase.storage
      .from('evidence')
      .upload(path, compressed, { upsert: false, contentType: 'image/jpeg' })
    if (error) {
      toast(`Upload failed: ${error.message}`, 'error')
      return
    }
    const { error: rowError } = await supabase.from('evidence').insert({
      org_id: ORG_ID,
      instance_id: instance.id,
      item_id: item?.id ?? null,
      type: 'photo',
      storage_path: path,
      uploader: session!.user.id,
      device_ts: new Date().toISOString(),
      gps_lat: geo?.lat,
      gps_lng: geo?.lng,
      gps_accuracy: geo?.accuracy,
      geofence_verdict: geo?.verdict ?? 'unknown',
    })
    if (rowError) {
      toast(`Could not save the photo: ${rowError.message}`, 'error')
      return
    }
    qc.invalidateQueries({ queryKey: ['evidence', instance.id] })
    if (item)
      toggle.mutate(
        { item, patch: { photo_count: item.photo_count + 1, checked: true } },
        { onError: (e) => toast(e.message, 'error') },
      )
    toast('Photo captured & stamped', 'success')
  }

  const doSubmit = async () => {
    if (!instance) return
    if (requiresSig && sig.signed && sig.canvas) {
      try {
        const canvas = sig.canvas
        const blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (b) => (b ? resolve(b) : reject(new Error('Could not capture the signature'))),
            'image/png',
          ),
        )
        const path = `${ORG_ID}/${instance.id}/signature-${Date.now()}.png`
        const { error } = await supabase.storage
          .from('evidence')
          .upload(path, blob, { contentType: 'image/png' })
        if (error) throw new Error(error.message)
        const { error: rowError } = await supabase.from('evidence').insert({
          org_id: ORG_ID,
          instance_id: instance.id,
          type: 'signature',
          storage_path: path,
          uploader: session!.user.id,
          device_ts: new Date().toISOString(),
          geofence_verdict: geo?.verdict ?? 'unknown',
        })
        if (rowError) throw new Error(rowError.message)
      } catch (e) {
        toast(
          `Signature save failed: ${e instanceof Error ? e.message : String(e)}`,
          'error',
        )
        return
      }
    }
    const message = note.trim()
    if (message) {
      const { error: noteError } = await supabase.from('evidence').insert({
        org_id: ORG_ID,
        instance_id: instance.id,
        type: 'note',
        metadata: { text: message },
        uploader: session!.user.id,
        device_ts: new Date().toISOString(),
        geofence_verdict: geo?.verdict ?? 'unknown',
      })
      if (noteError) {
        toast(`Could not save your message: ${noteError.message}`, 'error')
        return
      }
      setNote('')
    }
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
              title:
                instance.requires_approval === false
                  ? isIncident
                    ? 'Incident report completed'
                    : total === 0
                      ? 'Task completed'
                      : 'Checklist completed'
                  : isIncident
                    ? 'Incident report sent'
                    : total === 0
                      ? 'Task submitted'
                      : 'Checklist submitted',
              msg: `${
                instance.requires_approval === false
                  ? 'Logged and archived — no review needed for this task.'
                  : `Sent to your Team Leader for review${message ? ' with your message' : ''}.`
              }${geo?.verdict === 'verified' ? ' Evidence stamped ✓ Verified on-site.' : ''}`,
            },
          }),
        onError: (e) => toast(e.message, 'error'),
      },
    )
  }

  if (!instance) {
    if (task === undefined) return null
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-2 bg-canvas p-6 text-center">
        <div className="text-[15px] font-bold">Task not found</div>
        <div className="text-xs leading-relaxed text-muted">
          This task is no longer available — it may have been completed or removed.
        </div>
        <button
          onClick={() => navigate('/staff/tasks')}
          className="mt-2 rounded-[13px] bg-brand px-5 py-3 text-[13.5px] font-bold text-white"
        >
          Back to tasks
        </button>
      </div>
    )
  }

  return (
    <div className="flex min-h-full flex-col bg-canvas">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          onFile(e.target.files?.[0])
          // reset so the same file / a retake can be picked again
          e.target.value = ''
        }}
      />
      <div className="sticky top-0 z-20 border-b border-line bg-white px-4 pb-2.5 pt-2">
        <div className="mb-2.5 flex items-center gap-2.5">
          <button onClick={() => navigate('/staff')} className="p-1">
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1">
            <div className="text-[15.5px] font-bold">{instance.title}</div>
            <div className="text-[11px] text-muted">
              {total > 0
                ? `${done} / ${total} complete`
                : isIncident
                  ? 'Incident report'
                  : 'No checklist — add photos or a message if needed'}
            </div>
          </div>
          <GeoChip result={geo} checking={checking} storeName={store?.name ?? ''} />
        </div>
        {total > 0 && (
          <div className="h-1.5 overflow-hidden rounded-md bg-[#EDEEF1]">
            <div
              className="h-full rounded-md bg-success transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </div>

      <div className="flex-1 p-4">
        <SentBackBanner task={instance} />
        {isIncident && instance.description?.trim() && (
          <div className="mb-2.5 rounded-[14px] border border-line bg-white p-3.5">
            <div className="mb-1 flex items-center gap-1.5 text-[13.5px] font-semibold">
              <Warning size={17} color="#E5484D" weight="fill" /> What you reported
            </div>
            <div className="whitespace-pre-wrap text-[13px] leading-relaxed text-slate">
              {instance.description}
            </div>
          </div>
        )}
        {(items ?? []).map((it) => (
          <ItemRow key={it.id} item={it} onPhoto={onPhoto} onQr={setQrItem} />
        ))}

        {showPhotos && (
          <div className="mb-2.5 rounded-[14px] border border-line bg-white p-3.5">
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[13.5px] font-semibold">
                <Camera size={17} color="#FF5A2D" /> Photo evidence
              </span>
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                style={{
                  color: photoOk ? '#0E9152' : '#E8481F',
                  background: photoOk ? '#E7F7EF' : '#FFF6F2',
                }}
              >
                {taskPhotos.length
                  ? `${taskPhotos.length} attached ✓`
                  : requiresPhoto
                    ? 'Required'
                    : 'Optional'}
              </span>
            </div>
            <div className="mb-2 text-[11.5px] leading-relaxed text-muted">
              {requiresPhoto
                ? 'Take at least one photo of the finished task.'
                : isIncident
                  ? 'Add photos of the issue or of what you have done about it.'
                  : 'Add photos if they help the reviewer.'}{' '}
              Photos are stamped with time and location and go to the reviewer with your submission.
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {taskPhotos.map((e) => (
                <div
                  key={e.id}
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
                onClick={() => onPhoto(null)}
                disabled={uploading}
                className="flex h-[46px] items-center gap-1.5 rounded-[10px] border-[1.5px] border-dashed px-3 text-[12.5px] font-semibold disabled:opacity-60"
                style={{
                  borderColor: photoOk ? 'rgba(21,27,40,.2)' : 'rgba(255,90,45,.6)',
                  background: photoOk ? '#F9FAFB' : '#FFF6F2',
                  color: photoOk ? '#8B93A4' : '#E8481F',
                }}
              >
                <Camera size={18} /> {uploading ? 'Saving…' : taskPhotos.length ? 'Add another' : 'Take photo'}
              </button>
            </div>
          </div>
        )}

        {openEvidence && (
          <div className="mb-2.5 rounded-[14px] border border-line bg-white p-3.5">
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[13.5px] font-semibold">
                <ChatText size={17} color="#FF5A2D" /> Message to your reviewer
              </span>
              <span className="rounded-full bg-canvas px-2 py-0.5 text-[10px] font-bold text-slate">Optional</span>
            </div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                returned
                  ? 'What have you done about the feedback?'
                  : isIncident
                    ? 'Any update on the incident?'
                    : 'Anything the reviewer should know?'
              }
              className="h-[84px] w-full resize-none rounded-xl border-[1.5px] border-ink/15 bg-white p-3 text-[13.5px] outline-none focus:border-brand"
            />
          </div>
        )}

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
            if (!payload.startsWith('storeops:') || !payload.includes(instance.store_id)) {
              toast('Wrong code — scan this store’s QR label', 'error')
              return
            }
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
            toggle.mutate(
              { item, patch: { qr_verified: true, checked: true } },
              { onError: (e) => toast(e.message, 'error') },
            )
            toast('QR verified · presence confirmed at asset', 'success')
          }}
        />
      )}

      <div className="sticky bottom-0 border-t border-line bg-white p-4">
        {/* location notice sits with the action it gates, so the checklist never shifts under a tap */}
        {blocked && (
          <div className="mb-1.5 text-[11px] font-semibold text-danger">
            This checklist must be completed on the premises.
          </div>
        )}
        <GeoNotice
          result={geo}
          checking={checking}
          storeName={store?.name}
          onRetry={retry}
          tone={blocked ? 'danger' : 'warn'}
        />
        <button
          onClick={doSubmit}
          disabled={!canSubmit || submit.isPending}
          className="w-full rounded-[13px] p-[15px] text-[15px] font-bold text-white transition"
          style={{ background: canSubmit ? '#FF5A2D' : '#C3C9D2' }}
        >
          {blocked
            ? noLocation
              ? 'Enable location to submit this task'
              : 'Blocked — outside geofence'
            : canSubmit
              ? submitLabel
              : missingSteps}
        </button>
      </div>
    </div>
  )
}
