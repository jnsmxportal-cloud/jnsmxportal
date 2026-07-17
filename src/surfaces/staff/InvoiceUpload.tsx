import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, CircleNotch, FilePdf, Receipt, Scan } from '@phosphor-icons/react'
import { format } from 'date-fns'
import { jsPDF } from 'jspdf'
import { supabase, ORG_ID } from '../../lib/supabase'
import { useAuth } from '../../auth/AuthProvider'
import { audit } from '../../data/ops'
import { useToast } from '../../components/Toast'
import { useStaffStore } from './StaffShell'

const suppliers = ['Booker', 'Coca-Cola Enterprises', 'Nisa', 'Bestway', 'Other']

/** FR-4.1a: enhance a camera capture for archive legibility (resize, grayscale, contrast stretch). */
async function enhanceToJpeg(file: File): Promise<string> {
  const img = await createImageBitmap(file)
  const maxSide = 1400
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
  const w = Math.round(img.width * scale)
  const h = Math.round(img.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0, w, h)
  const data = ctx.getImageData(0, 0, w, h)
  const px = data.data
  let min = 255
  let max = 0
  for (let i = 0; i < px.length; i += 4) {
    const g = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]
    if (g < min) min = g
    if (g > max) max = g
  }
  const range = Math.max(1, max - min)
  for (let i = 0; i < px.length; i += 4) {
    const g = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]
    const v = Math.min(255, Math.max(0, ((g - min) / range) * 255 * 1.08))
    px[i] = px[i + 1] = px[i + 2] = v
  }
  ctx.putImageData(data, 0, 0)
  return canvas.toDataURL('image/jpeg', 0.85)
}

export default function InvoiceUpload() {
  const navigate = useNavigate()
  const toast = useToast()
  const { session } = useAuth()
  const store = useStaffStore()
  const fileRef = useRef<HTMLInputElement>(null)
  const [supplier, setSupplier] = useState(suppliers[0])
  const [invoiceNo, setInvoiceNo] = useState('')
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const onFile = async (f: File | undefined) => {
    if (!f) return
    setBusy(true)
    try {
      setPreview(await enhanceToJpeg(f))
      toast('Scan enhanced · contrast corrected, ready to file', 'success')
    } finally {
      setBusy(false)
    }
  }

  const submit = async () => {
    if (!preview || !store) return
    setBusy(true)
    try {
      const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
      pdf.addImage(preview, 'JPEG', 8, 8, 194, 0)
      const blob = pdf.output('blob')
      // filed by store / supplier / month (FR-6.6)
      const month = format(new Date(), 'yyyy-MM')
      const safe = (s: string) => s.replace(/[^a-zA-Z0-9-_]/g, '_')
      const path = `${safe(store.name)}/${safe(supplier)}/${month}/${safe(invoiceNo || `scan-${Date.now()}`)}.pdf`
      const { error: upErr } = await supabase.storage.from('invoices').upload(path, blob, {
        contentType: 'application/pdf',
        upsert: true,
      })
      if (upErr) throw upErr
      const { error } = await supabase.from('invoices').insert({
        org_id: ORG_ID,
        store_id: store.id,
        supplier,
        invoice_no: invoiceNo || null,
        invoice_date: format(new Date(), 'yyyy-MM-dd'),
        pdf_path: path,
        uploaded_by: session!.user.id,
      })
      if (error) throw error
      await audit(session!.user.id, 'invoice.uploaded', 'invoice', '', { path })
      navigate('/staff/success', {
        state: {
          icon: 'seal',
          color: '#16B364',
          title: 'Invoice filed',
          msg: `Saved as PDF and filed under ${store.name} / ${supplier} / ${month}. Immediately searchable — no Remote Office step needed.`,
        },
      })
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const label = 'mb-1.5 block text-xs font-semibold text-slate'
  const inputCls =
    'w-full rounded-xl border-[1.5px] border-ink/15 bg-white p-3 text-sm outline-none focus:border-brand'

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
      <div className="border-b border-line bg-white px-4 pb-3 pt-2">
        <div className="flex items-center gap-2.5">
          <button onClick={() => navigate('/staff')} className="p-1">
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1">
            <div className="text-[15.5px] font-bold">Invoice Upload</div>
            <div className="text-[11px] text-muted">
              Direct to invoice folder · replaces the Google-Sheet process
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3.5 p-4">
        <div className="grid grid-cols-2 gap-3">
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
              value={invoiceNo}
              onChange={(e) => setInvoiceNo(e.target.value)}
              placeholder="e.g. 4471"
              className={inputCls}
            />
          </div>
        </div>

        <button
          onClick={() => fileRef.current?.click()}
          className="flex w-full items-center gap-3 rounded-[14px] border-[1.5px] border-brand/50 bg-brand-tint p-3.5 text-left"
        >
          <div className="flex h-[46px] w-[46px] flex-none items-center justify-center rounded-xl bg-brand">
            {busy ? (
              <CircleNotch size={24} color="#fff" className="animate-spin" />
            ) : (
              <Scan size={24} weight="fill" color="#fff" />
            )}
          </div>
          <div className="flex-1">
            <div className="text-sm font-bold">{preview ? 'Retake scan' : 'Scan invoice'}</div>
            <div className="mt-px text-[11.5px] text-muted">
              Auto contrast-enhance · saved as archive-ready PDF
            </div>
          </div>
        </button>

        {preview && (
          <div className="rounded-[14px] border border-line bg-white p-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-success-deep">
              <FilePdf size={16} weight="fill" /> Enhanced preview
            </div>
            <img src={preview} alt="Enhanced invoice scan" className="max-h-[300px] w-full rounded-lg object-contain" />
          </div>
        )}
      </div>

      <div className="sticky bottom-0 border-t border-line bg-white p-4">
        <button
          onClick={submit}
          disabled={!preview || busy}
          className="flex w-full items-center justify-center gap-2 rounded-[13px] bg-brand p-[15px] text-[15px] font-bold text-white disabled:opacity-50"
        >
          <Receipt size={18} weight="fill" /> File invoice as PDF
        </button>
      </div>
    </div>
  )
}
