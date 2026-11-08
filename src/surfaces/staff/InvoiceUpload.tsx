import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CircleNotch, FilePdf, Receipt } from '@phosphor-icons/react'
import { format } from 'date-fns'
import { supabase, ORG_ID } from '../../lib/supabase'
import { useAuth } from '../../auth/AuthProvider'
import { useInvoices } from '../../data/hooks'
import { useSupplierNames } from '../../data/suppliers'
import { audit } from '../../data/ops'
import { timeAgo } from '../../lib/format'
import { useToast } from '../../components/Toast'
import InvoicePages, { useInvoicePages } from '../../components/InvoicePages'
import { useStaffStore } from './StaffShell'
import { buildInvoicePdf, invoicePdfPath } from '../../lib/invoicePdf'


export default function InvoiceUpload() {
  const navigate = useNavigate()
  const toast = useToast()
  const qc = useQueryClient()
  const { session } = useAuth()
  const store = useStaffStore()
  // the owner's supplier list (Admin → Suppliers) plus "Other" for one-off invoices
  const { names: supplierNames } = useSupplierNames()
  const suppliers = [...supplierNames, 'Other']
  const [pickedSupplier, setSupplier] = useState('')
  const supplier = suppliers.includes(pickedSupplier) ? pickedSupplier : suppliers[0]
  const [invoiceNo, setInvoiceNo] = useState('')
  const invoicePages = useInvoicePages()
  const [busy, setBusy] = useState(false)
  const { data: recentInvoices } = useInvoices(store?.id)
  const ready = invoicePages.count > 0 && !invoicePages.processing

  const openInvoice = async (path: string | null) => {
    if (!path) return
    const { data, error } = await supabase.storage.from('invoices').createSignedUrl(path, 300)
    if (error || !data?.signedUrl) {
      toast('Could not open the PDF', 'error')
      return
    }
    window.open(data.signedUrl, '_blank')
  }

  const submit = async () => {
    if (!ready || busy) return
    if (!store) {
      toast('No store is assigned to your account — ask your manager to add you to a store', 'error')
      return
    }
    setBusy(true)
    try {
      const pageCount = invoicePages.pages.length
      const blob = buildInvoicePdf(invoicePages.pages)
      const { month, path } = invoicePdfPath(store.name, supplier, invoiceNo)
      const { error: upErr } = await supabase.storage.from('invoices').upload(path, blob, {
        contentType: 'application/pdf',
      })
      if (upErr) throw new Error(`Upload failed: ${upErr.message}`)
      const { error } = await supabase.from('invoices').insert({
        org_id: ORG_ID,
        store_id: store.id,
        supplier,
        invoice_no: invoiceNo || null,
        invoice_date: format(new Date(), 'yyyy-MM-dd'),
        pdf_path: path,
        uploaded_by: session!.user.id,
      })
      if (error) throw new Error(`Filing failed: ${error.message}`)
      try {
        await audit(session!.user.id, 'invoice.uploaded', 'invoice', '', { path, pages: pageCount })
      } catch {
        /* audit is best-effort */
      }
      qc.invalidateQueries({ queryKey: ['invoices'] })
      navigate('/staff/success', {
        state: {
          icon: 'seal',
          color: '#16B364',
          title: 'Invoice filed',
          msg: `Saved as a ${pageCount}-page PDF and filed under ${store.name} / ${supplier} / ${month}. Immediately searchable — no Remote Office step needed.`,
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
      <div className="border-b border-line bg-white px-4 pb-3 pt-2">
        <div className="flex items-center gap-2.5">
          <button onClick={() => navigate('/staff')} className="p-1" aria-label="Back">
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

        <InvoicePages
          state={invoicePages}
          title="Invoice pages"
          hint="Scan every page — they’re enhanced and combined into a single archive-ready PDF. Tap a page to check it."
        />

        {(recentInvoices ?? []).length > 0 && (
          <div className="rounded-[14px] border border-line bg-white">
            <div className="border-b border-ink/5 px-4 py-3 text-xs font-bold">
              Recently filed — {store?.name}
            </div>
            {(recentInvoices ?? []).slice(0, 8).map((inv) => (
              <button
                key={inv.id}
                onClick={() => openInvoice(inv.pdf_path)}
                className="flex w-full items-center gap-2.5 border-t border-ink/5 px-4 py-2.5 text-left first:border-t-0"
              >
                <FilePdf size={18} color="#DB2777" weight="fill" className="flex-none" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-semibold">
                    {inv.supplier}
                    {inv.invoice_no ? ` · #${inv.invoice_no}` : ''}
                  </span>
                  <span className="block text-[10.5px] text-muted">{timeAgo(inv.uploaded_at)}</span>
                </span>
                <span className="text-[11px] font-semibold text-brand">Open</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="sticky bottom-0 border-t border-line bg-white p-4">
        <button
          onClick={submit}
          disabled={!ready || busy}
          className="flex w-full items-center justify-center gap-2 rounded-[13px] bg-brand p-[15px] text-[15px] font-bold text-white disabled:opacity-50"
        >
          {busy ? (
            <CircleNotch size={18} className="animate-spin" />
          ) : (
            <Receipt size={18} weight="fill" />
          )}
          {busy
            ? 'Filing…'
            : invoicePages.count > 1
              ? `File ${invoicePages.count}-page invoice as PDF`
              : 'File invoice as PDF'}
        </button>
      </div>
    </div>
  )
}
