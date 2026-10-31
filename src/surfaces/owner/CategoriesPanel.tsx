import { useState } from 'react'
import {
  Archive,
  ArrowCounterClockwise,
  LockSimple,
  PencilSimple,
  Plus,
  Trash,
  Warning,
  X,
} from '@phosphor-icons/react'
import { Card } from '../../components/ui'
import { useToast } from '../../components/Toast'
import {
  CATEGORY_COLORS,
  CATEGORY_ICON_KEYS,
  activeCategories,
  categoryIcon,
  slugify,
  tint,
  useArchiveCategory,
  useCategories,
  useCategoryUsage,
  useDeleteCategory,
  useSaveCategory,
  type CategoryUsage,
} from '../../data/categories'
import type { Category } from '../../lib/types'

const inputCls =
  'w-full rounded-xl border-[1.5px] border-ink/15 bg-white p-2.5 text-sm outline-none focus:border-brand'
const label = 'mb-1.5 block text-xs font-semibold text-slate'
const modalShell = 'fixed inset-0 z-[80] flex items-center justify-center bg-navy/50 p-6'
const modalBox =
  'w-[460px] max-w-full animate-fade rounded-[20px] bg-white p-6 shadow-[0_30px_80px_rgba(0,0,0,.3)]'

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

function usageText(u: CategoryUsage | undefined): string {
  if (!u) return 'Checking usage…'
  if (u.templates + u.instances === 0) return 'Not used yet'
  const tasks = u.open_instances
    ? `${plural(u.instances, 'task')} (${u.open_instances} open)`
    : plural(u.instances, 'task')
  return `${plural(u.templates, 'template')} · ${tasks}`
}

