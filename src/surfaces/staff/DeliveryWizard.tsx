import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Camera,
  Check,
  MapPin,
  Warning,
  X,
} from '@phosphor-icons/react'
import { useAuth } from '../../auth/AuthProvider'
import { useSubmitDelivery } from '../../data/hooks'
import { compressImage } from '../../lib/image'
import { useToast } from '../../components/Toast'
import GeoChip, { useGeofence } from './GeoChip'
import { useStaffStore } from './StaffShell'

const suppliers = ['Booker', 'Coca-Cola Enterprises', 'Nisa', 'Bestway']
const stepNames = ['Details', 'Photos', 'Remarks', 'Review']

export default function DeliveryWizard() {
  const navigate = useNavigate()
  const toast = useToast()
  const { profile } = useAuth()
  const store = useStaffStore()
  const { result: geo, checking } = useGeofence(store)
  const submit = useSubmitDelivery()

  const [step, setStep] = useState(0)
  const [supplier, setSupplier] = useState(suppliers[0])
  const [invoice, setInvoice] = useState('')
  const [qty, setQty] = useState('')
  const [remarks, setRemarks] = useState('')
  const [photos, setPhotos] = useState<{ blob: Blob; url: string }[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  const qtyNum = parseInt(qty || '0', 10)
  const blocked = geo?.verdict === 'off_site'
  const inputCls =
    'w-full rounded-xl border-[1.5px] border-ink/15 bg-white p-3 text-sm outline-none focus:border-brand'
  const label = 'mb-1.5 block text-xs font-semibold text-slate'

  const addPhoto = async (f: File | undefined) => {
    if (!f) return
    try {
      const blob = await compressImage(f)
      setPhotos((p) => [...p, { blob, url: URL.createObjectURL(blob) }])
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not process the photo', 'error')
    }
  }

  const removePhoto = (i: number) => {
    setPhotos((p) => {
      URL.revokeObjectURL(p[i].url)
      return p.filter((_, idx) => idx !== i)
    })
  }

  const next = () => {
    if (step < 3) {
      setStep(step + 1)
      return
    }
    if (blocked) return
    if (!store) {
      toast('No store assigned to your account', 'error')
      return
    }
    submit.mutate(
      {
        storeId: store.id,
        supplier,
        invoiceNo: invoice,
        discrepancy: Number.isNaN(qtyNum) ? 0 : qtyNum,
        remarks,
        photoCount: photos.length,
        photos: photos.map((p) => p.blob),
        geofenceVerdict: geo?.verdict ?? 'unknown',
      },
      {
        onSuccess: ({ queued }) => {
          if (queued) {
            navigate('/staff/success', {
              state: {
                icon: 'truck',
                color: '#F59E0B',
                title: 'Saved offline ⟳',
                msg: 'No connection right now — the delivery is queued on this device and will sync automatically when you’re back online.',
              },
            })
            return
          }
          toast('Delivery sent to Remote Office · Owner will approve', 'info')
          navigate('/staff/success', {
            state: {
              icon: 'truck',
              color: '#3B82F6',
              title: 'Delivery submitted',
              msg: 'Record created and pushed to Remote Office for cost & quantity verification (36h SLA). You’ll be notified when it’s approved.',
            },
          })
        },
        onError: (e) => toast(e.message, 'error'),
      },
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
          addPhoto(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      <div className="border-b border-line bg-white px-4 pb-3 pt-2">
        <div className="mb-3 flex items-center gap-2.5">
          <button onClick={() => (step === 0 ? navigate('/staff') : setStep(step - 1))} className="p-1">
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1">
            <div className="text-[15.5px] font-bold">Delivery Received</div>
            <div className="text-[11px] text-muted">
              Step {step + 1} of 4 · {stepNames[step]}
            </div>
          </div>
          <GeoChip result={geo} checking={checking} storeName={store?.name ?? ''} />
        </div>
        <div className="flex gap-1.5">
          {stepNames.map((_, i) => (
            <div
              key={i}
              className="h-[5px] flex-1 rounded-[5px]"
              style={{ background: i <= step ? '#FF5A2D' : '#EDEEF1' }}
            />
          ))}
        </div>
      </div>

      <div className="flex-1 p-4">
        {step === 0 && (
          <div className="flex flex-col gap-3.5">
            <div>
              <label className={label}>Supplier</label>
              <select value={supplier} onChange={(e) => setSupplier(e.target.value)} className={inputCls}>
                {suppliers.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={label}>Invoice number</label>
              <input
                value={invoice}
                onChange={(e) => setInvoice(e.target.value)}
                placeholder="e.g. 4471"
                className={inputCls}
              />
            </div>
            {geo?.verdict === 'verified' && (
              <div className="flex items-center gap-2.5 rounded-xl bg-success-soft p-3">
                <MapPin size={19} weight="fill" color="#0E9152" />
                <div className="text-xs font-medium text-success-deep">
                  Location verified on-site · {store?.name}
                  {geo.distanceM != null ? ` (${geo.distanceM} m)` : ''}. This delivery is provably
                  logged in-store.
                </div>
              </div>
            )}
            <div className="text-xs leading-normal text-muted">
              Staff name <b className="text-ink">{profile!.full_name}</b> and timestamp are captured
              automatically.
            </div>
          </div>
        )}

        {step === 1 && (
          <div>
            <div className="mb-1 text-[13px] font-semibold">Capture invoice &amp; goods</div>
            <div className="mb-3.5 text-xs text-muted">
              Photograph the invoice and the delivered stock.
            </div>
            <div className="grid grid-cols-3 gap-2.5">
              {photos.map((ph, i) => (
                <div
                  key={ph.url}
                  className="relative aspect-square overflow-hidden rounded-[13px] border border-ink/5"
                >
                  <img src={ph.url} alt="" className="h-full w-full object-cover" />
                  <button
                    onClick={() => removePhoto(i)}
                    className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-ink/70"
                  >
                    <X size={13} weight="bold" color="#fff" />
                  </button>
                </div>
              ))}
              <button
                onClick={() => fileRef.current?.click()}
                className="flex aspect-square flex-col items-center justify-center gap-1 rounded-[13px] border-[1.5px] border-dashed border-ink/20 bg-[#F9FAFB]"
              >
                <Camera size={24} color="#8B93A4" />
                <span className="text-[10px] font-semibold text-muted">Capture</span>
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-3.5">
            <div>
              <label className={label}>Quantity discrepancy (units short)</label>
              <input
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                inputMode="numeric"
                placeholder="0"
                className={inputCls}
              />
            </div>
            {qtyNum > 0 && (
              <div className="flex items-center gap-2 rounded-xl bg-warn-soft p-3 text-xs text-amber">
                <Warning size={16} weight="fill" />
                Discrepancy &gt; 0 will flag an escalation to the Owner.
              </div>
            )}
            <div>
              <label className={label}>Remarks</label>
              <textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Anything unusual about this delivery…"
                className="h-[90px] w-full resize-none rounded-xl border-[1.5px] border-ink/15 bg-white p-3 text-sm outline-none focus:border-brand"
              />
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <div className="mb-3.5 rounded-[14px] border border-line bg-white p-4">
              <div className="mb-3 text-sm font-bold">Review submission</div>
              <div className="flex flex-col gap-2 text-[13px]">
                {[
                  ['Supplier', supplier],
                  ['Invoice', invoice ? `#${invoice}` : '—'],
                  ['Photos', `${photos.length} captured`],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <span className="text-muted">{k}</span>
                    <span className="font-semibold">{v}</span>
                  </div>
                ))}
                <div className="flex justify-between">
                  <span className="text-muted">Discrepancy</span>
                  <span className="font-semibold" style={{ color: qtyNum > 0 ? '#E5484D' : '#151B28' }}>
                    {qtyNum > 0 ? `${qtyNum} short` : 'None'}
                  </span>
                </div>
                <div className="flex justify-between border-t border-ink/5 pt-2">
                  <span className="text-muted">Location</span>
                  <span
                    className="font-semibold"
                    style={{ color: geo?.verdict === 'verified' ? '#0E9152' : '#F59E0B' }}
                  >
                    {geo?.verdict === 'verified' ? 'Verified on-site ✓' : 'Not verified'}
                  </span>
                </div>
              </div>
            </div>
            <div className="rounded-[14px] bg-info-soft p-4">
              <div className="mb-2.5 text-[11.5px] font-bold uppercase tracking-wide text-[#2563EB]">
                What happens next
              </div>
              {[
                { n: 1, text: 'You submit — record created', done: true },
                { n: 2, text: 'Remote Office verifies cost & quantity (36h SLA)' },
                { n: 3, text: 'Owner approves → archived for EPOS' },
              ].map((s, i) => (
                <div key={s.n}>
                  {i > 0 && <div className="ml-3 h-3.5 w-0.5 bg-[#c9d6f0]" />}
                  <div className="flex items-center gap-2.5">
                    <div
                      className="flex h-[26px] w-[26px] items-center justify-center rounded-full"
                      style={
                        s.done
                          ? { background: '#16B364' }
                          : { background: '#fff', border: '2px solid #93b4f0' }
                      }
                    >
                      {s.done ? (
                        <Check size={13} weight="bold" color="#fff" />
                      ) : (
                        <span className="text-[11px] font-bold text-[#2563EB]">{s.n}</span>
                      )}
                    </div>
                    <span
                      className="text-[12.5px]"
                      style={{ color: s.done ? '#151B28' : '#5B6478', fontWeight: s.done ? 600 : 400 }}
                    >
                      {s.text}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="sticky bottom-0 border-t border-line bg-white p-4">
        <button
          onClick={next}
          disabled={submit.isPending || (step === 3 && blocked)}
          className="w-full rounded-[13px] bg-brand p-[15px] text-[15px] font-bold text-white disabled:opacity-60"
        >
          {step < 3 ? 'Continue' : blocked ? 'Blocked — outside geofence' : 'Submit delivery'}
        </button>
      </div>
    </div>
  )
}
