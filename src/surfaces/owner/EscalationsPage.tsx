import {
  ArrowsClockwise,
  Clock,
  Storefront,
  WarningOctagon,
} from '@phosphor-icons/react'
import { Card } from '../../components/ui'
import { useEscalations, useResolveEscalation } from '../../data/hooks'
import { timeAgo } from '../../lib/format'
import { useToast } from '../../components/Toast'
import { useOwnerCtx } from './OwnerLayout'
import { useNames } from './shared'

export default function EscalationsPage() {
  const { storeId } = useOwnerCtx()
  const { data: escalations } = useEscalations(storeId)
  const { storeName } = useNames()
  const resolve = useResolveEscalation()
  const toast = useToast()

  if ((escalations ?? []).length === 0)
    return (
      <Card className="max-w-[760px] animate-fade p-14 text-center text-muted">
        <WarningOctagon size={44} color="#16B364" className="mx-auto" />
        <div className="mt-2.5 text-[15px] font-semibold text-ink">No open escalations</div>
        <div className="mt-1 text-[12.5px]">Everything raised has been resolved.</div>
      </Card>
    )

  return (
    <div className="flex max-w-[760px] animate-fade flex-col gap-3.5">
      {(escalations ?? []).map((e) => {
        const color = e.level === 'critical' ? '#E5484D' : '#F59E0B'
        const bg = e.level === 'critical' ? '#FCEBEC' : '#FEF3E2'
        return (
          <Card key={e.id} className="p-[18px]" >
            <div style={{ borderLeft: `4px solid ${color}`, margin: '-18px', padding: '18px', borderRadius: '16px' }}>
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <WarningOctagon size={20} weight="fill" color={color} />
                  <span className="font-display text-[15.5px] font-bold">{e.title}</span>
                </div>
                <span
                  className="rounded-full px-2.5 py-[3px] text-[10px] font-bold uppercase"
                  style={{ color, background: bg }}
                >
                  {e.level}
                </span>
              </div>
              <div className="mb-3 text-[13px] leading-normal text-slate">{e.detail}</div>
              <div className="mb-3.5 flex items-center gap-3.5 text-[11.5px] text-muted">
                <span className="flex items-center gap-1">
                  <Storefront size={12} /> {storeName(e.store_id)}
                </span>
                <span className="flex items-center gap-1">
                  <ArrowsClockwise size={12} /> Stage:{' '}
                  {e.stage === 'owner' ? 'Owner' : 'Team Leader'}
                </span>
                <span className="flex items-center gap-1">
                  <Clock size={12} /> {timeAgo(e.created_at)}
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() =>
                    resolve.mutate(
                      { id: e.id, status: 'investigating' },
                      { onSuccess: () => toast('Marked as investigating', 'info') },
                    )
                  }
                  className="rounded-[10px] bg-ink px-4 py-2 text-[12.5px] font-semibold text-white"
                >
                  {e.status === 'investigating' ? 'Investigating…' : 'Investigate'}
                </button>
                <button
                  onClick={() =>
                    resolve.mutate(
                      { id: e.id, status: 'resolved' },
                      { onSuccess: () => toast('Escalation resolved') },
                    )
                  }
                  className="rounded-[10px] border border-ink/15 bg-white px-4 py-2 text-[12.5px] font-semibold text-slate"
                >
                  Mark resolved
                </button>
              </div>
            </div>
          </Card>
        )
      })}
    </div>
  )
}