export default function CategoriesPanel() {
  const { data: cats, isLoading } = useCategories()
  const { data: usage } = useCategoryUsage()
  const archive = useArchiveCategory()
  const toast = useToast()
  const [editing, setEditing] = useState<Category | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Category | null>(null)

  // active first, then by the owner's order, then name; archived sink to the bottom
  const list = [...(cats ?? [])].sort(
    (a, b) =>
      Number(!!a.archived_at) - Number(!!b.archived_at) ||
      a.display_order - b.display_order ||
      a.name.localeCompare(b.name),
  )

  const toggleArchive = (c: Category) =>
    archive.mutate(
      { id: c.id, archived: !c.archived_at },
      {
        onSuccess: () =>
          toast(
            c.archived_at
              ? `“${c.name}” restored`
              : `“${c.name}” archived · hidden from pickers, existing work keeps it`,
          ),
        onError: (e) => toast(e.message, 'error'),
      },
    )

  return (
    <div>
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
        <div className="text-[12.5px] text-muted">
          Categories label templates and tasks everywhere: pickers, task icons and the Reports
          breakdown.
        </div>
        <button
          onClick={() => setEditing('new')}
          className="flex items-center gap-1.5 rounded-[10px] bg-brand px-3.5 py-2 text-xs font-semibold text-white"
        >
          <Plus size={13} weight="bold" /> New category
        </button>
      </div>

      <Card className="divide-y divide-line">
        {list.map((c) => {
          const Icon = categoryIcon(c.icon)
          const archived = !!c.archived_at
          const isDefault = c.is_system && c.slug === 'daily'
          return (
            <div
              key={c.id}
              className={`flex flex-wrap items-center gap-3 p-3.5 sm:flex-nowrap ${archived ? 'opacity-60' : ''}`}
            >
              <div
                className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px]"
                style={{ background: tint(c.color) }}
              >
                <Icon size={17} weight="fill" color={c.color} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-display text-sm font-bold">{c.name}</span>
                  <span className="font-mono text-[10px] text-muted">{c.slug}</span>
                  {c.is_system && (
                    <span className="rounded-full bg-canvas px-2 py-px text-[10px] font-semibold text-slate">
                      Built-in
                    </span>
                  )}
                  {isDefault && (
                    <span className="rounded-full bg-canvas px-2 py-px text-[10px] font-semibold text-slate">
                      Default
                    </span>
                  )}
                  {archived && (
                    <span className="rounded-full bg-canvas px-2 py-px text-[10px] font-semibold text-muted">
                      Archived
                    </span>
                  )}
                </div>
                <div className="text-[11.5px] text-muted">{usageText(usage?.[c.slug])}</div>
              </div>
              <div className="flex items-center gap-0.5">
                <button
                  title="Edit"
                  onClick={() => setEditing(c)}
                  className="rounded-lg p-1.5 text-slate hover:bg-canvas"
                >
                  <PencilSimple size={15} />
                </button>
                {isDefault ? (
                  <span title="Daily is the fallback category and always stays available" className="p-1.5 text-muted/40">
                    <LockSimple size={15} />
                  </span>
                ) : (
                  <button
                    title={archived ? 'Restore' : 'Archive (hide from pickers)'}
                    onClick={() => toggleArchive(c)}
                    disabled={archive.isPending}
                    className="rounded-lg p-1.5 text-slate hover:bg-canvas disabled:opacity-50"
                  >
                    {archived ? <ArrowCounterClockwise size={15} /> : <Archive size={15} />}
                  </button>
                )}
                {c.is_system ? (
                  <span title="Built-in categories drive app flows and cannot be deleted" className="p-1.5 text-muted/40">
                    <Trash size={15} />
                  </span>
                ) : (
                  <button
                    title="Delete"
                    onClick={() => setDeleting(c)}
                    className="rounded-lg p-1.5 text-danger hover:bg-danger-soft"
                  >
                    <Trash size={15} />
                  </button>
                )}
              </div>
            </div>
          )
        })}
        {!isLoading && list.length === 0 && (
          <div className="p-6 text-center text-sm text-muted">No categories yet.</div>
        )}
      </Card>

      <Card className="mt-4 p-4 text-[12px] text-slate">
        <div className="mb-1.5 font-bold text-ink">Archive vs delete</div>
        <ul className="list-disc space-y-1 pl-4">
          <li>
            <b>Archive</b> hides a category from every picker. Templates and tasks that already
            use it keep it, so history and reports stay intact. Restore it any time.
          </li>
          <li>
            <b>Delete</b> removes it for good. If anything still uses it you pick a replacement
            first: templates move across and keep scheduling, past and open tasks are relabelled,
            and their evidence, approvals and audit trail are untouched.
          </li>
          <li>
            The six built-in categories drive app flows (deliveries, incidents, temperature
            logs), so they can be renamed, recoloured or archived but not deleted. Daily is the
            fallback and always stays available.
          </li>
        </ul>
      </Card>

      {editing && (
        <CategoryModal
          category={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
      {deleting && (
        <DeleteModal
          category={deleting}
          categories={cats ?? []}
          usage={usage?.[deleting.slug]}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  )
}

// ================= create / edit =================

function CategoryModal({ category, onClose }: { category: Category | null; onClose: () => void }) {
  const save = useSaveCategory()
  const toast = useToast()
  const [name, setName] = useState(category?.name ?? '')
  const [color, setColor] = useState(category?.color ?? CATEGORY_COLORS[0])
  const [icon, setIcon] = useState(category?.icon ?? 'tag')
  const slug = category?.slug ?? slugify(name)
  const Icon = categoryIcon(icon)

  const submit = () =>
    save.mutate(
      { id: category?.id, name, color, icon },
      {
        onSuccess: () => {
          toast(category ? 'Category updated' : `“${name.trim()}” added`)
          onClose()
        },
        onError: (e) => toast(e.message, 'error'),
      },
    )

  return (
    <div onClick={onClose} className={modalShell}>
      <div onClick={(e) => e.stopPropagation()} className={modalBox}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-[17px] font-bold">
            {category ? `Edit ${category.name}` : 'New category'}
          </h3>
          <button onClick={onClose} className="p-1 text-muted">
            <X size={18} />
          </button>
        </div>

        <div className="mb-4 flex items-center gap-3 rounded-xl border border-line bg-canvas p-3">
          <div
            className="flex h-10 w-10 flex-none items-center justify-center rounded-[11px]"
            style={{ background: tint(color) }}
          >
            <Icon size={19} weight="fill" color={color} />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-bold">{name.trim() || 'Category name'}</div>
            <div className="font-mono text-[10.5px] text-muted">
              {slug || 'slug'}
              {!category && ' · fixed once created, used in CSV exports'}
            </div>
          </div>
        </div>

        <label className={label}>Name</label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          placeholder="e.g. Deep clean"
          className={`${inputCls} mb-3`}
          onKeyDown={(e) => e.key === 'Enter' && name.trim() && submit()}
        />

        <label className={label}>Colour</label>
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {CATEGORY_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              title={c}
              className={`h-7 w-7 rounded-full border-2 ${
                color.toLowerCase() === c.toLowerCase() ? 'border-ink' : 'border-transparent'
              }`}
              style={{ background: c }}
            />
          ))}
          <label
            title="Custom colour"
            className="flex h-7 cursor-pointer items-center gap-1 rounded-full border border-ink/15 px-2 text-[10.5px] font-semibold text-slate"
          >
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value.toUpperCase())}
              className="h-4 w-4 cursor-pointer border-0 bg-transparent p-0"
            />
            Custom
          </label>
        </div>

        <label className={label}>Icon</label>
        <div className="mb-4 grid grid-cols-8 gap-1.5">
          {CATEGORY_ICON_KEYS.map((k) => {
            const I = categoryIcon(k)
            const on = k === icon
            return (
              <button
                key={k}
                onClick={() => setIcon(k)}
                title={k}
                className={`flex h-9 items-center justify-center rounded-[10px] border ${
                  on ? 'border-brand bg-brand-tint' : 'border-ink/10 bg-white'
                }`}
              >
                <I size={17} weight={on ? 'fill' : 'regular'} color={on ? color : '#5B6478'} />
              </button>
            )
          })}
        </div>

        <button
          onClick={submit}
          disabled={save.isPending || !name.trim()}
          className="w-full rounded-xl bg-brand p-3 text-[13.5px] font-semibold text-white disabled:opacity-50"
        >
          {category ? 'Save changes' : 'Create category'}
        </button>
      </div>
    </div>
  )
}

