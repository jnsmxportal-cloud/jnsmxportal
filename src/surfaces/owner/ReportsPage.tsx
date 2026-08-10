import { useMemo, useState } from 'react'
import { format, subDays } from 'date-fns'
import {
  Broom,
  CalendarBlank,
  FileCsv,
  FilePdf,
  ListChecks,
  Thermometer,
  Truck,
  Warning,
} from '@phosphor-icons/react'
import { Card } from '../../components/ui'
import { useAuth } from '../../auth/AuthProvider'
import { useDeliveries, useEscalations, useTasks } from '../../data/hooks'
import { useToast } from '../../components/Toast'
import { useOwnerCtx } from './OwnerLayout'
import { storeCompliance } from './shared'
import type { TaskInstance } from '../../lib/types'

export default function ReportsPage() {
  const { stores } = useAuth()
  const { storeId } = useOwnerCtx()
  const { data: tasks } = useTasks({ storeId: 'all' })
  const { data: deliveries } = useDeliveries('all')
  const { data: escalations } = useEscalations('all')
  const toast = useToast()

  // filters: header store switcher (ctx) + date range, default last 30 days
  const [from, setFrom] = useState(() => format(subDays(new Date(), 30), 'yyyy-MM-dd'))
  const [to, setTo] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const inRange = (iso: string | null | undefined) => {
    if (!iso) return false
    const d = iso.slice(0, 10)
    return (!from || d >= from) && (!to || d <= to)
  }
  const inStore = (sid: string) => storeId === 'all' || sid === storeId
  const visibleStores = storeId === 'all' ? stores : stores.filter((s) => s.id === storeId)

  const fTasks = useMemo(
    () =>
      (tasks ?? []).filter(
        (t) => inStore(t.store_id) && inRange(t.submitted_at ?? t.completed_at ?? t.due_at ?? t.created_at),
      ),
    [tasks, storeId, from, to],
  )
  const fDeliveries = useMemo(
    () => (deliveries ?? []).filter((d) => inStore(d.store_id) && inRange(d.submitted_at)),
    [deliveries, storeId, from, to],
  )
  const fEscalations = useMemo(
    () => (escalations ?? []).filter((e) => inStore(e.store_id) && inRange(e.created_at)),
    [escalations, storeId, from, to],
  )

  const cats = useMemo(() => {
    const all = fTasks
    const completed = all.filter((t) => ['completed', 'approved'].includes(t.status))
    const count = (fn: (t: TaskInstance) => boolean) => completed.filter(fn).length
    const defs = [
      { label: 'Checklists', Icon: ListChecks, c: '#16B364', b: '#E7F7EF', n: count((t) => t.category === 'daily' && !t.is_temperature_log) },
      { label: 'Temperature logs', Icon: Thermometer, c: '#E5484D', b: '#FCEBEC', n: count((t) => t.is_temperature_log) },
      { label: 'Deliveries', Icon: Truck, c: '#3B82F6', b: '#EAF1FE', n: fDeliveries.filter((d) => d.status === 'approved').length },
      { label: 'Weekly / cleaning', Icon: Broom, c: '#0891B2', b: '#E0F5FA', n: count((t) => t.category === 'weekly') },
      { label: 'Incidents', Icon: Warning, c: '#F59E0B', b: '#FEF3E2', n: count((t) => t.category === 'incident') },
    ]
    const max = Math.max(1, ...defs.map((d) => d.n))
    return defs.map((d) => ({ ...d, pct: Math.round((d.n / max) * 100) }))
  }, [fTasks, fDeliveries])

  const tiles = [
    { label: 'Tasks completed', value: fTasks.filter((t) => ['completed', 'approved'].includes(t.status)).length, color: '#16B364' },
    { label: 'Missed checklists', value: fTasks.filter((t) => t.status === 'missed').length, color: '#E5484D' },
    { label: 'Open escalations', value: fEscalations.length, color: '#F59E0B' },
    { label: 'Deliveries logged', value: fDeliveries.length, color: '#3B82F6' },
  ]

  const storeNameOf = (id: string) => stores.find((s) => s.id === id)?.name ?? id

  const buildCsv = () => {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const rows = [
      ['Title', 'Store', 'Category', 'Priority', 'Status', 'Due at', 'Submitted at', 'Completed at'],
      ...fTasks.map((t) => [
        t.title,
        storeNameOf(t.store_id),
        t.category,
        t.priority,
        t.status,
        t.due_at ?? '',
        t.submitted_at ?? '',
        t.completed_at ?? '',
      ]),
    ]
    return rows.map((r) => r.map(esc).join(',')).join('\r\n')
  }

  const download = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    setTimeout(() => {
      a.remove()
      URL.revokeObjectURL(url)
    }, 1000)
  }

  const stamp = new Date().toISOString().slice(0, 10)

  const exportCsv = () => {
    download(new Blob([buildCsv()], { type: 'text/csv;charset=utf-8' }), `task-report-${stamp}.csv`)
    toast('CSV report downloaded')
  }

  const exportPdf = async () => {
    const { jsPDF } = await import('jspdf')
    const pdf = new jsPDF()
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(16)
    pdf.text('Store Operations — Compliance Report', 14, 18)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(10)
    pdf.text(
      `Generated ${new Date().toLocaleString()} · ${
        storeId === 'all' ? 'all stores' : stores.find((s) => s.id === storeId)?.name ?? ''
      } · ${from} → ${to}`,
      14,
      25,
    )
    let y = 36
    pdf.setFont('helvetica', 'bold')
    pdf.text('Completion by store', 14, y)
    pdf.setFont('helvetica', 'normal')
    y += 7
    for (const s of visibleStores) {
      pdf.text(`${s.name}: ${storeCompliance(fTasks, s.id)}%`, 18, y)
      y += 6
    }
    y += 4
    pdf.setFont('helvetica', 'bold')
    pdf.text('Summary', 14, y)
    pdf.setFont('helvetica', 'normal')
    y += 7
    for (const t of tiles) {
      pdf.text(`${t.label}: ${t.value}`, 18, y)
      y += 6
    }
    pdf.save(`compliance-report-${stamp}.pdf`)
    toast('PDF report downloaded')
  }

  const exportBtn = (label: string, Icon: typeof FilePdf, onClick: () => void, dark?: boolean) => (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 rounded-[10px] px-4 py-2.5 text-[12.5px] font-semibold ${
        dark ? 'bg-ink text-white' : 'border border-ink/15 bg-white text-slate'
      }`}
    >
      <Icon size={15} /> {label}
    </button>
  )

  return (
    <div className="grid max-w-[900px] animate-fade grid-cols-1 items-start gap-5 md:grid-cols-2">
      <Card className="col-span-full flex flex-wrap items-center gap-3 p-4">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-slate">
          <CalendarBlank size={14} /> Date range
        </span>
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="rounded-[10px] border-[1.5px] border-ink/15 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-brand"
        />
        <span className="text-xs text-muted">to</span>
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="rounded-[10px] border-[1.5px] border-ink/15 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-brand"
        />
        <span className="ml-auto text-[11px] text-muted">
          {storeId === 'all' ? 'All stores' : stores.find((s) => s.id === storeId)?.name} · switch
          store in the header · {fTasks.length} tasks in range
        </span>
      </Card>
      <Card className="p-5">
        <h3 className="mb-1 text-sm font-bold">Task completion rate</h3>
        <div className="mb-4 text-[11.5px] text-muted">Filtered range · by store</div>
        <div className="flex flex-col gap-[15px]">
          {visibleStores.map((s) => {
            const p = storeCompliance(fTasks, s.id)
            return (
              <div key={s.id}>
                <div className="mb-1.5 flex justify-between text-xs">
                  <span className="font-medium">{s.name}</span>
                  <span className="font-bold">{p}%</span>
                </div>
                <div className="h-2.5 rounded-md bg-[#F0F1F4]">
                  <div
                    className="h-full rounded-md"
                    style={{ width: `${p}%`, background: 'linear-gradient(90deg,#FF5A2D,#FF8A4D)' }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="mb-1 text-sm font-bold">By category</h3>
        <div className="mb-4 text-[11.5px] text-muted">Completed work</div>
        <div className="flex flex-col gap-[13px]">
          {cats.map((c) => (
            <div key={c.label} className="flex items-center gap-3">
              <div
                className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-[9px]"
                style={{ background: c.b }}
              >
                <c.Icon size={15} color={c.c} />
              </div>
              <div className="flex-1">
                <div className="mb-1 flex justify-between text-xs">
                  <span>{c.label}</span>
                  <span className="font-bold">{c.n}</span>
                </div>
                <div className="h-[7px] rounded-[5px] bg-[#F0F1F4]">
                  <div
                    className="h-full rounded-[5px]"
                    style={{ width: `${c.pct}%`, background: c.c }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="col-span-full grid grid-cols-2 gap-4 md:grid-cols-4">
        {tiles.map((r) => (
          <Card key={r.label} className="p-4">
            <div className="font-display text-[26px] font-bold" style={{ color: r.color }}>
              {r.value}
            </div>
            <div className="mt-1 text-[11.5px] text-muted">{r.label}</div>
          </Card>
        ))}
      </div>

      <div className="col-span-full flex flex-wrap gap-2.5">
        {exportBtn('Export PDF', FilePdf, exportPdf, true)}
        {exportBtn('CSV', FileCsv, exportCsv)}
      </div>
    </div>
  )
}
