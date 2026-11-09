import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { CircleNotch, DownloadSimple, MagnifyingGlassMinus, MagnifyingGlassPlus, X } from '@phosphor-icons/react'
import { fetchInvoicePdf, saveBlob } from '../lib/invoiceFile'
import { useToast } from './Toast'

export interface PdfTarget {
  /** path in the `invoices` bucket */
  path: string
  title: string
  fileName: string
}

/**
 * Full-screen in-app PDF viewer. Pages are drawn with pdf.js (loaded on first use), so it works
 * on Android, where Chrome has no built-in PDF viewer, and inside the installed app.
 */
export default function PdfViewer({ target, onClose }: { target: PdfTarget; onClose: () => void }) {
  const toast = useToast()
  const pagesRef = useRef<HTMLDivElement>(null)
  const [blob, setBlob] = useState<Blob | null>(null)
  const [pageCount, setPageCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const file = await fetchInvoicePdf(target.path)
        if (cancelled) return
        setBlob(file)
        const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
        const worker = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default
        const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
        if (cancelled) return
        setPageCount(doc.numPages)
        const host = pagesRef.current
        if (!host) return
        host.innerHTML = ''
        // render sharp enough for 2× zoom on a high-DPI phone, capped to keep memory sane
        const cssWidth = Math.min(host.clientWidth || 360, 900)
        const dpr = Math.min(window.devicePixelRatio || 1, 2)
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i)
          if (cancelled) return
          const base = page.getViewport({ scale: 1 })
          const scale = Math.min((cssWidth * dpr * 2) / base.width, 4000 / base.width)
          const viewport = page.getViewport({ scale })
          const canvas = document.createElement('canvas')
          canvas.width = Math.floor(viewport.width)
          canvas.height = Math.floor(viewport.height)
          canvas.className = 'block w-full rounded-md bg-white shadow-[0_4px_20px_rgba(0,0,0,.35)]'
          canvas.setAttribute('aria-label', `Page ${i} of ${doc.numPages}`)
          host.appendChild(canvas)
          await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not open the PDF')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [target.path])

  const download = () => {
    if (!blob) return
    saveBlob(blob, target.fileName)
    toast('Downloading PDF…', 'info')
  }

  const btn = 'flex h-9 items-center justify-center gap-1.5 rounded-lg bg-white/10 px-3 text-xs font-semibold text-white disabled:opacity-40'

  return (
    <div className="fixed inset-0 z-[95] flex flex-col bg-navy/95" role="dialog" aria-label={target.title}>
      <div className="flex items-center gap-2 px-3 pb-2 pt-[max(12px,env(safe-area-inset-top))]">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold text-white">{target.title}</div>
          <div className="text-[11px] text-white/60">
            {pageCount ? `${pageCount} page${pageCount === 1 ? '' : 's'}` : error ? 'Not loaded' : 'Loading…'}
          </div>
        </div>
        <button
          onClick={() => setZoom((z) => Math.max(1, z - 0.5))}
          disabled={zoom <= 1}
          className={btn}
          aria-label="Zoom out"
        >
          <MagnifyingGlassMinus size={16} />
        </button>
        <button
          onClick={() => setZoom((z) => Math.min(3, z + 0.5))}
          disabled={zoom >= 3}
          className={btn}
          aria-label="Zoom in"
        >
          <MagnifyingGlassPlus size={16} />
        </button>
        <button onClick={download} disabled={!blob} className={btn}>
          <DownloadSimple size={16} /> <span className="hidden sm:inline">Download</span>
        </button>
        <button onClick={onClose} className={btn} aria-label="Close">
          <X size={16} weight="bold" />
        </button>
      </div>

      <div className="flex-1 overflow-auto px-3 pb-[max(16px,env(safe-area-inset-bottom))]">
        {error ? (
          <div className="mx-auto mt-16 max-w-[320px] text-center text-sm text-white/80">{error}</div>
        ) : (
          <>
            {!pageCount && (
              <div className="mt-16 flex justify-center text-white/70">
                <CircleNotch size={28} className="animate-spin" />
              </div>
            )}
            <div
              ref={pagesRef}
              className="mx-auto flex flex-col gap-3"
              style={{ width: `${zoom * 100}%`, maxWidth: zoom === 1 ? 900 : undefined }}
            />
          </>
        )}
      </div>
    </div>
  )
}

/** `open(target)` shows the viewer; render `viewer` somewhere in the component. */
export function usePdfViewer(): { open: (t: PdfTarget) => void; viewer: ReactNode } {
  const [target, setTarget] = useState<PdfTarget | null>(null)
  const open = useCallback((t: PdfTarget) => setTarget(t), [])
  return {
    open,
    viewer: target ? <PdfViewer target={target} onClose={() => setTarget(null)} /> : null,
  }
}

/** View + Download buttons for one invoice PDF (the viewer itself also has Download). */
export function InvoicePdfButtons({ target, compact }: { target: PdfTarget; compact?: boolean }) {
  const toast = useToast()
  const { open, viewer } = usePdfViewer()
  const [saving, setSaving] = useState(false)
  const download = async () => {
    setSaving(true)
    try {
      saveBlob(await fetchInvoicePdf(target.path), target.fileName)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not download the PDF', 'error')
    } finally {
      setSaving(false)
    }
  }
  const cls = `flex items-center gap-1 rounded-lg border border-ink/15 bg-white font-semibold text-slate disabled:opacity-50 ${
    compact ? 'px-2 py-1 text-[11px]' : 'px-2.5 py-1.5 text-xs'
  }`
  return (
    <span className="flex flex-none items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      <button onClick={() => open(target)} className={cls}>
        View
      </button>
      <button onClick={download} disabled={saving} className={cls} aria-label="Download PDF">
        {saving ? <CircleNotch size={13} className="animate-spin" /> : <DownloadSimple size={13} />}
        {compact ? '' : ' Download'}
      </button>
      {viewer}
    </span>
  )
}