// ================= delete =================

function DeleteModal({
  category,
  categories,
  usage,
  onClose,
}: {
  category: Category
  categories: Category[]
  usage: CategoryUsage | undefined
  onClose: () => void
}) {
  const del = useDeleteCategory()
  const archive = useArchiveCategory()
  const toast = useToast()
  const candidates = activeCategories(categories).filter((c) => c.id !== category.id)
  const inUse = !!usage && usage.templates + usage.instances > 0
  const [replacement, setReplacement] = useState(
    candidates.find((c) => c.slug === 'ad_hoc')?.id ?? candidates[0]?.id ?? '',
  )
  const rep = candidates.find((c) => c.id === replacement)
  const busy = del.isPending || archive.isPending

  const confirm = () =>
    del.mutate(
      { id: category.id, replacementId: inUse ? replacement : null },
      {
        onSuccess: (r) => {
          const moved = r.templates_moved + r.instances_moved
          toast(
            moved > 0
              ? `Deleted “${category.name}” · moved ${plural(r.templates_moved, 'template')} and ${plural(r.instances_moved, 'task')} to ${rep?.name ?? 'the replacement'}`
              : `Deleted “${category.name}”`,
          )
          onClose()
        },
        onError: (e) => toast(e.message, 'error'),
      },
    )

  const archiveInstead = () =>
    archive.mutate(
      { id: category.id, archived: true },
      {
        onSuccess: () => {
          toast(`“${category.name}” archived · hidden from pickers, existing work keeps it`)
          onClose()
        },
        onError: (e) => toast(e.message, 'error'),
      },
    )

  return (
    <div onClick={onClose} className={modalShell}>
      <div onClick={(e) => e.stopPropagation()} className={modalBox}>
        <div className="mb-3 flex items-start gap-3">
          <div className="flex h-10 w-10 flex-none items-center justify-center rounded-[11px] bg-danger-soft">
            <Warning size={20} weight="fill" className="text-danger" />
          </div>
          <div className="flex-1">
            <h3 className="text-[17px] font-bold">Delete “{category.name}”?</h3>
            <div className="text-[12px] text-muted">This cannot be undone.</div>
          </div>
          <button onClick={onClose} className="p-1 text-muted">
            <X size={18} />
          </button>
        </div>

        <div className="mb-4 rounded-xl border border-line bg-canvas p-3 text-[12.5px] text-slate">
          {!usage ? (
            'Checking what uses this category…'
          ) : !inUse ? (
            'Nothing uses this category. It will be removed straight away.'
          ) : (
            <ul className="list-disc space-y-1 pl-4">
              {usage.templates > 0 && (
                <li>
                  <b>{plural(usage.templates, 'template')}</b> will move to the replacement and
                  keep their schedule.
                </li>
              )}
              {usage.instances > 0 && (
                <li>
                  <b>{plural(usage.instances, 'task')}</b>
                  {usage.open_instances > 0 && ` (${usage.open_instances} still open)`} will be
                  relabelled. Evidence, approvals, messages and the audit trail are untouched.
                </li>
              )}
              <li>Staff devices that are offline will pick up the new label when they next sync.</li>
            </ul>
          )}
        </div>

        {inUse && (
          <>
            <label className={label}>Move everything to</label>
            {candidates.length === 0 ? (
              <div className="mb-4 text-[12.5px] text-danger">
                No other active category to move things to. Restore or create one first.
              </div>
            ) : (
              <select
                value={replacement}
                onChange={(e) => setReplacement(e.target.value)}
                className={`${inputCls} mb-4`}
              >
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </>
        )}

        <div className="flex gap-2">
          {inUse && (
            <button
              onClick={archiveInstead}
              disabled={busy}
              title="Keep the label on existing work but hide it from pickers"
              className="flex-1 rounded-xl border border-ink/15 bg-white p-3 text-[13px] font-semibold text-slate disabled:opacity-50"
            >
              Archive instead
            </button>
          )}
          <button
            onClick={confirm}
            disabled={busy || !usage || (inUse && !rep)}
            className="flex-1 rounded-xl bg-danger p-3 text-[13px] font-semibold text-white disabled:opacity-50"
          >
            {inUse ? 'Move and delete' : 'Delete category'}
          </button>
        </div>
      </div>
    </div>
  )
}
