import { useEffect, useRef, useState } from 'react'
import { Checks, PaperPlaneTilt } from '@phosphor-icons/react'
import { format } from 'date-fns'
import { useAuth } from '../auth/AuthProvider'
import { useMarkThreadRead, useSendMessage, type Thread } from '../data/messages'
import { useProfiles } from '../data/hooks'
import { useToast } from './Toast'

export function PresenceDot({ online }: { online: boolean }) {
  return (
    <span
      className="inline-block h-2 w-2 rounded-full"
      style={{ background: online ? '#16B364' : '#C3C9D2' }}
      title={online ? 'Available' : 'Offline'}
    />
  )
}

export default function Conversation({ thread }: { thread: Thread }) {
  const { session } = useAuth()
  const { data: profiles } = useProfiles()
  const send = useSendMessage()
  const markRead = useMarkThreadRead()
  const toast = useToast()
  const [text, setText] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const me = session!.user.id
  const other = (profiles ?? []).find((p) => p.id === thread.otherUser)

  useEffect(() => {
    // guard against refire loops: only mark when there is something unread and no mark in flight
    if (thread.unread > 0 && !markRead.isPending) markRead.mutate(thread.threadId)
  }, [thread.threadId, thread.unread, markRead.isPending])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [thread.messages.length])

  const doSend = () => {
    if (!text.trim()) return
    send.mutate(
      { threadId: thread.threadId, toUser: thread.otherUser, body: text.trim() },
      { onError: (e) => toast(e.message, 'error') },
    )
    setText('')
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-line bg-white px-4 py-3">
        <span className="font-display text-sm font-bold">{other?.full_name ?? '—'}</span>
        <PresenceDot online={!!other?.is_online} />
        <span className="text-[11px] text-muted">{other?.is_online ? 'Available' : 'Offline'}</span>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto bg-canvas p-4">
        <div className="flex flex-col gap-2">
          {thread.messages.map((m) => {
            const mine = m.from_user === me
            return (
              <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-snug ${
                    mine ? 'rounded-br-md bg-navy text-white' : 'rounded-bl-md border border-line bg-white'
                  }`}
                >
                  <div>{m.body}</div>
                  <div
                    className={`mt-1 flex items-center justify-end gap-1 text-[9.5px] ${
                      mine ? 'text-white/60' : 'text-muted'
                    }`}
                  >
                    {format(new Date(m.sent_at), 'HH:mm')}
                    {mine && (
                      <Checks
                        size={13}
                        weight="bold"
                        color={m.read_at ? '#16B364' : mine ? 'rgba(255,255,255,.6)' : '#C3C9D2'}
                      />
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <div className="flex gap-2 border-t border-line bg-white p-3">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && doSend()}
          placeholder="Write a message…"
          className="flex-1 rounded-xl border-[1.5px] border-ink/15 px-3.5 py-2.5 text-sm outline-none focus:border-brand"
        />
        <button
          onClick={doSend}
          disabled={!text.trim() || send.isPending}
          className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand text-white disabled:opacity-50"
        >
          <PaperPlaneTilt size={18} weight="fill" />
        </button>
      </div>
    </div>
  )
}
