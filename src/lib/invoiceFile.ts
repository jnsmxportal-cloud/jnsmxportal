import { supabase } from './supabase'

/** Fetch an invoice PDF from the private `invoices` bucket as a Blob. */
export async function fetchInvoicePdf(path: string): Promise<Blob> {
  const { data, error } = await supabase.storage.from('invoices').download(path)
  if (error || !data) throw new Error('Could not load the PDF — check your connection and try again')
  return data
}

/** e.g. "Invoice Bestway 4566.pdf" / "Invoice Bestway 2026-11-08.pdf" */
export function invoiceFileName(o: { supplier?: string | null; invoiceNo?: string | null; date?: string | null }) {
  const parts = ['Invoice', o.supplier, o.invoiceNo || (o.date ? o.date.slice(0, 10) : null)]
  const name = parts
    .filter(Boolean)
    .join(' ')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .trim()
  return `${name || 'Invoice'}.pdf`
}

/**
 * Save a Blob as a file. An <a download> click on an object URL is not treated as a popup, so it
 * still works after an `await` (window.open after an await is blocked on phones).
 */
export function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export async function downloadInvoicePdf(path: string, fileName: string) {
  saveBlob(await fetchInvoicePdf(path), fileName)
}
