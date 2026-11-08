import { useState } from 'react'
import { Archive, ArrowCounterClockwise, PencilSimple, Plus, Trash, Truck, X } from '@phosphor-icons/react'
import { Card } from '../../components/ui'
import { useToast } from '../../components/Toast'
import {
  useArchiveSupplier,
  useDeleteSupplier,
  useSaveSupplier,
  useSuppliers,
  useSupplierUsage,
  type Supplier,
} from '../../data/suppliers'

const inputCls =
  'w-full rounded-xl border-[1.5px] border-ink/15 bg-white p-2.5 text-sm outline-none focus:border-brand'
const modalShell = 'fixed inset-0 z-[80] flex items-center justify-center bg-navy/50 p-3 sm:p-6'
const modalBox =
  'w-[420px] max-w-full animate-fade rounded-[20px] bg-white p-6 shadow-[0_30px_80px_rgba(0,0,0,.3)]'

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

/**
 * Admin → Suppliers: the list staff pick from in Delivery Received and Invoice Upload.
 * Archive hides a supplier from those pickers but keeps it here; delete removes it. Neither —
 * nor a rename — touches deliveries or invoices already logged, which keep the name they had.
 */
export default function SuppliersPanel() {
  const { data: suppliers, isLoading, error } = useSuppliers()
  const { data: usage } = useSupplierUsage()
  const archive = useArchiveSupplier()
  const toast = useToast()
  const [editing, setEditing] = useState<Supplier | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Supplier | null>(null)

  const list = [...(suppliers ?? [])].sort(
    (a, b) => Number(!!a.archived_at) - Number(!!b.archived_at) || a.name.localeCompare(b.name),
  )
  const usageOf = (s: Supplier) => usage?.[s.name.trim().toLowerCase()]
  const usageText = (s: Supplier) => {
    const u = usageOf(s)
    if (!usage) return 'Checking usage…'
    if (!u) return 'Not used yet'
    return [
      u.deliveries && `${u.deliveries} ${u.deliveries === 1 ? 'delivery' : 'deliveries'}`,
      u.invoices && plural(u.invoices, 'invoice'),
    ]
      .filter(Boolean)
      .join(' · ')
  }

  const toggleArchive = (s: Supplier) =>
    archive.mutate(
      { id: s.id, archived: !s.archived_at },
      {
        onSuccess: () =>
          toast(s.archived_at ? `“${s.name}” restored` : `“${s.name}” archived · hidden from staff pickers`),
        onError: (e) => toast(e.message, 'error'),
      },
    )

  return (
    <div>
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
        <div className="text-[12.5px] text-muted">
          Staff pick from these in Delivery Received and Invoice Upload. Past deliveries and invoices keep
          the name they were logged with.
        </div>
        <button
          onClick={() => setEditing('new')}
          disabled={!!error}
          className="flex items-center gap-1.5 rounded-[10px] bg-brand px-3.5 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          <Plus size={13} weight="bold" /> New supplier
        </button>
      </div>

      {error ? (
        <Card className="p-6 text-center text-[12.5px] text-danger">
          Could not load suppliers: {error.message}
        </Card>
      ) : (
        <Card className="divide-y divide-line">
          {list.map((s) => {
            const archived = !!s.archived_at
            return (
              <div key={s.id} className={`flex items-center gap-3 p-3.5 ${archived ? 'opacity-60' : ''}`}>
                <div className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px] bg-info-soft">
                  <Truck size={17} weight="fill" color="#3B82F6" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-display text-sm font-bold">{s.name}</span>
                    {archived && (
                      <span className="rounded-full bg-canvas px-2 py-px text-[10px] font-semibold text-muted">
                        Archived
                      </span>
                    )}
                  </div>
                  <div className="text-[11.5px] text-muted">{usageText(s)}</div>
                </div>
                <div className="flex items-center gap-0.5">
                  <button title="Rename" onClick={() => setEditing(s)} className="rounded-lg p-1.5 text-slate hover:bg-canvas">
                    <PencilSimple size={15} />
                  </button>
                  <button
                    title={archived ? 'Restore — show to staff again' : 'Archive — hide from staff pickers'}
                    onClick={() => toggleArchive(s)}
                    disabled={archive.isPending}
                    className="rounded-lg p-1.5 text-slate hover:bg-canvas"
                  >
                    {archived ? <ArrowCounterClockwise size={15} /> : <Archive size={15} />}
                  </button>
                  <button
                    title="Delete"
                    onClick={() => setDeleting(s)}
                    className="rounded-lg p-1.5 text-danger hover:bg-danger-soft"
                  >
                    <Trash size={15} />
                  </button>
                </div>
              </div>
            )
          })}
          {!isLoading && list.length === 0 && (
            <div className="p-8 text-center text-xs text-muted">
              No suppliers yet — add one so staff can log deliveries against it.
            </div>
          )}
        </Card>
      )}

      {editing && <SupplierModal supplier={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {deleting && (
        <DeleteSupplierModal
          supplier={deleting}
          used={!!usageOf(deleting)}
          onArchive={() => {
            toggleArchive(deleting)
            setDeleting(null)
          }}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  )
}

function SupplierModal({ supplier, onClose }: { supplier: Supplier | null; onClose: () => void }) {
  const save = useSaveSupplier()
  const toast = useToast()
  const [name, setName] = useState(supplier?.name ?? '')
  const submit = () =>
    save.mutate(
      { id: supplier?.id, name },
      {
        onSuccess: () => {
          toast(supplier ? `Renamed to “${name.trim()}”` : `“${name.trim()}” added`)
          onClose()
        },
        onError: (e) => toast(e.message, 'error'),
      },
    )
  return (
    <div onClick={onClose} className={modalShell}>
      <div onClick={(e) => e.stopPropagation()} className={modalBox}>
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-[17px] font-bold">{supplier ? 'Rename supplier' : 'New supplier'}</h3>
          <button onClick={onClose} className="p-1 text-muted" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="mb-4 text-xs text-muted">
          {supplier
            ? 'Staff see the new name from now on. Deliveries and invoices already logged keep the old one.'
            : 'Staff can pick it straight away in Delivery Received and Invoice Upload.'}
        </div>
        <label className="mb-1.5 block text-xs font-semibold text-slate">Name</label>
        <input
          autoFocus
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && name.trim() && submit()}
          placeholder="e.g. Booker"
          className={`${inputCls} mb-4`}
        />
        <div className="flex gap-2.5">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-ink/15 bg-white p-2.5 text-[13.5px] font-semibold text-slate"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!name.trim() || save.isPending}
            className="flex-1 rounded-xl bg-brand p-2.5 text-[13.5px] font-semibold text-white disabled:opacity-50"
          >
            {supplier ? 'Save' : 'Add supplier'}
          </button>
        </div>
      </div>
    </div>
  )
}

function DeleteSupplierModal({
  supplier,
  used,
  onArchive,
  onClose,
}: {
  supplier: Supplier
  used: boolean
  onArchive: () => void
  onClose: () => void
}) {
  const del = useDeleteSupplier()
  const toast = useToast()
  return (
    <div onClick={onClose} className={modalShell}>
      <div onClick={(e) => e.stopPropagation()} className={modalBox}>
        <h3 className="mb-1 text-[17px] font-bold">Delete “{supplier.name}”?</h3>
        <div className="mb-4 text-[12.5px] leading-relaxed text-muted">
          It disappears from this list and from the staff pickers.{' '}
          {used
            ? 'Deliveries and invoices already logged against it keep the name. If you may need it again, archive it instead.'
            : 'Nothing has been logged against it yet.'}
        </div>
        <div className="flex flex-wrap gap-2.5">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-ink/15 bg-white p-2.5 text-[13.5px] font-semibold text-slate"
          >
            Cancel
          </button>
          {used && !supplier.archived_at && (
            <button
              onClick={onArchive}
              className="flex-1 rounded-xl border border-ink/15 bg-white p-2.5 text-[13.5px] font-semibold text-ink"
            >
              Archive instead
            </button>
          )}
          <button
            onClick={() =>
              del.mutate(
                { id: supplier.id, name: supplier.name },
                {
                  onSuccess: () => {
                    toast(`“${supplier.name}” deleted`)
                    onClose()
                  },
                  onError: (e) => toast(e.message, 'error'),
                },
              )
            }
            disabled={del.isPending}
            className="flex-1 rounded-xl bg-danger p-2.5 text-[13.5px] font-semibold text-white disabled:opacity-50"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}
