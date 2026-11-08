import { useState, type ReactNode } from 'react'
import { format } from 'date-fns'
import { Check, ClipboardText, FilePdf, X } from '@phosphor-icons/react'
import { StatusChip, deliveryStatusStyle } from '../../components/ui'
import { useAuth } from '../../auth/AuthProvider'
import { useReviewDelivery, useVerifyDelivery } from '../../data/hooks'
import { supabase } from '../../lib/supabase'
import { timeAgo } from '../../lib/format'
import { useToast } from '../../components/Toast'
import { EvidencePhoto, useNames } from './shared'
import { useDeliveryEvidence } from '../../data/ownerExtras'
import { deliveryIssueText } from '../../lib/deliveryIssues'
import type { Delivery } from '../../lib/types'

const shell = 'fixed inset-0 z-[80] flex items-center justify-center bg-navy/50 p-3 sm:p-6'
const panel =
  'max-h-[calc(100dvh-24px)] w-[480px] max-w-full overflow-y-auto animate-fade rounded-[20px] bg-white p-6 shadow-[0_30px_80px_rgba(0,0,0,.3)] sm:max-h-[calc(100dvh-48px)]'
const label = 'mb-1.5 block text-xs font-semibold text-slate'

/** Open a PDF from the `invoices` bucket via a short-lived signed URL. */
export function useOpenInvoicePdf() {
  const toast = useToast()
  return async (path: string | null) => {
    if (!path) return
    const { data, error } = await supabase.storage.from('invoices').createSignedUrl(path, 300)
    if (error || !data?.signedUrl) {
      toast('Could not open the PDF', 'error')
      return
    }
    window.open(data.signedUrl, '_blank')
  }
}

function InvoiceScan({ delivery }: { delivery: Delivery }) {
  const openPdf = useOpenInvoicePdf()
  if (!delivery.invoice_pdf_path)
    return (
      <div className="mb-3 rounded-[10px] border border-dashed border-ink/15 px-3 py-2.5 text-[11.5px] text-muted">
        No invoice scanned with this delivery
      </div>
    )
  return (
    <button
      onClick={() => openPdf(delivery.invoice_pdf_path)}
      className="mb-3 flex w-full items-center gap-2.5 rounded-[10px] border border-ink/15 px-3 py-2.5 text-left"
    >
      <FilePdf size={20} weight="fill" color="#DB2777" />
      <span className="flex-1 text-[12.5px] font-semibold">
        Invoice{delivery.invoice_no ? ` #${delivery.invoice_no}` : ''}
        {delivery.invoice_pages ? (
          <span className="font-normal text-muted">
            {' '}· {delivery.invoice_pages} page{delivery.invoice_pages === 1 ? '' : 's'}
          </span>
        ) : null}
      </span>
      <span className="text-[11.5px] font-semibold text-brand">Open PDF</span>
    </button>
  )
}

function GoodsPhotos({ deliveryId }: { deliveryId: string }) {
  const { data: evidence } = useDeliveryEvidence(deliveryId)
  const photos = (evidence ?? []).filter((e) => e.type === 'photo' && e.storage_path)
  if (photos.length === 0)
    return (
      <div className="mb-3 rounded-[10px] border border-dashed border-ink/15 px-3 py-2.5 text-[11.5px] text-muted">
        No photos attached to this delivery
      </div>
    )
  return (
    <div className="mb-3 flex flex-wrap gap-2">
      {photos.map((e) => (
        <EvidencePhoto key={e.id} ev={e} />
      ))}
    </div>
  )
}

