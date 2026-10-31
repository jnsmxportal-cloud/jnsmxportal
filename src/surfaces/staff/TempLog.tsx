import { useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowsClockwise,
  Camera,
  Check,
  Thermometer,
  WarningOctagon,
  X,
} from '@phosphor-icons/react'
import { useStoreUnits, useSubmitTempLog, useTasks } from '../../data/hooks'
import { useToast } from '../../components/Toast'
import WheelPicker from '../../components/WheelPicker'
import GeoChip, { GeoNotice, useGeofence } from './GeoChip'
import { useStaffStore } from './StaffShell'
import { compressImage } from '../../lib/image'
import { format } from 'date-fns'

// readings are chosen on a wheel, so a value is always an integer in this range
const TEMP_MIN = -25
const TEMP_MAX = 30
const clampTemp = (v: number) => Math.min(TEMP_MAX, Math.max(TEMP_MIN, Math.round(v)))
const fmtTemp = (v: number) => `${v > 0 ? '+' : ''}${v}°C`

interface UnitPhoto {
  blob: Blob
  url: string
}

export default function TempLog() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const store = useStaffStore()
  const { data: units } = useStoreUnits(store?.id)
  const { data: tasks } = useTasks({ storeId: 'all' })
  const instance = (tasks ?? []).find((t) => t.id === id) ?? null
  const { result: geo, checking, retry } = useGeofence(store)
  const submit = useSubmitTempLog()
  const [vals, setVals] = useState<Record<string, number>>({})
  // wheel sheet: which unit is being set, and the value under the wheel's centre band
  const [picking, setPicking] = useState<string | null>(null)
  const [draft, setDraft] = useState<number>(0)
  // one camera photo of each unit's display, keyed by unit id (camera-only: no gallery picks)
  const [photos, setPhotos] = useState<Record<string, UnitPhoto>>({})
  const [processing, setProcessing] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const photoUnit = useRef<string | null>(null)

  // a template/task with Photo evidence requires a photo per unit before submit
  const photosRequired = !!instance?.evidence?.photo

  const rows = (units ?? []).map((u) => {
    const num = vals[u.id] ?? null
    const bad = num != null && num > u.breach_above
    const warnState = num != null && !bad && num > u.safe_limit
    return { unit: u, num, bad, warn: warnState, photo: photos[u.id] ?? null }
  })
  const pickingRow = rows.find((r) => r.unit.id === picking) ?? null
  const pickingIdx = rows.findIndex((r) => r.unit.id === picking)
  const nextRow = pickingIdx >= 0 ? (rows[pickingIdx + 1] ?? null) : null

  const openPicker = (unitId: string) => {
    const row = rows.find((r) => r.unit.id === unitId)
    if (!row) return
    // start the wheel on the previous reading, else on the unit's safe limit
    setDraft(clampTemp(row.num ?? Number(row.unit.safe_limit)))
    setPicking(unitId)
  }
  const commitDraft = () => {
    if (!picking) return
    setVals((v) => ({ ...v, [picking]: draft }))
  }

  const takePhoto = (unitId: string) => {
    photoUnit.current = unitId
    fileRef.current?.click()
  }
  const onFile = async (f: File | undefined) => {
    const unitId = photoUnit.current
    if (fileRef.current) fileRef.current.value = ''
    if (!f || !unitId) return
    setProcessing(unitId)
    try {
      const blob = await compressImage(f)
      setPhotos((p) => {
        const prev = p[unitId]
        if (prev) URL.revokeObjectURL(prev.url)
        return { ...p, [unitId]: { blob, url: URL.createObjectURL(blob) } }
      })
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not process the photo', 'error')
    } finally {
      setProcessing(null)
    }
  }

  const hasFail = rows.some((r) => r.bad)
  const readingsFilled = rows.length > 0 && rows.every((r) => r.num != null && !Number.isNaN(r.num))
  const photosFilled = !photosRequired || rows.every((r) => r.photo)
  const allFilled = readingsFilled && photosFilled
  const blocked = geo?.verdict === 'off_site'
  const photoCount = rows.filter((r) => r.photo).length

  const doSubmit = () => {
    if (!store) {
      toast('No store assigned to your account', 'error')
      return
    }
    const photoBlobs: Record<string, Blob> = {}
    for (const r of rows) if (r.photo) photoBlobs[r.unit.id] = r.photo.blob
    submit.mutate(
      {
        instance,
        storeId: store.id,
        readings: rows.map((r) => ({ unit: r.unit, value: r.num! })),
        geofenceVerdict: geo?.verdict ?? 'unknown',
        photos: photoBlobs,
        geo: { lat: geo?.lat, lng: geo?.lng, accuracy: geo?.accuracy },
      },
      {
        onSuccess: ({ breaches, queued }) => {
          if (queued) {
            navigate('/staff/success', {
              state: {
                icon: 'seal',
                color: '#F59E0B',
                title: 'Saved offline ⟳',
                msg: `No connection right now — your readings${photoCount ? ' and photos' : ''} are queued on this device and will sync automatically when you’re back online.`,
              },
            })
            return
          }
          if (breaches > 0)
            toast('Critical: temperature failure escalated to Owner', 'warn')
          navigate('/staff/success', {
            state:
              breaches > 0
                ? {
                    icon: 'warn',
                    color: '#E5484D',
                    title: 'Logged · escalation raised',
                    msg: 'A temperature failure was detected — a repair workflow was auto-created and the Owner notified instantly.',
                  }
                : {
                    icon: 'seal',
                    color: '#16B364',
                    // mirrors the checklist runner: say what actually happened to the log
                    title:
                      instance?.requires_approval === false
                        ? 'Temperature log completed'
                        : 'Temperature log submitted',
                    msg: `${
                      rows.some((r) => r.warn)
                        ? 'Logged — one or more readings sit above the safe limit but below the escalation threshold.'
                        : 'All readings within safe limits.'
                    }${photoCount ? ` ${photoCount} display photo${photoCount === 1 ? '' : 's'} attached.` : ''} ${
                      instance?.requires_approval === false
                        ? 'Logged and archived — no review needed for this log.'
                        : 'Locked & sent to your Team Leader for verification.'
                    }${geo?.verdict === 'verified' ? ' Evidence stamped ✓ Verified on-site.' : ''}`,
                  },
          })
        },
        onError: (e) => toast(e.message, 'error'),
      },
    )
  }

  return (
    <div className="flex min-h-full flex-col bg-canvas">
      {/* camera-only capture: no gallery picker, so the photo is taken here and now */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0])}
      />
      <div className="border-b border-line bg-white px-4 pb-3 pt-2">
        <div className="flex items-center gap-2.5">
          <button onClick={() => navigate('/staff')} className="p-1">
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1">
            <div className="text-[15.5px] font-bold">Fridge / Freezer Temp Log</div>
            <div className="text-[11px] text-muted">
              {format(new Date(), 'HH:mm')} reading{store ? ` · ${store.name}` : ''}
            </div>
          </div>
          <GeoChip result={geo} checking={checking} storeName={store?.name ?? ''} />
        </div>
      </div>

      <div className="flex-1 p-4">
        {hasFail && (
          <div className="mb-3.5 flex gap-2.5 rounded-[13px] border border-danger/25 bg-danger-soft p-3">
            <WarningOctagon size={20} weight="fill" color="#E5484D" className="flex-none" />
            <div>
              <div className="text-[13px] font-bold text-[#C0272C]">Temperature failure detected</div>
              <div className="mt-0.5 text-[11.5px] leading-snug text-[#9B3438]">
                A repair workflow will be auto-created and this reading escalated to the Owner
                instantly on submit.
              </div>
            </div>
          </div>
        )}
        {photosRequired && (
          <div className="mb-3.5 flex items-center gap-2.5 rounded-[13px] border border-line bg-white p-3 text-[11.5px] text-slate">
            <Camera size={18} weight="fill" className="flex-none text-brand" />
            <div>
              <b>Photo of every display required.</b> Take it with the camera as you read each unit —
              photos are stamped with the time and your location.
            </div>
          </div>
        )}
        <div className="flex flex-col gap-3">
          {rows.map((r) => {
            const color = r.bad ? '#E5484D' : r.warn ? '#F59E0B' : r.num != null ? '#16B364' : '#8B93A4'
            const bg = r.bad ? '#FCEBEC' : r.warn ? '#FEF3E2' : '#E7F7EF'
            const missingPhoto = photosRequired && !r.photo
            const busy = processing === r.unit.id
            return (
              <div
                key={r.unit.id}
                className="flex items-center gap-3 rounded-[14px] bg-white p-[13px]"
                style={{ border: `1px solid ${r.bad ? 'rgba(229,72,77,.4)' : 'rgba(21,27,40,.08)'}` }}
              >
                <div
                  className="flex h-11 w-11 flex-none items-center justify-center rounded-xl"
                  style={{ background: bg }}
                >
                  <Thermometer size={22} weight="fill" color={color} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{r.unit.name}</div>
                  <div className="text-[11.5px] text-muted">
                    Safe ≤ {r.unit.safe_limit}°C · escalates &gt; {r.unit.breach_above}°C
                  </div>
                </div>
                <button
                  onClick={() => takePhoto(r.unit.id)}
                  disabled={busy}
                  aria-label={r.photo ? `Retake photo of ${r.unit.name}` : `Photograph ${r.unit.name}`}
                  title={r.photo ? 'Retake photo' : photosRequired ? 'Photo required' : 'Add a photo (optional)'}
                  className="relative h-11 w-11 flex-none overflow-hidden rounded-[10px] border-[1.5px] bg-white"
                  style={{
                    borderColor: r.photo ? '#16B364' : missingPhoto ? '#E5484D' : 'rgba(21,27,40,.15)',
                  }}
                >
                  {r.photo ? (
                    <>
                      <img src={r.photo.url} alt="" className="h-full w-full object-cover" />
                      <span className="absolute inset-x-0 bottom-0 flex items-center justify-center bg-ink/60 py-px text-white">
                        <ArrowsClockwise size={10} weight="bold" />
                      </span>
                    </>
                  ) : (
                    <span className="flex h-full w-full items-center justify-center">
                      {busy ? (
                        <ArrowsClockwise size={18} className="animate-spin text-muted" />
                      ) : (
                        <Camera size={18} color={missingPhoto ? '#E5484D' : '#8B93A4'} />
                      )}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => openPicker(r.unit.id)}
                  aria-label={`Set ${r.unit.name} reading`}
                  className="min-w-[78px] rounded-[10px] border-[1.5px] bg-white p-2.5 text-center text-base font-bold outline-none"
                  style={{ borderColor: r.bad ? '#E5484D' : 'rgba(21,27,40,.15)', color }}
                >
                  {r.num != null ? fmtTemp(r.num) : '—'}
                </button>
              </div>
            )
          })}
        </div>
      </div>

      <div className="sticky bottom-0 border-t border-line bg-white p-4">
        <GeoNotice
          result={geo}
          checking={checking}
          storeName={store?.name}
          onRetry={retry}
          tone={blocked ? 'danger' : 'warn'}
        />
        <button
          onClick={doSubmit}
          disabled={!allFilled || blocked || submit.isPending}
          className="w-full rounded-[13px] p-[15px] text-[15px] font-bold text-white"
          style={{ background: allFilled && !blocked ? '#FF5A2D' : '#C3C9D2' }}
        >
          {blocked
            ? 'Blocked — outside geofence'
            : allFilled
              ? 'Submit temperature log'
              : readingsFilled
                ? 'Photograph every unit to submit'
                : 'Enter every reading to submit'}
        </button>
      </div>

      {pickingRow && (
        <div
          onClick={() => setPicking(null)}
          className="fixed inset-0 z-[80] flex items-end justify-center bg-navy/50"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[430px] animate-fade rounded-t-[20px] bg-white p-4 pb-6 shadow-[0_-20px_60px_rgba(0,0,0,.25)]"
          >
            <div className="mb-2 flex items-center gap-2.5">
              <div className="flex-1">
                <div className="text-[15px] font-bold">{pickingRow.unit.name}</div>
                <div className="text-[11.5px] text-muted">
                  Safe limit ≤ {pickingRow.unit.safe_limit}°C · escalates &gt; {pickingRow.unit.breach_above}°C
                </div>
              </div>
              <button onClick={() => setPicking(null)} aria-label="Cancel" className="p-1 text-muted">
                <X size={20} />
              </button>
            </div>
            <WheelPicker
              value={draft}
              onChange={setDraft}
              min={TEMP_MIN}
              max={TEMP_MAX}
              format={fmtTemp}
              colorFor={(v) =>
                v > pickingRow.unit.breach_above
                  ? '#E5484D'
                  : v > pickingRow.unit.safe_limit
                    ? '#F59E0B'
                    : '#16B364'
              }
            />
            <div className="mt-1 text-center text-[11.5px] font-semibold" style={{ color: draft > pickingRow.unit.breach_above ? '#E5484D' : draft > pickingRow.unit.safe_limit ? '#F59E0B' : '#16B364' }}>
              {draft > pickingRow.unit.breach_above
                ? 'Above escalation threshold — will be escalated on submit'
                : draft > pickingRow.unit.safe_limit
                  ? 'Above safe limit'
                  : 'Within safe limit'}
            </div>
            <div className="mt-3 flex gap-2.5">
              <button
                onClick={() => {
                  commitDraft()
                  setPicking(null)
                }}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-ink/15 bg-white p-3 text-[13.5px] font-semibold text-slate"
              >
                <Check size={15} weight="bold" /> Done
              </button>
              {nextRow && (
                <button
                  onClick={() => {
                    commitDraft()
                    setDraft(clampTemp(nextRow.num ?? Number(nextRow.unit.safe_limit)))
                    setPicking(nextRow.unit.id)
                  }}
                  className="flex flex-[1.4] items-center justify-center rounded-xl bg-brand p-3 text-[13.5px] font-semibold text-white"
                >
                  Next: {nextRow.unit.name}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
