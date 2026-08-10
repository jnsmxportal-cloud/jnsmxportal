import { useState } from 'react'
import { Check, ClipboardText, FilePdf, FolderOpen, X } from '@phosphor-icons/react'
import { Card, StatusChip, deliveryStatusStyle } from '../../components/ui'
import { useAuth } from '../../auth/AuthProvider'
import { useDeliveries, useInvoices, useReviewDelivery, useVerifyDelivery } from '../../data/hooks'
import { supabase } from '../../lib/supabase'
import { timeAgo } from '../../lib/format'
import { useToast } from '../../components/Toast'
import { useOwnerCtx } from './OwnerLayout'
import { EvidencePhoto, useNames } from './shared'
import { useDeliveryEvidence } from '../../data/ownerExtras'
import type { Delivery } from '../../lib/types'

function VerifyModal({ delivery, onClose }: { delivery: Delivery; onClose: () => void }) {
  const verify = useVerifyDelivery()
  const toast = useToast()
  const { data: evidence } = useDeliveryEvidence(delivery.id)
  const photos = (evidence ?? []).filter((e) => e.type === 'photo' && e.storage_path)
  const [cost, setCost] = useState((delivery.cost ?? delivery.invoice_total)?.toString() ?? '')
  const [qty, setQty] = useState('')
  const [epos, setEpos] = useState(false)
  const [shortages, setShortages] = useState(
    delivery.discrepancy_units > 0 ? `${delivery.discrepancy_units} unit(s) short per staff count` : '',
  )
  const inputCls =
    'w-full rounded-xl border-[1.5px] border-ink/15 bg-white p-2.5 text-sm outline-none focus:border-brand'
  const label = 'mb-1.5 block text-xs font-semibold text-slate'

  return (
    <div onClick={onClose} className="fixed inset-0 z-[80] flex items-center justify-center bg-navy/50 p-6">
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[440px] max-w-full animate-fade rounded-[20px] bg-white p-6 shadow-[0_30px_80px_rgba(0,0,0,.3)]"
      >
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-[17px] font-bold">Verify delivery</h3>
          <button onClick={onClose} className="p-1 text-muted"><X size={18} /></button>
        </div>
        <div className="mb-4 text-xs text-muted">
          {delivery.supplier} · Inv #{delivery.invoice_no} — Remote Office step: confirm cost &amp;
          quantity, then it goes to the Owner for approval.
        </div>
        <label className={label}>Goods photos from the store</label>
        {photos.length > 0 ? (
          <div className="mb-3 flex flex-wrap gap-2">
            {photos.map((e) => (
              <EvidencePhoto key={e.id} ev={e} />
            ))}
          </div>
        ) : (
          <div className="mb-3 rounded-[10px] border border-dashed border-ink/15 px-3 py-2.5 text-[11.5px] text-muted">
            No photos attached to this delivery
          </div>
        )}
        <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={label}>Cost per original invoice (£)</label>
            <input value={cost} onChange={(e) => setCost(e.target.value)} inputMode="decimal" className={inputCls} />
          </div>
          <div>
            <label className={label}>Final quantity (units)</label>
            <input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="numeric" className={inputCls} />
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
                cost: cost ? parseFloat(cost) : null,
                finalQty: qty ? parseInt(qty, 10) : null,
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

function InvoiceFolder({ storeId }: { storeId: string | 'all' }) {
  const { data: invoices } = useInvoices(storeId)
  const { storeName, userName } = useNames()
  const toast = useToast()
  const open = async (path: string | null) => {
    if (!path) return
    const { data, error } = await supabase.storage.from('invoices').createSignedUrl(path, 300)
    if (error || !data?.signedUrl) {
      toast('Could not open the PDF', 'error')
      return
    }
    window.open(data.signedUrl, '_blank')
  }
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
  const { profile } = useAuth()
  const { data: deliveries } = useDeliveries(storeId)
  const { userName, storeName } = useNames()
  const review = useReviewDelivery()
  const toast = useToast()
  const canAct = profile!.role === 'owner' || profile!.role === 'remote_office'
  const [verifying, setVerifying] = useState<Delivery | null>(null)

  return (
    <div className="animate-fade">
    <Card className="max-w-[980px] overflow-hidden">
    <div className="overflow-x-auto">
    <div className="min-w-[860px]">
      <div className="grid grid-cols-[1.3fr_1fr_.7fr_.8fr_.9fr_.7fr_auto] gap-3 bg-canvas px-5 py-[13px] text-[11px] font-bold uppercase tracking-wide text-muted">
        <span>Supplier</span>
        <span>Store</span>
        <span>Invoice</span>
        <span>Discrepancy</span>
        <span>Logged by</span>
        <span>Status</span>
        <span />
      </div>
      {(deliveries ?? []).map((d) => {
        const st = deliveryStatusStyle[d.status]
        const verified = d.status === 'verified' || d.status === 'approved'
        return (
          <div key={d.id} className="border-t border-ink/5">
          <div
            className="grid grid-cols-[1.3fr_1fr_.7fr_.8fr_.9fr_.7fr_auto] items-center gap-3 px-5 py-[15px] text-[12.5px]"
          >
            <span className="font-semibold">{d.supplier}</span>
            <span className="text-slate">{storeName(d.store_id)}</span>
            <span className="font-mono text-slate">#{d.invoice_no}</span>
            <span
              style={{
                color: d.discrepancy_units > 0 ? '#E5484D' : '#8B93A4',
                fontWeight: d.discrepancy_units > 0 ? 700 : 400,
              }}
            >
              {d.discrepancy_units > 0 ? `${d.discrepancy_units} short` : '—'}
            </span>
            <span className="text-muted">
              {userName(d.submitted_by)} · {timeAgo(d.submitted_at)}
            </span>
            <span>
              <StatusChip text={st.label} color={st.c} bg={st.b} />
            </span>
            <span className="flex gap-1.5">
              {canAct && d.status === 'review' && (
                <button
                  onClick={() => setVerifying(d)}
                  className="flex h-8 items-center gap-1.5 rounded-lg border border-info/40 bg-info-soft px-2.5 text-[11.5px] font-semibold text-[#2563EB]"
                >
                  <ClipboardText size={13} weight="fill" /> Review
                </button>
              )}
              {profile!.role === 'owner' && d.status === 'verified' && (
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
          {verified && (
            <div className="flex flex-wrap gap-x-5 gap-y-1 bg-canvas/60 px-5 pb-3 pt-1 text-[11.5px] text-slate">
              <span>
                Cost{' '}
                <b className="text-ink">
                  {d.cost != null ? `£${Number(d.cost).toFixed(2)}` : '—'}
                </b>
              </span>
              <span>
                Final qty <b className="text-ink">{d.final_qty ?? '—'}</b>
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
    </div>
  )
}
