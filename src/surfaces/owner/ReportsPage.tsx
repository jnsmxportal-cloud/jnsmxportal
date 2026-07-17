import { useMemo } from 'react'
import {
  Broom,
  FileCsv,
  FilePdf,
  FileXls,
  ListChecks,
  Thermometer,
  Truck,
  Warning,
} from '@phosphor-icons/react'
import { Card } from '../../components/ui'
import { useAuth } from '../../auth/AuthProvider'
import { useDeliveries, useEscalations, useTasks } from '../../data/hooks'
import { useToast } from '../../components/Toast'
import type { TaskInstance } from '../../lib/types'

function pct(tasks: TaskInstance[], storeId: string): number {
  const rel = tasks.filter((t) => t.store_id === storeId)
  const done = rel.filter((t) => ['completed', 'approved', 'submitted'].includes(t.status)).length
  const bad = rel.filter(
    (t) =>
      t.status === 'missed' ||
      (['assigned', 'in_progress'].includes(t.status) && t.due_at && new Date(t.due_at) < new Date()),
  ).length
  return done + bad === 0 ? 100 : Math.round((done / (done + bad)) * 100)
}

export default function ReportsPage() {
  const { stores } = useAuth()
  const { data: tasks } = useTasks({ storeId: 'all' })
  const { data: deliveries } = useDeliveries('all')
  const { data: escalations } = useEscalations('all')
  const toast = useToast()

  const cats = useMemo(() => {
    const all = tasks ?? []
    const completed = all.filter((t) => ['completed', 'approved'].includes(t.status))
    const count = (fn: (t: TaskInstance) => boolean) => completed.filter(fn).length
    const defs = [
      { label: 'Checklists', Icon: ListChecks, c: '#16B364', b: '#E7F7EF', n: count((t) => t.category === 'daily' && !t.is_temperature_log) },
      { label: 'Temperature logs', Icon: Thermometer, c: '#E5484D', b: '#FCEBEC', n: count((t) => t.is_temperature_log) },
      { label: 'Deliveries', Icon: Truck, c: '#3B82F6', b: '#EAF1FE', n: (deliveries ?? []).filter((d) => d.status === 'approved').length },
      { label: 'Weekly / cleaning', Icon: Broom, c: '#0891B2', b: '#E0F5FA', n: count((t) => t.category === 'weekly') },
      { label: 'Incidents', Icon: Warning, c: '#F59E0B', b: '#FEF3E2', n: count((t) => t.category === 'incident') },
    ]
    const max = Math.max(1, ...defs.map((d) => d.n))
    return defs.map((d) => ({ ...d, pct: Math.round((d.n / max) * 100) }))
  }, [tasks, deliveries])

  const tiles = [
    { label: 'Tasks completed', value: (tasks ?? []).filter((t) => ['completed', 'approved'].includes(t.status)).length, color: '#16B364' },
    { label: 'Missed checklists', value: (tasks ?? []).filter((t) => t.status === 'missed').length, color: '#E5484D' },
    { label: 'Open escalations', value: (escalations ?? []).length, color: '#F59E0B' },
    { label: 'Deliveries logged', value: (deliveries ?? []).length, color: '#3B82F6' },
  ]

  const storeNameOf = (id: string) => stores.find((s) => s.id === id)?.name ?? id

  const buildCsv = () => {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const rows = [
      ['Title', 'Store', 'Category', 'Priority', 'Status', 'Due at', 'Submitted at', 'Completed at'],
      ...(tasks ?? []).map((t) => [
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
    a.click()
    URL.revokeObjectURL(url)
  }

  const stamp = new Date().toISOString().slice(0, 10)

  const exportCsv = (ext: 'csv' | 'xls') => {
    download(new Blob([buildCsv()], { type: 'text/csv;charset=utf-8' }), `task-report-${stamp}.${ext}`)
    toast(`${ext.toUpperCase()} report downloaded`)
  }

  const exportPdf = async () => {
    const { jsPDF } = await import('jspdf')
    const pdf = new jsPDF()
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(16)
    pdf.text('Store Operations — Compliance Report', 14, 18)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(10)
    pdf.text(`Generated ${new Date().toLocaleString()} · all stores`, 14, 25)
    let y = 36
    pdf.setFont('helvetica', 'bold')
    pdf.text('Completion by store', 14, y)
    pdf.setFont('helvetica', 'normal')
    y += 7
    for (const s of stores) {
      pdf.text(`${s.name}: ${pct(tasks ?? [], s.id)}%`, 18, y)
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
      <Card className="p-5">
        <h3 className="mb-1 text-sm font-bold">Task completion rate</h3>
        <div className="mb-4 text-[11.5px] text-muted">Live · by store</div>
        <div className="flex flex-col gap-[15px]">
          {stores.map((s) => {
            const p = pct(tasks ?? [], s.id)
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
        {exportBtn('Excel', FileXls, () => exportCsv('xls'))}
        {exportBtn('CSV', FileCsv, () => exportCsv('csv'))}
      </div>
    </div>
  )
}
