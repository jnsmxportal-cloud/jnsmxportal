import { useState } from 'react'
import { ChatCircleDots, Plus, X } from '@phosphor-icons/react'
import { Card, Avatar } from '../../components/ui'
import Conversation, { PresenceDot } from '../../components/Conversation'
import { useThreads, useSendMessage } from '../../data/messages'
import { useProfiles } from '../../data/hooks'
import { useAuth } from '../../auth/AuthProvider'
import { timeAgo } from '../../lib/format'

function ComposeModal({ onClose, onSent }: { onClose: () => void; onSent: (threadId: string) => void }) {
  const { session } = useAuth()
  const { data: profiles } = useProfiles()
  const send = useSendMessage()
  const targets = (profiles ?? []).filter((p) => p.id !== session!.user.id)
  const [to, setTo] = useState('')
  const [body, setBody] = useState('')

  return (
    <div onClick={onClose} className="fixed inset-0 z-[80] flex items-center justify-center bg-navy/50 p-6">
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[440px] max-w-full animate-fade rounded-[20px] bg-white p-6 shadow-[0_30px_80px_rgba(0,0,0,.3)]"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-[17px] font-bold">New message</h3>
          <button onClick={onClose} className="p-1 text-muted">
            <X size={18} />
          </button>
        </div>
        <label className="mb-1.5 block text-xs font-semibold text-slate">To</label>
        <select
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="mb-3.5 w-full rounded-xl border-[1.5px] border-ink/15 bg-white p-3 text-sm outline-none"
        >
          <option value="">Select a team member…</option>
          {targets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name} · {p.role.replace('_', ' ')} {p.is_online ? '· online' : ''}
            </option>
          ))}
        </select>
        <label className="mb-1.5 block text-xs font-semibold text-slate">Message</label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="e.g. The chiller photo on this morning's checklist is blurred — please retake it."
          className="mb-4 h-[100px] w-full resize-none rounded-xl border-[1.5px] border-ink/15 p-3 text-[13.5px] outline-none focus:border-brand"
        />
        <button
          onClick={() =>
            send.mutate(
              { toUser: to, body: body.trim() },
              { onSuccess: (threadId) => { onSent(threadId); onClose() } },
            )
          }
          disabled={!to || !body.trim() || send.isPending}
          className="w-full rounded-xl bg-brand p-3 text-[13.5px] font-semibold text-white disabled:opacity-50"
        >
          Send message
        </button>
      </div>
    </div>
  )
}

export default function InboxPage() {
  const { threads } = useThreads()
  const { data: profiles } = useProfiles()
  const [sel, setSel] = useState<string | null>(null)
  const [compose, setCompose] = useState(false)
  const selected = threads.find((t) => t.threadId === sel) ?? threads[0] ?? null

  return (
    <div className="grid h-[calc(100vh-160px)] max-w-[980px] animate-fade grid-cols-[320px_1fr] gap-5">
      <div className="flex min-h-0 flex-col gap-2.5">
        <button
          onClick={() => setCompose(true)}
          className="flex items-center justify-center gap-2 rounded-[13px] border-[1.5px] border-dashed border-brand/50 bg-brand-tint p-3 text-[12.5px] font-semibold text-brand-dark"
        >
          <Plus size={15} weight="bold" /> New message
        </button>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex flex-col gap-2">
            {threads.map((t) => {
              const other = (profiles ?? []).find((p) => p.id === t.otherUser)
              const active = selected?.threadId === t.threadId
              return (
                <button
                  key={t.threadId}
                  onClick={() => setSel(t.threadId)}
                  className={`flex items-center gap-3 rounded-[14px] border p-3 text-left ${
                    active ? 'border-brand/40 bg-brand-tint' : 'border-line bg-white'
                  }`}
                >
                  <Avatar name={other?.full_name ?? '?'} color={other?.avatar_color ?? '#8B93A4'} size={38} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[13px] font-bold">{other?.full_name ?? '—'}</span>
                      <PresenceDot online={!!other?.is_online} />
                    </div>
                    <div className="truncate text-[11.5px] text-muted">{t.lastMessage.body}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-[10px] text-muted">{timeAgo(t.lastMessage.sent_at)}</span>
                    {t.unread > 0 && (
                      <span className="rounded-full bg-brand px-1.5 py-px text-[10px] font-bold text-white">
                        {t.unread}
                      </span>
                    )}
                  </div>
                </button>
              )
            })}
            {threads.length === 0 && (
              <Card className="p-8 text-center text-xs text-muted">
                <ChatCircleDots size={30} className="mx-auto mb-2" color="#C3C9D2" />
                No conversations yet. Message a staff member about an issue in their work — it stays
                in the audit trail.
              </Card>
            )}
          </div>
        </div>
      </div>

      <Card className="min-h-0 overflow-hidden">
        {selected ? (
          <Conversation thread={selected} />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted">
            Select or start a conversation
          </div>
        )}
      </Card>

      {compose && <ComposeModal onClose={() => setCompose(false)} onSent={(id) => setSel(id)} />}
    </div>
  )
}
