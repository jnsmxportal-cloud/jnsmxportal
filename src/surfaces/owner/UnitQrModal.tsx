import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { DownloadSimple, Printer, X } from '@phosphor-icons/react'
import type { StoreUnit } from '../../lib/types'
import { qrFileName, unitQrPayload } from '../../lib/qr'

/** PNG data URL of a QR code for the payload (null while rendering). */
export function useQrDataUrl(payload: string | null, width = 512): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    if (!payload) {
      setUrl(null)
      return
    }
    QRCode.toDataURL(payload, { width, margin: 2 }).then((u) => live && setUrl(u))
    return () => {
      live = false
    }
  }, [payload, width])
  return url
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

/** Opens a print-ready label (70 mm code + name) and sends it to the printer. */
export function printQrLabel(dataUrl: string, title: string, sub: string) {
  const w = window.open('', '_blank', 'width=480,height=640')
  if (!w) return
  w.document.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>` +
      `<style>body{font-family:Inter,system-ui,sans-serif;text-align:center;padding:24px;color:#151B28}` +
      `img{width:70mm;height:70mm}h1{font-size:22px;margin:8px 0 2px}p{margin:0;color:#5B6478;font-size:14px}` +
      `@page{margin:10mm}</style></head><body><img src="${dataUrl}" alt="QR"><h1>${esc(title)}</h1><p>${esc(sub)}</p>` +
      `<script>window.onload=function(){window.print()}</script></body></html>`,
  )
  w.document.close()
}

/** The QR label of one chiller/freezer: view, download as PNG, or print to stick on the unit. */
export default function UnitQrModal({
  unit,
  storeName,
  onClose,
}: {
  unit: StoreUnit
  storeName: string
  onClose: () => void
}) {
  const payload = unitQrPayload(unit.store_id, unit.id)
  const dataUrl = useQrDataUrl(payload)
  const sub = `${unit.type === 'freezer' ? 'Freezer' : 'Chiller'} · ${storeName}`
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-navy/50 p-3 sm:p-6">
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[380px] max-w-full animate-fade rounded-[20px] bg-white p-6 text-center shadow-[0_30px_80px_rgba(0,0,0,.3)]"
      >
        <div className="mb-3 flex items-start justify-between text-left">
          <div>
            <h3 className="font-display text-[17px] font-bold">{unit.name}</h3>
            <div className="text-xs text-muted">{sub}</div>
          </div>
          <button onClick={onClose} className="p-1 text-muted" aria-label="Close">
            <X size={20} />
          </button>
        </div>
        {dataUrl ? (
          <img src={dataUrl} alt={`QR label for ${unit.name}`} className="mx-auto w-[240px] max-w-full rounded-xl border border-line" />
        ) : (
          <div className="mx-auto h-[240px] w-[240px] rounded-xl bg-canvas" />
        )}
        <div className="mt-2 break-all font-mono text-[10px] text-muted">{payload}</div>
        <div className="mt-3 text-[11.5px] leading-relaxed text-slate">
          Print it and stick it on the unit. On QR-gated temperature logs, staff must scan this
          label before they can enter {unit.name}’s reading.
        </div>
        <div className="mt-4 flex gap-2.5">
          <a
            href={dataUrl ?? undefined}
            download={qrFileName(storeName, unit.name)}
            aria-disabled={!dataUrl}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-ink/15 bg-white p-2.5 text-[13px] font-semibold text-slate"
          >
            <DownloadSimple size={15} weight="bold" /> Download PNG
          </a>
          <button
            onClick={() => dataUrl && printQrLabel(dataUrl, unit.name, sub)}
            disabled={!dataUrl}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-ink p-2.5 text-[13px] font-semibold text-white disabled:opacity-60"
          >
            <Printer size={15} weight="bold" /> Print label
          </button>
        </div>
      </div>
    </div>
  )
}
