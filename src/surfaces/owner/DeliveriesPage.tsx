import { useState } from 'react'
import { Camera, ChatText, Check, ClipboardText, FilePdf, FolderOpen, X } from '@phosphor-icons/react'
import { Card, StatusChip, deliveryStatusStyle } from '../../components/ui'
import { useAuth } from '../../auth/AuthProvider'
import { useDeliveries, useInvoices, useReviewDelivery } from '../../data/hooks'
import { timeAgo } from '../../lib/format'
import { useToast } from '../../components/Toast'
import { useOwnerCtx } from './OwnerLayout'
import { useNames } from './shared'
import { DeliveryDetailModal, VerifyModal, useOpenInvoicePdf } from './DeliveryDetailModal'
import { deliveryIssueText } from '../../lib/deliveryIssues'
import type { Delivery } from '../../lib/types'

function InvoiceFolder({ storeId }: { storeId: string | 'all' }) {
  const { data: invoices } = useInvoices(storeId)
  const { storeName, userName } = useNames()
  const open = useOpenInvoicePdf()
  return (
    <Card className="mt-5 max-w-[980px] overflow-hidden">
      <div className="flex items-center gap-2 border-b border-ink/5 px-5 py-[15px]">
        <FolderOpen size={16} weight="fill" color="#DB2777" />
        <h3 className="text-sm font-bold">Invoice folder</h3>
        <span className="ml-auto text-[11.5px] text-muted">
          filed by store / supplier / month · direct uploads, no Remote-Office step
        </span>
      </div>
      {(invoices ?? []).map((inv) => (
        <div
          key={inv.id}
          className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 border-t border-ink/5 px-5 py-3 text-[12.5px] md:grid-cols-[1.2fr_1fr_.8fr_1.4fr_auto]"
        >
          <span className="font-semibold">{inv.supplier}</span>
          <span className="hidden text-slate md:block">{storeName(inv.store_id)}</span>
          <span className="hidden font-mono text-slate md:block">{inv.invoice_no ? `#${inv.invoice_no}` : '—'}</span>
          <span className="col-span-2 truncate font-mono text-[11px] text-muted md:col-span-1">{inv.pdf_path}</span>
          <button
            onClick={() => open(inv.pdf_path)}
            title={`Uploaded by ${userName(inv.uploaded_by)} · ${timeAgo(inv.uploaded_at)}`}
            className="flex items-center gap-1.5 rounded-lg border border-ink/15 px-3 py-1.5 text-xs font-semibold text-slate"
          >
            <FilePdf size={14} /> Open PDF
          </button>
        </div>
      ))}
      {(invoices ?? []).length === 0 && (
        <div className="p-8 text-center text-xs text-muted">
          No invoices filed yet — staff upload them from the Invoice Upload tile.
        </div>
      )}
    </Card>
  )
}

