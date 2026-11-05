import { format } from 'date-fns'
import { jsPDF } from 'jspdf'

export interface ScanPage {
  dataUrl: string
  w: number
  h: number
}

/** FR-4.1a: enhance a scan for archive legibility (grayscale, contrast stretch). */
export async function enhanceScan(dataUrl: string): Promise<ScanPage> {
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const el = new Image()
    el.onload = () => res(el)
    el.onerror = () => rej(new Error('Could not read the scanned image'))
    el.src = dataUrl
  })
  const maxSide = 1600
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
  return { dataUrl: canvas.toDataURL('image/jpeg', 0.85), w, h }
}

/** One A4 page per scan, each fitted within the margins with its aspect ratio kept. */
export function buildInvoicePdf(pages: ScanPage[]): Blob {
  if (!pages.length) throw new Error('No pages to save')
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
  const availW = 194
  const availH = 281
  pages.forEach((p, i) => {
    if (i > 0) pdf.addPage('a4', 'portrait')
    let wMM = availW
    let hMM = (availW * p.h) / p.w
    if (hMM > availH) {
      hMM = availH
      wMM = (availH * p.w) / p.h
    }
    pdf.addImage(p.dataUrl, 'JPEG', 8 + (availW - wMM) / 2, 8, wMM, hMM)
  })
  return pdf.output('blob')
}

/** Invoice folder path: filed by store / supplier / month (FR-6.6); timestamp keeps it unique. */
export function invoicePdfPath(storeName: string, supplier: string, invoiceNo: string, at = new Date()) {
  const safe = (s: string) => s.replace(/[^a-zA-Z0-9-_]/g, '_')
  const month = format(at, 'yyyy-MM')
  return {
    month,
    path: `${safe(storeName)}/${safe(supplier)}/${month}/${safe(invoiceNo || 'scan')}-${at.getTime()}.pdf`,
  }
}
