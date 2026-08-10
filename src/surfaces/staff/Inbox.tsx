import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, ChatCircleDots } from '@phosphor-icons/react'
import { Avatar } from '../../components/ui'
import Conversation, { PresenceDot } from '../../components/Conversation'
import { useThreads } from '../../data/messages'
import { useProfiles } from '../../data/hooks'
import { timeAgo } from '../../lib/format'

export function InboxList() {
  const { threads } = useThreads()
  const { data: profiles } = useProfiles()
  const navigate = useNavigate()

  return (
    <div className="animate-fade px-[18px] pb-5 pt-4">
      <h2 className="mb-4 text-[21px] font-extrabold tracking-tight">Inbox</h2>
      <div className="flex flex-col gap-2">
        {threads.map((t) => {
          const other = (profiles ?? []).find((p) => p.id === t.otherUser)
          return (
            <button
              key={t.threadId}
              onClick={() => navigate(`/staff/inbox/${t.threadId}`)}
              className="flex items-center gap-3 rounded-[14px] border border-line bg-white p-3 text-left"
            >
              <Avatar name={other?.full_name ?? '?'} color={other?.avatar_color ?? '#8B93A4'} size={40} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[13.5px] font-bold">{other?.full_name ?? '—'}</span>
                  <PresenceDot online={!!other?.is_online} />
                </div>
                <div className="truncate text-xs text-muted">{t.lastMessage.body}</div>
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
          <div className="rounded-[14px] border border-line bg-white p-8 text-center text-xs text-muted">
            <ChatCircleDots size={30} className="mx-auto mb-2" color="#C3C9D2" />
            No messages yet. Management can message you here about your work.
          </div>
        )}
      </div>
    </div>
  )
}

export function InboxThread() {
  const { threadId } = useParams()
  const navigate = useNavigate()
  const { threads } = useThreads()
  const thread = threads.find((t) => t.threadId === threadId)

  if (!thread)
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center gap-2 p-6 text-center">
        <ChatCircleDots size={30} color="#C3C9D2" />
        <div className="text-sm font-bold">Conversation not found</div>
        <div className="text-xs leading-relaxed text-muted">
          It may still be loading, or the conversation is no longer available.
        </div>
        <button
          onClick={() => navigate('/staff/inbox')}
          className="mt-2 rounded-[13px] bg-brand px-5 py-2.5 text-[13px] font-bold text-white"
        >
          Back to inbox
        </button>
      </div>
    )
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-line bg-white px-3 py-2">
        <button onClick={() => navigate('/staff/inbox')} className="p-1">
          <ArrowLeft size={19} />
        </button>
        <span className="text-[13px] font-bold">Conversation</span>
      </div>
      <div className="min-h-0 flex-1">
        <Conversation thread={thread} />
      </div>
    </div>
  )
}