export function VerifyModal({ delivery, onClose }: { delivery: Delivery; onClose: () => void }) {
  const verify = useVerifyDelivery()
  const toast = useToast()
  const [cost, setCost] = useState(
    delivery.cost ?? delivery.invoice_total ? Number(delivery.cost ?? delivery.invoice_total).toFixed(2) : '',
  )
  const [epos, setEpos] = useState(false)
  /** Money input: digits and one decimal point, at most 2 decimals (a comma is read as the point). */
  const onCost = (raw: string) => {
    const v = raw.replace(',', '.').replace(/[^0-9.]/g, '')
    const [whole, ...rest] = v.split('.')
    setCost(rest.length ? `${whole}.${rest.join('').slice(0, 2)}` : whole)
  }
  const costNum = cost === '' || cost === '.' ? null : Number(cost)
  const [shortages, setShortages] = useState(
    deliveryIssueText(delivery) ? `${deliveryIssueText(delivery)} per staff report` : '',
  )
  const inputCls =
    'w-full rounded-xl border-[1.5px] border-ink/15 bg-white p-2.5 text-sm outline-none focus:border-brand'

  return (
    <div onClick={onClose} className={shell}>
      <div onClick={(e) => e.stopPropagation()} className={panel}>
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-[17px] font-bold">Verify delivery</h3>
          <button onClick={onClose} className="p-1 text-muted"><X size={18} /></button>
        </div>
        <div className="mb-4 text-xs text-muted">
          {delivery.supplier} · Inv #{delivery.invoice_no} — Remote Office step: confirm the cost, then
          it goes to the Owner for approval.
        </div>
        <label className={label}>Invoice scan</label>
        <InvoiceScan delivery={delivery} />
        <label className={label}>Goods photos from the store</label>
        <GoodsPhotos deliveryId={delivery.id} />
        <div className="mb-3">
          <label className={label} htmlFor="verify-cost">
            Cost per original invoice (£)
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted">
              £
            </span>
            <input
              id="verify-cost"
              value={cost}
              onChange={(e) => onCost(e.target.value)}
              onBlur={() => costNum !== null && setCost(costNum.toFixed(2))}
              inputMode="decimal"
              placeholder="0.00"
              className={`${inputCls} pl-7 tabular-nums`}
            />
          </div>
        </div>
        <label className={label}>Stock shortages</label>
        <textarea
          value={shortages}
          onChange={(e) => setShortages(e.target.value)}
          className={`${inputCls} mb-3 h-16 resize-none`}
          placeholder="None"
        />
        <label className="mb-4 flex items-center gap-2 text-[13px] font-semibold text-slate">
          <input type="checkbox" checked={epos} onChange={(e) => setEpos(e.target.checked)} className="h-4 w-4 accent-[#FF5A2D]" />
          EPOS updated
        </label>
        <button
          onClick={() =>
            verify.mutate(
              {
                delivery,
                cost: costNum,
                eposUpdated: epos,
                stockShortages: shortages,
              },
              {
                onSuccess: () => {
                  toast('Verified · approval request pushed to the Owner')
                  onClose()
                },
                onError: (e) => toast(e.message, 'error'),
              },
            )
          }
          disabled={verify.isPending}
          className="w-full rounded-xl bg-brand p-3 text-[13.5px] font-semibold text-white disabled:opacity-60"
        >
          Complete verification
        </button>
      </div>
    </div>
  )
}

function Fact({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div>
      <div className="text-[11px] text-muted">{k}</div>
      <div className="text-[13px] font-semibold">{children}</div>
    </div>
  )
}

const money = (n: number | null) => (n != null ? `£${Number(n).toFixed(2)}` : '—')

/**
 * Everything about one delivery — what the store logged, the invoice scan and goods photos,
 * the Remote Office verification once done — plus the next step for its status
 * (Review & verify while in review, Approve / Reject once verified), if the viewer has that right.
 */
