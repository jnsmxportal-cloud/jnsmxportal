import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Camera,
  CheckCircle,
  Package,
  Plug,
  ShieldWarning,
  SmileySad,
} from '@phosphor-icons/react'
import { useSubmitIncident } from '../../data/hooks'
import { useToast } from '../../components/Toast'
import { useStaffStore } from './StaffShell'

const types = [
  { label: 'Equipment fault', Icon: Plug },
  { label: 'Breakage / damage', Icon: Package },
  { label: 'Customer complaint', Icon: SmileySad },
  { label: 'Safety issue', Icon: ShieldWarning },
]
const prios = ['Low', 'Medium', 'High', 'Critical'] as const

export default function Incident() {
  const navigate = useNavigate()
  const toast = useToast()
  const store = useStaffStore()
  const submit = useSubmitIncident()
  const [type, setType] = useState(types[0].label)
  const [desc, setDesc] = useState('')
  const [prio, setPrio] = useState<(typeof prios)[number]>('High')
  const [photos, setPhotos] = useState(0)

  const doSubmit = () => {
    const crit = prio === 'Critical'
    submit.mutate(
      {
        storeId: store!.id,
        type,
        description: desc,
        priority: prio.toLowerCase() as 'low' | 'medium' | 'high' | 'critical',
        photoCount: photos,
      },
      {
        onSuccess: ({ queued }) => {
          if (queued) {
            navigate('/staff/success', {
              state: {
                icon: 'warn',
                color: '#F59E0B',
                title: 'Saved offline ⟳',
                msg: 'No connection right now — the incident report is queued on this device and will sync automatically when you’re back online.',
              },
            })
            return
          }
          toast(
            crit
              ? 'Critical incident escalated to Owner instantly'
              : 'Incident reported to Team Leader',
            'warn',
          )
          navigate('/staff/success', {
            state: {
              icon: 'warn',
              color: '#E5484D',
              title: 'Incident reported',
              msg: crit
                ? 'Marked Critical — escalated to the Owner instantly with your photos and notes.'
                : 'Routed to your Team Leader with a 24h action deadline. The Owner is notified if unresolved within the escalation window.',
            },
          })
        },
        onError: (e) => toast(e.message, 'error'),
      },
    )
  }

  const label = 'mb-2 block text-xs font-semibold text-slate'
  return (
    <div className="flex min-h-full flex-col bg-canvas">
      <div className="border-b border-line bg-white px-4 pb-3 pt-2">
        <div className="flex items-center gap-2.5">
          <button onClick={() => navigate('/staff')} className="p-1">
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1">
            <div className="text-[15.5px] font-bold">Incident Report</div>
            <div className="text-[11px] text-muted">Routed to Team Leader &amp; Owner · 24h SLA</div>
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3.5 p-4">
        <div>
          <label className={label}>Type</label>
          <div className="grid grid-cols-2 gap-2">
            {types.map((t) => (
              <button
                key={t.label}
                onClick={() => setType(t.label)}
                className={`flex items-center gap-2 rounded-xl border p-3 text-[12.5px] font-semibold ${
                  type === t.label
                    ? 'border-brand bg-brand-tint text-brand-dark'
                    : 'border-ink/15 bg-white text-slate'
                }`}
              >
                <t.Icon size={18} /> {t.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className={label}>What happened?</label>
          <textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="Describe the incident…"
            className="h-[90px] w-full resize-none rounded-xl border-[1.5px] border-ink/15 bg-white p-3 text-sm outline-none focus:border-brand"
          />
        </div>
        <div>
          <label className={label}>Priority</label>
          <div className="flex gap-2">
            {prios.map((p) => (
              <button
                key={p}
                onClick={() => setPrio(p)}
                className={`flex-1 rounded-xl border p-2.5 text-xs font-semibold ${
                  prio === p
                    ? p === 'Critical'
                      ? 'border-danger bg-danger-soft text-danger'
                      : 'border-brand bg-brand-tint text-brand-dark'
                    : 'border-ink/15 bg-white text-slate'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className={label}>Photos</label>
          <div className="flex gap-2">
            {Array.from({ length: photos }).map((_, i) => (
              <div
                key={i}
                className="flex h-14 w-14 items-center justify-center rounded-[11px] border border-ink/5"
                style={{
                  background:
                    'repeating-linear-gradient(45deg,#eef0f3,#eef0f3 5px,#e4e7ec 5px,#e4e7ec 10px)',
                }}
              >
                <CheckCircle size={18} weight="fill" color="#16B364" />
              </div>
            ))}
            <button
              onClick={() => setPhotos((p) => p + 1)}
              className="flex h-14 w-14 items-center justify-center rounded-[11px] border-[1.5px] border-dashed border-ink/20 bg-[#F9FAFB]"
            >
              <Camera size={20} color="#8B93A4" />
            </button>
          </div>
        </div>
      </div>

      <div className="sticky bottom-0 border-t border-line bg-white p-4">
        <button
          onClick={doSubmit}
          disabled={!desc.trim() || submit.isPending}
          className="w-full rounded-[13px] bg-danger p-[15px] text-[15px] font-bold text-white disabled:opacity-50"
        >
          Report incident
        </button>
      </div>
    </div>
  )
}