export default function DeliveriesPage() {
  const { storeId } = useOwnerCtx()
  const { can } = useAuth()
  const { data: deliveries } = useDeliveries(storeId)
  const { userName, storeName } = useNames()
  const review = useReviewDelivery()
  const toast = useToast()
  const canAct = can('deliveries.verify')
  const openPdf = useOpenInvoicePdf()
  const [verifying, setVerifying] = useState<Delivery | null>(null)
  // by id, so the modal shows the live row (realtime refetches) rather than a stale snapshot
  const [openId, setOpenId] = useState<string | null>(null)
  const openDelivery = openId ? (deliveries ?? []).find((d) => d.id === openId) ?? null : null

  return (
    <div className="animate-fade">
    <Card className="max-w-[980px] overflow-hidden">
    <div className="overflow-x-auto">
    <div className="min-w-[860px]">
      <div className="grid grid-cols-[1.3fr_1fr_.7fr_.8fr_.9fr_.7fr_auto] gap-3 bg-canvas px-5 py-[13px] text-[11px] font-bold uppercase tracking-wide text-muted">
        <span>Supplier</span>
        <span>Store</span>
        <span>Invoice</span>
        <span>Issues</span>
        <span>Logged by</span>
        <span>Status</span>
        <span />
      </div>
      {(deliveries ?? []).map((d) => {
        const st = deliveryStatusStyle[d.status]
        const verified = d.status === 'verified' || d.status === 'approved'
        return (
          // the whole row (incl. the verification strip) opens the delivery; the inline
          // PDF / Review / Approve / Reject buttons stop propagation so they act on their own
          <div
            key={d.id}
            role="button"
            tabIndex={0}
            aria-label={`Open delivery from ${d.supplier}`}
            onClick={() => setOpenId(d.id)}
            onKeyDown={(e) => {
              if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return
              e.preventDefault()
              setOpenId(d.id)
            }}
            className="cursor-pointer border-t border-ink/5 transition hover:bg-canvas/60 focus-visible:bg-canvas/60 focus-visible:outline-none"
          >
          <div
            className="grid grid-cols-[1.3fr_1fr_.7fr_.8fr_.9fr_.7fr_auto] items-center gap-3 px-5 py-[15px] text-[12.5px]"
          >
            <span className="font-semibold">{d.supplier}</span>
            <span className="text-slate">{storeName(d.store_id)}</span>
            <span className="flex items-center gap-1.5 font-mono text-slate">
              {d.invoice_no ? `#${d.invoice_no}` : '—'}
              {d.invoice_pdf_path && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    openPdf(d.invoice_pdf_path)
                  }}
                  title={`Open invoice PDF${d.invoice_pages ? ` (${d.invoice_pages} page${d.invoice_pages === 1 ? '' : 's'})` : ''}`}
                  aria-label="Open invoice PDF"
                  className="rounded-md p-0.5 text-[#DB2777] hover:bg-[#DB2777]/10"
                >
                  <FilePdf size={16} weight="fill" />
                </button>
              )}
            </span>
            <span
              style={{
                color: deliveryIssueText(d) ? '#E5484D' : '#8B93A4',
                fontWeight: deliveryIssueText(d) ? 700 : 400,
              }}
            >
              {deliveryIssueText(d) ?? '—'}
            </span>
            <span className="text-muted">
              {userName(d.submitted_by)} · {timeAgo(d.submitted_at)}
            </span>
            <span>
              <StatusChip text={st.label} color={st.c} bg={st.b} />
            </span>
            <span className="flex gap-1.5" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
              {canAct && d.status === 'review' && (
                <button
                  onClick={() => setVerifying(d)}
                  className="flex h-8 items-center gap-1.5 rounded-lg border border-info/40 bg-info-soft px-2.5 text-[11.5px] font-semibold text-[#2563EB]"
                >
                  <ClipboardText size={13} weight="fill" /> Review
                </button>
              )}
              {can('deliveries.approve') && d.status === 'verified' && (
                <>
                  <button
                    title="Approve — archive & stage for EPOS"
                    onClick={() =>
                      review.mutate(
                        { delivery: d, verdict: 'approved' },
                        {
                          onSuccess: () => toast('Delivery approved · staged for EPOS sync'),
                          onError: (e) => toast(e.message, 'error'),
                        },
                      )
                    }
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-success text-white"
                  >
                    <Check size={14} weight="bold" />
                  </button>
                  <button
                    title="Reject"
                    onClick={() =>
                      review.mutate(
                        { delivery: d, verdict: 'rejected' },
                        {
                          onSuccess: () => toast('Delivery rejected · returned to store', 'error'),
                          onError: (e) => toast(e.message, 'error'),
                        },
                      )
                    }
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-danger/35 text-danger"
                  >
                    <X size={14} weight="bold" />
                  </button>
                </>
              )}
            </span>
          </div>
          {(d.remarks?.trim() || d.photo_count > 0) && (
            <div className="flex items-start gap-x-5 gap-y-1 px-5 pb-2.5 text-[11.5px] text-slate">
              {d.remarks?.trim() && (
                <span className="flex min-w-0 flex-1 items-start gap-1.5" title={d.remarks}>
                  <ChatText size={13} weight="fill" className="mt-px flex-none text-muted" />
                  <span className="line-clamp-2 min-w-0 [overflow-wrap:anywhere]">
                    <span className="text-muted">Remarks </span>
                    <span className="text-ink">“{d.remarks.trim()}”</span>
                  </span>
                </span>
              )}
              {d.photo_count > 0 && (
                <span className="flex flex-none items-center gap-1 text-muted">
                  <Camera size={13} weight="fill" /> {d.photo_count} photo{d.photo_count === 1 ? '' : 's'}
                </span>
              )}
            </div>
          )}
          {verified && (
            <div className="flex flex-wrap gap-x-5 gap-y-1 bg-canvas/60 px-5 pb-3 pt-1 text-[11.5px] text-slate">
              <span>
                Cost{' '}
                <b className="text-ink">
                  {d.cost != null ? `£${Number(d.cost).toFixed(2)}` : '—'}
                </b>
              </span>
              <span>
                EPOS updated{' '}
                <b className={d.epos_updated ? 'text-success' : 'text-danger'}>
                  {d.epos_updated ? 'Yes' : 'No'}
                </b>
              </span>
              <span>
                Shortages{' '}
                <b className={d.stock_shortages ? 'text-danger' : 'text-ink'}>
                  {d.stock_shortages ?? 'None'}
                </b>
              </span>
            </div>
          )}
          </div>
        )
      })}
      {(deliveries ?? []).length === 0 && (
        <div className="p-10 text-center text-xs text-muted">No deliveries logged yet.</div>
      )}
    </div>
    </div>
    </Card>
    <InvoiceFolder storeId={storeId} />
    {verifying && <VerifyModal delivery={verifying} onClose={() => setVerifying(null)} />}
    {openDelivery && <DeliveryDetailModal delivery={openDelivery} onClose={() => setOpenId(null)} />}
    </div>
  )
}
