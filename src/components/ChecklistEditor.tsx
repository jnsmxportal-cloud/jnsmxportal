import { ArrowDown, ArrowUp, Camera, Plus, QrCode, Signature, Thermometer, Trash } from '@phosphor-icons/react'
import type { ChecklistDef } from '../data/admin'

/**
 * Editable list of checklist item definitions, shared by the template editor and the
 * create-task modal. Each row: reorder, label, per-item evidence toggles (photo, temperature
 * with optional limit, QR, signature) and delete.
 */
export default function ChecklistEditor({
  items,
  onChange,
  hint,
}: {
  items: ChecklistDef[]
  onChange: (items: ChecklistDef[]) => void
  /** optional line under the heading, e.g. where the items came from */
  hint?: string
}) {
  const setItem = (i: number, patch: Partial<ChecklistDef>) =>
    onChange(items.map((it, ix) => (ix === i ? { ...it, ...patch } : it)))
  const moveItem = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= items.length) return
    const next = [...items]
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label className="text-xs font-semibold text-slate">Checklist items</label>
        <button
          onClick={() => onChange([...items, { label: '' }])}
          className="flex items-center gap-1 rounded-lg bg-brand-tint px-2.5 py-1 text-[11.5px] font-semibold text-brand-dark"
        >
          <Plus size={12} weight="bold" /> Add item
        </button>
      </div>
      {hint && <div className="mb-2 text-[11px] text-muted">{hint}</div>}
      <div className="flex flex-col gap-2">
        {items.map((it, i) => (
          <div key={i} className="flex items-center gap-2 rounded-xl border border-line bg-canvas p-2">
            <div className="flex flex-col">
              <button onClick={() => moveItem(i, -1)} className="p-0.5 text-muted" aria-label="Move up">
                <ArrowUp size={11} />
              </button>
              <button onClick={() => moveItem(i, 1)} className="p-0.5 text-muted" aria-label="Move down">
                <ArrowDown size={11} />
              </button>
            </div>
            <input
              value={it.label}
              onChange={(e) => setItem(i, { label: e.target.value })}
              placeholder="Item label…"
              className="flex-1 rounded-lg border border-ink/10 bg-white px-2.5 py-2 text-[12.5px] outline-none"
            />
            <button
              onClick={() => setItem(i, { photo: !it.photo })}
              title="Photo required"
              className={`rounded-lg p-1.5 ${it.photo ? 'bg-brand text-white' : 'text-muted'}`}
            >
              <Camera size={14} />
            </button>
            <button
              onClick={() => setItem(i, { temp: !it.temp })}
              title="Temperature reading"
              className={`rounded-lg p-1.5 ${it.temp ? 'bg-danger text-white' : 'text-muted'}`}
            >
              <Thermometer size={14} />
            </button>
            {it.temp && (
              <input
                value={it.limit ?? ''}
                onChange={(e) =>
                  setItem(i, { limit: e.target.value === '' ? undefined : parseFloat(e.target.value) })
                }
                placeholder="limit"
                className="w-14 rounded-lg border border-ink/10 bg-white px-1.5 py-2 text-center text-[11px] outline-none"
              />
            )}
            <button
              onClick={() => setItem(i, { qr: !it.qr })}
              title="QR required"
              className={`rounded-lg p-1.5 ${it.qr ? 'bg-info text-white' : 'text-muted'}`}
            >
              <QrCode size={14} />
            </button>
            <button
              onClick={() => setItem(i, { signature: !it.signature })}
              title="Signature required"
              className={`rounded-lg p-1.5 ${it.signature ? 'bg-ink text-white' : 'text-muted'}`}
            >
              <Signature size={14} />
            </button>
            <button
              onClick={() => onChange(items.filter((_, ix) => ix !== i))}
              className="p-1.5 text-danger"
              aria-label="Remove item"
            >
              <Trash size={14} />
            </button>
          </div>
        ))}
        {items.length === 0 && (
          <div className="rounded-xl border border-dashed border-ink/15 p-4 text-center text-[11.5px] text-muted">
            No checklist items — the task is a single completable unit.
          </div>
        )}
      </div>
    </div>
  )
}
