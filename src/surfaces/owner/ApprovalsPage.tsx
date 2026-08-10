import { CheckCircle } from '@phosphor-icons/react'
import { Card, PrioBadge } from '../../components/ui'
import { useTasks } from '../../data/hooks'
import { timeAgo } from '../../lib/format'
import { useOwnerCtx } from './OwnerLayout'
import { ApprovalActions, EvidenceGallery, evidenceSummary, kindMeta, useNames } from './shared'

export default function ApprovalsPage() {
  const { storeId } = useOwnerCtx()
  const { data: tasks } = useTasks({ storeId })
  const { userName, storeName } = useNames()
  const queue = (tasks ?? []).filter((t) => t.status === 'submitted')

  if (queue.length === 0)
    return (
      <Card className="max-w-[820px] animate-fade p-14 text-center text-muted">
        <CheckCircle size={44} color="#16B364" className="mx-auto" />
        <div className="mt-2.5 text-[15px] font-semibold text-ink">Queue clear</div>
        <div className="mt-1 text-[12.5px]">Every submission has been reviewed.</div>
      </Card>
    )

  return (
    <div className="flex max-w-[820px] animate-fade flex-col gap-3.5">
      {queue.map((t) => {
        const { Icon, c, b } = kindMeta(t)
        return (
          <Card key={t.id} className="flex gap-4 p-[18px]">
            <div
              className="flex h-11 w-11 flex-none items-center justify-center rounded-xl"
              style={{ background: b }}
            >
              <Icon size={22} weight="fill" color={c} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-0.5 flex items-center gap-2">
                <span className="font-display text-[15px] font-bold">{t.title}</span>
                <PrioBadge p={t.priority} />
              </div>
              <div className="mb-2.5 text-xs text-muted">
                {storeName(t.store_id)} · Submitted by {userName(t.submitted_by)} ·{' '}
                {t.submitted_at ? timeAgo(t.submitted_at) : ''}
              </div>
              <div className="mb-3 text-[12.5px] text-slate">{evidenceSummary(t)}</div>
              <div className="mb-3.5">
                <EvidenceGallery instanceId={t.id} />
              </div>
              <ApprovalActions task={t} />
            </div>
          </Card>
        )
      })}
    </div>
  )
}
