import { useRef, useState } from 'react'
import { CircleNotch, FilePdf, Plus, Scan, X } from '@phosphor-icons/react'
import { enhanceScan, type ScanPage } from '../lib/invoicePdf'
import { useToast } from './Toast'
import DocScanner from './DocScanner'

/** A scanned invoice page; `page` is null while the scan is still being enhanced. */
type PageSlot = { id: number; page: ScanPage | null }

/** State for a multi-page invoice scan (pages in scan order, enhanced for archive legibility). */
export function useInvoicePages() {
  const toast = useToast()
  const [slots, setSlots] = useState<PageSlot[]>([])
  const [scanning, setScanning] = useState(false)
  const slotId = useRef(0)

  /** Each accepted page arrives here; a slot is reserved first so pages keep their scan order. */
  const add = (dataUrl: string) => {
    const id = ++slotId.current
    setSlots((p) => [...p, { id, page: null }])
    enhanceScan(dataUrl)
      .then((page) => setSlots((p) => p.map((s) => (s.id === id ? { id, page } : s))))
      .catch((e) => {
        setSlots((p) => p.filter((s) => s.id !== id))
        toast(e instanceof Error ? e.message : 'Could not process that page — please rescan it', 'error')
      })
  }

  return {
    slots,
    count: slots.length,
    /** true while any page is still being enhanced */
    processing: slots.some((s) => !s.page),
    /** the finished pages, in order — what goes into the PDF */
    pages: slots.flatMap((s) => (s.page ? [s.page] : [])),
    add,
    remove: (id: number) => setSlots((p) => p.filter((s) => s.id !== id)),
    scanning,
    setScanning,
  }
}

export type InvoicePagesState = ReturnType<typeof useInvoicePages>

/**
 * Multi-page invoice capture: a "Scan invoice" button, then numbered page thumbnails
 * (tap to view, × to remove) with an "Add page" tile. Owns the full-screen scanner.
 */
export default function InvoicePages({
  state,
  title = 'Invoice',
  hint = 'Scan every page of the supplier invoice — they’re combined into a single PDF.',
}: {
  state: InvoicePagesState
  title?: string
  hint?: string
}) {
  const { slots, count, scanning, setScanning, add, remove } = state
  const [viewing, setViewing] = useState<number | null>(null)
  const viewed = viewing != null ? slots.findIndex((s) => s.id === viewing) : -1
  const viewedPage = viewed >= 0 ? slots[viewed].page : null

  return (
    <div>
      {scanning && (
        <DocScanner
          title="Scan invoice"
          multiPage
          pageCount={count}
          onDone={add}
          onFinish={() => setScanning(false)}
          onClose={() => setScanning(false)}
        />
      )}
      {viewedPage && (
        <div
          onClick={() => setViewing(null)}
          className="fixed inset-0 z-[90] flex flex-col bg-navy/95 p-4"
          role="dialog"
          aria-label={`Invoice page ${viewed + 1}`}
        >
          <div className="mb-3 flex items-center justify-between text-white">
            <span className="text-sm font-bold">
              Page {viewed + 1} of {count}
            </span>
            <button className="rounded-full bg-white/10 p-2" aria-label="Close">
              <X size={18} />
            </button>
          </div>
          <img
            src={viewedPage.dataUrl}
            alt={`Invoice page ${viewed + 1}`}
            className="min-h-0 flex-1 rounded-lg object-contain"
          />
        </div>
      )}

      <div className="mb-1 flex items-center justify-between">
        <span className="text-[13px] font-semibold">{title}</span>
        {count > 0 && (
          <span className="flex items-center gap-1 text-[11px] font-semibold text-success-deep">
            <FilePdf size={14} weight="fill" />
            {count} page{count === 1 ? '' : 's'} · one PDF
          </span>
        )}
      </div>
      <div className="mb-3 text-xs text-muted">{hint}</div>

      {count === 0 ? (
        <button
          onClick={() => setScanning(true)}
          className="flex w-full items-center gap-3 rounded-[14px] border-[1.5px] border-brand/50 bg-brand-tint p-3.5 text-left"
        >
          <div className="flex h-[46px] w-[46px] flex-none items-center justify-center rounded-xl bg-brand">
            <Scan size={24} weight="fill" color="#fff" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-bold">Scan invoice</div>
            <div className="mt-px text-[11.5px] text-muted">
              Multi-page · auto edge detect · saved as one PDF
            </div>
          </div>
        </button>
      ) : (
        <div className="grid grid-cols-4 gap-2">
          {slots.map((s, i) => (
            <div
              key={s.id}
              className="relative aspect-[3/4] overflow-hidden rounded-[11px] border border-ink/10 bg-white"
            >
              {s.page ? (
                <button
                  onClick={() => setViewing(s.id)}
                  aria-label={`View page ${i + 1}`}
                  className="h-full w-full"
                >
                  <img
                    src={s.page.dataUrl}
                    alt={`Invoice page ${i + 1}`}
                    className="h-full w-full object-cover object-top"
                  />
                </button>
              ) : (
                <div className="flex h-full items-center justify-center">
                  <CircleNotch size={20} className="animate-spin text-muted" />
                </div>
              )}
              <span className="pointer-events-none absolute bottom-1 left-1 rounded-md bg-ink/75 px-1.5 text-[10px] font-bold text-white">
                {i + 1}
              </span>
              {s.page && (
                <button
                  onClick={() => remove(s.id)}
                  aria-label={`Remove page ${i + 1}`}
                  className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-ink/70"
                >
                  <X size={13} weight="bold" color="#fff" />
                </button>
              )}
            </div>
          ))}
          <button
            onClick={() => setScanning(true)}
            className="flex aspect-[3/4] flex-col items-center justify-center gap-1 rounded-[11px] border-[1.5px] border-dashed border-brand/50 bg-brand-tint"
          >
            <Plus size={20} color="#FF5A2D" weight="bold" />
            <span className="text-[10px] font-semibold text-brand">Add page</span>
          </button>
        </div>
      )}
    </div>
  )
}
