import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Thermometer, WarningOctagon } from '@phosphor-icons/react'
import { useStoreUnits, useSubmitTempLog, useTasks } from '../../data/hooks'
import { useToast } from '../../components/Toast'
import GeoChip, { useGeofence } from './GeoChip'
import { useStaffStore } from './StaffShell'
import { format } from 'date-fns'

export default function TempLog() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const store = useStaffStore()
  const { data: units } = useStoreUnits(store?.id)
  const { data: tasks } = useTasks({ storeId: 'all' })
  const instance = (tasks ?? []).find((t) => t.id === id) ?? null
  const { result: geo, checking, retry } = useGeofence(store)
  const submit = useSubmitTempLog()
  const [vals, setVals] = useState<Record<string, string>>({})

  const rows = (units ?? []).map((u) => {
    const raw = vals[u.id] ?? ''
    const num = raw === '' ? null : parseFloat(raw)
    const bad = num != null && num > u.breach_above
    const warnState = num != null && !bad && num > u.safe_limit
    return { unit: u, raw, num, bad, warn: warnState }
  })
  const hasFail = rows.some((r) => r.bad)
  const allFilled = rows.length > 0 && rows.every((r) => r.num != null && !Number.isNaN(r.num))
  const blocked = geo?.verdict === 'off_site'

  const doSubmit = () => {
    if (!store) {
      toast('No store assigned to your account', 'error')
      return
    }
    submit.mutate(
      {
        instance,
        storeId: store.id,
        readings: rows.map((r) => ({ unit: r.unit, value: r.num! })),
        geofenceVerdict: geo?.verdict ?? 'unknown',
      },
      {
        onSuccess: ({ breaches, queued }) => {
          if (queued) {
            navigate('/staff/success', {
              state: {
                icon: 'seal',
                color: '#F59E0B',
                title: 'Saved offline ⟳',
                msg: 'No connection right now — your readings are queued on this device and will sync automatically when you’re back online.',
              },
            })
            return
          }
          if (breaches > 0)
            toast('Critical: temperature failure escalated to Owner', 'warn')
          navigate('/staff/success', {
            state:
              breaches > 0
                ? {
                    icon: 'warn',
                    color: '#E5484D',
                    title: 'Logged · escalation raised',
                    msg: 'A temperature failure was detected — a repair workflow was auto-created and the Owner notified instantly.',
                  }
                : {
                    icon: 'seal',
                    color: '#16B364',
                    title: 'Temperature log submitted',
                    msg: 'All readings within safe limits. Stamped ✓ Verified on-site and archived for compliance.',
                  },
          })
        },
        onError: (e) => toast(e.message, 'error'),
      },
    )
  }

  return (
    <div className="flex min-h-full flex-col bg-canvas">
      <div className="border-b border-line bg-white px-4 pb-3 pt-2">
        <div className="flex items-center gap-2.5">
          <button onClick={() => navigate('/staff')} className="p-1">
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1">
            <div className="text-[15.5px] font-bold">Fridge / Freezer Temp Log</div>
            <div className="text-[11px] text-muted">
              {format(new Date(), 'HH:mm')} reading{store ? ` · ${store.name}` : ''}
            </div>
          </div>
          <GeoChip result={geo} checking={checking} storeName={store?.name ?? ''} />
        </div>
      </div>

      <div className="flex-1 p-4">
        {!checking && geo?.verdict === 'unknown' && (
          <div className="mb-3.5 flex items-center justify-between gap-2.5 rounded-[13px] border border-amber/25 bg-warn-soft p-3">
            <div className="text-[11.5px] font-medium leading-snug text-amber">
              Location unavailable — enable location so this log is verified on-site.
            </div>
            <button
              onClick={retry}
              className="flex-none rounded-[9px] border border-amber/40 bg-white px-3 py-1.5 text-[11.5px] font-semibold text-amber"
            >
              Retry location
            </button>
          </div>
        )}
        {hasFail && (
          <div className="mb-3.5 flex gap-2.5 rounded-[13px] border border-danger/25 bg-danger-soft p-3">
            <WarningOctagon size={20} weight="fill" color="#E5484D" className="flex-none" />
            <div>
              <div className="text-[13px] font-bold text-[#C0272C]">Temperature failure detected</div>
              <div className="mt-0.5 text-[11.5px] leading-snug text-[#9B3438]">
                A repair workflow will be auto-created and this reading escalated to the Owner
                instantly on submit.
              </div>
            </div>
          </div>
        )}
        <div className="flex flex-col gap-3">
          {rows.map((r) => {
            const color = r.bad ? '#E5484D' : r.warn ? '#F59E0B' : r.num != null ? '#16B364' : '#8B93A4'
            const bg = r.bad ? '#FCEBEC' : r.warn ? '#FEF3E2' : '#E7F7EF'
            return (
              <div
                key={r.unit.id}
                className="flex items-center gap-3 rounded-[14px] bg-white p-[15px]"
                style={{ border: `1px solid ${r.bad ? 'rgba(229,72,77,.4)' : 'rgba(21,27,40,.08)'}` }}
              >
                <div
                  className="flex h-11 w-11 flex-none items-center justify-center rounded-xl"
                  style={{ background: bg }}
                >
                  <Thermometer size={22} weight="fill" color={color} />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-semibold">{r.unit.name}</div>
                  <div className="text-[11.5px] text-muted">
                    Safe limit ≤ {r.unit.safe_limit}°C · escalates &gt; {r.unit.breach_above}°C
                  </div>
                </div>
                <input
                  value={r.raw}
                  onChange={(e) => setVals((v) => ({ ...v, [r.unit.id]: e.target.value }))}
                  inputMode="decimal"
                  placeholder="—"
                  className="w-[70px] rounded-[10px] border-[1.5px] p-2.5 text-center text-base font-bold outline-none"
                  style={{ borderColor: r.bad ? '#E5484D' : 'rgba(21,27,40,.15)', color }}
                />
                <span className="text-[13px] font-semibold text-muted">°C</span>
              </div>
            )
          })}
        </div>
      </div>

      <div className="sticky bottom-0 border-t border-line bg-white p-4">
        <button
          onClick={doSubmit}
          disabled={!allFilled || blocked || submit.isPending}
          className="w-full rounded-[13px] p-[15px] text-[15px] font-bold text-white"
          style={{ background: allFilled && !blocked ? '#FF5A2D' : '#C3C9D2' }}
        >
          {blocked
            ? 'Blocked — outside geofence'
            : allFilled
              ? 'Submit temperature log'
              : 'Enter every reading to submit'}
        </button>
      </div>
    </div>
  )
}