export function DeliveryDetailModal({ delivery, onClose }: { delivery: Delivery; onClose: () => void }) {
  const { can } = useAuth()
  const { userName, storeName } = useNames()
  const review = useReviewDelivery()
  const toast = useToast()
  const [verifying, setVerifying] = useState(false)
  const st = deliveryStatusStyle[delivery.status]
  const verified = delivery.status === 'verified' || delivery.status === 'approved'
  const issueText = deliveryIssueText(delivery)

  if (verifying) return <VerifyModal delivery={delivery} onClose={onClose} />

  const decide = (verdict: 'approved' | 'rejected') =>
    review.mutate(
      { delivery, verdict },
      {
        onSuccess: () => {
          toast(
            verdict === 'approved' ? 'Delivery approved · staged for EPOS sync' : 'Delivery rejected · returned to store',
            verdict === 'approved' ? undefined : 'error',
          )
          onClose()
        },
        onError: (e) => toast(e.message, 'error'),
      },
    )

  return (
    <div onClick={onClose} className={shell}>
      <div onClick={(e) => e.stopPropagation()} className={panel}>
        <div className="mb-1 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-[17px] font-bold">{delivery.supplier}</h3>
            <div className="text-xs text-muted">
              {storeName(delivery.store_id)}
              {delivery.invoice_no ? ` · Inv #${delivery.invoice_no}` : ''}
            </div>
          </div>
          <div className="flex flex-none items-center gap-2">
            <StatusChip text={st.label} color={st.c} bg={st.b} />
            <button onClick={onClose} className="p-1 text-muted" aria-label="Close"><X size={18} /></button>
          </div>
        </div>

        <div className="my-4 grid grid-cols-2 gap-x-4 gap-y-3 rounded-[14px] bg-canvas p-3.5">
          <Fact k="Logged by">
            {userName(delivery.submitted_by)}
            <span className="font-normal text-muted"> · {timeAgo(delivery.submitted_at)}</span>
          </Fact>
          <Fact k="Issues">
            <span className={issueText ? 'text-danger' : ''}>
              {issueText ?? 'None'}
            </span>
          </Fact>
          <Fact k="Invoice date">
            {delivery.invoice_date ? format(new Date(delivery.invoice_date), 'd MMM yyyy') : '—'}
          </Fact>
          <Fact k="Invoice total">{money(delivery.invoice_total)}</Fact>
        </div>

        {delivery.remarks?.trim() && (
          <>
            <label className={label}>Remarks from the store</label>
            <div className="mb-3 rounded-[10px] border border-ink/10 px-3 py-2.5 text-[12.5px]">
              {delivery.remarks}
            </div>
          </>
        )}

        <label className={label}>Invoice scan</label>
        <InvoiceScan delivery={delivery} />
        <label className={label}>Goods photos from the store</label>
        <GoodsPhotos deliveryId={delivery.id} />

        {verified && (
          <>
            <label className={label}>Remote Office verification</label>
            <div className="mb-3 grid grid-cols-2 gap-x-4 gap-y-3 rounded-[14px] border border-ink/10 p-3.5">
              <Fact k="Cost">{money(delivery.cost)}</Fact>
              <Fact k="EPOS updated">
                <span className={delivery.epos_updated ? 'text-success' : 'text-danger'}>
                  {delivery.epos_updated ? 'Yes' : 'No'}
                </span>
              </Fact>
              <Fact k="Shortages">
                <span className={delivery.stock_shortages ? 'text-danger' : ''}>
                  {delivery.stock_shortages || 'None'}
                </span>
              </Fact>
            </div>
          </>
        )}

        {delivery.status === 'review' &&
          (can('deliveries.verify') ? (
            <button
              onClick={() => setVerifying(true)}
              className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-brand p-3 text-[13.5px] font-semibold text-white"
            >
              <ClipboardText size={16} weight="fill" /> Review &amp; verify
            </button>
          ) : (
            <div className="mt-1 rounded-[10px] bg-warn-soft px-3 py-2.5 text-[11.5px] font-semibold text-amber">
              Waiting for Remote Office to verify the cost
            </div>
          ))}

        {delivery.status === 'verified' && can('deliveries.approve') && (
          <div className="mt-1 grid grid-cols-2 gap-2.5">
            <button
              onClick={() => decide('rejected')}
              disabled={review.isPending}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-danger/35 p-3 text-[13.5px] font-semibold text-danger disabled:opacity-60"
            >
              <X size={15} weight="bold" /> Reject
            </button>
            <button
              onClick={() => decide('approved')}
              disabled={review.isPending}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-success p-3 text-[13.5px] font-semibold text-white disabled:opacity-60"
            >
              <Check size={15} weight="bold" /> Approve
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
